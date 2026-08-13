import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// `lireAnalyseSeance` lit un fichier écrit hors de tout contrôle de l'app
// (deploy/nas/analyse-seance.sh, tâche 24) : absence et corruption doivent
// toutes les deux renvoyer `null`, jamais lever — même discipline que
// `lireAnalyse` (analyse.test.ts).

let racine: string;
let analysesSeances: string;

beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), 'analyse-seance-test-'));
  analysesSeances = join(racine, 'export', 'analyses-seances');
  mkdirSync(analysesSeances, { recursive: true });
  process.env.GARMIN_DATA_DIR = racine;
});

afterAll(() => rmSync(racine, { recursive: true, force: true }));

describe('lireAnalyseSeance', () => {
  it('renvoie null quand le fichier de la séance est absent', async () => {
    const { lireAnalyseSeance } = await import('@/lib/analyse-seance');
    expect(lireAnalyseSeance(123456)).toBeNull();
  });

  it('renvoie null quand le JSON est corrompu', async () => {
    writeFileSync(join(analysesSeances, '123456.json'), '{ ceci n est pas du json');
    const { lireAnalyseSeance } = await import('@/lib/analyse-seance');
    expect(lireAnalyseSeance(123456)).toBeNull();
  });

  it('renvoie null quand le JSON valide mais sans les clés attendues', async () => {
    writeFileSync(join(analysesSeances, '123456.json'), JSON.stringify({ foo: 'bar' }));
    const { lireAnalyseSeance } = await import('@/lib/analyse-seance');
    expect(lireAnalyseSeance(123456)).toBeNull();
  });

  it('renvoie un objet typé quand le JSON est valide, genere_le converti en Date', async () => {
    writeFileSync(join(analysesSeances, '123456.json'), JSON.stringify({
      genere_le: 1786212246,
      resume: 'Allure stable malgré une FC plus basse qu’en juillet.',
      observations: [
        'Ta FC moyenne (150) est plus basse que tes 3 dernières sorties (~158), à allure comparable.',
        'Les splits sont réguliers, écart de moins de 5 s/km entre le plus rapide et le plus lent.',
      ],
      prudence: null,
    }));
    const { lireAnalyseSeance } = await import('@/lib/analyse-seance');
    const a = lireAnalyseSeance(123456);
    expect(a).not.toBeNull();
    expect(a?.resume).toMatch(/Allure stable/);
    expect(a?.observations).toHaveLength(2);
    expect(a?.prudence).toBeNull();
    expect(a?.genereLe).toBeInstanceOf(Date);
    expect(a?.genereLe.getTime()).toBe(1786212246 * 1000);
  });

  it('accepte une prudence non nulle', async () => {
    writeFileSync(join(analysesSeances, '999.json'), JSON.stringify({
      genere_le: 1786212246,
      resume: 'Séance sans historique comparable.',
      observations: [],
      prudence: 'Charge en forte hausse sur la semaine — reste attentif à ton ressenti.',
    }));
    const { lireAnalyseSeance } = await import('@/lib/analyse-seance');
    expect(lireAnalyseSeance(999)?.prudence).toMatch(/Charge en forte hausse/);
  });

  it('lit le fichier de la bonne séance et pas d’une autre', async () => {
    writeFileSync(join(analysesSeances, '111.json'), JSON.stringify({
      genere_le: 1786212246, resume: 'Séance 111.', observations: [], prudence: null,
    }));
    writeFileSync(join(analysesSeances, '222.json'), JSON.stringify({
      genere_le: 1786212246, resume: 'Séance 222.', observations: [], prudence: null,
    }));
    const { lireAnalyseSeance } = await import('@/lib/analyse-seance');
    expect(lireAnalyseSeance(111)?.resume).toBe('Séance 111.');
    expect(lireAnalyseSeance(222)?.resume).toBe('Séance 222.');
    expect(lireAnalyseSeance(333)).toBeNull();
  });
});
