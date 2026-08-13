import { describe, it, expect } from 'vitest';
import { SERIES_COURBE, MAX_SERIES_ACTIVES, appliquerSeriesCourbe } from '@/lib/series-courbe';

// Tâche 48 (courbes enrichies, gisement G7 du rapport d'audit B1) : la
// préférence `courbes:<sport>` (lib/preferences-registre.ts, app/actions.ts)
// n'est jamais qu'une LISTE d'ids connus, au plus deux — même esprit de
// revalidation tolérante que lib/densite.ts/lib/fenetre-temporelle.ts
// (« valeur invalide → repli, jamais une exception »), mais sur un tableau
// plutôt qu'une valeur scalaire.

describe('SERIES_COURBE / MAX_SERIES_ACTIVES', () => {
  it('les trois séries connues, au plus deux actives à la fois', () => {
    expect(SERIES_COURBE).toEqual(['cadence', 'altitude', 'puissance']);
    expect(MAX_SERIES_ACTIVES).toBe(2);
  });
});

describe('appliquerSeriesCourbe : revalidation tolérante', () => {
  it('renvoie [] pour une sauvegarde absente, non-tableau ou vide', () => {
    expect(appliquerSeriesCourbe(null)).toEqual([]);
    expect(appliquerSeriesCourbe(undefined)).toEqual([]);
    expect(appliquerSeriesCourbe('cadence')).toEqual([]);
    expect(appliquerSeriesCourbe({ 0: 'cadence' })).toEqual([]);
    expect(appliquerSeriesCourbe([])).toEqual([]);
  });

  it('reprend une liste connue telle quelle (deux séries)', () => {
    expect(appliquerSeriesCourbe(['cadence', 'altitude'])).toEqual(['cadence', 'altitude']);
  });

  it('écarte les ids inconnus sans casser le reste de la liste', () => {
    expect(appliquerSeriesCourbe(['cadence', 'inconnue', 'altitude'])).toEqual(['cadence', 'altitude']);
  });

  it('plafonne à MAX_SERIES_ACTIVES, jamais un tableau plus long', () => {
    expect(appliquerSeriesCourbe(['cadence', 'altitude', 'puissance'])).toEqual(['cadence', 'altitude']);
  });

  it('déduplique en gardant la première occurrence', () => {
    expect(appliquerSeriesCourbe(['cadence', 'cadence', 'altitude'])).toEqual(['cadence', 'altitude']);
  });

  it('ignore les entrées d’un mauvais type au sein du tableau', () => {
    expect(appliquerSeriesCourbe(['cadence', 42, null, 'altitude'])).toEqual(['cadence', 'altitude']);
  });
});
