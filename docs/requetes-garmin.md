# Requêtes de référence sur `garmin-ro.db`

Ces requêtes ont été **exécutées et validées contre le schéma réel** de la base
(56 tables, données du 30/07 au 06/08/2026) pendant la phase Grafana, avant que
celle-ci soit abandonnée au profit de l'app. Elles constituent la base de
l'écran Historique.

Elles sont données ici en SQL « propre ». La version Grafana enveloppait les
dates dans `CAST(strftime('%s', …) AS INTEGER)` parce que le plugin SQLite
exigeait un epoch en secondes ; **l'app n'a pas cette contrainte** et peut
travailler directement avec les dates ISO stockées en base.

Toutes lisent l'instantané `data/export/garmin-ro.db` en lecture seule.

## État du jour

```sql
-- Readiness et ses facteurs
SELECT calendar_date, score, level, feedback_short, feedback_long,
       hrv_factor_percent, sleep_history_factor_percent,
       stress_history_factor_percent, acwr_factor_percent, recovery_time
FROM training_readiness
ORDER BY calendar_date DESC LIMIT 1;
```

```sql
-- HRV de la nuit et baseline personnelle
SELECT calendar_date, last_night_avg, weekly_avg, status,
       baseline_low, baseline_upper
FROM hrv
ORDER BY calendar_date DESC LIMIT 1;
```

```sql
-- Sommeil de la nuit
SELECT calendar_date, sleep_time_seconds, deep_sleep_seconds,
       rem_sleep_seconds, light_sleep_seconds, awake_sleep_seconds,
       sleep_score_overall, resting_heart_rate
FROM sleep
ORDER BY calendar_date DESC LIMIT 1;
```

```sql
-- Séance prescrite du jour (une ligne par date, séance en JSON)
-- Champs utiles du JSON : workoutName, workoutType, isRestDay,
-- estimatedDistanceInMeters, estimatedDurationInSecs, workoutPhrase, tpPlanName
SELECT calendar_date, raw_json
FROM workout_schedule
WHERE calendar_date = :today;
```

## Tendances

```sql
-- HRV contre baseline
SELECT calendar_date, last_night_avg, weekly_avg, baseline_low, baseline_upper
FROM hrv ORDER BY calendar_date;
```

```sql
-- Readiness et facteurs
SELECT calendar_date, score, hrv_factor_percent, sleep_history_factor_percent,
       stress_history_factor_percent, acwr_factor_percent
FROM training_readiness ORDER BY calendar_date;
```

```sql
-- Sommeil par phase, en heures
SELECT calendar_date,
       deep_sleep_seconds  / 3600.0 AS profond,
       rem_sleep_seconds   / 3600.0 AS rem,
       light_sleep_seconds / 3600.0 AS leger,
       awake_sleep_seconds / 3600.0 AS eveille
FROM sleep ORDER BY calendar_date;
```

```sql
-- FC de repos et stress
SELECT h.calendar_date, h.resting_hr, h.last_7day_avg_resting, s.avg_stress
FROM heart_rate h
LEFT JOIN stress s ON s.calendar_date = h.calendar_date
ORDER BY h.calendar_date;
```

```sql
-- Charge aiguë vs chronique
SELECT calendar_date, acute_load, chronic_load, status
FROM training_status ORDER BY calendar_date;
```

```sql
-- Minutes d'intensité
SELECT calendar_date, moderate, vigorous, goal
FROM intensity_minutes ORDER BY calendar_date;
```

## Séances

```sql
-- Liste des activités Garmin
SELECT activity_id, start_time_local, activity_name, activity_type,
       distance_meters / 1000.0 AS km,
       duration_seconds / 60.0   AS minutes,
       average_hr, max_hr, aerobic_training_effect, training_load
FROM activity ORDER BY start_time_local DESC;
```

```sql
-- Temps en zones de FC, en minutes — le panneau clé pour l'endurance
-- fondamentale : une sortie « base » doit être massivement en Z1-Z2.
SELECT a.activity_id, a.start_time_local, a.activity_name,
       z.zone1_seconds / 60.0 AS z1, z.zone2_seconds / 60.0 AS z2,
       z.zone3_seconds / 60.0 AS z3, z.zone4_seconds / 60.0 AS z4,
       z.zone5_seconds / 60.0 AS z5
FROM activity_hr_zones z
JOIN activity a ON a.activity_id = z.activity_id
ORDER BY a.start_time_local;
```

```sql
-- Splits kilométriques d'une séance
SELECT split_number, distance_meters, duration_seconds, average_speed,
       average_hr, elevation_gain, avg_cadence
FROM activity_splits WHERE activity_id = :id ORDER BY split_number;
```

```sql
-- Trace GPS et FC seconde par seconde
SELECT seq, timestamp_utc, latitude, longitude, altitude_m,
       distance_m, speed_mps, heart_rate_bpm, cadence
FROM activity_trackpoints WHERE activity_id = :id ORDER BY seq;
```

## Pièges relevés

- `garmin.db` est en **WAL** : impossible à ouvrir depuis un montage `:ro`.
  Toujours lire l'instantané `export/garmin-ro.db`, publié en mode rollback.
- `workout_schedule` a `calendar_date` en **clé primaire** : deux séances
  planifiées le même jour s'écrasent. Sans conséquence pour un plan de course.
- `weight.timestamp` est en **millisecondes epoch**, contrairement aux autres
  tables qui utilisent `calendar_date` en texte ISO.
- Tables vides à ce stade, à ne pas confondre avec une panne : `vo2max`,
  `endurance_score`, `hill_score`, `workouts` (bibliothèque perso vide),
  `goals`, `nutrition_*`. Elles se rempliront ou non selon l'usage de la montre.
- Une nuit peut manquer dans `sleep` (montre non portée) alors que
  `daily_summary` a bien la journée. Ne jamais présumer une ligne par jour.
