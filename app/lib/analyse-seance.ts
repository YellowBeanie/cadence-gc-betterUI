import { readFileSync } from 'node:fs';
import type { AnalyseSeance } from '@/lib/types';

/** Forme brute du fichier écrit par `deploy/nas/analyse-seance.sh` (hôte,
 *  hors contrôle de l'app) — même enveloppe à plat que `AnalyseBrute`
 *  (lib/analyse.ts), un fichier par activité. */
type AnalyseSeanceBrute = {
  genere_le: number;
  resume: string;
  observations: string[];
  prudence: string | null;
};

function estAnalyseSeanceBrute(v: unknown): v is AnalyseSeanceBrute {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.genere_le === 'number' && Number.isFinite(o.genere_le) &&
    typeof o.resume === 'string' &&
    Array.isArray(o.observations) && o.observations.every((x) => typeof x === 'string') &&
    (o.prudence === null || typeof o.prudence === 'string')
  );
}

/** Lecture tolérante de
 *  `${GARMIN_DATA_DIR}/export/analyses-seances/{activityId}.json` — produit
 *  hors du contrôle de l'app par un script hôte (tâche 24). Fichier absent,
 *  JSON invalide, ou JSON valide mais aux clés inattendues renvoient tous
 *  `null`, jamais une exception à l'écran (même logique que `lireAnalyse`). */
export function lireAnalyseSeance(activityId: number): AnalyseSeance | null {
  const racine = process.env.GARMIN_DATA_DIR ?? '/work';
  try {
    const brut: unknown = JSON.parse(
      readFileSync(`${racine}/export/analyses-seances/${activityId}.json`, 'utf8'),
    );
    if (!estAnalyseSeanceBrute(brut)) return null;
    return {
      genereLe: new Date(brut.genere_le * 1000),
      resume: brut.resume,
      observations: brut.observations,
      prudence: brut.prudence,
    };
  } catch {
    return null;
  }
}
