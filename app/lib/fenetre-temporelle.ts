// Fenêtre temporelle configurable (tâche 47, gisement T43/G3 du rapport
// d'audit B1) : préférence globale UNIQUE (clé 'fenetre_jours', pas une par
// écran) — même modèle qu'une simple valeur parmi plusieurs que `densite.ts`
// (lib/densite.ts), revalidée ici avec la même garde stricte (« valeur
// inconnue ⇒ défaut, jamais une exception »).
//
// « 7 jours » (le défaut) laisse chaque vue pilotée strictement TELLE QUELLE
// — règle du projet « défaut = écran actuel ». Les valeurs 14/30 élargissent
// la fenêtre glissante des vues identifiées par l'audit B1 : la bande de
// stats « N derniers jours » de /historique (lib/db/garmin.ts,
// `lireStatsSemaine`) et les sparklines des tuiles de mesures du dashboard
// (components/bande-mesures.tsx) — jamais les vues à période propre par
// nature (charge par semaine ISO 8 semaines, records personnels, liste des
// séances, zones par semaine, plan passé 14 j) : voir le rapport de la
// tâche 47 pour la liste exacte et la justification de chaque exclusion.
import { estObjet } from './layout-accueil';

export const FENETRES = [7, 14, 30] as const;
export type FenetreJours = (typeof FENETRES)[number];
export const FENETRE_PAR_DEFAUT: FenetreJours = 7;

function fenetreValide(v: unknown): v is FenetreJours {
  return typeof v === 'number' && (FENETRES as readonly number[]).includes(v);
}

/** Revalide une sauvegarde lue via `lirePreference` (jamais validée en
 *  profondeur en amont, lib/db/preferences.ts) : une valeur inconnue, d'un
 *  mauvais type, ou absente (`null`) replie sur le défaut, jamais une
 *  exception — même contrat que `appliquerDensite`. `estObjet` réutilisée
 *  seulement pour rejeter d'éventuels objets glissés dans la clé par erreur —
 *  la valeur attendue est un nombre. */
export function appliquerFenetre(sauvegarde: unknown): FenetreJours {
  if (estObjet(sauvegarde)) return FENETRE_PAR_DEFAUT;
  return fenetreValide(sauvegarde) ? sauvegarde : FENETRE_PAR_DEFAUT;
}

/** Libellé « N derniers jours » partagé par toutes les vues pilotées — un seul
 *  point d'écriture pour ce texte, pour ne jamais laisser une vue afficher un
 *  nombre de jours différent de la fenêtre réellement appliquée à sa lecture
 *  (règle du projet : un en-tête figé qui ment est un bug). */
export function libelleFenetre(fenetre: FenetreJours): string {
  return `${fenetre} derniers jours`;
}
