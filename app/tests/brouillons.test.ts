import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// `lireBrouillons`/`supprimerBrouillon` lisent/suppriment des fichiers écrits
// hors de tout contrôle de l'app (deploy/nas/traite-audio.sh, tâche 28) —
// même discipline que lireAnalyseSeance/lirePhotosSeance : dossier absent,
// JSON corrompu ou aux clés inattendues ne doivent jamais lever.

let racine: string;
let dossier: string;

beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), 'brouillons-test-'));
  dossier = join(racine, 'export', 'brouillons-saisie');
  process.env.GARMIN_DATA_DIR = racine;
});

afterAll(() => rmSync(racine, { recursive: true, force: true }));

function brouillonValide(overrides: Record<string, unknown> = {}) {
  return {
    genere_le: 1786212246,
    transcript: 'Ce soir cours de boxe, échauffement dix minutes puis sac.',
    proposition: {
      date: '2026-08-09',
      sport: 'boxe',
      duree_min: 60,
      rpe: 7,
      segments: [
        { type: 'échauffement', duree_min: 10, notes: null },
        { type: 'sac', duree_min: 20, notes: 'jambes lourdes' },
      ],
      notes: null,
      ...overrides,
    },
  };
}

describe('lireBrouillons', () => {
  it('renvoie une liste vide quand le dossier est totalement absent', async () => {
    const { lireBrouillons } = await import('@/lib/brouillons');
    expect(lireBrouillons()).toEqual([]);
  });

  it('renvoie une liste vide quand le dossier est vide', async () => {
    mkdirSync(dossier, { recursive: true });
    const { lireBrouillons } = await import('@/lib/brouillons');
    expect(lireBrouillons()).toEqual([]);
  });

  it('lit un brouillon valide et convertit genere_le en Date', async () => {
    mkdirSync(dossier, { recursive: true });
    writeFileSync(join(dossier, '20260809-153000-a1b2c3d4.json'), JSON.stringify(brouillonValide()));
    const { lireBrouillons } = await import('@/lib/brouillons');
    const [b] = lireBrouillons();
    expect(b.id).toBe('20260809-153000-a1b2c3d4');
    expect(b.genereLe).toBeInstanceOf(Date);
    expect(b.genereLe.getTime()).toBe(1786212246 * 1000);
    expect(b.transcript).toMatch(/boxe/);
    expect(b.proposition.sport).toBe('boxe');
    expect(b.proposition.segments).toHaveLength(2);
    expect(b.proposition.segments[1]).toEqual({ type: 'sac', dureeMin: 20, notes: 'jambes lourdes' });
  });

  it('accepte une proposition avec date/duree/rpe/notes null (jamais inventés)', async () => {
    mkdirSync(dossier, { recursive: true });
    writeFileSync(join(dossier, '20260809-153000-a1b2c3d4.json'), JSON.stringify(brouillonValide({
      date: null, duree_min: null, rpe: null, segments: [], notes: null,
    })));
    const { lireBrouillons } = await import('@/lib/brouillons');
    const [b] = lireBrouillons();
    expect(b.proposition.date).toBeNull();
    expect(b.proposition.dureeMin).toBeNull();
    expect(b.proposition.rpe).toBeNull();
    expect(b.proposition.segments).toEqual([]);
  });

  it('ignore un fichier JSON corrompu sans planter', async () => {
    mkdirSync(dossier, { recursive: true });
    writeFileSync(join(dossier, '20260809-153000-a1b2c3d4.json'), '{ ceci n est pas du json');
    const { lireBrouillons } = await import('@/lib/brouillons');
    expect(lireBrouillons()).toEqual([]);
  });

  it('ignore un fichier valide en JSON mais aux clés inattendues', async () => {
    mkdirSync(dossier, { recursive: true });
    writeFileSync(join(dossier, '20260809-153000-a1b2c3d4.json'), JSON.stringify({ foo: 'bar' }));
    const { lireBrouillons } = await import('@/lib/brouillons');
    expect(lireBrouillons()).toEqual([]);
  });

  it('ignore un fichier dont le nom ne suit pas le motif attendu (anti-traversal)', async () => {
    mkdirSync(dossier, { recursive: true });
    writeFileSync(join(dossier, '..%2F..%2Fsecret.json'), JSON.stringify(brouillonValide()));
    writeFileSync(join(dossier, 'pas-le-bon-format.json'), JSON.stringify(brouillonValide()));
    const { lireBrouillons } = await import('@/lib/brouillons');
    expect(lireBrouillons()).toEqual([]);
  });

  it('trie les brouillons du plus récent au plus ancien', async () => {
    mkdirSync(dossier, { recursive: true });
    writeFileSync(join(dossier, '20260801-100000-aaaaaaaa.json'),
      JSON.stringify(brouillonValide()).replace('1786212246', '1000'));
    writeFileSync(join(dossier, '20260809-153000-bbbbbbbb.json'),
      JSON.stringify(brouillonValide()).replace('1786212246', '2000'));
    const { lireBrouillons } = await import('@/lib/brouillons');
    const ids = lireBrouillons().map((b) => b.id);
    expect(ids).toEqual(['20260809-153000-bbbbbbbb', '20260801-100000-aaaaaaaa']);
  });
});

describe('supprimerBrouillon', () => {
  it('supprime le fichier du brouillon existant', async () => {
    mkdirSync(dossier, { recursive: true });
    const chemin = join(dossier, '20260809-153000-a1b2c3d4.json');
    writeFileSync(chemin, JSON.stringify(brouillonValide()));
    const { supprimerBrouillon } = await import('@/lib/brouillons');
    supprimerBrouillon('20260809-153000-a1b2c3d4');
    expect(existsSync(chemin)).toBe(false);
  });

  it('ne fait rien (silencieusement) pour un id déjà absent', async () => {
    mkdirSync(dossier, { recursive: true });
    const { supprimerBrouillon } = await import('@/lib/brouillons');
    expect(() => supprimerBrouillon('20260809-153000-a1b2c3d4')).not.toThrow();
  });

  it('rejette un id de traversée de chemin sans jamais construire ce chemin', async () => {
    mkdirSync(dossier, { recursive: true });
    const secret = join(racine, 'export', 'secret.txt');
    writeFileSync(secret, 'top secret');
    const { supprimerBrouillon } = await import('@/lib/brouillons');
    supprimerBrouillon('../secret');
    supprimerBrouillon('../../export/secret');
    expect(existsSync(secret)).toBe(true);
  });

  it('rejette un id qui ne suit pas le motif attendu', async () => {
    mkdirSync(dossier, { recursive: true });
    const chemin = join(dossier, 'pas-le-bon-format.json');
    writeFileSync(chemin, JSON.stringify(brouillonValide()));
    const { supprimerBrouillon } = await import('@/lib/brouillons');
    supprimerBrouillon('pas-le-bon-format');
    expect(existsSync(chemin)).toBe(true);
  });
});
