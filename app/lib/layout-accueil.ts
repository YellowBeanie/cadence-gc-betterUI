// Moteur de layout de l'accueil (tâche 37, socle personnalisation) : définit
// canoniquement les sections du dashboard, les 14 tuiles de la bande de
// mesures (mêmes clés stables que components/bande-mesures.tsx) et les choix
// possibles de mesure « héros » (components/rapport-matin.tsx), puis fusionne
// une sauvegarde utilisateur (preferences_affichage, clé 'accueil') avec ce
// défaut de façon tolérante — jamais d'écran cassé si le JSON est partiel,
// obsolète (id retiré du code depuis) ou mal formé.

/** Ordre exact du dashboard actuel (app/page.tsx) — c'est le défaut, à
 *  l'identique, tant qu'aucune préférence n'est enregistrée. La section
 *  « brouillons vocaux à valider » n'apparaît PAS ici : c'est une
 *  information d'action (des saisies en attente de validation), pas une
 *  préférence d'affichage — jamais masquable ni réordonnable, rendue à part
 *  par app/page.tsx quel que soit le layout choisi. */
export const SECTIONS_ACCUEIL = [
  'heros', 'bande-mesures', 'ressenti', 'charge-7j', 'predictions', 'seances-recentes', 'layers',
] as const;
export type IdSection = (typeof SECTIONS_ACCUEIL)[number];

/** Les 14 tuiles construites par components/bande-mesures.tsx, dans leur
 *  ordre d'apparition actuel — mêmes valeurs que `Mesure.cle` dans ce
 *  fichier ; un renommage là-bas doit être répercuté ici. */
export const TUILES_MESURES = [
  'readiness', 'hrv', 'fc-repos', 'sommeil', 'charge', 'calories',
  'pas', 'etages', 'intensite', 'stress', 'spo2', 'vo2max', 'respiration', 'age-forme',
] as const;
export type IdTuile = (typeof TUILES_MESURES)[number];

/** Mesures pouvant devenir le gros chiffre du héros (rapport-matin.tsx). */
export const HEROS_OPTIONS = ['body_battery', 'readiness', 'sommeil', 'stress', 'pas'] as const;
export type IdHeros = (typeof HEROS_OPTIONS)[number];

export type ElementLayout<Id extends string> = { id: Id; visible: boolean };

export type LayoutAccueil = {
  sections: ElementLayout<IdSection>[];
  tuiles: ElementLayout<IdTuile>[];
  heros: IdHeros;
};

export const LAYOUT_PAR_DEFAUT: LayoutAccueil = {
  sections: SECTIONS_ACCUEIL.map((id) => ({ id, visible: true })),
  tuiles: TUILES_MESURES.map((id) => ({ id, visible: true })),
  heros: 'body_battery',
};

/** Exportée (pas seulement utilisée ici) : `lib/layout-seance.ts` (tâche 38)
 *  réutilise cette garde plutôt que d'en redéfinir une identique. */
export function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Fusionne une liste sauvegardée (potentiellement absente, mal formée, ou
 *  truffée d'ids inconnus/dupliqués) avec l'ordre par défaut : id inconnu
 *  ignoré, entrée malformée ignorée, id du défaut manquant dans la
 *  sauvegarde ajouté en fin (visible), premier doublon gagnant sur les
 *  suivants. C'est la logique la plus testée de ce module.
 *
 *  Exportée : `lib/layout-seance.ts` (tâche 38, templates de page de séance
 *  par sport) réutilise cette même fusion générique plutôt que de dupliquer
 *  une logique déjà couverte par de nombreux cas de test ici. */
export function fusionnerListe<Id extends string>(
  defaut: ElementLayout<Id>[], sauvegarde: unknown,
): ElementLayout<Id>[] {
  const idsConnus = new Set<string>(defaut.map((e) => e.id));
  const brut = Array.isArray(sauvegarde) ? sauvegarde : [];
  const vus = new Set<Id>();
  const resultat: ElementLayout<Id>[] = [];

  for (const entree of brut) {
    if (!estObjet(entree) || typeof entree.id !== 'string') continue;
    if (!idsConnus.has(entree.id)) continue;
    const id = entree.id as Id;
    if (vus.has(id)) continue; // doublon : la première occurrence gagne
    resultat.push({ id, visible: typeof entree.visible === 'boolean' ? entree.visible : true });
    vus.add(id);
  }
  for (const e of defaut) {
    if (!vus.has(e.id)) resultat.push({ id: e.id, visible: true });
  }
  return resultat;
}

function heroValide(v: unknown): v is IdHeros {
  return typeof v === 'string' && (HEROS_OPTIONS as readonly string[]).includes(v);
}

/** Fusionne `defaut` (toujours l'écran actuel) avec une sauvegarde lue via
 *  `lirePreference` — cette dernière n'est jamais validée en profondeur en
 *  amont (lib/db/preferences.ts ne garantit que « du JSON valide »), donc
 *  chaque champ est revérifié ici avant usage. `sauvegarde` vaut `null`
 *  quand aucune préférence n'a encore été enregistrée : le défaut est alors
 *  renvoyé tel quel. */
export function appliquerLayout(defaut: LayoutAccueil, sauvegarde: unknown): LayoutAccueil {
  if (!estObjet(sauvegarde)) return defaut;
  return {
    sections: fusionnerListe(defaut.sections, sauvegarde.sections),
    tuiles: fusionnerListe(defaut.tuiles, sauvegarde.tuiles),
    heros: heroValide(sauvegarde.heros) ? sauvegarde.heros : defaut.heros,
  };
}
