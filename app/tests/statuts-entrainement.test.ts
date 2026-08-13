import { describe, it, expect } from 'vitest';
import {
  traduireStatutEntrainement, traduireNiveauReadiness, traduireFeedbackReadiness,
  traduireFeedbackSommeil, tonDepuisPrefixe, tonDepuisFacteur, traduireFacteur,
  traduireQualificatifStress, traduireTypeRecord,
} from '@/lib/statuts-entrainement';

describe('traduireStatutEntrainement : traduction fidèle des libellés Garmin', () => {
  it('traduit les huit statuts documentés, suffixe numérique ignoré', () => {
    expect(traduireStatutEntrainement('STRAINED_1')).toBe('Sollicité');
    expect(traduireStatutEntrainement('PRODUCTIVE_1')).toBe('Productif');
    expect(traduireStatutEntrainement('RECOVERY_2')).toBe('Récupération');
    expect(traduireStatutEntrainement('MAINTAINING_3')).toBe('Maintien');
    expect(traduireStatutEntrainement('DETRAINING_1')).toBe('Désentraînement');
    expect(traduireStatutEntrainement('UNPRODUCTIVE_8')).toBe('Improductif');
    expect(traduireStatutEntrainement('PEAKING_5')).toBe('Affûtage');
    expect(traduireStatutEntrainement('NO_STATUS_2')).toBe('Pas de statut');
  });

  // Piège du brief tâche 12 : un code Garmin réel mais non documenté ici
  // (OVERREACHING existe côté Garmin) ne doit jamais être deviné.
  it('affiche un code inconnu tel quel plutôt que de le deviner', () => {
    expect(traduireStatutEntrainement('OVERREACHING_6')).toBe('OVERREACHING_6');
  });

  it('renvoie null quand le code est absent', () => {
    expect(traduireStatutEntrainement(null)).toBeNull();
  });
});

describe('traduireNiveauReadiness : traduction des niveaux training_readiness.level (tâche 21)', () => {
  it('traduit les niveaux connus', () => {
    expect(traduireNiveauReadiness('POOR')).toBe('faible');
    expect(traduireNiveauReadiness('LOW')).toBe('bas');
    expect(traduireNiveauReadiness('MODERATE')).toBe('modéré');
    expect(traduireNiveauReadiness('GOOD')).toBe('bon');
    expect(traduireNiveauReadiness('HIGH')).toBe('élevé');
    expect(traduireNiveauReadiness('EXCELLENT')).toBe('excellent');
  });

  it('affiche un code inconnu tel quel plutôt que de le deviner', () => {
    expect(traduireNiveauReadiness('UNKNOWN_LEVEL')).toBe('UNKNOWN_LEVEL');
  });

  it('renvoie null quand le niveau est absent', () => {
    expect(traduireNiveauReadiness(null)).toBeNull();
  });
});

describe('traduireFeedbackReadiness : verdicts training_readiness.feedback_short (tâche 31)', () => {
  it('traduit les phrases-conseils observées en production', () => {
    expect(traduireFeedbackReadiness('TAKE_IT_EASY')).toBe('Vas-y doucement aujourd’hui');
    expect(traduireFeedbackReadiness('WELL_RECOVERED')).toBe('Bien récupéré');
    expect(traduireFeedbackReadiness('RECOVERED_AND_READY')).toBe('Récupéré et prêt');
  });

  it('affiche un code inconnu tel quel plutôt que de le deviner', () => {
    expect(traduireFeedbackReadiness('SOME_NEW_CODE')).toBe('SOME_NEW_CODE');
  });

  it('UNKNOWN et null sont traités comme une absence de verdict', () => {
    expect(traduireFeedbackReadiness('UNKNOWN')).toBeNull();
    expect(traduireFeedbackReadiness(null)).toBeNull();
  });
});

describe('traduireFeedbackSommeil : verdicts sleep_score_feedback/insight (tâche 31)', () => {
  it('traduit les codes observés en production', () => {
    expect(traduireFeedbackSommeil('POSITIVE_CONTINUOUS')).toBe('Nuit continue');
    expect(traduireFeedbackSommeil('NEGATIVE_SHORT_AND_POOR_STRUCTURE')).toBe('Nuit courte et mal structurée');
  });

  it('affiche un code inconnu tel quel plutôt que de le deviner', () => {
    expect(traduireFeedbackSommeil('POSITIVE_SOMETHING_NEW')).toBe('POSITIVE_SOMETHING_NEW');
  });

  it('NONE et null sont traités comme une absence de verdict', () => {
    expect(traduireFeedbackSommeil('NONE')).toBeNull();
    expect(traduireFeedbackSommeil(null)).toBeNull();
  });
});

describe('tonDepuisPrefixe : ton bon/mauvais depuis le préfixe POSITIVE_/NEGATIVE_ (tâche 31)', () => {
  it('détecte le ton depuis le seul préfixe du code', () => {
    expect(tonDepuisPrefixe('POSITIVE_CONTINUOUS')).toBe('positif');
    expect(tonDepuisPrefixe('NEGATIVE_DISCONTINUOUS')).toBe('negatif');
  });

  it('NONE et un code sans préfixe reconnu ne portent aucun ton', () => {
    expect(tonDepuisPrefixe('NONE')).toBeNull();
    expect(tonDepuisPrefixe('AUTRE_CHOSE')).toBeNull();
    expect(tonDepuisPrefixe(null)).toBeNull();
  });
});

describe('tonDepuisFacteur / traduireFacteur : échelle POOR/MODERATE/GOOD/VERY_GOOD (tâche 31)', () => {
  it('mappe les quatre crans vers un ton', () => {
    expect(tonDepuisFacteur('POOR')).toBe('negatif');
    expect(tonDepuisFacteur('MODERATE')).toBe('neutre');
    expect(tonDepuisFacteur('GOOD')).toBe('positif');
    expect(tonDepuisFacteur('VERY_GOOD')).toBe('positif');
  });

  it('NONE ne porte aucun ton (Garmin n’a pas encore assez d’historique)', () => {
    expect(tonDepuisFacteur('NONE')).toBeNull();
    expect(tonDepuisFacteur(null)).toBeNull();
  });

  it('traduit les quatre crans en français, NONE en absence', () => {
    expect(traduireFacteur('POOR')).toBe('faible');
    expect(traduireFacteur('VERY_GOOD')).toBe('très bon');
    expect(traduireFacteur('NONE')).toBeNull();
    expect(traduireFacteur(null)).toBeNull();
  });
});

describe('traduireQualificatifStress (tâche 31)', () => {
  it('traduit le qualificatif vu en production', () => {
    expect(traduireQualificatifStress('BALANCED')).toBe('équilibré');
  });

  it('affiche un code inconnu tel quel plutôt que de le deviner', () => {
    expect(traduireQualificatifStress('FRENETIC')).toBe('FRENETIC');
  });

  it('renvoie null quand le qualificatif est absent', () => {
    expect(traduireQualificatifStress(null)).toBeNull();
  });
});

describe('traduireTypeRecord : personal_record.pr_type (tâche 31)', () => {
  it('traduit les distances de course standard, avec leur nature', () => {
    expect(traduireTypeRecord(7)).toEqual({ libelle: 'Plus longue sortie', nature: 'distance' });
    expect(traduireTypeRecord(1)).toEqual({ libelle: '1 km', nature: 'temps' });
  });

  it('renvoie null pour un type non couvert, jamais deviné', () => {
    expect(traduireTypeRecord(12)).toBeNull();
  });
});
