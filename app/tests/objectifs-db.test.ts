import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let racine: string;

beforeEach(async () => {
  racine = mkdtempSync(join(tmpdir(), 'objectifs-db-test-'));
  process.env.GARMIN_DATA_DIR = racine;
  const { initialiserSchema } = await import('@/lib/db/schema');
  initialiserSchema();
});

afterAll(() => rmSync(racine, { recursive: true, force: true }));

describe('creerObjectif / lireObjectifs', () => {
  it('crée un objectif avec un libellé généré (jamais saisi) et le relit', async () => {
    const { creerObjectif, lireObjectifs } = await import('@/lib/db/objectifs');
    const id = creerObjectif({ sport: 'boxe', type: 'seances_par_semaine', cible: 2 });
    const objectifs = lireObjectifs();
    expect(objectifs).toHaveLength(1);
    expect(objectifs[0]).toMatchObject({
      id, sport: 'boxe', type: 'seances_par_semaine', cible: 2,
      libelle: '2 séances de boxe par semaine', actif: true,
    });
    expect(objectifs[0].creeLe).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('un nouvel objectif est actif par défaut', async () => {
    const { creerObjectif, lireObjectifs } = await import('@/lib/db/objectifs');
    creerObjectif({ sport: 'course', type: 'km_par_semaine', cible: 15 });
    expect(lireObjectifs()[0].actif).toBe(true);
  });

  it('lireObjectifs renvoie plusieurs objectifs dans l ordre de création', async () => {
    const { creerObjectif, lireObjectifs } = await import('@/lib/db/objectifs');
    creerObjectif({ sport: 'boxe', type: 'seances_par_semaine', cible: 2 });
    creerObjectif({ sport: 'course', type: 'km_par_semaine', cible: 15 });
    const objectifs = lireObjectifs();
    expect(objectifs).toHaveLength(2);
    expect(objectifs.map((o) => o.sport)).toEqual(['boxe', 'course']);
  });

  it('renvoie une liste vide quand aucun objectif n existe', async () => {
    const { lireObjectifs } = await import('@/lib/db/objectifs');
    expect(lireObjectifs()).toEqual([]);
  });
});

describe('lireObjectifsActifs', () => {
  it('ne renvoie que les objectifs actifs', async () => {
    const { creerObjectif, lireObjectifsActifs, basculerActifObjectif } = await import('@/lib/db/objectifs');
    const idActif = creerObjectif({ sport: 'boxe', type: 'seances_par_semaine', cible: 2 });
    const idInactif = creerObjectif({ sport: 'course', type: 'km_par_semaine', cible: 15 });
    basculerActifObjectif(idInactif);
    const actifs = lireObjectifsActifs();
    expect(actifs).toHaveLength(1);
    expect(actifs[0].id).toBe(idActif);
  });
});

describe('basculerActifObjectif', () => {
  it('bascule actif -> inactif -> actif', async () => {
    const { creerObjectif, lireObjectifs, basculerActifObjectif } = await import('@/lib/db/objectifs');
    const id = creerObjectif({ sport: 'boxe', type: 'seances_par_semaine', cible: 2 });
    basculerActifObjectif(id);
    expect(lireObjectifs()[0].actif).toBe(false);
    basculerActifObjectif(id);
    expect(lireObjectifs()[0].actif).toBe(true);
  });

  it('un id inconnu ne touche rien (idempotent, jamais une erreur)', async () => {
    const { creerObjectif, lireObjectifs, basculerActifObjectif } = await import('@/lib/db/objectifs');
    creerObjectif({ sport: 'boxe', type: 'seances_par_semaine', cible: 2 });
    expect(() => basculerActifObjectif(999)).not.toThrow();
    expect(lireObjectifs()[0].actif).toBe(true);
  });
});

describe('supprimerObjectif', () => {
  it('supprime définitivement l objectif', async () => {
    const { creerObjectif, lireObjectifs, supprimerObjectif } = await import('@/lib/db/objectifs');
    const id = creerObjectif({ sport: 'boxe', type: 'seances_par_semaine', cible: 2 });
    supprimerObjectif(id);
    expect(lireObjectifs()).toEqual([]);
  });

  it('un id inconnu ne lève jamais (idempotent)', async () => {
    const { supprimerObjectif } = await import('@/lib/db/objectifs');
    expect(() => supprimerObjectif(999)).not.toThrow();
  });
});
