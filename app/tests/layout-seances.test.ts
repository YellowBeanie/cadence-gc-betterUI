import { describe, it, expect } from 'vitest';
import {
  LAYOUT_SEANCES_PAR_DEFAUT, SECTIONS_SEANCES, appliquerLayoutSeances,
} from '@/lib/layout-seances';

// Tâche 45 (T45 du rapport B1) : même transposition que layout-historique —
// les cas limites génériques de la fusion (id inconnu, doublon, entrée
// malformée) sont déjà couverts par tests/layout-accueil.test.ts. Ce fichier
// se concentre sur les deux sections spécifiques à /seances, volontairement
// peu nombreuses (« ne fabrique pas des sections artificielles », mission).

describe('LAYOUT_SEANCES_PAR_DEFAUT : le défaut est l’écran actuel, à l’identique', () => {
  it('liste les 2 sections dans l’ordre actuel de la page, toutes visibles', () => {
    expect(LAYOUT_SEANCES_PAR_DEFAUT.sections.map((s) => s.id)).toEqual(['stats-par-sport', 'liste-seances']);
    expect(LAYOUT_SEANCES_PAR_DEFAUT.sections.every((s) => s.visible)).toBe(true);
  });

  it('SECTIONS_SEANCES couvre exactement les mêmes ids que le défaut', () => {
    expect(SECTIONS_SEANCES).toEqual(LAYOUT_SEANCES_PAR_DEFAUT.sections.map((s) => s.id));
  });
});

describe('appliquerLayoutSeances : clé absente ou sauvegarde vide', () => {
  it('renvoie le défaut tel quel quand la sauvegarde est null', () => {
    expect(appliquerLayoutSeances(LAYOUT_SEANCES_PAR_DEFAUT, null)).toEqual(LAYOUT_SEANCES_PAR_DEFAUT);
  });

  it('renvoie le défaut tel quel quand la sauvegarde n’est pas un objet', () => {
    expect(appliquerLayoutSeances(LAYOUT_SEANCES_PAR_DEFAUT, 42 as unknown)).toEqual(LAYOUT_SEANCES_PAR_DEFAUT);
  });
});

describe('appliquerLayoutSeances : fusion des sections', () => {
  it('respecte l’ordre et la visibilité sauvegardés (liste inversée, stats masquées)', () => {
    const sauvegarde = { sections: [{ id: 'liste-seances', visible: true }, { id: 'stats-par-sport', visible: false }] };
    const r = appliquerLayoutSeances(LAYOUT_SEANCES_PAR_DEFAUT, sauvegarde);
    expect(r.sections.map((s) => s.id)).toEqual(['liste-seances', 'stats-par-sport']);
    expect(r.sections.find((s) => s.id === 'stats-par-sport')?.visible).toBe(false);
  });

  it('ignore un id de section inconnu et ajoute en fin les ids manquants du défaut', () => {
    const sauvegarde = { sections: [{ id: 'section-fantome', visible: true }, { id: 'liste-seances', visible: true }] };
    const r = appliquerLayoutSeances(LAYOUT_SEANCES_PAR_DEFAUT, sauvegarde);
    expect(r.sections.map((s) => s.id)).not.toContain('section-fantome');
    expect(r.sections).toEqual([{ id: 'liste-seances', visible: true }, { id: 'stats-par-sport', visible: true }]);
  });
});
