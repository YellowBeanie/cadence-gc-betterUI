import { describe, it, expect } from 'vitest';
import { fusionnerSeances } from '@/lib/fusion';
import type { Activite } from '@/lib/types';

const activites: Activite[] = [
  { id: 1, debut: '2026-08-05 19:01:04', nom: 'Nyon - Base', type: 'running',
    distanceM: 4005, dureeSec: 2003, fcMoy: 160, fcMax: 186, effetAerobie: 3.2 },
  { id: 2, debut: '2026-08-04 18:30:00', nom: 'Boxe', type: 'other',
    distanceM: null, dureeSec: 3600, fcMoy: 142, fcMax: 178, effetAerobie: null },
];

describe('fusion des séances', () => {
  it('enrichit une activité Garmin rattachée au lieu de la dupliquer', () => {
    const r = fusionnerSeances(activites, [
      { id: 10, date: '2026-08-04', sport: 'boxe', sousType: 'sparring', dureeMin: 60,
        rpe: 8, notes: null, garminActivityId: 2, source: 'manual' },
    ]);
    expect(r).toHaveLength(2);
    const boxe = r.find((s) => s.garminId === 2)!;
    expect(boxe.rpe).toBe(8);
    expect(boxe.sousType).toBe('sparring');
  });

  it('ajoute une séance manuelle non rattachée', () => {
    const r = fusionnerSeances(activites, [
      { id: 11, date: '2026-08-03', sport: 'boxe', sousType: 'sac', dureeMin: 45,
        rpe: 6, notes: null, garminActivityId: null, source: 'manual' },
    ]);
    expect(r).toHaveLength(3);
  });

  it('trie du plus récent au plus ancien', () => {
    const r = fusionnerSeances(activites, [
      { id: 12, date: '2026-08-06', sport: 'boxe', sousType: null, dureeMin: 60,
        rpe: 5, notes: null, garminActivityId: null, source: 'manual' },
    ]);
    expect(r[0].date.slice(0, 10)).toBe('2026-08-06');
    expect(r[r.length - 1].date.slice(0, 10)).toBe('2026-08-04');
  });

  it("ne fabrique aucun zéro : durée Garmin absente et pas de saisie manuelle => null", () => {
    const activiteSansDuree: Activite[] = [
      { id: 3, debut: '2026-08-02 08:00:00', nom: 'Marche', type: 'walking',
        distanceM: 1200, dureeSec: null, fcMoy: null, fcMax: null, effetAerobie: null },
    ];
    const r = fusionnerSeances(activiteSansDuree, []);
    expect(r[0].dureeMin).toBeNull();
  });

  it('une séance manuelle autonome ne porte ni distance ni FC Garmin (jamais de zéro fabriqué)', () => {
    const r = fusionnerSeances([], [
      { id: 13, date: '2026-08-01', sport: 'boxe', sousType: 'sac', dureeMin: 45,
        rpe: 6, notes: null, garminActivityId: null, source: 'manual' },
    ]);
    expect(r[0].distanceM).toBeNull();
    expect(r[0].fcMoy).toBeNull();
  });

  it('expose l’effet aérobie Garmin, jamais fabriqué pour une séance manuelle (tâche 20)', () => {
    const r = fusionnerSeances(activites, []);
    const course = r.find((s) => s.garminId === 1)!;
    expect(course.effetAerobie).toBe(3.2);
    const boxeGarmin = r.find((s) => s.garminId === 2)!;
    expect(boxeGarmin.effetAerobie).toBeNull();

    const rManuelle = fusionnerSeances([], [
      { id: 20, date: '2026-08-01', sport: 'boxe', sousType: 'sac', dureeMin: 45,
        rpe: 6, notes: null, garminActivityId: null, source: 'manual' },
    ]);
    expect(rManuelle[0].effetAerobie).toBeNull();
  });

  it('nomme une séance manuelle autonome à partir du sport et du sous-type', () => {
    const r = fusionnerSeances([], [
      { id: 14, date: '2026-08-01', sport: 'boxe', sousType: 'sac', dureeMin: 45,
        rpe: 6, notes: null, garminActivityId: null, source: 'manual' },
      { id: 15, date: '2026-07-31', sport: 'boxe', sousType: null, dureeMin: 45,
        rpe: 6, notes: null, garminActivityId: null, source: 'manual' },
    ]);
    expect(r[0].nom).toBe('boxe — sac');
    expect(r[1].nom).toBe('boxe');
  });
});
