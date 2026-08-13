// Moteur de layout de /seances (tâche 45, gisement T45 du rapport B1) — nom
// de fichier au PLURIEL, à ne pas confondre avec lib/layout-seance.ts (la
// page de détail /seance/[id], singulier) : même transposition directe de
// lib/layout-accueil.ts que ce dernier, mais l'écran est plus simple — deux
// sections seulement (pas de sections artificielles fabriquées pour ce
// réglage, cf. mission), sous UNE clé fixe ('seances'), pas per-sport.
import { fusionnerListe, estObjet, type ElementLayout } from './layout-accueil';

/** Les deux sections de l'écran actuel (app/seances/page.tsx), dans l'ordre
 *  actuel : la bande de stats par sport (Garmin + saisies manuelles), puis
 *  la liste complète groupée par mois. */
export const SECTIONS_SEANCES = ['stats-par-sport', 'liste-seances'] as const;
export type IdSectionSeances = (typeof SECTIONS_SEANCES)[number];

export type LayoutSeances = { sections: ElementLayout<IdSectionSeances>[] };

export const LAYOUT_SEANCES_PAR_DEFAUT: LayoutSeances = {
  sections: SECTIONS_SEANCES.map((id) => ({ id, visible: true })),
};

/** Fusionne `defaut` (toujours l'écran actuel) avec une sauvegarde lue via
 *  `lirePreference` (clé 'seances') — même garde et même fusion générique que
 *  les autres moteurs de layout, réutilisées telles quelles. */
export function appliquerLayoutSeances(defaut: LayoutSeances, sauvegarde: unknown): LayoutSeances {
  if (!estObjet(sauvegarde)) return defaut;
  return { sections: fusionnerListe(defaut.sections, sauvegarde.sections) };
}
