import { describe, it, expect } from 'vitest';
import {
  LAYOUT_HISTORIQUE_PAR_DEFAUT, SECTIONS_HISTORIQUE, appliquerLayoutHistorique,
} from '@/lib/layout-historique';

// Tâche 45 (T41 du rapport B1) : transposition directe de
// layout-accueil.ts/tests — `appliquerLayoutHistorique` réutilise la même
// fusion tolérante (`fusionnerListe`, exportée de lib/layout-accueil.ts), donc
// ses cas limites génériques (id inconnu, doublon, entrée malformée,
// sauvegarde non-tableau) sont déjà couverts par tests/layout-accueil.test.ts.
// Ce fichier se concentre sur ce qui est spécifique à /historique : les huit
// sections, dans l'ordre actuel de l'écran, et la fusion d'une sauvegarde
// partielle/obsolète.

describe('LAYOUT_HISTORIQUE_PAR_DEFAUT : le défaut est l’écran actuel, à l’identique', () => {
  it('liste les 8 sections dans l’ordre actuel de la page, toutes visibles', () => {
    expect(LAYOUT_HISTORIQUE_PAR_DEFAUT.sections.map((s) => s.id)).toEqual([
      'stats-semaine', 'tendance-semaines', 'zones-par-semaine', 'efficacite-aerobie',
      'records', 'graphiques', 'guidance', 'boxe-regularite',
    ]);
    expect(LAYOUT_HISTORIQUE_PAR_DEFAUT.sections.every((s) => s.visible)).toBe(true);
  });

  it('SECTIONS_HISTORIQUE couvre exactement les mêmes ids que le défaut', () => {
    expect(SECTIONS_HISTORIQUE).toEqual(LAYOUT_HISTORIQUE_PAR_DEFAUT.sections.map((s) => s.id));
  });

  it('n’inclut pas le bloc d’identité (titre/analyse/observations) ni le lien de navigation final', () => {
    expect(SECTIONS_HISTORIQUE).not.toContain('identite');
    expect(SECTIONS_HISTORIQUE).not.toContain('toutes-les-seances');
  });
});

describe('appliquerLayoutHistorique : clé absente ou sauvegarde vide', () => {
  it('renvoie le défaut tel quel quand la sauvegarde est null', () => {
    expect(appliquerLayoutHistorique(LAYOUT_HISTORIQUE_PAR_DEFAUT, null)).toEqual(LAYOUT_HISTORIQUE_PAR_DEFAUT);
  });

  it('renvoie le défaut tel quel quand la sauvegarde n’est pas un objet', () => {
    expect(appliquerLayoutHistorique(LAYOUT_HISTORIQUE_PAR_DEFAUT, 'pas un objet' as unknown)).toEqual(LAYOUT_HISTORIQUE_PAR_DEFAUT);
  });
});

describe('appliquerLayoutHistorique : fusion des sections', () => {
  it('respecte l’ordre et la visibilité sauvegardés quand tous les ids sont connus', () => {
    const sauvegarde = {
      sections: [
        { id: 'boxe-regularite', visible: true },
        { id: 'records', visible: false },
        { id: 'stats-semaine', visible: true },
        { id: 'tendance-semaines', visible: true },
        { id: 'zones-par-semaine', visible: true },
        { id: 'efficacite-aerobie', visible: true },
        { id: 'graphiques', visible: true },
        { id: 'guidance', visible: true },
      ],
    };
    const r = appliquerLayoutHistorique(LAYOUT_HISTORIQUE_PAR_DEFAUT, sauvegarde);
    expect(r.sections.map((s) => s.id)).toEqual([
      'boxe-regularite', 'records', 'stats-semaine', 'tendance-semaines',
      'zones-par-semaine', 'efficacite-aerobie', 'graphiques', 'guidance',
    ]);
    expect(r.sections.find((s) => s.id === 'records')?.visible).toBe(false);
  });

  it('ignore un id de section inconnu présent dans la sauvegarde', () => {
    const sauvegarde = { sections: [{ id: 'section-fantome', visible: true }, ...LAYOUT_HISTORIQUE_PAR_DEFAUT.sections] };
    const r = appliquerLayoutHistorique(LAYOUT_HISTORIQUE_PAR_DEFAUT, sauvegarde);
    expect(r.sections.map((s) => s.id)).not.toContain('section-fantome');
    expect(r.sections).toHaveLength(8);
  });

  it('ajoute en fin, visible, une section du défaut absente de la sauvegarde (nouvelle section ajoutée au code depuis)', () => {
    const sauvegarde = { sections: LAYOUT_HISTORIQUE_PAR_DEFAUT.sections.filter((s) => s.id !== 'boxe-regularite') };
    const r = appliquerLayoutHistorique(LAYOUT_HISTORIQUE_PAR_DEFAUT, sauvegarde);
    expect(r.sections.at(-1)).toEqual({ id: 'boxe-regularite', visible: true });
  });

  it('tolère une sauvegarde dont `sections` n’est pas un tableau : replie sur le défaut', () => {
    const r = appliquerLayoutHistorique(LAYOUT_HISTORIQUE_PAR_DEFAUT, { sections: 'pas un tableau' } as never);
    expect(r.sections).toEqual(LAYOUT_HISTORIQUE_PAR_DEFAUT.sections);
  });
});
