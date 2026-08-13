import { DatabaseSync } from 'node:sqlite';

/** Instantané Garmin minimal, avec les pièges du vrai schéma. */
export function semerGarmin(chemin: string): void {
  const db = new DatabaseSync(chemin);
  db.exec(`
    -- feedback_short/recovery_time/acwr_factor_feedback ajoutés par la tâche 31
    -- (revue A1, verdicts Garmin exposés pour la mise en évidence positive/négative).
    CREATE TABLE training_readiness (calendar_date TEXT PRIMARY KEY, score REAL, level TEXT,
      hrv_factor_percent REAL, sleep_history_factor_percent REAL,
      stress_history_factor_percent REAL, acwr_factor_percent REAL,
      feedback_short TEXT, recovery_time REAL, acwr_factor_feedback TEXT);
    CREATE TABLE hrv (calendar_date TEXT PRIMARY KEY, last_night_avg REAL, weekly_avg REAL,
      baseline_low REAL, baseline_upper REAL);
    -- awake_count / average_hr_sleep / average_spo2 / nap_time_seconds ajoutés
    -- par la tâche 12 (sommeil détaillé, au-delà de la durée déjà affichée).
    -- sleep_score_feedback / sleep_score_insight / sleep_need_minutes ajoutés
    -- par la tâche 31 (revue A1, verdict Garmin + pourquoi + besoin de
    -- sommeil personnalisé).
    CREATE TABLE sleep (calendar_date TEXT PRIMARY KEY, sleep_time_seconds INTEGER,
      deep_sleep_seconds INTEGER, rem_sleep_seconds INTEGER, light_sleep_seconds INTEGER,
      awake_sleep_seconds INTEGER, sleep_score_overall REAL, awake_count INTEGER,
      average_hr_sleep REAL, average_spo2 REAL, nap_time_seconds INTEGER,
      sleep_score_feedback TEXT, sleep_score_insight TEXT, sleep_need_minutes INTEGER);
    CREATE TABLE heart_rate (calendar_date TEXT PRIMARY KEY, resting_hr REAL, last_7day_avg_resting REAL);
    -- status ajouté par la tâche 12 (traduction en français à l'écran Aujourd'hui).
    CREATE TABLE training_status (calendar_date TEXT PRIMARY KEY, acute_load REAL, chronic_load REAL, status TEXT);
    CREATE TABLE workout_schedule (calendar_date TEXT PRIMARY KEY, raw_json TEXT);
    CREATE TABLE activity (activity_id INTEGER PRIMARY KEY, start_time_local TEXT,
      activity_name TEXT, activity_type TEXT, distance_meters REAL, duration_seconds REAL,
      average_hr REAL, max_hr REAL, aerobic_training_effect REAL,
      -- Colonnes ajoutées pour lireSeanceDetail (tâche 20) : sous-ensemble réel
      -- de la table activity de production (56 colonnes, vérifiées sur le serveur),
      -- limité à celles lues par l'écran de détail de séance.
      anaerobic_training_effect REAL, calories REAL, activity_min_hr INTEGER,
      avg_cadence REAL, max_cadence REAL, elevation_gain REAL, elevation_loss REAL,
      avg_power REAL, max_power REAL, norm_power REAL, location_name TEXT,
      -- training_load ajouté pour la tâche 21 (charge 7 jours, dashboard Cadence) :
      -- lireChargeParJour additionne cette colonne par jour civil.
      training_load REAL,
      -- Colonnes ajoutées par la tâche 31 (revue A1) : VO2max au niveau de
      -- l'activité (table dédiée vo2max encore vide), impact Body Battery de
      -- la séance, ressenti saisi par l'utilisateur directement dans Garmin Connect.
      vo2max_value REAL, body_battery_change INTEGER,
      direct_workout_feel INTEGER, direct_workout_rpe INTEGER);
    CREATE TABLE activity_hr_zones (activity_id INTEGER PRIMARY KEY, zone1_seconds REAL,
      zone2_seconds REAL, zone3_seconds REAL, zone4_seconds REAL, zone5_seconds REAL);
    -- Tables de la tâche 20 (détail de séance) : splits kilométriques, météo à
    -- l'heure de la séance, trace seconde par seconde. Schéma vérifié contre
    -- la production (le serveur) — colonnes réellement lues par lireSeanceDetail/
    -- lireTrackpoints uniquement, pas les 56 colonnes réelles de chaque table.
    CREATE TABLE activity_splits (activity_id INTEGER, split_number INTEGER,
      distance_meters REAL, duration_seconds REAL, average_speed REAL, average_hr REAL,
      elevation_gain REAL, avg_cadence REAL);
    CREATE TABLE activity_weather (activity_id INTEGER PRIMARY KEY, temperature REAL,
      apparent_temperature REAL, humidity REAL, wind_speed REAL, wind_direction INTEGER,
      weather_type TEXT);
    -- latitude/longitude conservées dans le schéma (fidélité à la production)
    -- bien que lireTrackpoints ne les lise pas : seules distance_m/heart_rate_bpm/
    -- speed_mps/altitude_m/cadence/power_w sont utiles à la courbe de la page
    -- de détail (FC + allure, et cadence/altitude/puissance en overlay opt-in
    -- depuis la tâche 48). cadence/power_w vérifiées présentes en production
    -- (PRAGMA table_info, le serveur) — colonne temperature_c existe aussi mais
    -- n'est lue par aucun écran, absente ici pour rester au plus près de ce
    -- qui est réellement utilisé.
    CREATE TABLE activity_trackpoints (activity_id INTEGER, seq INTEGER, latitude REAL,
      longitude REAL, altitude_m REAL, distance_m REAL, speed_mps REAL, heart_rate_bpm INTEGER,
      cadence INTEGER, power_w INTEGER);

    -- Tables de la tâche 12 (enrichissement de l'écran Aujourd'hui). Toujours
    -- créées même vides : c'est ainsi que garmin-givemydata les livre en
    -- production (cf. docs/requetes-garmin.md — vo2max, endurance_score,
    -- hill_score existent vides chez cet utilisateur, jamais absentes).
    CREATE TABLE body_battery (calendar_date TEXT PRIMARY KEY, at_wake REAL, most_recent REAL,
      highest REAL, lowest REAL, charged REAL, drained REAL);
    CREATE TABLE daily_summary (calendar_date TEXT PRIMARY KEY, total_steps INTEGER,
      daily_step_goal INTEGER, total_distance_meters REAL, total_kilocalories REAL,
      active_kilocalories REAL, floors_ascended REAL);
    -- goal est l'objectif HEBDOMADAIRE (150 par défaut chez Garmin), répété
    -- identique sur chaque ligne journalière — piège relevé dans le brief de
    -- la tâche 12 : ne jamais le comparer à moderate/vigorous du seul jour.
    CREATE TABLE intensity_minutes (calendar_date TEXT PRIMARY KEY, moderate REAL,
      vigorous REAL, goal REAL);
    CREATE TABLE stress (calendar_date TEXT PRIMARY KEY, avg_stress REAL, max_stress REAL,
      stress_qualifier TEXT);
    CREATE TABLE respiration (calendar_date TEXT PRIMARY KEY, avg_waking REAL, avg_sleep REAL,
      min_value REAL, max_value REAL);
    CREATE TABLE spo2 (calendar_date TEXT PRIMARY KEY, avg_spo2 REAL, min_spo2 REAL);
    CREATE TABLE race_predictions (calendar_date TEXT PRIMARY KEY, time_5k REAL, time_10k REAL,
      time_half_marathon REAL, time_marathon REAL);
    CREATE TABLE fitness_age (calendar_date TEXT PRIMARY KEY, fitness_age REAL,
      chronological_age REAL, achievable_fitness_age REAL);
    -- Vides pour cet utilisateur (montre neuve) : jamais peuplées ici, exactement
    -- comme en production. Sert à vérifier qu'une section ne s'affiche pas du
    -- tout — pas de tirets alignés — quand sa table est vide.
    CREATE TABLE vo2max (calendar_date TEXT PRIMARY KEY, vo2_max_value REAL);

    -- Tables de la tâche 31 (revue A1) : chacune limitée aux colonnes
    -- réellement lues par lib/db/garmin.ts, même convention que activity_splits/
    -- activity_weather ci-dessus. hr_zones n'a pas de calendar_date (une seule
    -- ligne de configuration, vérifié sur l'instantané réel).
    CREATE TABLE hr_zones (id INTEGER PRIMARY KEY, raw_json TEXT);
    CREATE TABLE personal_record (id INTEGER PRIMARY KEY, display_name TEXT,
      pr_type TEXT, value REAL, pr_date TEXT, activity_id INTEGER);
    CREATE TABLE weight (timestamp INTEGER, calendar_date TEXT, weight REAL);
    CREATE TABLE running_dynamics (activity_id INTEGER PRIMARY KEY, avg_gct REAL,
      avg_gct_balance REAL, avg_vert_osc REAL, avg_vert_ratio REAL, avg_stride_len REAL);

    -- Une seule ligne de configuration des zones (sport DEFAULT), reprise de
    -- l'instantané réel (le serveur) — changeState/sport/trainingMethod ne sont pas
    -- lus par lireZonesFcBornes, seuls les planchers et les 3 FC de référence.
    INSERT INTO hr_zones VALUES (36, '{"zone1Floor":101,"zone2Floor":121,"zone3Floor":141,"zone4Floor":161,"zone5Floor":181,"maxHeartRateUsed":201,"restingHeartRateUsed":87,"lactateThresholdHeartRateUsed":175}');

    -- Records personnels (tâche 31) : deux records de course rattachés à
    -- l'activité 1 (types 7 et 1, traduits par traduireTypeRecord), un record
    -- agrégé sans activité/date (type 12, pas quotidiens — doit être exclu par
    -- lirePersonalRecords), et un type de course non couvert par le
    -- dictionnaire (type 99 — doit aussi être exclu, jamais deviné).
    INSERT INTO personal_record VALUES (1, 'Nyon - Base', '7', 4005.52, '2026-08-05', 1);
    INSERT INTO personal_record VALUES (2, 'Nyon - Base', '1', 405.23, '2026-08-05', 1);
    INSERT INTO personal_record VALUES (3, NULL, '12', 30737, NULL, 0);
    INSERT INTO personal_record VALUES (4, 'Sortie inconnue', '99', 123, '2026-08-01', 1);

    -- Poids (tâche 31) : deux entrées le même jour (cas réel observé en
    -- production, saisie manuelle avec une correction) — lirePoids ne doit
    -- garder que la plus récente par date (timestamp le plus grand).
    INSERT INTO weight VALUES (1784246400000, '2026-07-17', 95000);
    INSERT INTO weight VALUES (1784299844031, '2026-07-17', 94800);

    -- Dynamique de course (tâche 31) : activité 1 uniquement — l'activité 2
    -- (boxe) n'a pas de ligne, cas tordu « séance sans détails riches ».
    INSERT INTO running_dynamics VALUES (1, 314.1, NULL, 7.57, 8.28, 90.74);

    -- recovery_time en MINUTES (vérifié sur l'instantané réel : valeurs de
    -- 0 à ~2723, cohérent avec des minutes, pas des heures).
    INSERT INTO training_readiness VALUES ('2026-08-05', 62, 'MODERATE', 70, 80, 60, 90, 'WELL_RECOVERED', 480, 'GOOD');
    INSERT INTO training_readiness VALUES ('2026-08-06', 1, 'POOR', 32, 75, 39, 89, 'TAKE_IT_EASY', 1080, 'POOR');
    INSERT INTO hrv VALUES ('2026-08-05', 55, 44, 43, 73);
    INSERT INTO hrv VALUES ('2026-08-06', 38, 41, 43, 73);
    -- Nuit manquante le 06 : montre non portée. Ne jamais présumer une ligne par jour.
    -- Conservé tel quel (tâche 12) : sert aussi à vérifier que le sommeil détaillé
    -- de la journée ancrée s'efface proprement (aucune ligne = section masquée).
    INSERT INTO sleep VALUES ('2026-08-05', 26160, 6180, 5220, 14220, 720, 71, 3, 52, 96, 900, 'POSITIVE_DEEP', 'POSITIVE_STRESSFUL_DAY', 500);
    -- Nuit du 03 : durée totale connue mais détail des stades non remonté (sync partiel).
    -- Doit rester null, jamais 0 — un 0 se lirait comme « aucun sommeil profond ».
    INSERT INTO sleep VALUES ('2026-08-03', 24000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
    INSERT INTO heart_rate VALUES ('2026-08-06', 54, 56);
    INSERT INTO training_status VALUES ('2026-08-06', 106, 137, 'STRAINED_1');
    -- Colonnes étendues (tâche 20) reprises de la vraie séance de production
    -- (Nyon - Base, activity_id 23865202992 sur le serveur) pour que les tests
    -- restent ancrés dans des valeurs réelles plutôt qu'inventées.
    INSERT INTO activity (activity_id, start_time_local, activity_name, activity_type,
      distance_meters, duration_seconds, average_hr, max_hr, aerobic_training_effect,
      anaerobic_training_effect, calories, activity_min_hr, avg_cadence, max_cadence,
      elevation_gain, elevation_loss, avg_power, max_power, norm_power, location_name,
      training_load, vo2max_value, body_battery_change, direct_workout_feel, direct_workout_rpe)
      VALUES (1, '2026-08-05 19:01:04', 'Nyon - Base', 'running',
      4005.5, 2003.3, 160, 186, 3.2,
      0.4, 411, 100, 129.6, 207, 37, 40, 244, 466, 289, 'Nyon', 180, 41.0, -8, 25, 80);
    -- Activité sans GPS ni zones : cas boxe en salle. Colonnes étendues
    -- toutes NULL (implicite, colonnes omises) — cas tordu « séance sans
    -- détails riches » pour lireSeanceDetail (pas de splits/zones/météo/trackpoints).
    -- training_load renseigné quand même (tâche 21, lireChargeParJour) : une
    -- séance sans GPS a quand même une charge d'entraînement chez Garmin.
    INSERT INTO activity (activity_id, start_time_local, activity_name, activity_type,
      distance_meters, duration_seconds, average_hr, max_hr, aerobic_training_effect,
      training_load)
      VALUES (2, '2026-08-04 18:30:00', 'Boxe', 'other', NULL, 3600, 142, 178, NULL, 95);
    INSERT INTO activity_hr_zones VALUES (1, 18.8, 95.0, 865.0, 639.0, 385.5);
    -- Splits kilométriques de l'activité 1 (tâche 20) — 4 splits couvrant les
    -- 4 km, valeurs plausibles d'une sortie « base » qui accélère légèrement.
    INSERT INTO activity_splits VALUES (1, 1, 1000, 520, 1.92, 152, 8, 126);
    INSERT INTO activity_splits VALUES (1, 2, 1000, 495, 2.02, 158, 12, 129);
    INSERT INTO activity_splits VALUES (1, 3, 1000, 488, 2.05, 163, 9, 131);
    INSERT INTO activity_splits VALUES (1, 4, 1005.5, 500.3, 2.01, 165, 8, 132);
    -- Météo de l'activité 1 (tâche 20), reprise de la vraie séance de
    -- production : Garmin renvoie temp/apparentTemp en °F même pour un compte
    -- en unités métriques (vérifié sur le serveur — dewPoint cohérent avec 88°F,
    -- incohérent avec 88°C un soir d'août à Nyon) — lireSeanceDetail convertit
    -- en °C. wind_speed suit la même convention impériale (mph).
    INSERT INTO activity_weather VALUES (1, 88, 88, 38, 3, 300, 'Mostly Clear');
    -- Activité 2 (boxe) : aucune ligne météo/splits/trackpoints — cas tordu
    -- « séance sans détails riches » vérifié par les tests.
    INSERT INTO workout_schedule VALUES ('2026-08-07', '{"workoutName":"Base","workoutType":"running","isRestDay":false,"estimatedDistanceInMeters":3172,"estimatedDurationInSecs":1320,"workoutPhrase":"EASY_WEEK_LOAD_BASE","tpPlanName":"Programme de remise en forme de 2026"}');
    INSERT INTO workout_schedule VALUES ('2026-08-08', '{"isRestDay":true,"tpPlanName":"Programme de remise en forme de 2026"}');
    -- Prochaines séances (lireProchainesSeances, défaut 3 des captures Bento) :
    -- deux séances chiffrées encadrant le jour de repos déjà semé ci-dessus.
    INSERT INTO workout_schedule VALUES ('2026-08-09', '{"workoutName":"Intervalles","workoutType":"running","isRestDay":false,"estimatedDistanceInMeters":5000,"estimatedDurationInSecs":1800,"workoutPhrase":"TEMPO_RUN","tpPlanName":"Programme de remise en forme de 2026"}');
    INSERT INTO workout_schedule VALUES ('2026-08-10', '{"workoutName":"Longue sortie","workoutType":"running","isRestDay":false,"estimatedDistanceInMeters":8000,"estimatedDurationInSecs":2700,"workoutPhrase":"LONG_RUN_BASE","tpPlanName":"Programme de remise en forme de 2026"}');
    -- Plan passé (tâche 25, lirePlanPasse) : entrées AVANT le jour ancré
    -- (06/08), placées sur les dates des deux activités déjà semées plutôt que
    -- d'en ajouter une troisième — évite de casser les tests qui comptent les
    -- activités (ex. lireActivites → 2). 05/08 (course réelle le même jour,
    -- cas FAIT) ; 04/08 (seule une boxe ce jour-là, qui n'est pas une activité
    -- de course → cas NON COURU). 03/08 est un jour de repos : doit être
    -- filtré par lirePlanPasse (contrairement à lireProchainesSeances qui
    -- inclut les jours de repos).
    INSERT INTO workout_schedule VALUES ('2026-08-03', '{"isRestDay":true,"tpPlanName":"Programme de remise en forme de 2026"}');
    INSERT INTO workout_schedule VALUES ('2026-08-04', '{"workoutName":"Sortie facile","workoutType":"running","isRestDay":false,"estimatedDistanceInMeters":4000,"workoutPhrase":"EASY_RUN","tpPlanName":"Programme de remise en forme de 2026"}');
    INSERT INTO workout_schedule VALUES ('2026-08-05', '{"workoutName":"Base","workoutType":"running","isRestDay":false,"estimatedDistanceInMeters":4000,"workoutPhrase":"EASY_WEEK_LOAD_BASE","tpPlanName":"Programme de remise en forme de 2026"}');

    -- Body Battery du jour ancré (08-06) : exemple repris du brief tâche 12,
    -- « réveil 65 → maintenant 50, pic 69, creux 5, +64 rechargé / −19 dépensé ».
    -- La veille (08-05) est semée aussi (tâche 19, sparkline) : même paire de
    -- jours que hrv/readiness ci-dessus, pour vérifier une série à 2 points.
    INSERT INTO body_battery VALUES ('2026-08-05', 70, 58, 78, 12, 55, 22);
    INSERT INTO body_battery VALUES ('2026-08-06', 65, 50, 69, 5, 64, 19);
    INSERT INTO daily_summary VALUES ('2026-08-06', 8342, 10000, 6200, 2450, 680, 9);
    INSERT INTO stress VALUES ('2026-08-06', 28, 71, 'BALANCED');
    -- Respiration présente le 05 ET le 06 ; SpO2 seulement le 06 — sert à vérifier
    -- qu'un jour partiellement renseigné (sommeil présent le 05, SpO2 absente ce
    -- même jour) ne fait pas planter la lecture de la journée complète.
    INSERT INTO respiration VALUES ('2026-08-05', 15.2, 13.8, 12.0, 19.5);
    INSERT INTO respiration VALUES ('2026-08-06', 16.0, 14.1, 12.5, 20.0);
    INSERT INTO spo2 VALUES ('2026-08-06', 95, 90);
    INSERT INTO fitness_age VALUES ('2026-08-06', 32.37, 29, 27.84);
    -- vo2max (table dédiée) reste vide pour cet utilisateur — voir vo2max_value
    -- sur activity ci-dessus. race_predictions reste vide pour le JOUR ANCRÉ
    -- (06/08 — la section doit disparaître, cf. test dédié) mais est semée pour
    -- le 05/08 (tâche 31) afin de vérifier la lecture quand la table est peuplée.
    INSERT INTO race_predictions VALUES ('2026-08-05', 1380, 2880, 6420, 13500);

    -- ⚠️ Piège découvert sur les données réelles de production (tâche 12) :
    -- intensity_minutes.moderate/vigorous ne sont PAS les minutes du jour mais
    -- déjà le cumul de la semaine Garmin en cours (weeklyModerate/weeklyVigorous
    -- du payload brut), répété à l'identique sur chaque jour de cette semaine —
    -- les additionner sur plusieurs jours compterait la même semaine plusieurs
    -- fois. La ligne du 05/08 (semaine précédente, valeurs très différentes) ne
    -- doit jamais être mêlée à celle du jour ancré (06/08) ; goal reste NULL
    -- le 05/08 comme observé en production (colonne non alimentée par le
    -- collecteur pour cet utilisateur, malgré weekGoal présent dans le JSON brut).
    INSERT INTO intensity_minutes VALUES ('2026-08-05', 269, 131, NULL);
    INSERT INTO intensity_minutes VALUES ('2026-08-06', 66, 34, 150);
  `);

  // Trackpoints de l'activité 1 (tâche 20) : 2005 points seconde par seconde,
  // même volume que la vraie séance de production — sert à vérifier que
  // lireTrackpoints sous-échantillonne bien vers ~300 points. Générés en
  // boucle (prepared statement) plutôt qu'en SQL littéral : 2005 lignes de
  // texte SQL n'apporteraient rien de plus qu'une boucle lisible.
  const insererTrackpoint = db.prepare(`
    INSERT INTO activity_trackpoints
      (activity_id, seq, latitude, longitude, altitude_m, distance_m, speed_mps, heart_rate_bpm, cadence, power_w)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const NB_TRACKPOINTS = 2005;
  // Une seule transaction pour les 2005 lignes : sans elle, chaque INSERT
  // autocommit force un fsync individuel — largement suffisant pour dépasser
  // le hookTimeout par défaut de vitest (constaté : >10s sans transaction).
  db.exec('BEGIN');
  for (let i = 0; i < NB_TRACKPOINTS; i += 1) {
    const distance = (4005.5 * i) / (NB_TRACKPOINTS - 1);
    const altitude = 413 + Math.sin(i / 50) * 10;
    // Avant le fix GPS (10 premières secondes) : lat/lon absents — cas tordu
    // du brief tâche 20 (« points sans lat/lon »), non lu par lireTrackpoints
    // mais présent dans le schéma réel, donc dans la fixture.
    const avantFixGps = i < 10;
    // Perte de contact du capteur FC entre i=500 et i=504 : trou volontaire,
    // jamais un 0 (« jamais de zéro fabriqué ») — cas tordu du brief.
    const sansFc = i >= 500 && i < 505;
    // Vitesse nulle au tout premier point (arrêt réel avant de démarrer) :
    // 0 légitime, distinct d'une FC absente — même brief.
    const vitesse = i === 0 ? 0 : 1.9 + Math.sin(i / 80) * 0.4;
    // Cadence/puissance ajoutées tâche 48 (courbes enrichies) : valeurs
    // plausibles d'une course à pied, mêmes ordres de grandeur que les
    // vraies données de production (Nyon - Base, ~172 spm, ~230 W). Un seul
    // trou de puissance (seq 999, comme la production réelle avait
    // 2004/2005 points de puissance contre 2005/2005 de cadence) — jamais un
    // 0 fabriqué, même brief que le trou de FC ci-dessus.
    const sansPuissance = i === 999;
    const cadence = Math.round(172 + Math.sin(i / 70) * 6);
    const puissance = sansPuissance ? null : Math.round(230 + Math.sin(i / 90) * 25);
    insererTrackpoint.run(
      1, i,
      avantFixGps ? null : 46.3766 + i * 0.00001,
      avantFixGps ? null : 6.2214 + i * 0.00001,
      altitude, distance, vitesse,
      sansFc ? null : Math.round(140 + Math.sin(i / 100) * 20),
      cadence, puissance,
    );
  }
  db.exec('COMMIT');

  db.close();
}

/** Scénario où la readiness est en retard sur le reste : sommeil et HRV du jour
 *  sont déjà arrivés, la readiness n'a pas encore été calculée par Garmin. */
export function semerReadinessRetardataire(chemin: string): void {
  const db = new DatabaseSync(chemin);
  db.exec(`
    CREATE TABLE training_readiness (calendar_date TEXT PRIMARY KEY, score REAL, level TEXT);
    CREATE TABLE hrv (calendar_date TEXT PRIMARY KEY, last_night_avg REAL, weekly_avg REAL,
      baseline_low REAL, baseline_upper REAL);
    CREATE TABLE sleep (calendar_date TEXT PRIMARY KEY, sleep_time_seconds INTEGER,
      deep_sleep_seconds INTEGER, rem_sleep_seconds INTEGER, light_sleep_seconds INTEGER,
      awake_sleep_seconds INTEGER, sleep_score_overall REAL);
    CREATE TABLE heart_rate (calendar_date TEXT PRIMARY KEY, resting_hr REAL, last_7day_avg_resting REAL);

    INSERT INTO training_readiness VALUES ('2026-08-05', 62, 'MODERATE');
    INSERT INTO hrv VALUES ('2026-08-06', 38, 41, 43, 73);
    INSERT INTO sleep VALUES ('2026-08-06', 26160, 6180, 5220, 14220, 720, 71);
  `);
  db.close();
}
