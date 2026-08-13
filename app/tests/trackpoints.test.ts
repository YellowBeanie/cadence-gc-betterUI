import { describe, it, expect } from 'vitest';
import { preparerCourbeSeance, seriesDisponibles } from '@/lib/trackpoints';
import type { TrackpointSeance } from '@/lib/types';

describe('preparerCourbeSeance : trace brute vers points de courbe (tâche 20)', () => {
  it('convertit la distance en km et dérive l’allure (min/km) depuis la vitesse', () => {
    const pts: TrackpointSeance[] = [
      { distanceM: 0, fcBpm: 100, vitesseMps: 2, altitudeM: 410, cadenceSpm: 170, puissanceW: 220 },
      { distanceM: 1000, fcBpm: 150, vitesseMps: 2.5, altitudeM: 415, cadenceSpm: 175, puissanceW: 240 },
    ];
    const r = preparerCourbeSeance(pts);
    expect(r[0].distanceKm).toBe(0);
    expect(r[1].distanceKm).toBe(1);
    // 1000 m / 2.5 m/s = 400 s pour 1 km = 6.667 min/km.
    expect(r[1].allureMinKm).toBeCloseTo(6.667, 2);
  });

  it('renvoie une allure null pour une vitesse nulle (arrêt réel), jamais une division par zéro affichée', () => {
    const pts: TrackpointSeance[] = [
      { distanceM: 500, fcBpm: 120, vitesseMps: 0, altitudeM: 410, cadenceSpm: 170, puissanceW: 220 },
    ];
    const r = preparerCourbeSeance(pts);
    expect(r[0].allureMinKm).toBeNull();
  });

  it('renvoie une allure null quand la vitesse est absente', () => {
    const pts: TrackpointSeance[] = [
      { distanceM: 500, fcBpm: 120, vitesseMps: null, altitudeM: 410, cadenceSpm: 170, puissanceW: 220 },
    ];
    const r = preparerCourbeSeance(pts);
    expect(r[0].allureMinKm).toBeNull();
  });

  it('conserve un trou (null) de FC sans le transformer', () => {
    const pts: TrackpointSeance[] = [
      { distanceM: 500, fcBpm: null, vitesseMps: 2, altitudeM: 410, cadenceSpm: 170, puissanceW: 220 },
    ];
    const r = preparerCourbeSeance(pts);
    expect(r[0].fcBpm).toBeNull();
  });

  it('écarte les points sans distance connue (ne peuvent pas se positionner sur l’axe X)', () => {
    const pts: TrackpointSeance[] = [
      { distanceM: null, fcBpm: 120, vitesseMps: 2, altitudeM: 410, cadenceSpm: 170, puissanceW: 220 },
      { distanceM: 500, fcBpm: 130, vitesseMps: 2, altitudeM: 412, cadenceSpm: 172, puissanceW: 225 },
    ];
    const r = preparerCourbeSeance(pts);
    expect(r).toHaveLength(1);
    expect(r[0].distanceKm).toBe(0.5);
  });

  it('renvoie un tableau vide pour une trace vide', () => {
    expect(preparerCourbeSeance([])).toEqual([]);
  });

  it('reprend cadence/puissance telles quelles (tâche 48, courbes enrichies)', () => {
    const pts: TrackpointSeance[] = [
      { distanceM: 500, fcBpm: 130, vitesseMps: 2, altitudeM: 412, cadenceSpm: 172, puissanceW: 225 },
      { distanceM: 1000, fcBpm: 135, vitesseMps: 2, altitudeM: 413, cadenceSpm: null, puissanceW: null },
    ];
    const r = preparerCourbeSeance(pts);
    expect(r[0]).toMatchObject({ cadenceSpm: 172, puissanceW: 225 });
    // Un trou de cadence/puissance reste un trou, jamais un zéro fabriqué.
    expect(r[1].cadenceSpm).toBeNull();
    expect(r[1].puissanceW).toBeNull();
  });
});

describe('seriesDisponibles : honnêteté par séance (tâche 48, courbes enrichies)', () => {
  it('ne propose que les séries ayant au moins une valeur connue pour CETTE séance', () => {
    const pts: TrackpointSeance[] = [
      { distanceM: 0, fcBpm: 100, vitesseMps: 2, altitudeM: 410, cadenceSpm: 170, puissanceW: null },
      { distanceM: 500, fcBpm: 110, vitesseMps: 2, altitudeM: 412, cadenceSpm: null, puissanceW: null },
    ];
    // Altitude et cadence ont chacune au moins une valeur ; puissance n'en a
    // aucune sur toute la trace (ex. randonnée sans footpod) — jamais
    // proposée, même si elle existe pour d'autres séances du même sport.
    expect(seriesDisponibles(pts)).toEqual(['cadence', 'altitude']);
  });

  it('renvoie [] quand aucune des trois séries n’a de donnée', () => {
    const pts: TrackpointSeance[] = [
      { distanceM: 0, fcBpm: 100, vitesseMps: 2, altitudeM: null, cadenceSpm: null, puissanceW: null },
    ];
    expect(seriesDisponibles(pts)).toEqual([]);
  });

  it('renvoie [] pour une trace vide (séance sans trackpoints, boxe/manuelle)', () => {
    expect(seriesDisponibles([])).toEqual([]);
  });

  it('compte une valeur même sur un point sans distance connue (question distincte du tracé)', () => {
    const pts: TrackpointSeance[] = [
      { distanceM: null, fcBpm: 100, vitesseMps: 2, altitudeM: null, cadenceSpm: 170, puissanceW: null },
    ];
    expect(seriesDisponibles(pts)).toEqual(['cadence']);
  });

  it('renvoie les trois séries dans l’ordre canonique quand toutes sont présentes', () => {
    const pts: TrackpointSeance[] = [
      { distanceM: 0, fcBpm: 100, vitesseMps: 2, altitudeM: 410, cadenceSpm: 170, puissanceW: 220 },
    ];
    expect(seriesDisponibles(pts)).toEqual(['cadence', 'altitude', 'puissance']);
  });
});
