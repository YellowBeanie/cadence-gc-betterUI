// Traduction fidèle des libellés de statut d'entraînement Garmin (table
// training_status.status). Ne couvre que les huit statuts documentés dans le
// brief de la tâche 12 ; un code Garmin réel mais absent de cette liste (ex.
// OVERREACHING) s'affiche tel quel plutôt que d'être deviné — l'app ne doit
// jamais interpréter ni inventer une traduction.
const TRADUCTIONS: Record<string, string> = {
  STRAINED: 'Sollicité',
  PRODUCTIVE: 'Productif',
  RECOVERY: 'Récupération',
  MAINTAINING: 'Maintien',
  DETRAINING: 'Désentraînement',
  UNPRODUCTIVE: 'Improductif',
  PEAKING: 'Affûtage',
  NO_STATUS: 'Pas de statut',
};

/** Les codes Garmin portent un suffixe numérique de variante interne
 *  (STRAINED_1, NO_STATUS_2…) sans intérêt pour l'affichage. */
export function traduireStatutEntrainement(code: string | null): string | null {
  if (!code) return null;
  const base = code.replace(/_\d+$/, '');
  return TRADUCTIONS[base] ?? code;
}

// Traduction fidèle des niveaux de `training_readiness.level` (tâche 21,
// bande de mesures du dashboard Cadence) — même prudence que
// TRADUCTIONS ci-dessus : un code Garmin réel mais non couvert (peu probable,
// mais la liste n'est pas documentée publiquement par Garmin) s'affiche tel
// quel plutôt que d'être deviné.
const TRADUCTIONS_READINESS: Record<string, string> = {
  POOR: 'faible',
  LOW: 'bas',
  MODERATE: 'modéré',
  GOOD: 'bon',
  HIGH: 'élevé',
  EXCELLENT: 'excellent',
};

export function traduireNiveauReadiness(niveau: string | null): string | null {
  if (!niveau) return null;
  return TRADUCTIONS_READINESS[niveau] ?? niveau;
}

// Tâche 31 (revue A1, mise en évidence positive/négative) : traduction des
// verdicts texte de Garmin (training_readiness.feedback_short, sleep.sleep_score_feedback)
// et des codes ordinaux des facteurs de préparation (*_factor_feedback, dont
// acwr_factor_feedback) — même prudence que les dictionnaires ci-dessus :
// phrases/codes observés en production, un code réel mais non couvert
// s'affiche tel quel plutôt que d'être deviné.

/** `training_readiness.feedback_short` — phrases-conseils courtes, traduction
 *  fidèle (aucune ambiguïté de sens, contrairement à un code opaque). */
const TRADUCTIONS_FEEDBACK_READINESS: Record<string, string> = {
  TAKE_IT_EASY: 'Vas-y doucement aujourd’hui',
  FOCUS_ON_RECOVERY: 'Concentre-toi sur la récupération',
  LISTEN_TO_YOUR_BODY: 'Écoute ton corps',
  RECOVERED_AND_READY: 'Récupéré et prêt',
  FIND_TIME_TO_RELAX: 'Prends le temps de te détendre',
  FOCUS_ON_SLEEP_QUALITY: 'Priorité à la qualité du sommeil',
  TIME_TO_RECHARGE: 'Temps de recharger les batteries',
  WELL_RECOVERED: 'Bien récupéré',
  BALANCE_STRESS_AND_RECOVERY: 'Équilibre stress et récupération',
};

export function traduireFeedbackReadiness(code: string | null): string | null {
  if (!code || code === 'UNKNOWN') return null;
  return TRADUCTIONS_FEEDBACK_READINESS[code] ?? code;
}

/** `sleep.sleep_score_feedback` / `.sleep_score_insight` — préfixe
 *  POSITIVE_/NEGATIVE_ explicite dans le code lui-même (voir `tonDepuisPrefixe`
 *  ci-dessous), le dictionnaire ne fait que rendre le reste du code lisible. */
const TRADUCTIONS_FEEDBACK_SOMMEIL: Record<string, string> = {
  NEGATIVE_SHORT_AND_POOR_STRUCTURE: 'Nuit courte et mal structurée',
  NEGATIVE_SHORT_AND_POOR_QUALITY: 'Nuit courte et de mauvaise qualité',
  NEGATIVE_SHORT_AND_NONRECOVERING: 'Nuit courte, peu récupératrice',
  NEGATIVE_LONG_BUT_POOR_QUALITY: 'Nuit longue mais de mauvaise qualité',
  NEGATIVE_DISCONTINUOUS: 'Nuit entrecoupée',
  NEGATIVE_STRENUOUS_EXERCISE: 'Exercice intense la veille',
  NEGATIVE_HIGHLY_STRESSFUL_DAY: 'Journée très stressante',
  NEGATIVE_STRESSFUL_DAY: 'Journée stressante',
  POSITIVE_CONTINUOUS: 'Nuit continue',
  POSITIVE_LONG_AND_DEEP: 'Nuit longue et profonde',
  POSITIVE_DEEP: 'Nuit profonde',
  POSITIVE_SHORT_BUT_DEEP: 'Nuit courte mais profonde',
  POSITIVE_LONG_AND_REFRESHING: 'Nuit longue et réparatrice',
  POSITIVE_SHORT_BUT_RECOVERING: 'Nuit courte mais récupératrice',
  POSITIVE_REFRESHING: 'Nuit réparatrice',
  POSITIVE_SHORT_BUT_CONTINUOUS: 'Nuit courte mais continue',
  POSITIVE_LATE_BED_TIME: 'Coucher tardif',
  POSITIVE_STRESSFUL_DAY: 'Malgré une journée stressante',
};

/** `NONE` = Garmin n'a émis aucun verdict pour cette nuit — traité comme
 *  absent, jamais affiché comme un code brut. */
export function traduireFeedbackSommeil(code: string | null): string | null {
  if (!code || code === 'NONE') return null;
  return TRADUCTIONS_FEEDBACK_SOMMEIL[code] ?? code;
}

export type Ton = 'positif' | 'neutre' | 'negatif';

/** Ton bon/mauvais déduit du seul PRÉFIXE explicite du code Garmin
 *  (`POSITIVE_…`/`NEGATIVE_…`) — jamais une lecture du texte qui suit,
 *  seulement la convention de nommage que Garmin applique elle-même. */
export function tonDepuisPrefixe(code: string | null): Ton | null {
  if (!code || code === 'NONE') return null;
  if (code.startsWith('POSITIVE_')) return 'positif';
  if (code.startsWith('NEGATIVE_')) return 'negatif';
  return null;
}

/** Ton déduit de l'échelle ordinale à 4 crans observée en production sur les
 *  colonnes `training_readiness.*_factor_feedback` (dont `acwr_factor_feedback`,
 *  le ratio de charge aiguë/chronique) : POOR/MODERATE/GOOD/VERY_GOOD. `NONE`
 *  = Garmin n'a pas encore assez d'historique pour juger — traité comme absent. */
export function tonDepuisFacteur(code: string | null): Ton | null {
  if (code === 'POOR') return 'negatif';
  if (code === 'MODERATE') return 'neutre';
  if (code === 'GOOD' || code === 'VERY_GOOD') return 'positif';
  return null;
}

const TRADUCTIONS_FACTEUR: Record<string, string> = {
  POOR: 'faible', MODERATE: 'modéré', GOOD: 'bon', VERY_GOOD: 'très bon',
};

/** Traduction du même code que `tonDepuisFacteur` — `NONE` rendu `null` par
 *  la même règle (aucun verdict connu, jamais un mot inventé à sa place). */
export function traduireFacteur(code: string | null): string | null {
  if (!code || code === 'NONE') return null;
  return TRADUCTIONS_FACTEUR[code] ?? code;
}

/** `stress.stress_qualifier` — un seul mot descriptif ; `BALANCED` est la
 *  seule valeur vue en production à ce jour (cf. tests/fixtures/seed.ts),
 *  les autres sont la terminologie Garmin usuelle pour ce champ. */
const TRADUCTIONS_STRESS: Record<string, string> = {
  BALANCED: 'équilibré', LOW: 'bas', MEDIUM: 'moyen', HIGH: 'élevé', REST: 'repos',
};

export function traduireQualificatifStress(code: string | null): string | null {
  if (!code) return null;
  return TRADUCTIONS_STRESS[code] ?? code;
}

/** `personal_record.pr_type` — code Garmin purement numérique, sans libellé
 *  fourni par l'API (`prTypeLabelKey` toujours `null` en production, vérifié
 *  sur l'instantané réel) : contrairement aux dictionnaires ci-dessus (qui
 *  traduisent un TEXTE Garmin déjà descriptif), rien dans la donnée
 *  elle-même n'indique le sens d'un type non couvert ici — un type inconnu
 *  n'est donc pas rendu « tel quel » (un simple entier serait illisible) mais
 *  exclu par l'appelant (`lirePersonalRecords`, lib/db/garmin.ts), jamais
 *  deviné. Les 7 types ci-dessous correspondent aux distances de course
 *  standard (1 km → marathon, type 7 = plus longue sortie) — seuls types
 *  observés avec une activité et une date rattachées sur l'instantané réel. */
const RECORDS_COURSE: Record<number, { libelle: string; nature: 'temps' | 'distance' }> = {
  1: { libelle: '1 km', nature: 'temps' },
  2: { libelle: '1 mile', nature: 'temps' },
  3: { libelle: '5 km', nature: 'temps' },
  4: { libelle: '10 km', nature: 'temps' },
  5: { libelle: 'Semi-marathon', nature: 'temps' },
  6: { libelle: 'Marathon', nature: 'temps' },
  7: { libelle: 'Plus longue sortie', nature: 'distance' },
};

export function traduireTypeRecord(prType: number): { libelle: string; nature: 'temps' | 'distance' } | null {
  return RECORDS_COURSE[prType] ?? null;
}
