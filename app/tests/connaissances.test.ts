import {
  describe, it, expect, beforeEach, afterEach,
} from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Tâche 12 (file de validation) : `connaissances.db` est une base PYTHON
// (connaissances/db.py, spec 4), jamais initialisée par l'app — aucun pont
// cross-langage praticable dans ce projet, donc la fixture recopie ici le
// CREATE TABLE sources/fiches du schéma Python plutôt que de l'importer.
// Sous-ensemble volontaire : fiches_fts/registre_couverture/file_ingestion
// ne sont jamais lus par lib/db/connaissances.ts, donc absents ici.
const DDL = `
CREATE TABLE sources(
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
CREATE TABLE fiches(
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  affirmation TEXT NOT NULL,
  extrait_verbatim TEXT NOT NULL,
  localisation TEXT NOT NULL,
  incertitude TEXT NOT NULL CHECK(incertitude IN ('consensus','debattu','preuve_faible')),
  contredit_fiche_id INTEGER REFERENCES fiches(id),
  embedding BLOB,
  maj_le TEXT NOT NULL
);
`;

let racine: string;
let chemin: string;

/** Crée le fichier connaissances.db avec le schéma ci-dessus, puis exécute
 *  les insertions de seed fournies. Rien n'est créé si `seed` n'est jamais
 *  appelé — sert au cas « base absente ». */
function seed(inserts?: (db: DatabaseSync) => void): void {
  const db = new DatabaseSync(chemin);
  db.exec(DDL);
  if (inserts) inserts(db);
  db.close();
}

beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), 'connaissances-test-'));
  chemin = join(racine, 'connaissances.db');
  process.env.CONNAISSANCES_DB_PATH = chemin;
});

afterEach(() => {
  delete process.env.CONNAISSANCES_DB_PATH;
  rmSync(racine, { recursive: true, force: true });
});

describe('lireSourcesEnAttente', () => {
  it('ne renvoie que les sources en_attente, avec leurs fiches', async () => {
    seed((db) => {
      db.prepare(`INSERT INTO sources (id, type, titre, auteurs, annee, url, domaine, signaux_credibilite, statut, ajoute_le)
        VALUES (1, 'etude', 'Titre en attente', 'Dupont', 2024, 'https://exemple.test/a', 'course', '{"doi_resolu":true,"liste_blanche":false}', 'en_attente', '2026-01-01T00:00:00Z')`).run();
      db.prepare(`INSERT INTO sources (id, type, titre, url, domaine, statut, ajoute_le)
        VALUES (2, 'guide_officiel', 'Déjà validée', 'https://exemple.test/b', 'boxe', 'validee', '2026-01-01T00:00:00Z')`).run();
      db.prepare(`INSERT INTO sources (id, type, titre, url, domaine, statut, ajoute_le)
        VALUES (3, 'video', 'Déjà rejetée', 'https://exemple.test/c', 'general', 'rejetee', '2026-01-01T00:00:00Z')`).run();
      db.prepare(`INSERT INTO fiches (id, source_id, affirmation, extrait_verbatim, localisation, incertitude, maj_le)
        VALUES (1, 1, 'Affirmation test', 'Extrait verbatim.', 'p.3', 'consensus', '2026-01-01T00:00:00Z')`).run();
    });

    const { lireSourcesEnAttente } = await import('@/lib/db/connaissances');
    const resultat = lireSourcesEnAttente();
    expect(resultat).toHaveLength(1);
    expect(resultat[0]).toMatchObject({
      id: 1,
      titre: 'Titre en attente',
      auteurs: 'Dupont',
      annee: 2024,
      url: 'https://exemple.test/a',
      type: 'etude',
      domaine: 'course',
      signaux: { doi_resolu: true, liste_blanche: false },
    });
    expect(resultat[0].fiches).toEqual([
      {
        affirmation: 'Affirmation test', extrait: 'Extrait verbatim.', localisation: 'p.3', incertitude: 'consensus',
      },
    ]);
  });

  it('tolère les champs NULL (auteurs, année) et une source sans fiche', async () => {
    seed((db) => {
      db.prepare(`INSERT INTO sources (id, type, titre, url, domaine, statut, ajoute_le)
        VALUES (1, 'vulgarisation', 'Sans auteur', 'https://exemple.test/d', 'general', 'en_attente', '2026-01-01T00:00:00Z')`).run();
    });
    const { lireSourcesEnAttente } = await import('@/lib/db/connaissances');
    const [source] = lireSourcesEnAttente();
    expect(source.auteurs).toBeNull();
    expect(source.annee).toBeNull();
    expect(source.fiches).toEqual([]);
  });

  it('signaux_credibilite JSON invalide devient un objet vide (tolérant)', async () => {
    seed((db) => {
      db.prepare(`INSERT INTO sources (id, type, titre, url, domaine, signaux_credibilite, statut, ajoute_le)
        VALUES (1, 'video', 'JSON cassé', 'https://exemple.test/e', 'general', '{ pas du json', 'en_attente', '2026-01-01T00:00:00Z')`).run();
    });
    const { lireSourcesEnAttente } = await import('@/lib/db/connaissances');
    expect(lireSourcesEnAttente()[0].signaux).toEqual({});
  });

  it('signaux_credibilite absent (NULL) devient un objet vide', async () => {
    seed((db) => {
      db.prepare(`INSERT INTO sources (id, type, titre, url, domaine, statut, ajoute_le)
        VALUES (1, 'video', 'Sans signaux', 'https://exemple.test/f', 'general', 'en_attente', '2026-01-01T00:00:00Z')`).run();
    });
    const { lireSourcesEnAttente } = await import('@/lib/db/connaissances');
    expect(lireSourcesEnAttente()[0].signaux).toEqual({});
  });

  it('base absente : tableau vide, jamais une erreur', async () => {
    // Aucun appel à seed() : le fichier n'existe pas du tout — cas nominal
    // actuel d'un NAS fraîchement installé.
    expect(existsSync(chemin)).toBe(false);
    const { lireSourcesEnAttente } = await import('@/lib/db/connaissances');
    expect(() => lireSourcesEnAttente()).not.toThrow();
    expect(lireSourcesEnAttente()).toEqual([]);
  });
});

describe('changerStatutSource', () => {
  it('bascule une source en_attente vers validee', async () => {
    seed((db) => {
      db.prepare(`INSERT INTO sources (id, type, titre, url, domaine, statut, ajoute_le)
        VALUES (1, 'etude', 'À valider', 'https://exemple.test/g', 'course', 'en_attente', '2026-01-01T00:00:00Z')`).run();
    });
    const { changerStatutSource, lireSourcesEnAttente } = await import('@/lib/db/connaissances');
    changerStatutSource(1, 'validee');
    expect(lireSourcesEnAttente()).toEqual([]);

    const verif = new DatabaseSync(chemin, { readOnly: true });
    const ligne = verif.prepare(`SELECT statut FROM sources WHERE id = 1`).get() as { statut: string };
    verif.close();
    expect(ligne.statut).toBe('validee');
  });

  it('bascule une source en_attente vers rejetee', async () => {
    seed((db) => {
      db.prepare(`INSERT INTO sources (id, type, titre, url, domaine, statut, ajoute_le)
        VALUES (1, 'etude', 'À rejeter', 'https://exemple.test/h', 'course', 'en_attente', '2026-01-01T00:00:00Z')`).run();
    });
    const { changerStatutSource, lireSourcesEnAttente } = await import('@/lib/db/connaissances');
    changerStatutSource(1, 'rejetee');
    expect(lireSourcesEnAttente()).toEqual([]);

    const verif = new DatabaseSync(chemin, { readOnly: true });
    const ligne = verif.prepare(`SELECT statut FROM sources WHERE id = 1`).get() as { statut: string };
    verif.close();
    expect(ligne.statut).toBe('rejetee');
  });

  it('un id inconnu ne touche rien et ne lève jamais (idempotent)', async () => {
    seed((db) => {
      db.prepare(`INSERT INTO sources (id, type, titre, url, domaine, statut, ajoute_le)
        VALUES (1, 'etude', 'Inchangée', 'https://exemple.test/i', 'course', 'en_attente', '2026-01-01T00:00:00Z')`).run();
    });
    const { changerStatutSource, lireSourcesEnAttente } = await import('@/lib/db/connaissances');
    expect(() => changerStatutSource(999, 'validee')).not.toThrow();
    expect(lireSourcesEnAttente()).toHaveLength(1);
  });

  it('base absente : ne lève jamais', async () => {
    const { changerStatutSource } = await import('@/lib/db/connaissances');
    expect(() => changerStatutSource(1, 'validee')).not.toThrow();
  });
});
