import { ouvrirTraining } from './connection';

/** Idempotent : appelé au démarrage de l'app, ne détruit jamais de données. */
export function initialiserSchema(): void {
  const db = ouvrirTraining();
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS manual_sessions (
        id                  INTEGER PRIMARY KEY,
        date                TEXT NOT NULL,
        sport               TEXT NOT NULL,
        sub_type            TEXT,
        duration_min        INTEGER,
        rpe                 INTEGER,
        notes               TEXT,
        garmin_activity_id  INTEGER,
        source              TEXT NOT NULL DEFAULT 'manual',
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_manual_sessions_date ON manual_sessions(date);

      CREATE TABLE IF NOT EXISTS daily_checkin (
        date            TEXT PRIMARY KEY,
        form            INTEGER,
        motivation      INTEGER,
        sleep_quality   INTEGER,
        soreness        TEXT,
        notes           TEXT,
        source          TEXT NOT NULL DEFAULT 'manual',
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      );

      -- Tâche 28 (saisie vocale) : segments d'une séance manuelle (échauffement,
      -- technique, sac, renfo…), rattachés à manual_sessions par seance_id.
      -- Migration additive : ne touche à rien d'existant, CREATE TABLE IF NOT
      -- EXISTS comme le reste de ce fichier.
      CREATE TABLE IF NOT EXISTS seance_segments (
        id          INTEGER PRIMARY KEY,
        seance_id   INTEGER NOT NULL REFERENCES manual_sessions(id),
        ordre       INTEGER NOT NULL,
        type        TEXT NOT NULL,
        duree_min   INTEGER,
        notes       TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_seance_segments_seance_id ON seance_segments(seance_id);

      -- Tâche 37 (personnalisation de l'affichage) : préférences d'affichage
      -- par clé — 'accueil' pour le layout du dashboard (tâche 37), et à terme
      -- 'seance:<sport>' (templates par sport, tâche 38) et 'visuels'
      -- (variantes de visuels par mesure, tâche 39). Une seule table pour
      -- toutes ces clés plutôt qu'une table par usage : lib/db/preferences.ts
      -- expose une API générique lire/écrire/supprimer, jamais spécifique à
      -- une clé. Migration additive comme le reste de ce fichier.
      CREATE TABLE IF NOT EXISTS preferences_affichage (
        cle           TEXT PRIMARY KEY,
        valeur_json   TEXT NOT NULL,
        maj           TEXT NOT NULL
      );

      -- Tâche 43 (objectifs déclarés, rapport B2 §B.2 N1b) : objectifs
      -- personnels calculables — jamais de texte libre (inexploitable sans
      -- faire interpréter le modèle, contraire à la loi B2 §A.8). sport en
      -- {course, boxe, randonnee, tous}, type en {seances_par_semaine,
      -- km_par_semaine, minutes_par_semaine} (lib/objectifs.ts, seule
      -- définition faisant foi). libelle généré à la création, jamais
      -- saisi librement. Migration additive comme le reste de ce fichier.
      CREATE TABLE IF NOT EXISTS objectifs (
        id          INTEGER PRIMARY KEY,
        sport       TEXT NOT NULL,
        type        TEXT NOT NULL,
        cible       REAL NOT NULL,
        libelle     TEXT NOT NULL,
        actif       INTEGER NOT NULL DEFAULT 1,
        cree_le     TEXT NOT NULL
      );
    `);
  } finally {
    db.close();
  }
}
