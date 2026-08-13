import { describe, it, expect } from 'vitest';
import {
  FENETRE_PAR_DEFAUT, FENETRES, appliquerFenetre, libelleFenetre,
} from '@/lib/fenetre-temporelle';

// Tâche 47 (T43 du rapport B1) : même esprit que tests/densite.test.ts —
// une simple valeur parmi plusieurs (7/14/30), pas une fusion de listes. La
// couverture porte sur la revalidation tolérante (`appliquerFenetre`, même
// contrat qu'`appliquerDensite`) et sur le libellé partagé (`libelleFenetre`)
// qui doit toujours rester synchronisé avec la fenêtre réellement appliquée.

describe('FENETRE_PAR_DEFAUT', () => {
  it('vaut 7 — le défaut ne doit rien changer à l’écran actuel', () => {
    expect(FENETRE_PAR_DEFAUT).toBe(7);
    expect(FENETRES).toContain(FENETRE_PAR_DEFAUT);
  });
});

describe('appliquerFenetre : revalidation tolérante', () => {
  it('renvoie le défaut quand la sauvegarde est null (clé jamais écrite)', () => {
    expect(appliquerFenetre(null)).toBe(7);
  });

  it('reprend la valeur sauvegardée quand elle est connue', () => {
    expect(appliquerFenetre(7)).toBe(7);
    expect(appliquerFenetre(14)).toBe(14);
    expect(appliquerFenetre(30)).toBe(30);
  });

  it('replie sur le défaut pour une valeur inconnue (JSON tapé à la main, ancienne version)', () => {
    expect(appliquerFenetre(21)).toBe(7);
    expect(appliquerFenetre(0)).toBe(7);
    expect(appliquerFenetre(-7)).toBe(7);
    expect(appliquerFenetre('14')).toBe(7); // chaîne, pas un nombre
    expect(appliquerFenetre(true)).toBe(7);
  });

  it('replie sur le défaut pour un objet glissé dans la clé par erreur', () => {
    expect(appliquerFenetre({ fenetre_jours: 14 })).toBe(7);
  });
});

describe('libelleFenetre : texte partagé par toutes les vues pilotées', () => {
  it('formate chaque fenêtre connue en « N derniers jours »', () => {
    expect(libelleFenetre(7)).toBe('7 derniers jours');
    expect(libelleFenetre(14)).toBe('14 derniers jours');
    expect(libelleFenetre(30)).toBe('30 derniers jours');
  });
});
