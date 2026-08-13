import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let racine: string;

beforeEach(async () => {
  racine = mkdtempSync(join(tmpdir(), 'training-test-'));
  process.env.GARMIN_DATA_DIR = racine;
  const { initialiserSchema } = await import('@/lib/db/schema');
  initialiserSchema();
});

afterAll(() => rmSync(racine, { recursive: true, force: true }));

describe('saisies', () => {
  it('enregistre et relit une séance de boxe', async () => {
    const { enregistrerSeance, lireSeancesManuelles } = await import('@/lib/db/training');
    enregistrerSeance({ date: '2026-08-06', sport: 'boxe', sousType: 'sparring',
      dureeMin: 90, rpe: 8, notes: 'jambes lourdes' });
    const s = lireSeancesManuelles();
    expect(s).toHaveLength(1);
    expect(s[0].sousType).toBe('sparring');
    expect(s[0].rpe).toBe(8);
    expect(s[0].source).toBe('manual');
  });

  it('rattache une séance à une activité Garmin', async () => {
    const { enregistrerSeance, lireSeancesManuelles } = await import('@/lib/db/training');
    enregistrerSeance({ date: '2026-08-06', sport: 'boxe', dureeMin: 60, garminActivityId: 2 });
    expect(lireSeancesManuelles()[0].garminActivityId).toBe(2);
  });

  it('remplace le point du jour au lieu d en créer un second', async () => {
    const { enregistrerPoint, lirePointDuJour } = await import('@/lib/db/training');
    enregistrerPoint({ date: '2026-08-06', forme: 2, motivation: 3, sommeilPercu: 2 });
    enregistrerPoint({ date: '2026-08-06', forme: 4, motivation: 4, sommeilPercu: 4,
      douleurs: 'mollet droit' });
    const p = lirePointDuJour('2026-08-06');
    expect(p?.forme).toBe(4);
    expect(p?.douleurs).toBe('mollet droit');
  });

  it('renvoie null quand aucun point n existe pour la date', async () => {
    const { lirePointDuJour } = await import('@/lib/db/training');
    expect(lirePointDuJour('2026-01-01')).toBeNull();
  });

  it('est idempotent : réinitialiser le schéma ne perd rien', async () => {
    const { enregistrerSeance, lireSeancesManuelles } = await import('@/lib/db/training');
    const { initialiserSchema } = await import('@/lib/db/schema');
    enregistrerSeance({ date: '2026-08-06', sport: 'boxe', dureeMin: 60 });
    initialiserSchema();
    expect(lireSeancesManuelles()).toHaveLength(1);
  });
});

describe('lireRegulariteBoxe : régularité boxe depuis les saisies manuelles (tâche 25)', () => {
  it('compte les séances de boxe par semaine ISO et moyenne le RPE, insensible à la casse', async () => {
    const { enregistrerSeance, lireRegulariteBoxe } = await import('@/lib/db/training');
    // Semaine ISO du lundi 03/08 au dimanche 09/08.
    enregistrerSeance({ date: '2026-08-03', sport: 'boxe', rpe: 6 });
    enregistrerSeance({ date: '2026-08-05', sport: 'Boxe', rpe: 8 });      // casse mixte
    enregistrerSeance({ date: '2026-08-06', sport: 'autre', rpe: 4 });    // pas de la boxe, ignorée
    const semaines = lireRegulariteBoxe(1, '2026-08-06');
    expect(semaines).toHaveLength(1);
    expect(semaines[0].debut).toBe('2026-08-03');
    expect(semaines[0].nbSeances).toBe(2);
    expect(semaines[0].rpeMoyen).toBe(7);
  });

  it('renvoie un RPE moyen null (jamais 0) quand aucune saisie de la semaine n’a de RPE', async () => {
    const { enregistrerSeance, lireRegulariteBoxe } = await import('@/lib/db/training');
    enregistrerSeance({ date: '2026-08-04', sport: 'BOXE' });
    const semaines = lireRegulariteBoxe(1, '2026-08-06');
    expect(semaines[0].nbSeances).toBe(1);
    expect(semaines[0].rpeMoyen).toBeNull();
  });

  it('n’invente pas de semaine antérieure à la première saisie de boxe', async () => {
    const { enregistrerSeance, lireRegulariteBoxe } = await import('@/lib/db/training');
    enregistrerSeance({ date: '2026-08-10', sport: 'boxe', rpe: 5 }); // semaine du lundi 10/08
    const semaines = lireRegulariteBoxe(4, '2026-08-13');
    expect(semaines.map((s) => s.debut)).toEqual(['2026-08-10']);
  });

  it('renvoie une liste vide quand aucune saisie de boxe n’existe', async () => {
    const { lireRegulariteBoxe } = await import('@/lib/db/training');
    expect(lireRegulariteBoxe(4, '2026-08-06')).toEqual([]);
  });

  it('étiquette chaque semaine par son numéro ISO (formatage.ts)', async () => {
    const { enregistrerSeance, lireRegulariteBoxe } = await import('@/lib/db/training');
    const { numeroSemaineIso } = await import('@/lib/formatage');
    enregistrerSeance({ date: '2026-08-03', sport: 'boxe', rpe: 6 });
    const semaines = lireRegulariteBoxe(1, '2026-08-06');
    expect(semaines[0].isoSemaine).toBe(numeroSemaineIso('2026-08-03'));
  });
});

describe('segments de séance (tâche 28, saisie vocale)', () => {
  it('enregistre et relit les segments dans l ordre du récit', async () => {
    const { enregistrerSeance, enregistrerSegments, lireSegments } = await import('@/lib/db/training');
    const seanceId = enregistrerSeance({ date: '2026-08-09', sport: 'boxe', dureeMin: 75 });
    enregistrerSegments(seanceId, [
      { type: 'échauffement', dureeMin: 10, notes: null },
      { type: 'technique', dureeMin: 20, notes: 'jab-cross' },
      { type: 'sac', dureeMin: 15, notes: null },
    ]);
    const segments = lireSegments(seanceId);
    expect(segments).toHaveLength(3);
    expect(segments.map((s) => s.type)).toEqual(['échauffement', 'technique', 'sac']);
    expect(segments[1].notes).toBe('jab-cross');
    expect(segments[0].ordre).toBe(0);
  });

  it('renvoie une liste vide quand la séance n a aucun segment', async () => {
    const { enregistrerSeance, lireSegments } = await import('@/lib/db/training');
    const seanceId = enregistrerSeance({ date: '2026-08-09', sport: 'boxe', dureeMin: 60 });
    expect(lireSegments(seanceId)).toEqual([]);
  });

  it('n écrit rien pour une liste vide de segments', async () => {
    const { enregistrerSeance, enregistrerSegments, lireSegments } = await import('@/lib/db/training');
    const seanceId = enregistrerSeance({ date: '2026-08-09', sport: 'boxe', dureeMin: 60 });
    enregistrerSegments(seanceId, []);
    expect(lireSegments(seanceId)).toEqual([]);
  });

  it('n isole pas les segments d une séance vers une autre', async () => {
    const { enregistrerSeance, enregistrerSegments, lireSegments } = await import('@/lib/db/training');
    const id1 = enregistrerSeance({ date: '2026-08-09', sport: 'boxe', dureeMin: 60 });
    const id2 = enregistrerSeance({ date: '2026-08-10', sport: 'boxe', dureeMin: 60 });
    enregistrerSegments(id1, [{ type: 'sac', dureeMin: 10, notes: null }]);
    expect(lireSegments(id1)).toHaveLength(1);
    expect(lireSegments(id2)).toEqual([]);
  });

  it('accepte une durée et des notes absentes (null, jamais un zéro fabriqué)', async () => {
    const { enregistrerSeance, enregistrerSegments, lireSegments } = await import('@/lib/db/training');
    const seanceId = enregistrerSeance({ date: '2026-08-09', sport: 'boxe', dureeMin: 60 });
    enregistrerSegments(seanceId, [{ type: 'étirements' }]);
    const [s] = lireSegments(seanceId);
    expect(s.dureeMin).toBeNull();
    expect(s.notes).toBeNull();
  });
});

describe('lireStatsManuelles : stats agrégées par sport saisi (tâche 26, écran Séances)', () => {
  it('agrège nombre, minutes totales et RPE moyen par sport, séances autonomes seulement', async () => {
    const { enregistrerSeance, lireStatsManuelles } = await import('@/lib/db/training');
    enregistrerSeance({ date: '2026-08-03', sport: 'boxe', dureeMin: 90, rpe: 8 });
    enregistrerSeance({ date: '2026-08-05', sport: 'boxe', dureeMin: 60, rpe: 6 });
    // Rattachée à une activité Garmin : déjà représentée via l'activité elle-même
    // (lireStatsParSport côté garmin.ts) — ne doit pas s'ajouter une seconde fois
    // ici, même principe que fusionnerSeances (une saisie rattachée enrichit une
    // activité, elle ne s'y additionne pas).
    enregistrerSeance({ date: '2026-08-06', sport: 'autre', dureeMin: 33, rpe: 5, garminActivityId: 1 });
    const stats = lireStatsManuelles();
    expect(stats).toEqual([{ sport: 'boxe', nombre: 2, dureeTotaleMin: 150, rpeMoyen: 7 }]);
  });

  it('renvoie un RPE moyen null (jamais 0) quand aucune saisie du sport n’a de RPE', async () => {
    const { enregistrerSeance, lireStatsManuelles } = await import('@/lib/db/training');
    enregistrerSeance({ date: '2026-08-04', sport: 'boxe', dureeMin: 45 });
    const stats = lireStatsManuelles();
    expect(stats).toEqual([{ sport: 'boxe', nombre: 1, dureeTotaleMin: 45, rpeMoyen: null }]);
  });

  it('renvoie une liste vide quand aucune saisie autonome n’existe', async () => {
    const { lireStatsManuelles } = await import('@/lib/db/training');
    expect(lireStatsManuelles()).toEqual([]);
  });
});
