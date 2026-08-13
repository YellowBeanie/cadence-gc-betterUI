// Moteur de layout de /historique (tâche 45, gisement T41 du rapport B1) :
// transposition directe de lib/layout-accueil.ts — même défaut canonique,
// même fusion tolérante (`fusionnerListe`, réutilisée telle quelle, pas
// redupliquée) — mais UNE seule liste de sections sous UNE clé fixe
// ('historique'), pas de tuiles ni de héros : l'écran est un empilement de
// panneaux (stats de la semaine, tendances, records...), chacun déjà son
// propre composant qui s'omet lui-même si sa donnée manque.
import { fusionnerListe, estObjet, type ElementLayout } from './layout-accueil';

/** Ordre exact de l'écran actuel (app/historique/page.tsx) — le défaut, à
 *  l'identique, tant qu'aucune préférence n'est enregistrée. Le bloc
 *  d'identité de la page (titre, résumé de l'analyse Claude, observations)
 *  n'apparaît PAS ici : comme le héros de brouillons de l'accueil ou le
 *  bloc photo+stats de la page séance, c'est l'identité de l'écran — toujours
 *  en tête, jamais masquable ni réordonnable. Le lien final « Toutes les
 *  séances » n'en fait pas non plus partie : c'est de la navigation, pas une
 *  section de contenu. */
export const SECTIONS_HISTORIQUE = [
  'stats-semaine', 'tendance-semaines', 'zones-par-semaine', 'efficacite-aerobie',
  'records', 'graphiques', 'guidance', 'boxe-regularite',
] as const;
export type IdSectionHistorique = (typeof SECTIONS_HISTORIQUE)[number];

export type LayoutHistorique = { sections: ElementLayout<IdSectionHistorique>[] };

export const LAYOUT_HISTORIQUE_PAR_DEFAUT: LayoutHistorique = {
  sections: SECTIONS_HISTORIQUE.map((id) => ({ id, visible: true })),
};

/** Fusionne `defaut` (toujours l'écran actuel) avec une sauvegarde lue via
 *  `lirePreference` (clé 'historique') — même garde et même fusion générique
 *  qu'`appliquerLayout`/`appliquerLayoutSeance`, réutilisées telles quelles. */
export function appliquerLayoutHistorique(defaut: LayoutHistorique, sauvegarde: unknown): LayoutHistorique {
  if (!estObjet(sauvegarde)) return defaut;
  return { sections: fusionnerListe(defaut.sections, sauvegarde.sections) };
}
