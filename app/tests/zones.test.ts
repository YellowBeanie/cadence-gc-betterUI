import { describe, it, expect } from 'vitest';
import { ZONES } from '@/lib/zones';

describe('ZONES : rampe des zones de FC (tâche 21, extraite de l’ancien lib/couloir.ts)', () => {
  it('couvre les cinq zones, dans l’ordre, avec les hex verbatim d’origine', () => {
    expect(ZONES.map((z) => z.label)).toEqual(['Z1', 'Z2', 'Z3', 'Z4', 'Z5']);
    expect(ZONES.map((z) => z.couleur)).toEqual([
      '#5AA9E6', '#4ED4A0', '#F2C94C', '#F2994A', '#EB5757',
    ]);
  });
});
