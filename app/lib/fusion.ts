import type { Activite } from '@/lib/types';
import type { SeanceManuelle } from '@/lib/db/training';

export type SeanceUnifiee = {
  cle: string;
  date: string;
  nom: string;
  sport: string | null;
  sousType: string | null;
  distanceM: number | null;
  dureeMin: number | null;
  fcMoy: number | null;
  // Effet d'entraînement aérobie Garmin (tâche 20, ligne enrichie de
  // l'Historique) : jamais une estimation manuelle, comme distanceM/fcMoy —
  // Garmin le calcule à partir de la FC mesurée, une saisie ne peut pas s'y
  // substituer.
  effetAerobie: number | null;
  rpe: number | null;
  garminId: number | null;
};

/** Une séance manuelle rattachée à une activité Garmin l'enrichit — elle ne
 *  s'y ajoute pas, sans quoi la charge d'entraînement serait comptée deux fois
 *  (une fois via l'activité, une fois via la saisie). */
export function fusionnerSeances(
  activites: Activite[], manuelles: SeanceManuelle[],
): SeanceUnifiee[] {
  const parGarminId = new Map<number, SeanceManuelle>();
  const autonomes: SeanceManuelle[] = [];
  for (const m of manuelles) {
    if (m.garminActivityId != null) parGarminId.set(m.garminActivityId, m);
    else autonomes.push(m);
  }

  const issuesDeGarmin: SeanceUnifiee[] = activites.map((a) => {
    const m = parGarminId.get(a.id);
    return {
      cle: `g${a.id}`,
      date: a.debut,
      nom: a.nom ?? a.type ?? 'Activité',
      sport: m?.sport ?? a.type ?? null,
      sousType: m?.sousType ?? null,
      // Distance et FC ne viennent jamais de la saisie manuelle : ce sont des
      // mesures Garmin, une estimation manuelle ne doit pas se faire passer
      // pour l'une d'elles.
      distanceM: a.distanceM,
      // Durée Garmin prioritaire (mesurée) ; à défaut, estimation manuelle ;
      // jamais de 0 fabriqué quand aucune des deux n'est connue.
      dureeMin: a.dureeSec != null ? Math.round(a.dureeSec / 60) : (m?.dureeMin ?? null),
      fcMoy: a.fcMoy,
      effetAerobie: a.effetAerobie,
      rpe: m?.rpe ?? null,
      garminId: a.id,
    };
  });

  const issuesDeSaisie: SeanceUnifiee[] = autonomes.map((m) => ({
    cle: `m${m.id}`,
    date: m.date,
    nom: m.sousType ? `${m.sport} — ${m.sousType}` : m.sport,
    sport: m.sport,
    sousType: m.sousType,
    distanceM: null,
    dureeMin: m.dureeMin,
    fcMoy: null,
    effetAerobie: null,
    rpe: m.rpe,
    garminId: null,
  }));

  return [...issuesDeGarmin, ...issuesDeSaisie].sort((a, b) => b.date.localeCompare(a.date));
}
