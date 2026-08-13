import { describe, it, expect } from 'vitest';
import {
  DENSITE_PAR_DEFAUT, DENSITES, appliquerDensite, classeBandeMesures, classeLigneSeance,
} from '@/lib/densite';

// Tâche 45 (T44 du rapport B1) : contrairement aux moteurs de layout
// (fusion de listes), la densité est une simple valeur parmi deux — la
// couverture porte donc sur la revalidation tolérante (`appliquerDensite`,
// même esprit que `heroValide` de lib/layout-accueil.ts) et sur les deux
// fonctions de classe CSS, dont la règle centrale : « compacte » n'ajoute
// jamais qu'une classe, jamais n'en retire une déjà posée ailleurs.

describe('DENSITE_PAR_DEFAUT', () => {
  it('vaut « normale » — le défaut ne doit rien changer à l’écran actuel', () => {
    expect(DENSITE_PAR_DEFAUT).toBe('normale');
    expect(DENSITES).toContain(DENSITE_PAR_DEFAUT);
  });
});

describe('appliquerDensite : revalidation tolérante', () => {
  it('renvoie le défaut quand la sauvegarde est null (clé jamais écrite)', () => {
    expect(appliquerDensite(null)).toBe('normale');
  });

  it('reprend la valeur sauvegardée quand elle est connue', () => {
    expect(appliquerDensite('compacte')).toBe('compacte');
    expect(appliquerDensite('normale')).toBe('normale');
  });

  it('replie sur le défaut pour une valeur inconnue (JSON tapé à la main, ancienne version)', () => {
    expect(appliquerDensite('large')).toBe('normale');
    expect(appliquerDensite(7)).toBe('normale');
    expect(appliquerDensite(true)).toBe('normale');
  });

  it('replie sur le défaut pour un objet glissé dans la clé par erreur', () => {
    expect(appliquerDensite({ densite: 'compacte' })).toBe('normale');
  });
});

describe('classeBandeMesures : n’ajoute la compacité que si demandée', () => {
  it('renvoie seulement "bande-mesures" en densité normale', () => {
    expect(classeBandeMesures('normale')).toBe('bande-mesures');
  });

  it('ajoute "bande-170" en densité compacte', () => {
    expect(classeBandeMesures('compacte')).toBe('bande-mesures bande-170');
  });
});

describe('classeLigneSeance : work-row + cliquable + densité compacte', () => {
  it('renvoie "work-row" seul en densité normale, non cliquable', () => {
    expect(classeLigneSeance('normale', false)).toBe('work-row');
  });

  it('ajoute "cliquable" quand la ligne pointe vers une activité Garmin', () => {
    expect(classeLigneSeance('normale', true)).toBe('work-row cliquable');
  });

  it('ajoute "densite-compacte" en densité compacte, après cliquable', () => {
    expect(classeLigneSeance('compacte', true)).toBe('work-row cliquable densite-compacte');
    expect(classeLigneSeance('compacte', false)).toBe('work-row densite-compacte');
  });
});
