// Logique pure de préparation de la courbe FC + allure (page de détail de
// séance, tâche 20) : sépare la dérivation numérique du composant Recharts
// pour rester testable sans DOM — même découpage que lib/couloir.ts et
// lib/sparkline.ts.

import type { TrackpointSeance } from './types';
import { SERIES_COURBE, type SerieCourbe } from './series-courbe';

export type PointCourbe = {
  distanceKm: number;
  fcBpm: number | null;
  allureMinKm: number | null;
  altitudeM: number | null;
  // Ajoutées tâche 48 (courbes enrichies) : mêmes valeurs brutes que
  // TrackpointSeance, seulement reprojetées sur la distance comme le reste
  // de ce type — voir lib/types.ts pour la convention `null` = pas de mesure.
  cadenceSpm: number | null;
  puissanceW: number | null;
};

/** Prépare la trace sous-échantillonnée (lireTrackpoints, lib/db/garmin.ts)
 *  pour la courbe FC + allure sur la distance.
 *
 *  Un point sans distance connue est écarté : il ne peut pas se positionner
 *  sur l'axe X, l'inclure obligerait à inventer une abscisse. Une vitesse
 *  nulle ou absente donne une allure `null` — un arrêt réel n'a pas d'allure
 *  instantanée définie (division par zéro), ce n'est pas un 0 à fabriquer ni
 *  un trou de capteur au même titre que la FC, mais le résultat correct de
 *  la formule « pas de vitesse, pas d'allure ». */
export function preparerCourbeSeance(points: TrackpointSeance[]): PointCourbe[] {
  return points
    .filter((p): p is TrackpointSeance & { distanceM: number } => p.distanceM != null)
    .map((p) => ({
      distanceKm: p.distanceM / 1000,
      fcBpm: p.fcBpm,
      allureMinKm: p.vitesseMps != null && p.vitesseMps > 0 ? (1000 / p.vitesseMps) / 60 : null,
      altitudeM: p.altitudeM,
      cadenceSpm: p.cadenceSpm,
      puissanceW: p.puissanceW,
    }));
}

function valeurBrute(p: TrackpointSeance, serie: SerieCourbe): number | null {
  switch (serie) {
    case 'cadence': return p.cadenceSpm;
    case 'altitude': return p.altitudeM;
    case 'puissance': return p.puissanceW;
    default: return null;
  }
}

/** Séries optionnelles (lib/series-courbe.ts) réellement disponibles pour
 *  CETTE séance (tâche 48) : une série ne compte comme disponible que si au
 *  moins un trackpoint porte une valeur non nulle — jamais déduit du sport ni
 *  d'une autre séance (honnêteté absolue, mission tâche 48 : « une série sans
 *  données pour la séance n'existe pas pour cette séance »). Lit les
 *  trackpoints BRUTS (avant le filtrage par distance de `preparerCourbeSeance`) :
 *  un point sans distance connue mais avec une cadence connue compterait quand
 *  même pour la disponibilité, ce n'est pas la même question que le tracé.
 *  Ordre stable = `SERIES_COURBE`, pour un affichage toujours dans le même
 *  ordre (interrupteurs, légende). */
export function seriesDisponibles(points: TrackpointSeance[]): SerieCourbe[] {
  return SERIES_COURBE.filter((serie) => points.some((p) => valeurBrute(p, serie) != null));
}
