import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

// `connaissances.db` (tâche 12) est une base PYTHON (connaissances/db.py,
// spec 4) : l'app ne l'initialise jamais, elle ne fait que la LIRE (et
// changer un statut). Même motif de résolution de chemin que
// lib/db/connection.ts (fonction, jamais une constante figée au chargement
// du module — les tests font varier GARMIN_DATA_DIR/CONNAISSANCES_DB_PATH
// d'un scénario à l'autre dans le même process), mais avec son propre
// override d'environnement dédié : `connaissances.db` vit dans le même
// répertoire que `training.db` (même volume `data/`, cf.
// deploy/nas/docker-compose.yml), donc le défaut réutilise `GARMIN_DATA_DIR`.
function racineDonnees(): string {
  return process.env.GARMIN_DATA_DIR ?? '/work';
}

function cheminConnaissances(): string {
  return process.env.CONNAISSANCES_DB_PATH ?? `${racineDonnees()}/connaissances.db`;
}

export type FicheProposee = {
  affirmation: string;
  extrait: string;
  localisation: string;
  incertitude: string;
};

export type SourceEnAttente = {
  id: number;
  titre: string;
  auteurs: string | null;
  annee: number | null;
  url: string;
  type: string;
  domaine: string;
  signaux: Record<string, boolean>;
  fiches: FicheProposee[];
};

/** Parse tolérant de `signaux_credibilite` (JSON produit par
 *  connaissances/credibilite.py) : colonne absente (NULL), JSON invalide, ou
 *  JSON valide mais pas un objet (tableau, nombre...) renvoient tous les
 *  trois un objet vide plutôt qu'une exception — même prudence que
 *  `lirePreference` (lib/db/preferences.ts) face à un JSON corrompu. */
function parseSignaux(json: unknown): Record<string, boolean> {
  if (typeof json !== 'string') return {};
  try {
    const valeur: unknown = JSON.parse(json);
    if (valeur === null || typeof valeur !== 'object' || Array.isArray(valeur)) return {};
    return valeur as Record<string, boolean>;
  } catch {
    return {};
  }
}

/** Sources au statut `en_attente`, fiches proposées incluses — le pendant UI
 *  du choix de l'utilisateur « autonome pour la littérature, validation pour le reste »
 *  (spec 4). Base absente ⇒ `[]`, jamais une erreur : un NAS fraîchement
 *  installé n'a pas encore de base connaissances.db (état nominal actuel de
 *  la prod, où les 3 sources existantes sont `auto_admise`). */
export function lireSourcesEnAttente(): SourceEnAttente[] {
  const chemin = cheminConnaissances();
  if (!existsSync(chemin)) return [];

  const db = new DatabaseSync(chemin, { readOnly: true });
  try {
    const sources = db.prepare(
      `SELECT id, titre, auteurs, annee, url, type, domaine, signaux_credibilite
       FROM sources WHERE statut = 'en_attente' ORDER BY ajoute_le ASC, id ASC`,
    ).all() as Record<string, unknown>[];

    const stmtFiches = db.prepare(
      `SELECT affirmation, extrait_verbatim, localisation, incertitude
       FROM fiches WHERE source_id = ? ORDER BY id ASC`,
    );

    return sources.map((s) => ({
      id: s.id as number,
      titre: s.titre as string,
      auteurs: (s.auteurs as string | null) ?? null,
      annee: (s.annee as number | null) ?? null,
      url: s.url as string,
      type: s.type as string,
      domaine: s.domaine as string,
      signaux: parseSignaux(s.signaux_credibilite),
      fiches: (stmtFiches.all(s.id as number) as Record<string, unknown>[]).map((f) => ({
        affirmation: f.affirmation as string,
        extrait: f.extrait_verbatim as string,
        localisation: f.localisation as string,
        incertitude: f.incertitude as string,
      })),
    }));
  } finally {
    db.close();
  }
}

/** Verdict de la file de validation : jamais une écriture directe en base
 *  depuis l'écran — seuls `validee`/`rejetee` sont atteignables ici, jamais
 *  `auto_admise` (réservé au pipeline Python) ni `en_attente` (état de
 *  départ). Idempotent — un `id` inconnu ou une base absente ne touchent
 *  rien et ne lèvent jamais (même convention que `basculerActifObjectif`,
 *  lib/db/objectifs.ts). */
export function changerStatutSource(id: number, statut: 'validee' | 'rejetee'): void {
  const chemin = cheminConnaissances();
  if (!existsSync(chemin)) return;

  const db = new DatabaseSync(chemin);
  try {
    db.prepare(`UPDATE sources SET statut = ? WHERE id = ?`).run(statut, id);
  } finally {
    db.close();
  }
}
