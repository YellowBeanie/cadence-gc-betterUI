import { describe, it, expect } from 'vitest';
import {
  LAYOUT_PAR_DEFAUT, SECTIONS_ACCUEIL, TUILES_MESURES, HEROS_OPTIONS, appliquerLayout,
} from '@/lib/layout-accueil';

// Tâche 37 (socle personnalisation) : `appliquerLayout` est le cœur de la
// logique de layout — fusion tolérante entre le défaut (l'écran actuel, à
// l'identique) et une sauvegarde utilisateur potentiellement partielle,
// désynchronisée (id retiré du code depuis), ou carrément mal formée (JSON
// d'une ancienne version, tapé à la main). Jamais d'écran cassé, jamais une
// tuile qui disparaît silencieusement faute d'entrée dans la sauvegarde.

describe('LAYOUT_PAR_DEFAUT : le défaut est l’écran actuel, à l’identique', () => {
  it('liste les 7 sections dans l’ordre actuel du dashboard, toutes visibles', () => {
    expect(LAYOUT_PAR_DEFAUT.sections.map((s) => s.id)).toEqual([
      'heros', 'bande-mesures', 'ressenti', 'charge-7j', 'predictions', 'seances-recentes', 'layers',
    ]);
    expect(LAYOUT_PAR_DEFAUT.sections.every((s) => s.visible)).toBe(true);
  });

  it('liste les 14 tuiles de mesures dans l’ordre actuel de bande-mesures.tsx, toutes visibles', () => {
    expect(LAYOUT_PAR_DEFAUT.tuiles).toHaveLength(14);
    expect(LAYOUT_PAR_DEFAUT.tuiles.map((t) => t.id)).toEqual([
      'readiness', 'hrv', 'fc-repos', 'sommeil', 'charge', 'calories',
      'pas', 'etages', 'intensite', 'stress', 'spo2', 'vo2max', 'respiration', 'age-forme',
    ]);
    expect(LAYOUT_PAR_DEFAUT.tuiles.every((t) => t.visible)).toBe(true);
  });

  it('choisit Body Battery comme héros par défaut', () => {
    expect(LAYOUT_PAR_DEFAUT.heros).toBe('body_battery');
  });

  it('SECTIONS_ACCUEIL/TUILES_MESURES/HEROS_OPTIONS couvrent exactement les mêmes ids que le défaut', () => {
    expect(SECTIONS_ACCUEIL).toEqual(LAYOUT_PAR_DEFAUT.sections.map((s) => s.id));
    expect(TUILES_MESURES).toEqual(LAYOUT_PAR_DEFAUT.tuiles.map((t) => t.id));
    expect(HEROS_OPTIONS).toContain(LAYOUT_PAR_DEFAUT.heros);
  });
});

describe('appliquerLayout : clé absente ou sauvegarde vide', () => {
  it('renvoie le défaut tel quel quand la sauvegarde est null', () => {
    expect(appliquerLayout(LAYOUT_PAR_DEFAUT, null)).toEqual(LAYOUT_PAR_DEFAUT);
  });

  it('renvoie le défaut tel quel quand la sauvegarde n’est pas un objet', () => {
    expect(appliquerLayout(LAYOUT_PAR_DEFAUT, 'pas un objet' as unknown)).toEqual(LAYOUT_PAR_DEFAUT);
    expect(appliquerLayout(LAYOUT_PAR_DEFAUT, 42 as unknown)).toEqual(LAYOUT_PAR_DEFAUT);
  });
});

describe('appliquerLayout : fusion des sections', () => {
  it('respecte l’ordre et la visibilité sauvegardés quand tous les ids sont connus', () => {
    const sauvegarde = {
      sections: [
        { id: 'layers', visible: true },
        { id: 'heros', visible: false },
        { id: 'bande-mesures', visible: true },
        { id: 'ressenti', visible: true },
        { id: 'charge-7j', visible: true },
        { id: 'predictions', visible: true },
        { id: 'seances-recentes', visible: true },
      ],
      tuiles: LAYOUT_PAR_DEFAUT.tuiles,
      heros: 'body_battery',
    };
    const r = appliquerLayout(LAYOUT_PAR_DEFAUT, sauvegarde);
    expect(r.sections.map((s) => s.id)).toEqual([
      'layers', 'heros', 'bande-mesures', 'ressenti', 'charge-7j', 'predictions', 'seances-recentes',
    ]);
    expect(r.sections.find((s) => s.id === 'heros')?.visible).toBe(false);
  });

  it('ignore un id de section inconnu présent dans la sauvegarde', () => {
    const sauvegarde = {
      sections: [
        { id: 'section-fantome', visible: true },
        ...LAYOUT_PAR_DEFAUT.sections,
      ],
      tuiles: LAYOUT_PAR_DEFAUT.tuiles,
      heros: 'body_battery',
    };
    const r = appliquerLayout(LAYOUT_PAR_DEFAUT, sauvegarde);
    expect(r.sections.map((s) => s.id)).not.toContain('section-fantome');
    expect(r.sections).toHaveLength(7);
  });

  it('ajoute en fin, visible, une section du défaut absente de la sauvegarde', () => {
    const sauvegarde = {
      sections: LAYOUT_PAR_DEFAUT.sections.filter((s) => s.id !== 'layers'),
      tuiles: LAYOUT_PAR_DEFAUT.tuiles,
      heros: 'body_battery',
    };
    const r = appliquerLayout(LAYOUT_PAR_DEFAUT, sauvegarde);
    expect(r.sections.at(-1)).toEqual({ id: 'layers', visible: true });
  });

  it('déduplique un id répété dans la sauvegarde (garde la première occurrence)', () => {
    const sauvegarde = {
      sections: [
        { id: 'layers', visible: false },
        { id: 'layers', visible: true },
        ...LAYOUT_PAR_DEFAUT.sections.filter((s) => s.id !== 'layers'),
      ],
      tuiles: LAYOUT_PAR_DEFAUT.tuiles,
      heros: 'body_battery',
    };
    const r = appliquerLayout(LAYOUT_PAR_DEFAUT, sauvegarde);
    expect(r.sections.filter((s) => s.id === 'layers')).toHaveLength(1);
    expect(r.sections.find((s) => s.id === 'layers')?.visible).toBe(false);
  });

  it('renvoie visible: true quand l’entrée sauvegardée ne porte pas de champ visible exploitable', () => {
    const sauvegarde = {
      sections: [
        { id: 'heros' }, // pas de champ `visible` du tout
        { id: 'bande-mesures', visible: 'oui' }, // mauvais type
        ...LAYOUT_PAR_DEFAUT.sections.filter((s) => s.id !== 'heros' && s.id !== 'bande-mesures'),
      ],
      tuiles: LAYOUT_PAR_DEFAUT.tuiles,
      heros: 'body_battery',
    };
    const r = appliquerLayout(LAYOUT_PAR_DEFAUT, sauvegarde);
    expect(r.sections.find((s) => s.id === 'heros')?.visible).toBe(true);
    expect(r.sections.find((s) => s.id === 'bande-mesures')?.visible).toBe(true);
  });

  it('tolère une sauvegarde dont `sections` n’est pas un tableau : replie sur le défaut', () => {
    const sauvegarde = { sections: 'pas un tableau', tuiles: LAYOUT_PAR_DEFAUT.tuiles, heros: 'body_battery' };
    const r = appliquerLayout(LAYOUT_PAR_DEFAUT, sauvegarde as never);
    expect(r.sections).toEqual(LAYOUT_PAR_DEFAUT.sections);
  });

  it('ignore les entrées non-objets glissées dans le tableau (JSON tapé à la main)', () => {
    const sauvegarde = {
      sections: [null, 'texte', 3, { id: 'heros', visible: true }, ...LAYOUT_PAR_DEFAUT.sections],
      tuiles: LAYOUT_PAR_DEFAUT.tuiles,
      heros: 'body_battery',
    };
    expect(() => appliquerLayout(LAYOUT_PAR_DEFAUT, sauvegarde as never)).not.toThrow();
    const r = appliquerLayout(LAYOUT_PAR_DEFAUT, sauvegarde as never);
    expect(r.sections).toHaveLength(7);
  });
});

describe('appliquerLayout : fusion des tuiles (même logique que les sections)', () => {
  it('respecte l’ordre/visibilité sauvegardés et ajoute en fin les tuiles nouvelles du code', () => {
    const sauvegarde = {
      sections: LAYOUT_PAR_DEFAUT.sections,
      tuiles: [
        { id: 'vo2max', visible: true },
        { id: 'readiness', visible: false },
        { id: 'tuile-retiree-depuis', visible: true }, // id inconnu : ignoré
      ],
      heros: 'body_battery',
    };
    const r = appliquerLayout(LAYOUT_PAR_DEFAUT, sauvegarde);
    expect(r.tuiles[0]).toEqual({ id: 'vo2max', visible: true });
    expect(r.tuiles[1]).toEqual({ id: 'readiness', visible: false });
    expect(r.tuiles.map((t) => t.id)).not.toContain('tuile-retiree-depuis');
    // Les 12 autres tuiles connues, absentes de la sauvegarde, sont ajoutées
    // en fin dans l'ordre du défaut, toutes visibles.
    expect(r.tuiles).toHaveLength(14);
    expect(r.tuiles.slice(2).every((t) => t.visible)).toBe(true);
  });
});

describe('appliquerLayout : choix du héros', () => {
  it('reprend le héros sauvegardé quand il fait partie des options connues', () => {
    const sauvegarde = { sections: LAYOUT_PAR_DEFAUT.sections, tuiles: LAYOUT_PAR_DEFAUT.tuiles, heros: 'stress' };
    expect(appliquerLayout(LAYOUT_PAR_DEFAUT, sauvegarde).heros).toBe('stress');
  });

  it.each(HEROS_OPTIONS)('accepte l’option héros %s', (heros) => {
    const sauvegarde = { sections: LAYOUT_PAR_DEFAUT.sections, tuiles: LAYOUT_PAR_DEFAUT.tuiles, heros };
    expect(appliquerLayout(LAYOUT_PAR_DEFAUT, sauvegarde).heros).toBe(heros);
  });

  it('replie sur le héros par défaut si la valeur sauvegardée est inconnue', () => {
    const sauvegarde = { sections: LAYOUT_PAR_DEFAUT.sections, tuiles: LAYOUT_PAR_DEFAUT.tuiles, heros: 'vo2max' };
    expect(appliquerLayout(LAYOUT_PAR_DEFAUT, sauvegarde as never).heros).toBe('body_battery');
  });

  it('replie sur le héros par défaut si le champ heros est absent ou d’un mauvais type', () => {
    expect(appliquerLayout(LAYOUT_PAR_DEFAUT, { sections: [], tuiles: [] } as never).heros).toBe('body_battery');
    expect(appliquerLayout(LAYOUT_PAR_DEFAUT, { heros: 7 } as never).heros).toBe('body_battery');
  });
});
