import type { DatabaseSync } from 'node:sqlite';
import { ouvrirGarmin } from './connection';
import { initialiserSchema } from './schema';
import { lireSeanceManuelleParGarminId, lireSegments } from './training';
import type {
  Activite, AgeDeForme, ActiviteJournee, BodyBattery, ChargeHebdo, ChargeJour, DynamiqueCourse,
  EfficaciteAerobie, EtatDuJour, JourneeComplete, MeteoSeance, MinutesIntensite, PersonalRecord,
  PlanPasse, PointTraceGps, PoidsMesure, PredictionsCourse, RessentiGarmin, RespirationSpo2,
  SeanceDetail, SeancePrescrite, SommeilDetaille, SplitSeance, StatsSemaine, StatutEntrainement,
  StressJournee, Tendances, TrackpointSeance, VO2maxRecent, ZonesFcBornes, ZonesHebdo, ZonesSeance,
} from '@/lib/types';
import { traduireStatutEntrainement, traduireTypeRecord } from '@/lib/statuts-entrainement';
import { allureSecParKm, numeroSemaineIso } from '@/lib/formatage';

/** Types d'`activity_type` Garmin considérés comme de la course à pied —
 *  partagés par `lireEfficaciteAerobie` et `lirePlanPasse` (recherche
 *  d'activité réalisée), même liste que le brief de la tâche 25. */
const TYPES_COURSE = ['running', 'trail_running', 'treadmill_running'];

/** Dernier jour connu, ancré toutes tables confondues (training_readiness, hrv,
 *  sleep, heart_rate) : si la readiness du jour manque alors que le sommeil ou la
 *  HRV sont déjà arrivés, mieux vaut montrer ce jour avec ses trous — en `null` —
 *  qu'afficher silencieusement la veille comme si elle était encore d'actualité.
 *  Partagée par lireEtatDuJour et lireJourneeComplete : c'est ce qui garantit
 *  que les deux s'accordent toujours sur le même jour. */
function dateAncrage(db: DatabaseSync): string | null {
  const ligne = db.prepare(`
    SELECT MAX(d) AS date FROM (
      SELECT MAX(calendar_date) AS d FROM training_readiness
      UNION ALL SELECT MAX(calendar_date) FROM hrv
      UNION ALL SELECT MAX(calendar_date) FROM sleep
      UNION ALL SELECT MAX(calendar_date) FROM heart_rate
    )`).get() as { date: string | null } | undefined;
  return ligne?.date ?? null;
}

export function lireEtatDuJour(): EtatDuJour | null {
  const db = ouvrirGarmin();
  try {
    const date = dateAncrage(db);
    if (!date) return null;

    const r = db.prepare(
      `SELECT score, level FROM training_readiness WHERE calendar_date = ?`)
      .get(date) as Record<string, unknown> | undefined;
    const hrv = db.prepare(
      `SELECT last_night_avg, baseline_low, baseline_upper FROM hrv
       WHERE calendar_date = ?`).get(date) as Record<string, unknown> | undefined;
    const sommeil = db.prepare(
      `SELECT sleep_time_seconds, sleep_score_overall FROM sleep
       WHERE calendar_date = ?`).get(date) as Record<string, unknown> | undefined;
    const fc = db.prepare(
      `SELECT resting_hr, last_7day_avg_resting FROM heart_rate WHERE calendar_date = ?`)
      .get(date) as Record<string, unknown> | undefined;

    return {
      date,
      readiness: (r?.score as number) ?? null,
      niveauReadiness: (r?.level as string) ?? null,
      hrvNuit: (hrv?.last_night_avg as number) ?? null,
      hrvBasseLimite: (hrv?.baseline_low as number) ?? null,
      hrvHauteLimite: (hrv?.baseline_upper as number) ?? null,
      sommeilSec: (sommeil?.sleep_time_seconds as number) ?? null,
      scoreSommeil: (sommeil?.sleep_score_overall as number) ?? null,
      fcRepos: (fc?.resting_hr as number) ?? null,
      fcReposMoy7j: (fc?.last_7day_avg_resting as number) ?? null,
    };
  } finally {
    db.close();
  }
}

export function lireSeancePrescrite(date: string): SeancePrescrite | null {
  const db = ouvrirGarmin();
  try {
    const ligne = db.prepare(
      `SELECT raw_json FROM workout_schedule WHERE calendar_date = ?`)
      .get(date) as { raw_json?: string } | undefined;
    if (!ligne?.raw_json) return null;

    const j = JSON.parse(ligne.raw_json) as Record<string, unknown>;
    return {
      date,
      nom: (j.workoutName as string) ?? null,
      type: (j.workoutType as string) ?? null,
      repos: j.isRestDay === true,
      distanceM: (j.estimatedDistanceInMeters as number) ?? null,
      dureeSec: (j.estimatedDurationInSecs as number) ?? null,
      intention: (j.workoutPhrase as string) ?? null,
      plan: (j.tpPlanName as string) ?? null,
    };
  } finally {
    db.close();
  }
}

/** Prochaines séances du plan (défaut 3 des captures Bento, tâche 18b) :
 *  mêmes lignes de `workout_schedule`/même décodage que `lireSeancePrescrite`,
 *  mais toutes les dates strictement postérieures à `date`, dans l'ordre
 *  chronologique, plafonnées à `limite`. Les jours de repos sont inclus
 *  (`repos: true`) au même titre qu'une séance chiffrée — le plan reste
 *  continu, ce n'est pas à cette fonction de les filtrer. */
export function lireProchainesSeances(date: string, limite = 3): SeancePrescrite[] {
  const db = ouvrirGarmin();
  try {
    const lignes = db.prepare(
      `SELECT calendar_date, raw_json FROM workout_schedule
       WHERE calendar_date > ? ORDER BY calendar_date ASC LIMIT ?`)
      .all(date, limite) as { calendar_date: string; raw_json: string }[];

    return lignes.map((ligne) => {
      const j = JSON.parse(ligne.raw_json) as Record<string, unknown>;
      return {
        date: ligne.calendar_date,
        nom: (j.workoutName as string) ?? null,
        type: (j.workoutType as string) ?? null,
        repos: j.isRestDay === true,
        distanceM: (j.estimatedDistanceInMeters as number) ?? null,
        dureeSec: (j.estimatedDurationInSecs as number) ?? null,
        intention: (j.workoutPhrase as string) ?? null,
        plan: (j.tpPlanName as string) ?? null,
      };
    });
  } finally {
    db.close();
  }
}

const COLONNES_ACTIVITE = `activity_id, start_time_local, activity_name, activity_type,
              distance_meters, duration_seconds, average_hr, max_hr, aerobic_training_effect`;

function activiteDepuisLigne(r: Record<string, unknown>): Activite {
  return {
    id: r.activity_id as number,
    debut: r.start_time_local as string,
    nom: (r.activity_name as string) ?? null,
    type: (r.activity_type as string) ?? null,
    distanceM: (r.distance_meters as number) ?? null,
    dureeSec: (r.duration_seconds as number) ?? null,
    fcMoy: (r.average_hr as number) ?? null,
    fcMax: (r.max_hr as number) ?? null,
    effetAerobie: (r.aerobic_training_effect as number) ?? null,
  };
}

export function lireActivites(limite = 100): Activite[] {
  const db = ouvrirGarmin();
  try {
    return db.prepare(
      `SELECT ${COLONNES_ACTIVITE} FROM activity ORDER BY start_time_local DESC LIMIT ?`)
      .all(limite).map((r: Record<string, unknown>) => activiteDepuisLigne(r));
  } finally {
    db.close();
  }
}

/** Autres séances du même `activity_type` (comparaison exacte, insensible à
 *  la casse) qu'une activité donnée — sélecteur de comparaison du radar
 *  (tâche 40, page de détail de séance). Ordre antichronologique (la plus
 *  récente d'abord), comme `lireActivites`. `type` vide ou nul ne matche
 *  jamais rien : une activité sans type connu ne peut pas être comparée à
 *  « une autre du même type ». */
export function lireActivitesMemeSport(type: string | null, excludeId: number): Activite[] {
  const db = ouvrirGarmin();
  try {
    const t = type?.toLowerCase() ?? '';
    if (!t) return [];
    return db.prepare(
      `SELECT ${COLONNES_ACTIVITE} FROM activity
       WHERE LOWER(activity_type) = ? AND activity_id != ?
       ORDER BY start_time_local DESC`)
      .all(t, excludeId).map((r: Record<string, unknown>) => activiteDepuisLigne(r));
  } finally {
    db.close();
  }
}

export function lireZonesFc(): ZonesSeance[] {
  const db = ouvrirGarmin();
  try {
    return db.prepare(
      `SELECT z.activity_id, a.start_time_local, a.activity_name,
              z.zone1_seconds, z.zone2_seconds, z.zone3_seconds,
              z.zone4_seconds, z.zone5_seconds
       FROM activity_hr_zones z JOIN activity a ON a.activity_id = z.activity_id
       ORDER BY a.start_time_local DESC`)
      .all().map((r: Record<string, unknown>) => ({
        activiteId: r.activity_id as number,
        debut: r.start_time_local as string,
        nom: (r.activity_name as string) ?? null,
        z1: ((r.zone1_seconds as number) ?? 0) / 60,
        z2: ((r.zone2_seconds as number) ?? 0) / 60,
        z3: ((r.zone3_seconds as number) ?? 0) / 60,
        z4: ((r.zone4_seconds as number) ?? 0) / 60,
        z5: ((r.zone5_seconds as number) ?? 0) / 60,
      }));
  } finally {
    db.close();
  }
}

export function lireTendances(): Tendances {
  const db = ouvrirGarmin();
  try {
    const hrv = db.prepare(
      `SELECT calendar_date, last_night_avg, weekly_avg, baseline_low, baseline_upper
       FROM hrv ORDER BY calendar_date`).all() as Record<string, unknown>[];
    const readiness = db.prepare(
      `SELECT calendar_date, score FROM training_readiness ORDER BY calendar_date`)
      .all() as Record<string, unknown>[];
    const sommeil = db.prepare(
      `SELECT calendar_date, deep_sleep_seconds, rem_sleep_seconds,
              light_sleep_seconds, awake_sleep_seconds
       FROM sleep ORDER BY calendar_date`).all() as Record<string, unknown>[];
    const charge = db.prepare(
      `SELECT calendar_date, acute_load, chronic_load FROM training_status
       ORDER BY calendar_date`).all() as Record<string, unknown>[];
    // Sparklines (tâche 19) : most_recent, même convention date/valeur que les
    // autres séries de Tendances ci-dessous.
    const bodyBattery = db.prepare(
      `SELECT calendar_date, most_recent FROM body_battery ORDER BY calendar_date`)
      .all() as Record<string, unknown>[];
    // Trois séries ajoutées pour la bande de mesures Cadence (tâche 21) :
    // même convention date/valeur nullable que les séries ci-dessus.
    const fcRepos = db.prepare(
      `SELECT calendar_date, resting_hr FROM heart_rate ORDER BY calendar_date`)
      .all() as Record<string, unknown>[];
    const scoreSommeil = db.prepare(
      `SELECT calendar_date, sleep_score_overall FROM sleep ORDER BY calendar_date`)
      .all() as Record<string, unknown>[];
    const calories = db.prepare(
      `SELECT calendar_date, total_kilocalories FROM daily_summary ORDER BY calendar_date`)
      .all() as Record<string, unknown>[];

    return {
      hrv: hrv.map((r) => ({
        date: r.calendar_date as string,
        nuit: (r.last_night_avg as number) ?? null,
        moyenne7j: (r.weekly_avg as number) ?? null,
        basse: (r.baseline_low as number) ?? null,
        haute: (r.baseline_upper as number) ?? null,
      })),
      readiness: readiness.map((r) => ({
        date: r.calendar_date as string,
        score: (r.score as number) ?? null,
      })),
      // Stade absent (nuit enregistrée sans détail) => null, jamais 0 : un 0 se lirait
      // comme « aucun sommeil profond », alors que la donnée est simplement inconnue.
      sommeil: sommeil.map((r) => ({
        date: r.calendar_date as string,
        profond: r.deep_sleep_seconds != null ? (r.deep_sleep_seconds as number) / 3600 : null,
        rem: r.rem_sleep_seconds != null ? (r.rem_sleep_seconds as number) / 3600 : null,
        leger: r.light_sleep_seconds != null ? (r.light_sleep_seconds as number) / 3600 : null,
        eveille: r.awake_sleep_seconds != null ? (r.awake_sleep_seconds as number) / 3600 : null,
      })),
      charge: charge.map((r) => ({
        date: r.calendar_date as string,
        aigue: (r.acute_load as number) ?? null,
        chronique: (r.chronic_load as number) ?? null,
      })),
      bodyBattery: bodyBattery.map((r) => ({
        date: r.calendar_date as string,
        actuel: (r.most_recent as number) ?? null,
      })),
      fcRepos: fcRepos.map((r) => ({
        date: r.calendar_date as string,
        valeur: (r.resting_hr as number) ?? null,
      })),
      scoreSommeil: scoreSommeil.map((r) => ({
        date: r.calendar_date as string,
        valeur: (r.sleep_score_overall as number) ?? null,
      })),
      calories: calories.map((r) => ({
        date: r.calendar_date as string,
        valeur: (r.total_kilocalories as number) ?? null,
      })),
    };
  } finally {
    db.close();
  }
}

/** `null` si toutes les valeurs de l'objet sont `null`/`undefined` : une section
 *  dont aucune donnée n'est connue pour le jour ancré doit disparaître de l'écran
 *  plutôt que d'aligner des tirets (règle du brief tâche 12), qu'il s'agisse d'une
 *  ligne absente ou d'une ligne présente mais entièrement vide. */
function nullSiVide<T extends Record<string, unknown>>(objet: T): T | null {
  return Object.values(objet).some((v) => v != null) ? objet : null;
}

/** Arrondi à une décimale (âge de forme, météo de séance). */
function arrondi1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** °F → °C. Garmin renvoie la météo d'activité en °F même pour un compte
 *  réglé en unités métriques (piège vérifié sur la production, cf.
 *  lireSeanceDetail) — jamais affiché brut sous un intitulé trompeur. */
function fahrenheitVersCelsius(f: number): number {
  return arrondi1((f - 32) * 5 / 9);
}

/** mph → km/h, même piège d'unité que la température (météo Garmin toujours
 *  en unités impériales, quel que soit le réglage du compte). */
function mphVersKmh(mph: number): number {
  return arrondi1(mph * 1.60934);
}

/** Toutes les sections enrichies de l'écran Aujourd'hui (tâche 12), en une
 *  seule ouverture de connexion. Sans argument, s'ancre sur le même jour que
 *  lireEtatDuJour (même fonction dateAncrage) ; un argument explicite permet
 *  d'interroger un autre jour (utilisé par les tests, et potentiellement par
 *  un futur écran Historique). */
export function lireJourneeComplete(date?: string): JourneeComplete {
  const db = ouvrirGarmin();
  try {
    const j = date ?? dateAncrage(db);
    if (!j) {
      return {
        date: null, bodyBattery: null, statutEntrainement: null, activite: null,
        minutesIntensite: null, stress: null, respirationSpo2: null,
        sommeilDetaille: null, predictionsCourse: null, ageDeForme: null,
        readinessFeedback: null, readinessRecupMin: null, acwrFeedback: null,
      };
    }

    const bb = db.prepare(
      `SELECT at_wake, most_recent, highest, lowest, charged, drained
       FROM body_battery WHERE calendar_date = ?`).get(j) as Record<string, unknown> | undefined;
    const bodyBattery: BodyBattery | null = nullSiVide({
      reveil: (bb?.at_wake as number) ?? null,
      actuel: (bb?.most_recent as number) ?? null,
      pic: (bb?.highest as number) ?? null,
      creux: (bb?.lowest as number) ?? null,
      recharge: (bb?.charged as number) ?? null,
      depense: (bb?.drained as number) ?? null,
    });

    const ts = db.prepare(
      `SELECT status, acute_load, chronic_load
       FROM training_status WHERE calendar_date = ?`).get(j) as Record<string, unknown> | undefined;
    const codeStatut = (ts?.status as string) ?? null;
    const statutEntrainement: StatutEntrainement | null = nullSiVide({
      code: codeStatut,
      libelle: traduireStatutEntrainement(codeStatut),
      chargeAigue: (ts?.acute_load as number) ?? null,
      chargeChronique: (ts?.chronic_load as number) ?? null,
    });

    const ds = db.prepare(
      `SELECT total_steps, daily_step_goal, total_distance_meters,
              total_kilocalories, active_kilocalories, floors_ascended
       FROM daily_summary WHERE calendar_date = ?`).get(j) as Record<string, unknown> | undefined;
    const activite: ActiviteJournee | null = nullSiVide({
      pas: (ds?.total_steps as number) ?? null,
      objectifPas: (ds?.daily_step_goal as number) ?? null,
      distanceM: (ds?.total_distance_meters as number) ?? null,
      kilocalories: (ds?.total_kilocalories as number) ?? null,
      kilocaloriesActives: (ds?.active_kilocalories as number) ?? null,
      etagesMontes: (ds?.floors_ascended as number) ?? null,
    });

    // ⚠️ Découvert sur les données réelles de production (raw_json de la table) :
    // `moderate`/`vigorous` ne sont PAS les minutes du jour mais déjà le cumul
    // de la semaine Garmin en cours (weeklyModerate/weeklyVigorous du payload),
    // répété à l'identique sur chaque jour de cette semaine. Les additionner sur
    // plusieurs jours compterait donc la même semaine plusieurs fois — la valeur
    // du seul jour ancré, prise telle quelle, EST déjà le cumul hebdomadaire.
    const im = db.prepare(
      `SELECT moderate, vigorous, goal FROM intensity_minutes
       WHERE calendar_date = ?`).get(j) as Record<string, unknown> | undefined;
    const minutesIntensite: MinutesIntensite | null = nullSiVide({
      moderee: (im?.moderate as number) ?? null,
      vigoureuse: (im?.vigorous as number) ?? null,
      objectifHebdo: (im?.goal as number) ?? null,
    });

    const st = db.prepare(
      `SELECT avg_stress, max_stress, stress_qualifier
       FROM stress WHERE calendar_date = ?`).get(j) as Record<string, unknown> | undefined;
    const stress: StressJournee | null = nullSiVide({
      moyenne: (st?.avg_stress as number) ?? null,
      max: (st?.max_stress as number) ?? null,
      qualificatif: (st?.stress_qualifier as string) ?? null,
    });

    const resp = db.prepare(
      `SELECT avg_waking, avg_sleep, min_value, max_value
       FROM respiration WHERE calendar_date = ?`).get(j) as Record<string, unknown> | undefined;
    const sp = db.prepare(
      `SELECT avg_spo2, min_spo2 FROM spo2 WHERE calendar_date = ?`)
      .get(j) as Record<string, unknown> | undefined;
    const respirationSpo2: RespirationSpo2 | null = nullSiVide({
      respirationReveil: (resp?.avg_waking as number) ?? null,
      respirationSommeil: (resp?.avg_sleep as number) ?? null,
      respirationMin: (resp?.min_value as number) ?? null,
      respirationMax: (resp?.max_value as number) ?? null,
      spo2Moyen: (sp?.avg_spo2 as number) ?? null,
      spo2Min: (sp?.min_spo2 as number) ?? null,
    });

    const sl = db.prepare(
      `SELECT deep_sleep_seconds, rem_sleep_seconds, light_sleep_seconds, awake_count,
              average_hr_sleep, average_spo2, nap_time_seconds, sleep_score_feedback,
              sleep_score_insight, sleep_need_minutes
       FROM sleep WHERE calendar_date = ?`).get(j) as Record<string, unknown> | undefined;
    const sommeilDetaille: SommeilDetaille | null = nullSiVide({
      profondH: sl?.deep_sleep_seconds != null ? (sl.deep_sleep_seconds as number) / 3600 : null,
      remH: sl?.rem_sleep_seconds != null ? (sl.rem_sleep_seconds as number) / 3600 : null,
      legerH: sl?.light_sleep_seconds != null ? (sl.light_sleep_seconds as number) / 3600 : null,
      reveils: (sl?.awake_count as number) ?? null,
      fcMoyenneSommeil: (sl?.average_hr_sleep as number) ?? null,
      spo2MoyenSommeil: (sl?.average_spo2 as number) ?? null,
      siesteMin: sl?.nap_time_seconds != null ? (sl.nap_time_seconds as number) / 60 : null,
      feedback: (sl?.sleep_score_feedback as string) ?? null,
      insight: (sl?.sleep_score_insight as string) ?? null,
      besoinMin: (sl?.sleep_need_minutes as number) ?? null,
    });

    const rp = db.prepare(
      `SELECT time_5k, time_10k, time_half_marathon, time_marathon
       FROM race_predictions WHERE calendar_date = ?`).get(j) as Record<string, unknown> | undefined;
    const predictionsCourse: PredictionsCourse | null = nullSiVide({
      temps5kSec: (rp?.time_5k as number) ?? null,
      temps10kSec: (rp?.time_10k as number) ?? null,
      tempsSemiSec: (rp?.time_half_marathon as number) ?? null,
      tempsMarathonSec: (rp?.time_marathon as number) ?? null,
    });

    const fa = db.prepare(
      `SELECT fitness_age, chronological_age, achievable_fitness_age
       FROM fitness_age WHERE calendar_date = ?`).get(j) as Record<string, unknown> | undefined;
    const ageDeForme: AgeDeForme | null = nullSiVide({
      age: fa?.fitness_age != null ? arrondi1(fa.fitness_age as number) : null,
      ageChronologique: fa?.chronological_age != null ? arrondi1(fa.chronological_age as number) : null,
      ageAtteignable: fa?.achievable_fitness_age != null
        ? arrondi1(fa.achievable_fitness_age as number) : null,
    });

    // Tâche 31 : verdicts bruts training_readiness — feedback_short (conseil
    // court), recovery_time (minutes) et acwr_factor_feedback (ratio de charge
    // aiguë/chronique déjà qualifié par Garmin). Traduits côté composant
    // uniquement (lib/statuts-entrainement.ts), jamais ici.
    const tr = db.prepare(
      `SELECT feedback_short, recovery_time, acwr_factor_feedback
       FROM training_readiness WHERE calendar_date = ?`).get(j) as Record<string, unknown> | undefined;

    return {
      date: j, bodyBattery, statutEntrainement, activite, minutesIntensite,
      stress, respirationSpo2, sommeilDetaille, predictionsCourse, ageDeForme,
      readinessFeedback: (tr?.feedback_short as string) ?? null,
      readinessRecupMin: (tr?.recovery_time as number) ?? null,
      acwrFeedback: (tr?.acwr_factor_feedback as string) ?? null,
    };
  } finally {
    db.close();
  }
}

/** Détail complet d'une séance (tâche 20, page `/seance/[id]`) : toutes les
 *  mesures étendues de `activity`, ses splits, ses zones de FC, sa météo, et
 *  la saisie manuelle éventuellement rattachée (RPE, notes). `null` si l'id
 *  n'existe pas — à l'appelant de renvoyer `notFound()`, pas un écran vide.
 *
 *  Seule fonction de `garmin.ts` à ouvrir aussi `training.db` (via
 *  `lireSeanceManuelleParGarminId`) : la saisie manuelle fait partie du
 *  contrat de cette fonction (brief tâche 20), pas une fusion à faire faire à
 *  l'appelant comme `fusionnerSeances` pour la liste. `initialiserSchema()`
 *  est appelé ici (idempotent, CREATE TABLE IF NOT EXISTS) pour que la
 *  fonction reste utilisable seule — y compris en test — sans dépendre d'un
 *  appel préalable fait par la page. */
export function lireSeanceDetail(id: number): SeanceDetail | null {
  const db = ouvrirGarmin();
  try {
    const a = db.prepare(
      `SELECT activity_id, activity_name, activity_type, start_time_local, location_name,
              distance_meters, duration_seconds, calories, average_hr, max_hr, activity_min_hr,
              avg_cadence, max_cadence, elevation_gain, elevation_loss,
              avg_power, max_power, norm_power, aerobic_training_effect, anaerobic_training_effect,
              vo2max_value, body_battery_change, direct_workout_feel, direct_workout_rpe
       FROM activity WHERE activity_id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!a) return null;

    // Tâche 31 : running_dynamics, table entière jamais lue avant cette tâche —
    // une ligne au plus par activité (clé activity_id, pas de PRIMARY KEY
    // dédiée côté schéma réel mais garanti 0 ou 1 ligne par le collecteur).
    let rd: Record<string, unknown> | undefined;
    try {
      rd = db.prepare(
        `SELECT avg_gct, avg_gct_balance, avg_vert_osc, avg_vert_ratio, avg_stride_len
         FROM running_dynamics WHERE activity_id = ?`).get(id) as Record<string, unknown> | undefined;
    } catch {
      rd = undefined;
    }

    // Tâche 40 (radar comparatif) : `training_load` lue à part, comme rd
    // ci-dessus — absente d'un instantané généré par une version antérieure du
    // collecteur (même tolérance que lireChargeParJour/lireChargeParSemaine) ;
    // une erreur ici ne doit jamais faire échouer le reste de la fonction.
    let charge: number | null = null;
    try {
      const c = db.prepare(`SELECT training_load FROM activity WHERE activity_id = ?`)
        .get(id) as { training_load: number | null } | undefined;
      charge = c?.training_load ?? null;
    } catch {
      charge = null;
    }

    const splits = db.prepare(
      `SELECT split_number, distance_meters, duration_seconds, average_speed, average_hr,
              elevation_gain, avg_cadence
       FROM activity_splits WHERE activity_id = ? ORDER BY split_number`)
      .all(id) as Record<string, unknown>[];

    const z = db.prepare(
      `SELECT zone1_seconds, zone2_seconds, zone3_seconds, zone4_seconds, zone5_seconds
       FROM activity_hr_zones WHERE activity_id = ?`).get(id) as Record<string, unknown> | undefined;

    const w = db.prepare(
      `SELECT temperature, apparent_temperature, humidity, wind_speed, wind_direction, weather_type
       FROM activity_weather WHERE activity_id = ?`).get(id) as Record<string, unknown> | undefined;

    initialiserSchema();
    const manuelle = lireSeanceManuelleParGarminId(id);

    const splitsConvertis: SplitSeance[] = splits.map((s) => ({
      numero: s.split_number as number,
      distanceM: (s.distance_meters as number) ?? null,
      dureeSec: (s.duration_seconds as number) ?? null,
      vitesseMoyMps: (s.average_speed as number) ?? null,
      fcMoy: (s.average_hr as number) ?? null,
      deniveleMonte: (s.elevation_gain as number) ?? null,
      cadenceMoy: (s.avg_cadence as number) ?? null,
    }));

    const meteo: MeteoSeance | null = w ? {
      temperatureC: w.temperature != null ? fahrenheitVersCelsius(w.temperature as number) : null,
      temperatureRessentieC: w.apparent_temperature != null
        ? fahrenheitVersCelsius(w.apparent_temperature as number) : null,
      humidite: (w.humidity as number) ?? null,
      ventKmh: w.wind_speed != null ? mphVersKmh(w.wind_speed as number) : null,
      ventDirectionDeg: (w.wind_direction as number) ?? null,
      type: (w.weather_type as string) ?? null,
    } : null;

    return {
      id: a.activity_id as number,
      nom: (a.activity_name as string) ?? null,
      type: (a.activity_type as string) ?? null,
      debut: a.start_time_local as string,
      lieu: (a.location_name as string) ?? null,
      distanceM: (a.distance_meters as number) ?? null,
      dureeSec: (a.duration_seconds as number) ?? null,
      calories: (a.calories as number) ?? null,
      fcMoy: (a.average_hr as number) ?? null,
      fcMax: (a.max_hr as number) ?? null,
      fcMin: (a.activity_min_hr as number) ?? null,
      cadenceMoy: (a.avg_cadence as number) ?? null,
      cadenceMax: (a.max_cadence as number) ?? null,
      deniveleMonte: (a.elevation_gain as number) ?? null,
      deniveleDescente: (a.elevation_loss as number) ?? null,
      puissanceMoy: (a.avg_power as number) ?? null,
      puissanceMax: (a.max_power as number) ?? null,
      puissanceNorm: (a.norm_power as number) ?? null,
      effetAerobie: (a.aerobic_training_effect as number) ?? null,
      effetAnaerobie: (a.anaerobic_training_effect as number) ?? null,
      splits: splitsConvertis,
      zones: z ? {
        z1: (z.zone1_seconds as number) / 60,
        z2: (z.zone2_seconds as number) / 60,
        z3: (z.zone3_seconds as number) / 60,
        z4: (z.zone4_seconds as number) / 60,
        z5: (z.zone5_seconds as number) / 60,
      } : null,
      meteo,
      saisie: manuelle ? {
        rpe: manuelle.rpe, notes: manuelle.notes, date: manuelle.date,
        segments: lireSegments(manuelle.id).map((s) => ({ type: s.type, dureeMin: s.dureeMin, notes: s.notes })),
      } : null,
      vo2max: (a.vo2max_value as number) ?? null,
      bodyBatteryChange: (a.body_battery_change as number) ?? null,
      ressentiGarmin: nullSiVide({
        feel: (a.direct_workout_feel as number) ?? null,
        rpe: (a.direct_workout_rpe as number) ?? null,
      }) as RessentiGarmin | null,
      dynamique: nullSiVide({
        tempsContactSolMs: (rd?.avg_gct as number) ?? null,
        balanceGctPct: (rd?.avg_gct_balance as number) ?? null,
        oscillationVerticaleCm: (rd?.avg_vert_osc as number) ?? null,
        ratioVerticalPct: (rd?.avg_vert_ratio as number) ?? null,
        longueurFouleeCm: (rd?.avg_stride_len as number) ?? null,
      }) as DynamiqueCourse | null,
      chargeEntrainement: charge,
    };
  } finally {
    db.close();
  }
}

/** Trace seconde par seconde, sous-échantillonnée par pas régulier vers
 *  `maxPoints` (~300 par défaut — de quoi tracer une courbe lisible sans
 *  transmettre les ~2000 points bruts d'une sortie de 33 minutes), premier et
 *  dernier point toujours conservés. `[]` si l'activité n'a pas de trace (cas
 *  boxe en salle) ou si l'id est inconnu — jamais une erreur, à l'appelant de
 *  masquer la section courbe dans ce cas. */
export function lireTrackpoints(id: number, maxPoints = 300): TrackpointSeance[] {
  const db = ouvrirGarmin();
  try {
    // cadence/power_w ajoutées tâche 48 (courbes enrichies) : vérifiées
    // présentes en production (`PRAGMA table_info`, le serveur) — jamais lues
    // avant cette tâche bien que la revue A1 les ait déjà signalées.
    const lignes = db.prepare(
      `SELECT distance_m, heart_rate_bpm, speed_mps, altitude_m, cadence, power_w
       FROM activity_trackpoints WHERE activity_id = ? ORDER BY seq`)
      .all(id) as Record<string, unknown>[];
    if (lignes.length === 0) return [];

    const pas = Math.max(1, Math.ceil(lignes.length / maxPoints));
    const dernierIndex = lignes.length - 1;
    return lignes
      .filter((_, i) => i % pas === 0 || i === dernierIndex)
      .map((r) => ({
        // `?? null` (et non `|| null`) : préserve une vitesse à 0 (arrêt réel)
        // et ne convertit jamais une FC absente en 0 — voir lib/types.ts.
        distanceM: (r.distance_m as number) ?? null,
        fcBpm: (r.heart_rate_bpm as number) ?? null,
        vitesseMps: (r.speed_mps as number) ?? null,
        altitudeM: (r.altitude_m as number) ?? null,
        cadenceSpm: (r.cadence as number) ?? null,
        puissanceW: (r.power_w as number) ?? null,
      }));
  } finally {
    db.close();
  }
}

/** Trace GPS sous-échantillonnée pour la carte 3D du parcours (tâche 27) :
 *  lat/lon/altitude ordonnés par `seq`, même technique de sous-échantillonnage
 *  par pas entier que `lireTrackpoints` (premier et dernier point du sous-
 *  ensemble valide toujours conservés). Les lignes sans lat/lon (avant fix
 *  GPS, cf. fixture) sont ignorées à la source par la clause SQL — MapLibre a
 *  besoin d'une trace continue, pas d'un trou à représenter. `[]` si
 *  l'activité n'a pas de trace GPS (boxe, tapis…) ou si l'id est inconnu —
 *  jamais une erreur, à l'appelant (section carte) de s'effacer dans ce cas. */
export function lireTraceGps(id: number, maxPoints = 1500): PointTraceGps[] {
  const db = ouvrirGarmin();
  try {
    const lignes = db.prepare(
      `SELECT latitude, longitude, altitude_m
       FROM activity_trackpoints
       WHERE activity_id = ? AND latitude IS NOT NULL AND longitude IS NOT NULL
       ORDER BY seq`)
      .all(id) as Record<string, unknown>[];
    if (lignes.length === 0) return [];

    const pas = Math.max(1, Math.ceil(lignes.length / maxPoints));
    const dernierIndex = lignes.length - 1;
    return lignes
      .filter((_, i) => i % pas === 0 || i === dernierIndex)
      .map((r) => ({
        lat: r.latitude as number,
        lon: r.longitude as number,
        altitudeM: (r.altitude_m as number) ?? null,
      }));
  } finally {
    db.close();
  }
}

/** `AAAA-MM-JJ` décalée de `delta` jours (peut être négatif) — utilitaire
 *  local aux deux fonctions ci-dessous, en arithmétique de date UTC pour ne
 *  jamais glisser d'un jour sur un changement d'heure d'été/hiver. */
function decalerDate(iso: string, delta: number): string {
  const [an, mois, jour] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(an, mois - 1, jour + delta));
  return d.toISOString().slice(0, 10);
}

/** Charge d'entraînement (`activity.training_load`) additionnée par jour
 *  civil, sur `jours` jours se terminant à `dateFin` inclus (aujourd'hui par
 *  défaut) — section « Charge 7 jours » du dashboard Cadence (tâche 21).
 *  Chronologique croissant, le jour le plus récent en dernier (même
 *  convention que les autres séries de l'app). Un jour sans activité ou dont
 *  la seule activité n'a pas de `training_load` connu renvoie `0` — c'est une
 *  vraie absence de charge ce jour-là, pas une donnée manquante à masquer
 *  (contrairement à la règle « jamais de zéro fabriqué » qui s'applique aux
 *  mesures physiologiques, pas à une somme dont l'absence de terme EST
 *  l'information).
 *
 *  `activity.training_load` documentée et validée contre le schéma réel
 *  (docs/requetes-garmin.md) mais absente d'un instantané généré par une
 *  version antérieure du collecteur : `[]` dans ce cas plutôt qu'un écran
 *  cassé — `ChargeSemaine` n'affiche alors pas les barres (le gros chiffre
 *  vient de `training_status`, une table distincte, non affecté). */
export function lireChargeParJour(jours = 7, dateFin?: string): ChargeJour[] {
  const db = ouvrirGarmin();
  try {
    const fin = dateFin ?? new Date().toISOString().slice(0, 10);
    const debut = decalerDate(fin, -(jours - 1));

    let lignes: { jour: string; total: number | null }[];
    try {
      lignes = db.prepare(
        `SELECT date(start_time_local) AS jour, SUM(training_load) AS total
         FROM activity
         WHERE date(start_time_local) BETWEEN ? AND ?
         GROUP BY jour`)
        .all(debut, fin) as { jour: string; total: number | null }[];
    } catch {
      return [];
    }
    const parJour = new Map(lignes.map((l) => [l.jour, l.total ?? 0]));

    const resultat: ChargeJour[] = [];
    for (let i = 0; i < jours; i += 1) {
      const jour = decalerDate(debut, i);
      resultat.push({ date: jour, total: parJour.get(jour) ?? 0 });
    }
    return resultat;
  } finally {
    db.close();
  }
}

/** Lundi (ISO) de la semaine contenant `iso` — même arithmétique de date UTC
 *  que `decalerDate`, pour ne jamais glisser d'un jour sur un changement
 *  d'heure d'été/hiver. */
function lundiDeLaSemaine(iso: string): string {
  const [an, mois, jour] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(an, mois - 1, jour));
  const jourIso = d.getUTCDay() || 7; // 1 = lundi … 7 = dimanche
  d.setUTCDate(d.getUTCDate() - (jourIso - 1));
  return d.toISOString().slice(0, 10);
}

/** Charge d'entraînement (`activity.training_load`) sommée par semaine ISO
 *  (lundi-dimanche), `nb` semaines se terminant par celle contenant `dateFin`
 *  inclus (aujourd'hui par défaut) — tendance 8 semaines de l'écran Historique
 *  (tâche 22). Chronologique croissant.
 *
 *  Contrairement à `lireChargeParJour`, les semaines antérieures à la première
 *  activité connue (`MIN(date(start_time_local))`) ne sont PAS incluses : la
 *  montre est neuve, il n'existe que quelques semaines de données, une
 *  semaine « avant que l'app existe » n'est pas une vraie absence de charge à
 *  afficher comme un 0 — c'est une semaine qui n'a jamais été mesurée. Une
 *  semaine postérieure à la première donnée mais sans aucune activité reste,
 *  elle, un vrai 0 (même logique que `lireChargeParJour`).
 *
 *  Même tolérance de schéma que `lireChargeParJour` (`training_load` absente
 *  d'un instantané généré par une version antérieure du collecteur) : `[]`
 *  plutôt qu'un écran cassé. */
export function lireChargeParSemaine(nb: number, dateFin?: string): ChargeHebdo[] {
  const db = ouvrirGarmin();
  try {
    const fin = dateFin ?? new Date().toISOString().slice(0, 10);
    const lundiFin = lundiDeLaSemaine(fin);
    const lundiDebut = decalerDate(lundiFin, -7 * (nb - 1));

    let lignes: { jour: string; total: number | null }[];
    try {
      lignes = db.prepare(
        `SELECT date(start_time_local) AS jour, SUM(training_load) AS total
         FROM activity
         WHERE date(start_time_local) BETWEEN ? AND ?
         GROUP BY jour`)
        .all(lundiDebut, fin) as { jour: string; total: number | null }[];
    } catch {
      return [];
    }

    const premiere = db.prepare(`SELECT MIN(date(start_time_local)) AS d FROM activity`)
      .get() as { d: string | null } | undefined;
    const premiereDate = premiere?.d ?? null;
    if (!premiereDate) return [];

    const parJour = new Map(lignes.map((l) => [l.jour, l.total ?? 0]));

    const semaines: ChargeHebdo[] = [];
    for (let i = 0; i < nb; i += 1) {
      const lundi = decalerDate(lundiDebut, 7 * i);
      const dimanche = decalerDate(lundi, 6);
      if (dimanche < premiereDate) continue; // semaine entièrement avant la première donnée

      let total = 0;
      for (let j = 0; j <= 6; j += 1) {
        total += parJour.get(decalerDate(lundi, j)) ?? 0;
      }
      semaines.push({ isoSemaine: numeroSemaineIso(lundi), debut: lundi, total });
    }
    return semaines;
  } finally {
    db.close();
  }
}

/** Stats agrégées des `jours` derniers jours (7 par défaut) se terminant à
 *  `dateFin` inclus (aujourd'hui par défaut) — bande de mesures de l'écran
 *  Historique/analyses (tâche 21 ; fenêtre configurable depuis la tâche 47,
 *  `lib/fenetre-temporelle.ts`, l'appelant passe la préférence utilisateur).
 *  Volume et dénivelé ne comptent que les activités Garmin qui portent
 *  réellement ces mesures (`SUM` ignore les `NULL`, ex. boxe en salle sans
 *  distance) ; `pourcentZ12` est `null` — jamais `0` — quand aucune activité
 *  de la fenêtre n'a de zones de FC connues, pour ne pas laisser croire à un
 *  « aucun temps en Z1-Z2 » qui serait faux. `seances` compte les activités
 *  Garmin de la fenêtre (les séances manuelles autonomes n'ont ni distance ni
 *  zones, elles ne peuvent pas nourrir les autres colonnes de cette même
 *  ligne de stats). */
export function lireStatsSemaine(dateFin?: string, jours = 7): StatsSemaine {
  const db = ouvrirGarmin();
  try {
    const fin = dateFin ?? new Date().toISOString().slice(0, 10);
    const debut = decalerDate(fin, -(jours - 1));

    // Même tolérance qu'un instantané généré par une version antérieure du
    // collecteur que lireChargeParJour ci-dessus : `elevation_gain` (ajoutée
    // pour la tâche 20) peut manquer sur un instantané ancien — `[]` plutôt
    // qu'un écran cassé, la fonction renvoie alors des stats neutres.
    let activites: {
      id: number; distance: number | null; denivele: number | null;
      z1: number | null; z2: number | null; z3: number | null; z4: number | null; z5: number | null;
    }[];
    try {
      activites = db.prepare(
        `SELECT a.activity_id AS id, a.distance_meters AS distance, a.elevation_gain AS denivele,
                z.zone1_seconds AS z1, z.zone2_seconds AS z2, z.zone3_seconds AS z3,
                z.zone4_seconds AS z4, z.zone5_seconds AS z5
         FROM activity a
         LEFT JOIN activity_hr_zones z ON z.activity_id = a.activity_id
         WHERE date(a.start_time_local) BETWEEN ? AND ?`)
        .all(debut, fin) as typeof activites;
    } catch {
      activites = [];
    }

    let distanceM = 0;
    let deniveleM = 0;
    let z12Sec = 0;
    let totalZonesSec = 0;
    let uneActiviteAvecZones = false;
    for (const a of activites) {
      distanceM += a.distance ?? 0;
      deniveleM += a.denivele ?? 0;
      if (a.z1 != null || a.z2 != null || a.z3 != null || a.z4 != null || a.z5 != null) {
        uneActiviteAvecZones = true;
        z12Sec += (a.z1 ?? 0) + (a.z2 ?? 0);
        totalZonesSec += (a.z1 ?? 0) + (a.z2 ?? 0) + (a.z3 ?? 0) + (a.z4 ?? 0) + (a.z5 ?? 0);
      }
    }

    return {
      volumeKm: Math.round((distanceM / 1000) * 10) / 10,
      deniveleM: Math.round(deniveleM),
      pourcentZ12: uneActiviteAvecZones && totalZonesSec > 0
        ? Math.round((z12Sec / totalZonesSec) * 100) : null,
      seances: activites.length,
    };
  } finally {
    db.close();
  }
}

/** Efficacité aérobie — « allure à FC égale » (tâche 25, écran Historique) :
 *  une ligne chronologique par activité de course à pied (`TYPES_COURSE`)
 *  qui porte à la fois une distance et une FC moyenne connues. Les activités
 *  sans l'une ou l'autre sont ignorées à la source (clause SQL) plutôt que
 *  représentées avec un champ inventé — ce n'est pas la même règle que
 *  `allureSecParKm` (qui, elle, tolère une distance absente en retournant
 *  `null` pour un appelant qui a déjà décidé d'afficher la ligne). `indice` =
 *  mètres parcourus par battement de cœur, `null` si la durée manque malgré
 *  tout (FC et distance garanties non nulles par la clause WHERE). */
export function lireEfficaciteAerobie(): EfficaciteAerobie[] {
  const db = ouvrirGarmin();
  try {
    const lignes = db.prepare(
      `SELECT start_time_local, activity_name, distance_meters, duration_seconds, average_hr
       FROM activity
       WHERE activity_type IN (${TYPES_COURSE.map(() => '?').join(',')})
         AND distance_meters IS NOT NULL AND distance_meters > 0
         AND average_hr IS NOT NULL
       ORDER BY start_time_local ASC`)
      .all(...TYPES_COURSE) as {
        start_time_local: string; activity_name: string | null; distance_meters: number;
        duration_seconds: number | null; average_hr: number;
      }[];

    return lignes.map((r) => {
      const dureeMin = r.duration_seconds != null ? r.duration_seconds / 60 : null;
      return {
        debut: r.start_time_local,
        nom: r.activity_name ?? null,
        allureSecKm: allureSecParKm(r.duration_seconds, r.distance_meters),
        fcMoy: r.average_hr,
        indice: dureeMin != null && dureeMin > 0 ? r.distance_meters / (dureeMin * r.average_hr) : null,
      };
    });
  } finally {
    db.close();
  }
}

/** Part du temps passé en zones 1-2 (effort facile) par semaine ISO (tâche
 *  25, écran Historique) — mêmes bornes/exclusions que `lireChargeParSemaine`
 *  (semaines antérieures à la première activité connue exclues). `pctZ1Z2`
 *  est `null` — jamais `0` — quand aucune activité de la semaine n'a de
 *  zones de FC connues (même règle que `lireStatsSemaine.pourcentZ12`).
 *  Même tolérance de schéma que les fonctions ci-dessus : `[]` plutôt qu'un
 *  écran cassé si `activity_hr_zones` manque sur un instantané ancien. */
export function lireZonesParSemaine(nb: number, dateFin?: string): ZonesHebdo[] {
  const db = ouvrirGarmin();
  try {
    const fin = dateFin ?? new Date().toISOString().slice(0, 10);
    const lundiFin = lundiDeLaSemaine(fin);
    const lundiDebut = decalerDate(lundiFin, -7 * (nb - 1));

    const premiere = db.prepare(`SELECT MIN(date(start_time_local)) AS d FROM activity`)
      .get() as { d: string | null } | undefined;
    const premiereDate = premiere?.d ?? null;
    if (!premiereDate) return [];

    let lignes: { jour: string; z1: number | null; z2: number | null; z3: number | null; z4: number | null; z5: number | null }[];
    try {
      lignes = db.prepare(
        `SELECT date(a.start_time_local) AS jour, z.zone1_seconds AS z1, z.zone2_seconds AS z2,
                z.zone3_seconds AS z3, z.zone4_seconds AS z4, z.zone5_seconds AS z5
         FROM activity a JOIN activity_hr_zones z ON z.activity_id = a.activity_id
         WHERE date(a.start_time_local) BETWEEN ? AND ?`)
        .all(lundiDebut, fin) as typeof lignes;
    } catch {
      lignes = [];
    }

    const semaines: ZonesHebdo[] = [];
    for (let i = 0; i < nb; i += 1) {
      const lundi = decalerDate(lundiDebut, 7 * i);
      const dimanche = decalerDate(lundi, 6);
      if (dimanche < premiereDate) continue; // semaine entièrement avant la première donnée

      const lignesSemaine = lignes.filter((l) => l.jour >= lundi && l.jour <= dimanche);
      let z12 = 0;
      let total = 0;
      for (const l of lignesSemaine) {
        z12 += (l.z1 ?? 0) + (l.z2 ?? 0);
        total += (l.z1 ?? 0) + (l.z2 ?? 0) + (l.z3 ?? 0) + (l.z4 ?? 0) + (l.z5 ?? 0);
      }
      semaines.push({
        isoSemaine: numeroSemaineIso(lundi),
        debut: lundi,
        pctZ1Z2: lignesSemaine.length > 0 && total > 0 ? Math.round((z12 / total) * 100) : null,
        activitesAvecZones: lignesSemaine.length,
      });
    }
    return semaines;
  } finally {
    db.close();
  }
}

/** Plan vs réalisé (tâche 25, écran Historique, sous-bloc « Semaine passée »
 *  de la guidance) : séances du plan Garmin (`workout_schedule`, même source
 *  que `lireProchainesSeances`) échues dans les `nbJours` derniers jours,
 *  `aujourdhui` strictement exclu. Les jours de repos sont filtrés ici —
 *  contrairement à `lireProchainesSeances` qui les inclut — un jour de repos
 *  n'est pas une « séance » à confronter à une activité réalisée. Pour
 *  chaque séance échue, recherche une activité de course (`TYPES_COURSE`) le
 *  même jour calendaire : `realisee = null` si aucune (formulation factuelle
 *  à l'appelant : « non couru », jamais « manqué »). */
export function lirePlanPasse(nbJours: number, aujourdhui?: string): PlanPasse[] {
  const db = ouvrirGarmin();
  try {
    const fin = aujourdhui ?? new Date().toISOString().slice(0, 10);
    const debut = decalerDate(fin, -nbJours);

    const lignes = db.prepare(
      `SELECT calendar_date, raw_json FROM workout_schedule
       WHERE calendar_date >= ? AND calendar_date < ? ORDER BY calendar_date ASC`)
      .all(debut, fin) as { calendar_date: string; raw_json: string }[];

    const realiseeParJour = db.prepare(
      `SELECT activity_id, activity_name, distance_meters FROM activity
       WHERE date(start_time_local) = ?
         AND activity_type IN (${TYPES_COURSE.map(() => '?').join(',')})
       ORDER BY start_time_local ASC LIMIT 1`);

    return lignes
      .map((ligne) => ({ date: ligne.calendar_date, j: JSON.parse(ligne.raw_json) as Record<string, unknown> }))
      .filter(({ j }) => j.isRestDay !== true)
      .map(({ date, j }) => {
        const realisee = realiseeParJour.get(date, ...TYPES_COURSE) as
          { activity_id: number; activity_name: string | null; distance_meters: number | null } | undefined;
        return {
          date,
          nom: (j.workoutName as string) ?? null,
          distanceM: (j.estimatedDistanceInMeters as number) ?? null,
          realisee: realisee
            ? { id: realisee.activity_id, nom: realisee.activity_name ?? null, distanceM: realisee.distance_meters ?? null }
            : null,
        };
      });
  } finally {
    db.close();
  }
}

/** `lireStatsParSport` (écran Séances, tâche 26) : une ligne par `activity_type`
 *  distinct. `kmTotal`/`deniveleM` sont `null` — jamais `0` — quand aucune
 *  activité du groupe ne porte cette mesure (SUM SQLite ignore les NULL et ne
 *  renvoie NULL que si la colonne est NULL sur toutes les lignes du groupe,
 *  ce qui correspond exactement à la règle « jamais de zéro fabriqué »).
 *  `allureSecKm` (allure moyenne pondérée par la distance) n'est calculée que
 *  pour les types de course à pied (`TYPES_COURSE`, même liste que
 *  `lireEfficaciteAerobie`/`lirePlanPasse`), `null` pour tout autre sport —
 *  une allure moyenne de vélo ou de boxe n'a pas de sens à afficher. Les
 *  activités sans `activity_type` connu sont exclues : une tuile sans
 *  libellé de sport serait plus trompeuse qu'absente. Même tolérance de
 *  schéma que les fonctions ci-dessus (`elevation_gain` absente d'un
 *  instantané ancien) : `[]` plutôt qu'un écran cassé. */
export type StatsSportGarmin = {
  sport: string;
  nombre: number;
  kmTotal: number | null;
  dureeTotaleMin: number | null;
  deniveleM: number | null;
  allureSecKm: number | null;
};

export function lireStatsParSport(): StatsSportGarmin[] {
  const db = ouvrirGarmin();
  try {
    let lignes: {
      sport: string; nombre: number; distance_totale: number | null;
      duree_totale: number | null; denivele_totale: number | null;
    }[];
    try {
      lignes = db.prepare(
        `SELECT activity_type AS sport, COUNT(*) AS nombre,
                SUM(distance_meters) AS distance_totale,
                SUM(duration_seconds) AS duree_totale,
                SUM(elevation_gain) AS denivele_totale
         FROM activity
         WHERE activity_type IS NOT NULL
         GROUP BY activity_type
         ORDER BY nombre DESC, activity_type ASC`)
        .all() as typeof lignes;
    } catch {
      return [];
    }
    if (lignes.length === 0) return [];

    // Allure moyenne pondérée par la distance, uniquement pour les types de
    // course, uniquement sur les activités qui portent à la fois une
    // distance et une durée connues (même clause que lireEfficaciteAerobie).
    const allureParType = new Map<string, number>();
    const coursesLignes = db.prepare(
      `SELECT activity_type AS sport, SUM(distance_meters) AS distance_totale,
              SUM(duration_seconds) AS duree_totale
       FROM activity
       WHERE activity_type IN (${TYPES_COURSE.map(() => '?').join(',')})
         AND distance_meters IS NOT NULL AND distance_meters > 0
         AND duration_seconds IS NOT NULL
       GROUP BY activity_type`)
      .all(...TYPES_COURSE) as { sport: string; distance_totale: number; duree_totale: number }[];
    for (const c of coursesLignes) {
      allureParType.set(c.sport, c.duree_totale / (c.distance_totale / 1000));
    }

    return lignes.map((l) => ({
      sport: l.sport,
      nombre: l.nombre,
      kmTotal: l.distance_totale != null ? Math.round((l.distance_totale / 1000) * 10) / 10 : null,
      dureeTotaleMin: l.duree_totale != null ? Math.round(l.duree_totale / 60) : null,
      deniveleM: l.denivele_totale != null ? Math.round(l.denivele_totale) : null,
      allureSecKm: allureParType.get(l.sport) ?? null,
    }));
  } finally {
    db.close();
  }
}

/** VO2max le plus récent (tâche 31, revue A1) : la table dédiée `vo2max`
 *  reste vide pour cet utilisateur (montre neuve), mais `activity.vo2max_value`
 *  porte déjà une vraie valeur au niveau de l'activité — dernière valeur non
 *  nulle par date d'activité. `null` si aucune activité n'en porte encore. */
export function lireVo2maxRecent(): VO2maxRecent | null {
  const db = ouvrirGarmin();
  try {
    const r = db.prepare(
      `SELECT vo2max_value, start_time_local FROM activity
       WHERE vo2max_value IS NOT NULL ORDER BY start_time_local DESC LIMIT 1`)
      .get() as { vo2max_value: number; start_time_local: string } | undefined;
    return r ? { valeur: r.vo2max_value, date: r.start_time_local } : null;
  } finally {
    db.close();
  }
}

/** Bornes BPM des zones de FC (tâche 31, revue A1) : `hr_zones` ne porte
 *  qu'une ligne de configuration (`raw_json`, pas de `calendar_date`
 *  contrairement au reste du schéma) — la plus récente par `id` si plusieurs
 *  existent un jour (changement de FC max, ex.). `null` si la table est vide
 *  ou si le JSON ne porte pas les bornes attendues. */
export function lireZonesFcBornes(): ZonesFcBornes | null {
  const db = ouvrirGarmin();
  try {
    let ligne: { raw_json: string } | undefined;
    try {
      ligne = db.prepare(`SELECT raw_json FROM hr_zones ORDER BY id DESC LIMIT 1`)
        .get() as { raw_json: string } | undefined;
    } catch {
      return null;
    }
    if (!ligne?.raw_json) return null;

    const j = JSON.parse(ligne.raw_json) as Record<string, unknown>;
    if (j.zone1Floor == null || j.zone2Floor == null || j.zone3Floor == null
      || j.zone4Floor == null || j.zone5Floor == null) return null;

    return {
      z1Plancher: j.zone1Floor as number,
      z2Plancher: j.zone2Floor as number,
      z3Plancher: j.zone3Floor as number,
      z4Plancher: j.zone4Floor as number,
      z5Plancher: j.zone5Floor as number,
      fcMax: (j.maxHeartRateUsed as number) ?? null,
      fcRepos: (j.restingHeartRateUsed as number) ?? null,
      fcSeuilLactate: (j.lactateThresholdHeartRateUsed as number) ?? null,
    };
  } finally {
    db.close();
  }
}

/** Records personnels (tâche 31, revue A1 — nommé explicitement par l'utilisateur) :
 *  seuls les records rattachés à une activité et une date connues
 *  (`pr_date IS NOT NULL AND activity_id != 0`) sont exposés — `pr_type` est
 *  un entier Garmin sans libellé fourni par l'API (`prTypeLabelKey` toujours
 *  `null` en production), seuls les types de distance de course standard sont
 *  traduits (`traduireTypeRecord`, lib/statuts-entrainement.ts) ; un type non
 *  couvert est exclu plutôt que deviné (contrairement aux codes textuels
 *  Garmin ailleurs dans l'app, un entier nu ne serait pas lisible « tel
 *  quel »). Chronologique décroissant (le plus récent d'abord). */
export function lirePersonalRecords(): PersonalRecord[] {
  const db = ouvrirGarmin();
  try {
    let lignes: {
      pr_type: string; value: number; pr_date: string;
      activity_id: number | null; display_name: string | null;
    }[];
    try {
      lignes = db.prepare(
        `SELECT pr_type, value, pr_date, activity_id, display_name FROM personal_record
         WHERE pr_date IS NOT NULL AND activity_id IS NOT NULL AND activity_id != 0
         ORDER BY pr_date DESC`).all() as typeof lignes;
    } catch {
      return [];
    }

    const resultat: PersonalRecord[] = [];
    for (const l of lignes) {
      const traduit = traduireTypeRecord(Number(l.pr_type));
      if (!traduit) continue; // type Garmin non couvert, jamais deviné
      resultat.push({
        libelle: traduit.libelle,
        nature: traduit.nature,
        valeur: l.value,
        date: l.pr_date,
        activiteId: l.activity_id,
        activiteNom: l.display_name,
      });
    }
    return resultat;
  } finally {
    db.close();
  }
}

/** Mesures de poids (tâche 31, revue A1 — nommé explicitement par l'utilisateur) :
 *  `weight.weight` est en grammes en base (piège vérifié sur l'instantané
 *  réel), converti en kg ici. Plusieurs entrées peuvent partager la même
 *  `calendar_date` (ex. saisie manuelle corrigée le même jour) — seule la
 *  plus récente par `timestamp` est conservée par date. Chronologique
 *  croissant, même convention que les autres séries de l'app. */
export function lirePoids(): PoidsMesure[] {
  const db = ouvrirGarmin();
  try {
    let lignes: { calendar_date: string; weight: number; timestamp: number }[];
    try {
      lignes = db.prepare(
        `SELECT calendar_date, weight, timestamp FROM weight
         WHERE weight IS NOT NULL ORDER BY timestamp ASC`).all() as typeof lignes;
    } catch {
      return [];
    }

    const parDate = new Map<string, { weight: number; timestamp: number }>();
    for (const l of lignes) {
      const existant = parDate.get(l.calendar_date);
      if (!existant || l.timestamp >= existant.timestamp) {
        parDate.set(l.calendar_date, { weight: l.weight, timestamp: l.timestamp });
      }
    }

    return Array.from(parDate.entries())
      .map(([date, v]) => ({ date, kg: Math.round((v.weight / 1000) * 10) / 10 }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } finally {
    db.close();
  }
}
