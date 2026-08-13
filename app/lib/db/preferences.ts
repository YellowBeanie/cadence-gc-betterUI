import { ouvrirTraining } from './connection';

/** Lecture tolérante d'une préférence d'affichage (`preferences_affichage`,
 *  tâche 37) : clé absente OU JSON corrompu renvoient tous les deux `defaut`,
 *  jamais une exception — un réglage cassé ne doit jamais faire tomber un
 *  écran (règle du projet, cf. AGENTS.md « jamais de zéro fabriqué » et
 *  hypothèses de la spec personnalisation : « JSON invalide ou clé inconnue
 *  → défauts actuels »). `defaut` n'est lui-même jamais validé ici : la forme
 *  attendue (ex. LayoutAccueil) est vérifiée par l'appelant si besoin
 *  (cf. lib/layout-accueil.ts, `appliquerLayout`, tolérant lui aussi). */
export function lirePreference<T>(cle: string, defaut: T): T {
  const db = ouvrirTraining();
  try {
    const r = db.prepare(`SELECT valeur_json FROM preferences_affichage WHERE cle = ?`)
      .get(cle) as { valeur_json: string } | undefined;
    if (!r) return defaut;
    try {
      return JSON.parse(r.valeur_json) as T;
    } catch {
      return defaut;
    }
  } finally {
    db.close();
  }
}

/** Écrit (ou remplace) une préférence — une seule ligne par clé, comme
 *  `enregistrerPoint` (lib/db/training.ts) pour `daily_checkin`. */
export function ecrirePreference<T>(cle: string, valeur: T): void {
  const db = ouvrirTraining();
  try {
    const maintenant = new Date().toISOString();
    db.prepare(
      `INSERT INTO preferences_affichage (cle, valeur_json, maj) VALUES (?, ?, ?)
       ON CONFLICT(cle) DO UPDATE SET valeur_json = excluded.valeur_json, maj = excluded.maj`,
    ).run(cle, JSON.stringify(valeur), maintenant);
  } finally {
    db.close();
  }
}

/** Supprime une préférence : la lecture suivante retombe sur le défaut fourni
 *  par l'appelant (« Réinitialiser », spec personnalisation). Idempotent —
 *  supprimer une clé déjà absente n'est jamais une erreur. */
export function supprimerPreference(cle: string): void {
  const db = ouvrirTraining();
  try {
    db.prepare(`DELETE FROM preferences_affichage WHERE cle = ?`).run(cle);
  } finally {
    db.close();
  }
}

/** Liste toutes les clés actuellement enregistrées — nécessaire à l'export
 *  (tâche 46, lib/preferences-registre.ts) : contrairement aux domaines de
 *  préférence à clé fixe ('accueil', 'visuels'...), le layout de page de
 *  séance vit sous une clé dynamique par sport (`seance:<type>`), non
 *  énumérable à l'avance — il faut regarder ce qui existe réellement en base. */
export function listerClesPreferences(): string[] {
  const db = ouvrirTraining();
  try {
    const lignes = db.prepare(`SELECT cle FROM preferences_affichage`).all() as { cle: string }[];
    return lignes.map((l) => l.cle);
  } finally {
    db.close();
  }
}
