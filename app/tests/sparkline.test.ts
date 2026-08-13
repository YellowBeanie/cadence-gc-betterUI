import { describe, it, expect } from 'vitest';
import { segmentsSparkline } from '@/lib/sparkline';

describe('segmentsSparkline : logique pure de la sparkline 7 jours (tâche 19)', () => {
  it('ne trace rien avec moins de deux valeurs connues', () => {
    expect(segmentsSparkline([], 90, 28)).toEqual({ segments: [], dernierPoint: null });
    expect(segmentsSparkline([null, null], 90, 28)).toEqual({ segments: [], dernierPoint: null });
    expect(segmentsSparkline([42], 90, 28)).toEqual({ segments: [], dernierPoint: null });
    expect(segmentsSparkline([42, null, null], 90, 28)).toEqual({ segments: [], dernierPoint: null });
  });

  it('trace un seul segment continu quand toutes les valeurs sont connues', () => {
    const { segments, dernierPoint } = segmentsSparkline([10, 20, 30], 90, 28);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveLength(3);
    // Premier point à x=0, dernier à x=largeur (extrémités du tracé).
    expect(segments[0][0].x).toBe(0);
    expect(segments[0][2].x).toBe(90);
    // Valeur la plus haute (30) → y le plus petit (proche du haut du SVG).
    expect(segments[0][2].y).toBeLessThan(segments[0][0].y);
    expect(dernierPoint).toEqual(segments[0][2]);
  });

  it('casse le tracé en segments distincts autour d’un trou (jamais de zéro fabriqué)', () => {
    const { segments } = segmentsSparkline([10, null, 30, 40], 90, 28);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toHaveLength(1);   // le point isolé avant le trou
    expect(segments[1]).toHaveLength(2);   // les deux points après le trou
  });

  it('place le marqueur final sur la dernière valeur CONNUE, pas le dernier jour', () => {
    const { dernierPoint } = segmentsSparkline([10, 20, 30, null], 90, 28);
    // Le point le plus récent connu est à l'index 2 sur 4 (x = 2/3 * 90).
    expect(dernierPoint?.x).toBeCloseTo(60, 4);
  });

  it('centre le tracé verticalement quand toutes les valeurs connues sont égales', () => {
    const { segments } = segmentsSparkline([50, 50, 50], 90, 28);
    expect(segments[0].every((p) => p.y === 14)).toBe(true);
  });

  it('borne les points dans la hauteur utile (marge verticale respectée)', () => {
    const { segments } = segmentsSparkline([0, 100], 90, 28);
    for (const seg of segments) {
      for (const p of seg) {
        expect(p.y).toBeGreaterThanOrEqual(3);
        expect(p.y).toBeLessThanOrEqual(25);
      }
    }
  });
});
