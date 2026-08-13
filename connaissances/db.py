"""Base connaissances.db : schéma, ouverture, migrations (spec 4, §5)."""
import sqlite3
from pathlib import Path

VERSION_SCHEMA = 1

_SCHEMA = """
CREATE TABLE IF NOT EXISTS meta(version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sources(
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('etude','guide_officiel','vulgarisation','video','fabricant')),
  titre TEXT NOT NULL, auteurs TEXT, annee INTEGER,
  url TEXT NOT NULL UNIQUE, doi TEXT,
  domaine TEXT NOT NULL CHECK(domaine IN ('course','boxe','recuperation','general')),
  licence TEXT,
  signaux_credibilite TEXT,
  statut TEXT NOT NULL CHECK(statut IN ('auto_admise','validee','en_attente','rejetee')),
  hash_contenu TEXT, ajoute_le TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fiches(
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  affirmation TEXT NOT NULL,
  extrait_verbatim TEXT NOT NULL,
  localisation TEXT NOT NULL,
  incertitude TEXT NOT NULL CHECK(incertitude IN ('consensus','debattu','preuve_faible')),
  contredit_fiche_id INTEGER REFERENCES fiches(id),
  embedding BLOB,               -- RÉSERVÉ v2, jamais lu en v1
  maj_le TEXT NOT NULL
);
-- FTS5 ordinaire (stocke sa propre copie du texte) pour compatibilité SQLite < 3.43
-- du NAS. Sans 'content=' ni 'contentless_delete=1', accepte les mêmes colonnes
-- et les mêmes triggers que la version externe du brief.
CREATE VIRTUAL TABLE IF NOT EXISTS fiches_fts USING fts5(
  affirmation, extrait_verbatim, titre_source
);
CREATE TRIGGER IF NOT EXISTS fiches_ai AFTER INSERT ON fiches BEGIN
  INSERT INTO fiches_fts(rowid, affirmation, extrait_verbatim, titre_source)
  SELECT new.id, new.affirmation, new.extrait_verbatim, s.titre
  FROM sources s WHERE s.id = new.source_id;
END;
CREATE TRIGGER IF NOT EXISTS fiches_ad AFTER DELETE ON fiches BEGIN
  DELETE FROM fiches_fts WHERE rowid = old.id;
END;
CREATE TABLE IF NOT EXISTS registre_couverture(
  url TEXT NOT NULL, hash TEXT, requete_source TEXT, date TEXT NOT NULL,
  verdict TEXT NOT NULL, PRIMARY KEY(url)
);
CREATE TABLE IF NOT EXISTS file_ingestion(
  url TEXT PRIMARY KEY, type TEXT NOT NULL, domaine TEXT NOT NULL,
  decouvert_le TEXT NOT NULL, priorite INTEGER NOT NULL DEFAULT 0,
  statut TEXT NOT NULL DEFAULT 'a_traiter' CHECK(statut IN ('a_traiter','traite','abandonne'))
);
"""


def ouvrir(chemin):
    """Ouvre (et crée au besoin) la base. Idempotente."""
    Path(chemin).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(chemin))
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(_SCHEMA)
    if conn.execute("SELECT count(*) FROM meta").fetchone()[0] == 0:
        conn.execute("INSERT INTO meta(version) VALUES(?)", (VERSION_SCHEMA,))
    conn.commit()
    return conn
