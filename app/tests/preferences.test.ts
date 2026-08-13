import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Tâche 37 (socle personnalisation) : preferences_affichage doit rester
// lisible même si son contenu est corrompu — un JSON invalide ou une clé
// absente ne doit JAMAIS faire planter un écran, seulement replier sur le
// défaut fourni par l'appelant (règle « jamais d'écran cassé »).

let racine: string;

beforeEach(async () => {
  racine = mkdtempSync(join(tmpdir(), 'preferences-test-'));
  process.env.GARMIN_DATA_DIR = racine;
  const { initialiserSchema } = await import('@/lib/db/schema');
  initialiserSchema();
});

afterAll(() => rmSync(racine, { recursive: true, force: true }));

describe('lirePreference : lecture tolérante', () => {
  it('renvoie le défaut quand la clé est absente', async () => {
    const { lirePreference } = await import('@/lib/db/preferences');
    expect(lirePreference('inconnue', { a: 1 })).toEqual({ a: 1 });
  });

  it('relit exactement ce qui a été écrit', async () => {
    const { lirePreference, ecrirePreference } = await import('@/lib/db/preferences');
    ecrirePreference('accueil', { heros: 'body_battery', n: 3 });
    expect(lirePreference('accueil', null)).toEqual({ heros: 'body_battery', n: 3 });
  });

  it('renvoie le défaut sans jamais lever quand le JSON stocké est invalide', async () => {
    const { lirePreference } = await import('@/lib/db/preferences');
    const { ouvrirTraining } = await import('@/lib/db/connection');
    const db = ouvrirTraining();
    db.prepare(
      `INSERT INTO preferences_affichage (cle, valeur_json, maj) VALUES (?, ?, ?)`,
    ).run('accueil', '{ pas du json valide', new Date().toISOString());
    db.close();
    expect(lirePreference('accueil', { defaut: true })).toEqual({ defaut: true });
  });

  it('distingue une valeur JSON valide mais falsy (0, false, null) d’une clé absente', async () => {
    const { lirePreference, ecrirePreference } = await import('@/lib/db/preferences');
    ecrirePreference('compteur', 0);
    expect(lirePreference('compteur', 99)).toBe(0);
    ecrirePreference('actif', false);
    expect(lirePreference('actif', true)).toBe(false);
  });
});

describe('ecrirePreference : écriture idempotente', () => {
  it('remplace la valeur précédente au lieu d’en créer une seconde ligne', async () => {
    const { ecrirePreference, lirePreference } = await import('@/lib/db/preferences');
    const { ouvrirTraining } = await import('@/lib/db/connection');
    ecrirePreference('accueil', { v: 1 });
    ecrirePreference('accueil', { v: 2 });
    expect(lirePreference('accueil', null)).toEqual({ v: 2 });
    const db = ouvrirTraining();
    const n = db.prepare(`SELECT COUNT(*) AS n FROM preferences_affichage WHERE cle = 'accueil'`)
      .get() as { n: number };
    db.close();
    expect(n.n).toBe(1);
  });

  it('horodate la préférence à chaque écriture', async () => {
    const { ecrirePreference } = await import('@/lib/db/preferences');
    const { ouvrirTraining } = await import('@/lib/db/connection');
    ecrirePreference('accueil', { v: 1 });
    const db = ouvrirTraining();
    const r = db.prepare(`SELECT maj FROM preferences_affichage WHERE cle = 'accueil'`)
      .get() as { maj: string };
    db.close();
    expect(r.maj).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('supprimerPreference : retour au défaut', () => {
  it('efface la ligne : une lecture suivante renvoie de nouveau le défaut', async () => {
    const { ecrirePreference, supprimerPreference, lirePreference } = await import('@/lib/db/preferences');
    ecrirePreference('accueil', { v: 1 });
    supprimerPreference('accueil');
    expect(lirePreference('accueil', 'defaut')).toBe('defaut');
  });

  it('ne lève pas quand la clé n’existait déjà pas', async () => {
    const { supprimerPreference } = await import('@/lib/db/preferences');
    expect(() => supprimerPreference('jamais-ecrite')).not.toThrow();
  });
});
