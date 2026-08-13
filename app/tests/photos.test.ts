import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// `lirePhotosSeance` liste des fichiers écrits hors de tout contrôle de
// l'app (collector/telecharger_photos.py, tâche 27, best-effort) : répertoire
// absent doit renvoyer [], jamais lever — même discipline que
// lireAnalyseSeance (analyse-seance.test.ts).

let racine: string;

beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), 'photos-test-'));
  process.env.GARMIN_DATA_DIR = racine;
});

afterAll(() => rmSync(racine, { recursive: true, force: true }));

describe('lirePhotosSeance', () => {
  it('renvoie une liste vide quand le répertoire export est totalement absent', async () => {
    const { lirePhotosSeance } = await import('@/lib/photos');
    expect(lirePhotosSeance(123456)).toEqual([]);
  });

  it('renvoie une liste vide quand le répertoire de la séance n’a pas de photos', async () => {
    mkdirSync(join(racine, 'export', 'photos-activites'), { recursive: true });
    const { lirePhotosSeance } = await import('@/lib/photos');
    expect(lirePhotosSeance(123456)).toEqual([]);
  });

  it('liste les fichiers .jpg triés numériquement, pas alphabétiquement', async () => {
    const dossier = join(racine, 'export', 'photos-activites', '111');
    mkdirSync(dossier, { recursive: true });
    // Ordre alphabétique inverserait 10.jpg avant 2.jpg — tri numérique attendu.
    writeFileSync(join(dossier, '10.jpg'), 'x');
    writeFileSync(join(dossier, '2.jpg'), 'x');
    writeFileSync(join(dossier, '1.jpg'), 'x');
    const { lirePhotosSeance } = await import('@/lib/photos');
    expect(lirePhotosSeance(111)).toEqual(['1.jpg', '2.jpg', '10.jpg']);
  });

  it('ignore les fichiers qui ne suivent pas le motif `n.jpg`', async () => {
    const dossier = join(racine, 'export', 'photos-activites', '222');
    mkdirSync(dossier, { recursive: true });
    writeFileSync(join(dossier, '1.jpg'), 'x');
    writeFileSync(join(dossier, '.hidden'), 'x');
    writeFileSync(join(dossier, 'notes.txt'), 'x');
    writeFileSync(join(dossier, '1.jpg.tmp'), 'x');
    const { lirePhotosSeance } = await import('@/lib/photos');
    expect(lirePhotosSeance(222)).toEqual(['1.jpg']);
  });

  it('lit le répertoire de la bonne séance et pas d’une autre', async () => {
    mkdirSync(join(racine, 'export', 'photos-activites', '111'), { recursive: true });
    mkdirSync(join(racine, 'export', 'photos-activites', '222'), { recursive: true });
    writeFileSync(join(racine, 'export', 'photos-activites', '111', '1.jpg'), 'x');
    writeFileSync(join(racine, 'export', 'photos-activites', '222', '1.jpg'), 'x');
    writeFileSync(join(racine, 'export', 'photos-activites', '222', '2.jpg'), 'x');
    const { lirePhotosSeance } = await import('@/lib/photos');
    expect(lirePhotosSeance(111)).toEqual(['1.jpg']);
    expect(lirePhotosSeance(222)).toEqual(['1.jpg', '2.jpg']);
    expect(lirePhotosSeance(333)).toEqual([]);
  });
});
