import { describe, it, expect } from 'vitest';
import {
  construireRadar, choisirComparaisonParDefaut, type DonneesRadarSeance,
} from '@/lib/radar-seances';

// Tâche 40 (radar comparatif inter-séances) — TDD strict, cf.
// docs/superpowers/specs/2026-08-11-personnalisation.md : c'est la logique
// de normalisation, le cœur « honnêteté » de la spec. Deux séances de course
// plausibles, volumes différents, pour exercer tous les axes en même temps.

const SEANCE_A: DonneesRadarSeance = {
  distanceM: 8000, deniveleMonte: 80, dureeSec: 2400, fcMoy: 152,
  chargeEntrainement: 180, zones: { z1: 10, z2: 20, z3: 8, z4: 2, z5: 0 },
};

const SEANCE_B: DonneesRadarSeance = {
  distanceM: 4000, deniveleMonte: 40, dureeSec: 1400, fcMoy: 160,
  chargeEntrainement: 90, zones: { z1: 4, z2: 8, z3: 8, z4: 4, z5: 0 },
};

const VIDE: DonneesRadarSeance = {
  distanceM: null, deniveleMonte: null, dureeSec: null, fcMoy: null,
  chargeEntrainement: null, zones: null,
};

describe('construireRadar : sept axes candidats, un seul commun de chaque côté', () => {
  it('construit les sept axes quand les deux séances portent toutes les mesures', () => {
    const r = construireRadar(SEANCE_A, SEANCE_B);
    expect(r).not.toBeNull();
    expect(r?.axes.map((a) => a.cle)).toEqual(['distance', 'temps', 'allure', 'denivele', 'fc', 'charge', 'z1z2']);
  });

  it('normalise chaque axe sur le max des deux séances — le max vaut 100', () => {
    const r = construireRadar(SEANCE_A, SEANCE_B);
    const distance = r?.axes.find((a) => a.cle === 'distance');
    // A (8000 m) > B (4000 m) : A à 100, B à 50.
    expect(distance?.normA).toBe(100);
    expect(distance?.normB).toBe(50);
  });

  it('affiche les valeurs réelles formatées (distance, D+, FC, charge) à côté du pourcentage', () => {
    const r = construireRadar(SEANCE_A, SEANCE_B);
    expect(r?.axes.find((a) => a.cle === 'distance')).toMatchObject({ reelA: '8.00 km', reelB: '4.00 km' });
    expect(r?.axes.find((a) => a.cle === 'denivele')).toMatchObject({ reelA: '80 m', reelB: '40 m' });
    expect(r?.axes.find((a) => a.cle === 'fc')).toMatchObject({ reelA: '152 bpm', reelB: '160 bpm' });
    expect(r?.axes.find((a) => a.cle === 'charge')).toMatchObject({ reelA: '180', reelB: '90' });
  });

  it('temps : réutilise formaterDureeCourse, normalisé sur la durée brute', () => {
    const r = construireRadar(SEANCE_A, SEANCE_B);
    const temps = r?.axes.find((a) => a.cle === 'temps');
    expect(temps).toMatchObject({ reelA: '40:00', reelB: '23:20' }); // 2400s, 1400s
    expect(temps?.normA).toBe(100);
    expect(temps?.normB).toBeCloseTo((1400 / 2400) * 100, 5);
  });

  it('% Z1-Z2 : calcule le ratio de temps en zones basses puis normalise sur le max des deux', () => {
    const r = construireRadar(SEANCE_A, SEANCE_B);
    const z1z2 = r?.axes.find((a) => a.cle === 'z1z2');
    // A : (10+20)/(10+20+8+2) = 75 % ; B : (4+8)/(4+8+8+4) = 50 %.
    expect(z1z2).toMatchObject({ reelA: '75%', reelB: '50%' });
    expect(z1z2?.normA).toBe(100);
    expect(z1z2?.normB).toBeCloseTo((50 / 75) * 100, 5);
  });
});

describe('construireRadar : allure — échelle INVERSÉE (plus rapide = plus loin du centre)', () => {
  it('la séance la plus rapide (allure la plus basse) atteint 100, jamais la plus lente', () => {
    // A : 8000 m / 2400 s → 300 s/km (5:00/km). B : 4000 m / 1400 s → 350 s/km (5:50/km).
    // A est plus rapide que B.
    const r = construireRadar(SEANCE_A, SEANCE_B);
    const allure = r?.axes.find((a) => a.cle === 'allure');
    expect(allure?.normA).toBe(100); // A, la plus rapide, au maximum
    expect(allure?.normB).toBeLessThan(100);
    // Les valeurs réelles affichées restent l'allure classique (pas la vitesse).
    expect(allure?.reelA).toBe('5:00 /km');
    expect(allure?.reelB).toBe('5:50 /km');
  });

  it('inversion vérifiée dans l’autre sens : la séance lente en premier argument reste normalisée sous 100', () => {
    const r = construireRadar(SEANCE_B, SEANCE_A); // B (lente) affichée, A (rapide) comparée
    const allure = r?.axes.find((a) => a.cle === 'allure');
    expect(allure?.normA).toBeLessThan(100); // B, la plus lente, n’atteint pas le max
    expect(allure?.normB).toBe(100); // A, la plus rapide, au maximum
  });
});

describe('construireRadar : honnêteté — jamais un axe fabriqué, jamais un 0 inventé', () => {
  it('omet un axe dès qu’une des deux séances n’a pas la mesure (ex. pas de D+ en salle)', () => {
    const b = { ...SEANCE_B, deniveleMonte: null };
    const r = construireRadar(SEANCE_A, b);
    expect(r?.axes.map((a) => a.cle)).not.toContain('denivele');
  });

  it('omet l’allure si l’une des deux séances n’a pas de distance (impossible de la calculer)', () => {
    const b = { ...SEANCE_B, distanceM: null };
    const r = construireRadar(SEANCE_A, b);
    expect(r?.axes.map((a) => a.cle)).not.toContain('allure');
    // La distance elle-même est déjà absente de B, donc son propre axe est
    // omis aussi — pas seulement l'allure qui en dépend.
    expect(r?.axes.map((a) => a.cle)).not.toContain('distance');
  });

  it('omet % Z1-Z2 si une seule des deux séances a des zones connues', () => {
    const b = { ...SEANCE_B, zones: null };
    const r = construireRadar(SEANCE_A, b);
    expect(r?.axes.map((a) => a.cle)).not.toContain('z1z2');
  });

  it('omet % Z1-Z2 si les zones existent mais totalisent 0 (rien à diviser)', () => {
    const a = { ...SEANCE_A, zones: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 } };
    const r = construireRadar(a, SEANCE_B);
    expect(r?.axes.map((a2) => a2.cle)).not.toContain('z1z2');
  });

  it('D+ nul des deux côtés (sortie plate) reste un axe légitime, normalisé à 0/0 sans planter', () => {
    const a = { ...SEANCE_A, deniveleMonte: 0 };
    const b = { ...SEANCE_B, deniveleMonte: 0 };
    const r = construireRadar(a, b);
    const denivele = r?.axes.find((ax) => ax.cle === 'denivele');
    expect(denivele).toMatchObject({ normA: 0, normB: 0, reelA: '0 m', reelB: '0 m' });
  });
});

describe('construireRadar : minimum trois axes communs, sinon null', () => {
  it('renvoie null quand une seule mesure est commune (sous le minimum de trois)', () => {
    // Seule fcMoy est commune aux deux côtés : un seul axe possible, sous le
    // minimum de trois → le radar ne se construit pas.
    const presqueVide: DonneesRadarSeance = { ...VIDE, fcMoy: 150 };
    expect(construireRadar(SEANCE_A, presqueVide)).toBeNull();
  });

  it('renvoie null quand aucune mesure n’est commune', () => {
    expect(construireRadar(SEANCE_A, VIDE)).toBeNull();
  });

  it('construit le radar dès que le minimum est atteint (l’allure se déduit de distance+temps, en plus)', () => {
    const partielle: DonneesRadarSeance = { ...VIDE, distanceM: 5000, dureeSec: 1500, fcMoy: 145 };
    const r = construireRadar(SEANCE_A, partielle);
    expect(r).not.toBeNull();
    // distance + temps + fc communs (3, le minimum) — l'allure s'ajoute
    // automatiquement puisqu'elle ne dépend que de distance/temps, déjà tous
    // deux communs : 4 axes au total, pas 3.
    expect(r?.axes.map((a) => a.cle)).toEqual(['distance', 'temps', 'allure', 'fc']);
  });
});

describe('choisirComparaisonParDefaut : la séance précédente du même sport, par défaut', () => {
  it('choisit la plus récente parmi celles AVANT la séance affichée', () => {
    const candidats = [
      { id: 1, debut: '2026-07-20 08:00:00' },
      { id: 2, debut: '2026-07-28 08:00:00' }, // la plus proche avant
      { id: 3, debut: '2026-08-10 08:00:00' }, // après
    ];
    expect(choisirComparaisonParDefaut(candidats, '2026-08-05 19:00:00')).toBe(2);
  });

  it('replie sur la plus proche APRÈS quand la séance affichée est la toute première de ce sport', () => {
    const candidats = [
      { id: 5, debut: '2026-08-12 08:00:00' }, // la plus proche après
      { id: 6, debut: '2026-08-20 08:00:00' },
    ];
    expect(choisirComparaisonParDefaut(candidats, '2026-08-05 19:00:00')).toBe(5);
  });

  it('renvoie null quand la liste de candidats est vide', () => {
    expect(choisirComparaisonParDefaut([], '2026-08-05 19:00:00')).toBeNull();
  });

  it('ne plante jamais sur une égalité exacte de date — renvoie la première candidate', () => {
    const candidats = [{ id: 9, debut: '2026-08-05 19:00:00' }];
    expect(choisirComparaisonParDefaut(candidats, '2026-08-05 19:00:00')).toBe(9);
  });
});
