import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// `lireAnalyse` lit un fichier écrit hors de tout contrôle de l'app (script
// hôte sur le NAS) : absence et corruption doivent toutes les deux renvoyer
// `null`, jamais lever — un JSON cassé ne doit pas faire planter l'écran.

let racine: string;
let export_: string;

beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), 'analyse-test-'));
  export_ = join(racine, 'export');
  mkdirSync(export_, { recursive: true });
  process.env.GARMIN_DATA_DIR = racine;
});

afterAll(() => rmSync(racine, { recursive: true, force: true }));

describe('lireAnalyse', () => {
  it('renvoie null quand analyse.json est absent', async () => {
    const { lireAnalyse } = await import('@/lib/analyse');
    expect(lireAnalyse()).toBeNull();
  });

  it('renvoie null quand le JSON est corrompu', async () => {
    writeFileSync(join(export_, 'analyse.json'), '{ ceci n est pas du json');
    const { lireAnalyse } = await import('@/lib/analyse');
    expect(lireAnalyse()).toBeNull();
  });

  it('renvoie null quand le JSON valide mais sans les clés attendues', async () => {
    writeFileSync(join(export_, 'analyse.json'), JSON.stringify({ foo: 'bar' }));
    const { lireAnalyse } = await import('@/lib/analyse');
    expect(lireAnalyse()).toBeNull();
  });

  it('renvoie un objet typé quand le JSON est valide, genere_le converti en Date', async () => {
    writeFileSync(join(export_, 'analyse.json'), JSON.stringify({
      genere_le: 1786212246,
      resume: 'Readiness très dégradée ces deux derniers jours.',
      observations: ['HRV moyen chute de 55 à 40.', 'Sommeil profond en baisse.'],
      prudence: 'Surveiller la récupération avant d’accélérer le plan.',
    }));
    const { lireAnalyse } = await import('@/lib/analyse');
    const a = lireAnalyse();
    expect(a).not.toBeNull();
    expect(a?.resume).toBe('Readiness très dégradée ces deux derniers jours.');
    expect(a?.observations).toHaveLength(2);
    expect(a?.prudence).toMatch(/récupération/);
    expect(a?.genereLe).toBeInstanceOf(Date);
    expect(a?.genereLe.getTime()).toBe(1786212246 * 1000);
  });

  it('accepte prudence null', async () => {
    writeFileSync(join(export_, 'analyse.json'), JSON.stringify({
      genere_le: 1786212246,
      resume: 'Données trop maigres pour conclure.',
      observations: [],
      prudence: null,
    }));
    const { lireAnalyse } = await import('@/lib/analyse');
    expect(lireAnalyse()?.prudence).toBeNull();
  });
});

describe('lireAnalyse : aSurveiller et question (tâche 43)', () => {
  it('renvoie aSurveiller null et question null quand les clés sont absentes (analyse archivée avant leur introduction)', async () => {
    writeFileSync(join(export_, 'analyse.json'), JSON.stringify({
      genere_le: 1786212246,
      resume: 'Titre.',
      observations: [],
      prudence: null,
    }));
    const { lireAnalyse } = await import('@/lib/analyse');
    const a = lireAnalyse();
    expect(a?.aSurveiller).toBeNull();
    expect(a?.question).toBeNull();
  });

  it('renvoie aSurveiller et question quand ils sont présents', async () => {
    writeFileSync(join(export_, 'analyse.json'), JSON.stringify({
      genere_le: 1786212246,
      resume: 'Titre.',
      observations: [],
      prudence: null,
      a_surveiller: ['douleur au genou signalée le 09.08'],
      question: 'La douleur au genou signalée le 09.08, où en est-elle ?',
    }));
    const { lireAnalyse } = await import('@/lib/analyse');
    const a = lireAnalyse();
    expect(a?.aSurveiller).toEqual(['douleur au genou signalée le 09.08']);
    expect(a?.question).toBe('La douleur au genou signalée le 09.08, où en est-elle ?');
  });

  it('accepte un a_surveiller vide', async () => {
    writeFileSync(join(export_, 'analyse.json'), JSON.stringify({
      genere_le: 1786212246,
      resume: 'Titre.',
      observations: [],
      prudence: null,
      a_surveiller: [],
    }));
    const { lireAnalyse } = await import('@/lib/analyse');
    expect(lireAnalyse()?.aSurveiller).toEqual([]);
  });

  it('renvoie null (analyse entière rejetée) quand a_surveiller n est pas une liste de chaînes', async () => {
    writeFileSync(join(export_, 'analyse.json'), JSON.stringify({
      genere_le: 1786212246,
      resume: 'Titre.',
      observations: [],
      prudence: null,
      a_surveiller: ['ok', 42],
    }));
    const { lireAnalyse } = await import('@/lib/analyse');
    expect(lireAnalyse()).toBeNull();
  });

  it('renvoie null (analyse entière rejetée) quand question n est pas une chaîne', async () => {
    writeFileSync(join(export_, 'analyse.json'), JSON.stringify({
      genere_le: 1786212246,
      resume: 'Titre.',
      observations: [],
      prudence: null,
      question: 42,
    }));
    const { lireAnalyse } = await import('@/lib/analyse');
    expect(lireAnalyse()).toBeNull();
  });
});

describe('lireAnalyse : suggestions (tâche 50, niveau N2)', () => {
  it('renvoie suggestions null quand la clé est absente (cas nominal, ou analyse archivée avant son introduction)', async () => {
    writeFileSync(join(export_, 'analyse.json'), JSON.stringify({
      genere_le: 1786212246,
      resume: 'Titre.',
      observations: [],
      prudence: null,
    }));
    const { lireAnalyse } = await import('@/lib/analyse');
    expect(lireAnalyse()?.suggestions).toBeNull();
  });

  it('renvoie suggestions quand présentes (0 à 2 objets {principe, texte})', async () => {
    writeFileSync(join(export_, 'analyse.json'), JSON.stringify({
      genere_le: 1786212246,
      resume: 'Titre.',
      observations: [],
      prudence: null,
      suggestions: [
        { principe: 'P1', texte: 'Les principes de répartition d’intensité suggèrent l’essentiel du volume à faible intensité.' },
        { principe: 'P6', texte: 'Le sommeil fait partie du processus d’adaptation, au même titre que les séances.' },
      ],
    }));
    const { lireAnalyse } = await import('@/lib/analyse');
    const a = lireAnalyse();
    expect(a?.suggestions).toEqual([
      { principe: 'P1', texte: 'Les principes de répartition d’intensité suggèrent l’essentiel du volume à faible intensité.' },
      { principe: 'P6', texte: 'Le sommeil fait partie du processus d’adaptation, au même titre que les séances.' },
    ]);
  });

  it('accepte un tableau suggestions vide', async () => {
    writeFileSync(join(export_, 'analyse.json'), JSON.stringify({
      genere_le: 1786212246,
      resume: 'Titre.',
      observations: [],
      prudence: null,
      suggestions: [],
    }));
    const { lireAnalyse } = await import('@/lib/analyse');
    expect(lireAnalyse()?.suggestions).toEqual([]);
  });

  it('renvoie null (analyse entière rejetée) quand suggestions n est pas une liste d objets {principe, texte}', async () => {
    writeFileSync(join(export_, 'analyse.json'), JSON.stringify({
      genere_le: 1786212246,
      resume: 'Titre.',
      observations: [],
      prudence: null,
      suggestions: ['P1'],
    }));
    const { lireAnalyse } = await import('@/lib/analyse');
    expect(lireAnalyse()).toBeNull();
  });

  it('renvoie null (analyse entière rejetée) quand un élément de suggestions a un champ manquant', async () => {
    writeFileSync(join(export_, 'analyse.json'), JSON.stringify({
      genere_le: 1786212246,
      resume: 'Titre.',
      observations: [],
      prudence: null,
      suggestions: [{ principe: 'P1' }],
    }));
    const { lireAnalyse } = await import('@/lib/analyse');
    expect(lireAnalyse()).toBeNull();
  });

  it('MENTION_SUGGESTIONS précise que ce ne sont ni un avis médical ni un plan personnalisé', async () => {
    const { MENTION_SUGGESTIONS } = await import('@/lib/analyse');
    expect(MENTION_SUGGESTIONS).toMatch(/corpus versionné/);
    expect(MENTION_SUGGESTIONS).toMatch(/ni un avis médical/);
    expect(MENTION_SUGGESTIONS).toMatch(/ni un plan personnalisé/);
  });
});

describe('analyseEnAttente', () => {
  it('renvoie false quand aucun drapeau n est déposé', async () => {
    const { analyseEnAttente } = await import('@/lib/analyse');
    expect(analyseEnAttente()).toBe(false);
  });

  it('renvoie true quand le drapeau .analyse-requested est présent', async () => {
    writeFileSync(join(racine, '.analyse-requested'), '');
    const { analyseEnAttente } = await import('@/lib/analyse');
    expect(analyseEnAttente()).toBe(true);
  });
});

describe('âge de l’analyse', () => {
  it('calcule l’âge en heures depuis genereLe', async () => {
    const ilYA10h = Math.floor(Date.now() / 1000) - 10 * 3600;
    writeFileSync(join(export_, 'analyse.json'), JSON.stringify({
      genere_le: ilYA10h,
      resume: 'R.',
      observations: [],
      prudence: null,
    }));
    const { lireAnalyse, ageAnalyseHeures } = await import('@/lib/analyse');
    const a = lireAnalyse();
    expect(a).not.toBeNull();
    const age = ageAnalyseHeures(a!);
    expect(age).toBeGreaterThan(9.9);
    expect(age).toBeLessThan(10.1);
  });

  it('analysePerimee est vrai au-delà de 26 h', async () => {
    const ilYA27h = Math.floor(Date.now() / 1000) - 27 * 3600;
    const ilYA1h = Math.floor(Date.now() / 1000) - 1 * 3600;
    const { analysePerimee } = await import('@/lib/analyse');
    expect(analysePerimee({
      genereLe: new Date(ilYA27h * 1000), resume: '', observations: [], prudence: null,
      aSurveiller: null, question: null, suggestions: null,
    })).toBe(true);
    expect(analysePerimee({
      genereLe: new Date(ilYA1h * 1000), resume: '', observations: [], prudence: null,
      aSurveiller: null, question: null, suggestions: null,
    })).toBe(false);
  });
});
