// Réglage de densité d'affichage (tâche 45, gisement T44 du rapport B1) :
// préférence globale UNIQUE (clé 'densite', pas une par page) — contrairement
// aux moteurs de layout (fusion de listes réordonnables), c'est une simple
// valeur parmi deux, revalidée ici comme `heroValide` (lib/layout-accueil.ts)
// revalide le héros du dashboard.
//
// « Normale » (le défaut) laisse chaque écran strictement TEL QUEL — règle du
// projet « défaut = écran actuel ». « Compacte » AJOUTE la classe `.bande-170`
// (déjà dans globals.css, tâche 22) aux bandes de mesures qui n'y sont PAS
// déjà — la bande principale du dashboard (14 tuiles) et la bande stats-par-
// sport de /seances — et resserre les listes de séances (`.work-row`,
// séances récentes du dashboard et liste complète de /seances).
//
// Ce réglage n'ajoute JAMAIS de compacité à une bande déjà fixée à
// `.bande-170` par un choix de design antérieur (stats de la semaine et poids
// de /historique — tâches 22/31 — ou prédictions du dashboard — tâche 22) :
// elles le sont déjà, rien à resserrer davantage. Conséquence honnête : le
// réglage n'a aucun effet visuel sur /historique aujourd'hui (ses bandes sont
// déjà les plus denses possibles) — ce n'est pas un oubli, une bande ne peut
// pas devenir « plus compacte que compacte ».
import { estObjet } from './layout-accueil';

export const DENSITES = ['normale', 'compacte'] as const;
export type Densite = (typeof DENSITES)[number];
export const DENSITE_PAR_DEFAUT: Densite = 'normale';

function densiteValide(v: unknown): v is Densite {
  return typeof v === 'string' && (DENSITES as readonly string[]).includes(v);
}

/** Revalide une sauvegarde lue via `lirePreference` (jamais validée en
 *  profondeur en amont, lib/db/preferences.ts) : une valeur inconnue, d'un
 *  mauvais type, ou absente (`null`) replie sur le défaut, jamais une
 *  exception. `estObjet` réutilisée seulement pour rejeter d'éventuels objets
 *  glissés dans la clé par erreur — la valeur attendue est une chaîne. */
export function appliquerDensite(sauvegarde: unknown): Densite {
  if (estObjet(sauvegarde)) return DENSITE_PAR_DEFAUT;
  return densiteValide(sauvegarde) ? sauvegarde : DENSITE_PAR_DEFAUT;
}

/** Classe à poser sur une grille `.bande-mesures` qui n'est pas déjà fixée à
 *  `.bande-170` par ailleurs (cf. commentaire de module) — n'ajoute la classe
 *  compacte que si l'utilisateur l'a choisi. */
export function classeBandeMesures(densite: Densite): string {
  return densite === 'compacte' ? 'bande-mesures bande-170' : 'bande-mesures';
}

/** Classe à poser sur une ligne `.work-row` (séances récentes du dashboard,
 *  liste complète de /seances) — resserre l'espacement vertical en
 *  « compacte » (règle CSS `.work-row.densite-compacte`, globals.css). */
export function classeLigneSeance(densite: Densite, cliquable: boolean): string {
  const classes = ['work-row'];
  if (cliquable) classes.push('cliquable');
  if (densite === 'compacte') classes.push('densite-compacte');
  return classes.join(' ');
}
