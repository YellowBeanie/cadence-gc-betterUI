import { describe, it, expect } from 'vitest';
import {
  VARIANTE_PAR_DEFAUT, VARIANTES_COMPATIBLES, variantesCompatibles,
  varianteEnregistree, varianteEffective, choixVisuel,
} from '@/lib/visuels-mesures';
import { TUILES_MESURES } from '@/lib/layout-accueil';

// Tâche 39 (variantes de visuel par mesure) : cœur testable de la
// personnalisation des visuels — une table de compatibilité PAR MESURE (quelles
// variantes ont un sens pour quelle donnée) et deux fonctions de repli
// tolérant : `varianteEnregistree` (choix incompatible → défaut) et
// `varianteEffective` (choix compatible mais donnée requise absente pour
// CETTE instance → défaut aussi). Jamais d'erreur, jamais un visuel vide.

describe('VARIANTES_COMPATIBLES : toutes les mesures acceptent chiffre et chiffre-sparkline', () => {
  it.each(TUILES_MESURES)('%s inclut chiffre et chiffre-sparkline', (id) => {
    expect(variantesCompatibles(id)).toContain('chiffre');
    expect(variantesCompatibles(id)).toContain('chiffre-sparkline');
  });

  it('couvre exactement les 14 tuiles connues, sans clé en trop', () => {
    expect(Object.keys(VARIANTES_COMPATIBLES).sort()).toEqual([...TUILES_MESURES].sort());
  });
});

describe('VARIANTES_COMPATIBLES : mesures cumulatives → + barres-7j', () => {
  it.each(['pas', 'calories', 'etages', 'intensite'] as const)('%s accepte barres-7j', (id) => {
    expect(variantesCompatibles(id)).toContain('barres-7j');
  });

  it.each(['readiness', 'hrv', 'fc-repos', 'sommeil', 'charge', 'stress', 'spo2', 'vo2max', 'respiration', 'age-forme'] as const)(
    '%s ne propose pas barres-7j', (id) => {
      expect(variantesCompatibles(id)).not.toContain('barres-7j');
    },
  );
});

describe('VARIANTES_COMPATIBLES : jauge réservée aux mesures à objectif RÉEL Garmin', () => {
  it.each(['pas', 'intensite'] as const)('%s accepte jauge (objectif fourni par Garmin)', (id) => {
    expect(variantesCompatibles(id)).toContain('jauge');
  });

  it('calories est cumulative mais n’a pas d’objectif Garmin réel : pas de jauge', () => {
    expect(variantesCompatibles('calories')).not.toContain('jauge');
  });

  it.each(TUILES_MESURES.filter((id) => id !== 'pas' && id !== 'intensite'))(
    '%s ne propose pas jauge', (id) => {
      expect(variantesCompatibles(id)).not.toContain('jauge');
    },
  );
});

describe('VARIANTES_COMPATIBLES : mesures de tendance → + courbe-section (promotion en section)', () => {
  it.each(['hrv', 'readiness', 'fc-repos', 'sommeil', 'stress'] as const)('%s accepte courbe-section', (id) => {
    expect(variantesCompatibles(id)).toContain('courbe-section');
  });

  it.each(['charge', 'calories', 'pas', 'etages', 'intensite', 'spo2', 'vo2max', 'respiration', 'age-forme'] as const)(
    '%s ne propose pas courbe-section', (id) => {
      expect(variantesCompatibles(id)).not.toContain('courbe-section');
    },
  );
});

describe('varianteEnregistree : choix incompatible ou inconnu → défaut', () => {
  it('renvoie le choix tel quel quand il est compatible avec la mesure', () => {
    expect(varianteEnregistree('pas', 'jauge')).toBe('jauge');
    expect(varianteEnregistree('hrv', 'courbe-section')).toBe('courbe-section');
    expect(varianteEnregistree('calories', 'barres-7j')).toBe('barres-7j');
  });

  it('replie sur le défaut quand le choix n’est pas compatible avec CETTE mesure', () => {
    // jauge a du sens pour "pas" mais jamais pour "hrv" (pas d'objectif Garmin réel).
    expect(varianteEnregistree('hrv', 'jauge')).toBe(VARIANTE_PAR_DEFAUT);
    // courbe-section a du sens pour "hrv" mais jamais pour "pas".
    expect(varianteEnregistree('pas', 'courbe-section')).toBe(VARIANTE_PAR_DEFAUT);
  });

  it('replie sur le défaut pour une chaîne inconnue', () => {
    expect(varianteEnregistree('pas', 'toile-araignee')).toBe(VARIANTE_PAR_DEFAUT);
  });

  it('replie sur le défaut pour undefined/null/mauvais type', () => {
    expect(varianteEnregistree('pas', undefined)).toBe(VARIANTE_PAR_DEFAUT);
    expect(varianteEnregistree('pas', null)).toBe(VARIANTE_PAR_DEFAUT);
    expect(varianteEnregistree('pas', 42)).toBe(VARIANTE_PAR_DEFAUT);
  });
});

describe('varianteEffective : donnée requise absente → repli défaut, jamais un visuel vide', () => {
  it('honore chiffre/chiffre-sparkline sans exiger aucune donnée', () => {
    expect(varianteEffective('hrv', 'chiffre', {})).toBe('chiffre');
    expect(varianteEffective('hrv', 'chiffre-sparkline', {})).toBe('chiffre-sparkline');
  });

  it('barres-7j : honoré seulement si une série 7 jours est disponible pour CETTE instance', () => {
    expect(varianteEffective('calories', 'barres-7j', { serie7j: true })).toBe('barres-7j');
    expect(varianteEffective('calories', 'barres-7j', { serie7j: false })).toBe(VARIANTE_PAR_DEFAUT);
    expect(varianteEffective('calories', 'barres-7j', {})).toBe(VARIANTE_PAR_DEFAUT);
  });

  it('courbe-section : honoré seulement si une série de tendance est disponible', () => {
    expect(varianteEffective('hrv', 'courbe-section', { serieTendance: true })).toBe('courbe-section');
    expect(varianteEffective('hrv', 'courbe-section', { serieTendance: false })).toBe(VARIANTE_PAR_DEFAUT);
  });

  it('jauge : honorée seulement si un objectif réel est disponible', () => {
    expect(varianteEffective('pas', 'jauge', { objectif: true })).toBe('jauge');
    expect(varianteEffective('pas', 'jauge', { objectif: false })).toBe(VARIANTE_PAR_DEFAUT);
  });

  it('jamais d’objectif inventé : jauge sur une mesure incompatible reste rejetée même si `objectif` est vrai', () => {
    expect(varianteEffective('hrv', 'jauge', { objectif: true })).toBe(VARIANTE_PAR_DEFAUT);
  });

  it('choix incompatible avec la mesure : ignore les données disponibles, replie sur le défaut', () => {
    expect(varianteEffective('pas', 'courbe-section', { serieTendance: true })).toBe(VARIANTE_PAR_DEFAUT);
  });
});

describe('choixVisuel : lecture tolérante d’une sauvegarde `visuels` (preferences_affichage)', () => {
  it('renvoie undefined quand la sauvegarde est null ou n’est pas un objet', () => {
    expect(choixVisuel(null, 'pas')).toBeUndefined();
    expect(choixVisuel('texte', 'pas')).toBeUndefined();
    expect(choixVisuel(42, 'pas')).toBeUndefined();
  });

  it('renvoie undefined quand la mesure n’a pas d’entrée dans la sauvegarde', () => {
    expect(choixVisuel({ hrv: 'courbe-section' }, 'pas')).toBeUndefined();
  });

  it('renvoie la valeur brute stockée pour cette mesure, sans la valider (au repli de le faire)', () => {
    expect(choixVisuel({ pas: 'jauge' }, 'pas')).toBe('jauge');
    expect(choixVisuel({ pas: 'n-importe-quoi' }, 'pas')).toBe('n-importe-quoi');
  });
});
