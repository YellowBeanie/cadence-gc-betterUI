import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { semerGarmin, semerReadinessRetardataire } from './fixtures/seed';

let racine: string;

beforeAll(() => {
  racine = mkdtempSync(join(tmpdir(), 'garmin-test-'));
  mkdirSync(join(racine, 'export'));
  semerGarmin(join(racine, 'export', 'garmin-ro.db'));
  process.env.GARMIN_DATA_DIR = racine;
});

afterAll(() => rmSync(racine, { recursive: true, force: true }));

describe('lecture de l instantané Garmin', () => {
  it('lit l état du jour le plus récent', async () => {
    const { lireEtatDuJour } = await import('@/lib/db/garmin');
    const etat = lireEtatDuJour();
    expect(etat?.date).toBe('2026-08-06');
    expect(etat?.readiness).toBe(1);
    expect(etat?.hrvNuit).toBe(38);
    expect(etat?.fcRepos).toBe(54);
  });

  it('tolère une nuit de sommeil manquante sans planter', async () => {
    const { lireEtatDuJour } = await import('@/lib/db/garmin');
    expect(lireEtatDuJour()?.sommeilSec).toBeNull();
  });

  it('lit la séance prescrite et la décode', async () => {
    const { lireSeancePrescrite } = await import('@/lib/db/garmin');
    const s = lireSeancePrescrite('2026-08-07');
    expect(s?.nom).toBe('Base');
    expect(s?.repos).toBe(false);
    expect(s?.distanceM).toBe(3172);
    expect(s?.intention).toBe('EASY_WEEK_LOAD_BASE');
  });

  it('reconnaît un jour de repos', async () => {
    const { lireSeancePrescrite } = await import('@/lib/db/garmin');
    expect(lireSeancePrescrite('2026-08-08')?.repos).toBe(true);
  });

  it('renvoie null quand aucun plan ne couvre la date', async () => {
    const { lireSeancePrescrite } = await import('@/lib/db/garmin');
    expect(lireSeancePrescrite('2026-12-25')).toBeNull();
  });

  it('lit les prochaines séances du plan, strictement après la date donnée, dans l’ordre', async () => {
    const { lireProchainesSeances } = await import('@/lib/db/garmin');
    const s = lireProchainesSeances('2026-08-07', 3);
    expect(s.map((x) => x.date)).toEqual(['2026-08-08', '2026-08-09', '2026-08-10']);
    expect(s[0].repos).toBe(true);            // jour de repos inclus, pas filtré
    expect(s[1].nom).toBe('Intervalles');
    expect(s[1].distanceM).toBe(5000);
    expect(s[1].intention).toBe('TEMPO_RUN');
  });

  it('plafonne le nombre de prochaines séances à la limite demandée', async () => {
    const { lireProchainesSeances } = await import('@/lib/db/garmin');
    expect(lireProchainesSeances('2026-08-07', 1).map((x) => x.date)).toEqual(['2026-08-08']);
  });

  it('renvoie une liste vide quand aucune séance future n’est planifiée', async () => {
    const { lireProchainesSeances } = await import('@/lib/db/garmin');
    expect(lireProchainesSeances('2026-12-25', 3)).toEqual([]);
  });

  it('liste les activités, y compris sans distance', async () => {
    const { lireActivites } = await import('@/lib/db/garmin');
    const a = lireActivites();
    expect(a).toHaveLength(2);
    expect(a[0].nom).toBe('Nyon - Base');       // plus récente d'abord
    expect(a[1].distanceM).toBeNull();          // boxe en salle
  });

  it('convertit les zones de FC en minutes', async () => {
    const { lireZonesFc } = await import('@/lib/db/garmin');
    const z = lireZonesFc();
    expect(z).toHaveLength(1);                  // l'activité sans zones est absente
    expect(z[0].z3).toBeCloseTo(14.4, 1);
  });

  it('calcule les tendances : conversions exactes, dates ISO, pas de faux zéro', async () => {
    const { lireTendances } = await import('@/lib/db/garmin');
    const t = lireTendances();

    // Dates restituées telles quelles, au format ISO, sans conversion d'epoch.
    expect(t.readiness.map((r) => r.date)).toEqual(['2026-08-05', '2026-08-06']);
    expect(t.hrv.map((h) => h.date)).toEqual(['2026-08-05', '2026-08-06']);

    // Baseline HRV basse et haute présentes dans la série.
    expect(t.hrv[0]).toMatchObject({ date: '2026-08-05', basse: 43, haute: 73 });
    expect(t.hrv[1]).toMatchObject({ date: '2026-08-06', basse: 43, haute: 73 });

    // Charge aiguë/chronique restituée sans transformation.
    expect(t.charge).toEqual([{ date: '2026-08-06', aigue: 106, chronique: 137 }]);

    // Conversion exacte des stades de sommeil en heures (nuit complète du 05/08).
    const nuitComplete = t.sommeil.find((s) => s.date === '2026-08-05');
    expect(nuitComplete?.profond).toBeCloseTo(6180 / 3600, 4);
    expect(nuitComplete?.rem).toBeCloseTo(5220 / 3600, 4);
    expect(nuitComplete?.leger).toBeCloseTo(14220 / 3600, 4);
    expect(nuitComplete?.eveille).toBeCloseTo(720 / 3600, 4);

    // Nuit du 03/08 sans détail de stade : null, jamais 0 (faux zéro trompeur).
    const nuitSansDetail = t.sommeil.find((s) => s.date === '2026-08-03');
    expect(nuitSansDetail).toEqual({
      date: '2026-08-03', profond: null, rem: null, leger: null, eveille: null,
    });

    // Body Battery (tâche 19, sparklines) : most_recent par jour, dates ISO,
    // même paire de jours que hrv/readiness.
    expect(t.bodyBattery).toEqual([
      { date: '2026-08-05', actuel: 58 },
      { date: '2026-08-06', actuel: 50 },
    ]);

    // Tâche 21 (bande de mesures Cadence, sparklines FC repos/sommeil/calories) :
    // trois séries supplémentaires, même convention date ISO / valeur nullable.
    expect(t.fcRepos).toEqual([{ date: '2026-08-06', valeur: 54 }]);
    expect(t.scoreSommeil).toEqual([
      { date: '2026-08-03', valeur: null },
      { date: '2026-08-05', valeur: 71 },
    ]);
    expect(t.calories).toEqual([{ date: '2026-08-06', valeur: 2450 }]);
  });
});

describe('lireEtatDuJour : moyenne FC repos 7 jours (tâche 21, bande de mesures Cadence)', () => {
  it('lit last_7day_avg_resting aux côtés de fcRepos', async () => {
    const { lireEtatDuJour } = await import('@/lib/db/garmin');
    const etat = lireEtatDuJour();
    expect(etat?.fcReposMoy7j).toBe(56);
  });
});

describe('lireChargeParJour : charge d’entraînement par jour civil (tâche 21)', () => {
  it('additionne training_load par jour sur la fenêtre demandée, 0 pour un jour sans activité', async () => {
    const { lireChargeParJour } = await import('@/lib/db/garmin');
    const jours = lireChargeParJour(7, '2026-08-06');
    expect(jours.map((j) => j.date)).toEqual([
      '2026-07-31', '2026-08-01', '2026-08-02', '2026-08-03',
      '2026-08-04', '2026-08-05', '2026-08-06',
    ]);
    expect(jours.find((j) => j.date === '2026-08-04')?.total).toBe(95);
    expect(jours.find((j) => j.date === '2026-08-05')?.total).toBe(180);
    expect(jours.find((j) => j.date === '2026-08-06')?.total).toBe(0);
    expect(jours.find((j) => j.date === '2026-07-31')?.total).toBe(0);
  });

  it('couvre le jour du bout demandé jusqu’à `jours - 1` jours avant, ordre chronologique croissant', async () => {
    const { lireChargeParJour } = await import('@/lib/db/garmin');
    const jours = lireChargeParJour(3, '2026-08-05');
    expect(jours.map((j) => j.date)).toEqual(['2026-08-03', '2026-08-04', '2026-08-05']);
  });

  it('renvoie un tableau vide, jamais une erreur, sur un instantané sans colonne training_load', async () => {
    const racineSansCharge = mkdtempSync(join(tmpdir(), 'garmin-test-sans-charge-'));
    mkdirSync(join(racineSansCharge, 'export'));
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(racineSansCharge, 'export', 'garmin-ro.db'));
    db.exec(`CREATE TABLE activity (activity_id INTEGER PRIMARY KEY, start_time_local TEXT);
      INSERT INTO activity VALUES (1, '2026-08-05 08:00:00');`);
    db.close();
    const precedente = process.env.GARMIN_DATA_DIR;
    process.env.GARMIN_DATA_DIR = racineSansCharge;
    try {
      const { lireChargeParJour } = await import('@/lib/db/garmin');
      expect(lireChargeParJour(7, '2026-08-06')).toEqual([]);
    } finally {
      process.env.GARMIN_DATA_DIR = precedente;
      rmSync(racineSansCharge, { recursive: true, force: true });
    }
  });
});

describe('lireStatsSemaine : stats de la semaine (tâche 21, écran Historique)', () => {
  it('calcule volume, D+, temps Z1-Z2 (%) et nombre de séances sur les 7 jours', async () => {
    const { lireStatsSemaine } = await import('@/lib/db/garmin');
    const s = lireStatsSemaine('2026-08-06');
    // Seule l’activité 1 a une distance (4005.5 m) ; l’activité 2 (boxe) est
    // sans distance — jamais fabriquée, simplement absente de la somme.
    expect(s.volumeKm).toBeCloseTo(4.0, 1);
    // Seule l’activité 1 a un dénivelé positif connu (37 m).
    expect(s.deniveleM).toBe(37);
    // Zones connues seulement pour l’activité 1 : Z1 18.8 + Z2 95.0 = 113.8 s
    // sur un total de 2003.3 s → 5.68 %, arrondi à l’entier le plus proche.
    expect(s.pourcentZ12).toBe(6);
    expect(s.seances).toBe(2);
  });

  it('renvoie un pourcentage Z1-Z2 nul quand aucune zone n’est connue sur la semaine', async () => {
    const { lireStatsSemaine } = await import('@/lib/db/garmin');
    const s = lireStatsSemaine('2026-07-20');
    expect(s.seances).toBe(0);
    expect(s.volumeKm).toBe(0);
    expect(s.deniveleM).toBe(0);
    expect(s.pourcentZ12).toBeNull();
  });

  it('jours par défaut (omis) équivaut exactement à jours=7 (tâche 47 : défaut inchangé)', async () => {
    const { lireStatsSemaine } = await import('@/lib/db/garmin');
    expect(lireStatsSemaine('2026-08-06')).toEqual(lireStatsSemaine('2026-08-06', 7));
  });

  it('jours=7 ignore une activité antérieure à la fenêtre demandée (tâche 47)', async () => {
    const { lireStatsSemaine } = await import('@/lib/db/garmin');
    // Fenêtre 7 jours se terminant le 11/08 : 05-11/08 → l'activité 1 (course
    // du 05/08) est dedans, l'activité 2 (boxe du 04/08) est hors fenêtre.
    const s = lireStatsSemaine('2026-08-11', 7);
    expect(s.seances).toBe(1);
  });

  it('jours=14 élargit la fenêtre et inclut l’activité désormais couverte (tâche 47)', async () => {
    const { lireStatsSemaine } = await import('@/lib/db/garmin');
    // Fenêtre 14 jours se terminant le 11/08 : 29/07-11/08 → couvre les deux
    // activités (05/08 et 04/08), contrairement à la fenêtre 7 jours ci-dessus.
    const s = lireStatsSemaine('2026-08-11', 14);
    expect(s.seances).toBe(2);
  });

  it('renvoie des stats neutres, jamais une erreur, sur un instantané sans colonne elevation_gain', async () => {
    const racineSansDenivele = mkdtempSync(join(tmpdir(), 'garmin-test-sans-denivele-'));
    mkdirSync(join(racineSansDenivele, 'export'));
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(racineSansDenivele, 'export', 'garmin-ro.db'));
    db.exec(`CREATE TABLE activity (activity_id INTEGER PRIMARY KEY, start_time_local TEXT, distance_meters REAL);
      INSERT INTO activity VALUES (1, '2026-08-05 08:00:00', 5000);`);
    db.close();
    const precedente = process.env.GARMIN_DATA_DIR;
    process.env.GARMIN_DATA_DIR = racineSansDenivele;
    try {
      const { lireStatsSemaine } = await import('@/lib/db/garmin');
      expect(lireStatsSemaine('2026-08-06')).toEqual({
        volumeKm: 0, deniveleM: 0, pourcentZ12: null, seances: 0,
      });
    } finally {
      process.env.GARMIN_DATA_DIR = precedente;
      rmSync(racineSansDenivele, { recursive: true, force: true });
    }
  });
});

describe('lireChargeParSemaine : charge d’entraînement par semaine ISO (tâche 22)', () => {
  it('regroupe par semaine ISO (lundi-dimanche) et exclut les semaines avant la première donnée', async () => {
    const { lireChargeParSemaine } = await import('@/lib/db/garmin');
    // Première activité connue : 2026-08-04 (boxe). Semaine du 03-09/08 est
    // donc la première à s'afficher, même en demandant 3 semaines en arrière.
    const semaines = lireChargeParSemaine(3, '2026-08-06');
    expect(semaines).toHaveLength(1);
    expect(semaines[0].debut).toBe('2026-08-03');
    // Boxe (95) le 04/08 + Nyon - Base (180) le 05/08.
    expect(semaines[0].total).toBe(275);
  });

  it('étiquette chaque semaine par son numéro ISO (formatage.ts)', async () => {
    const { lireChargeParSemaine } = await import('@/lib/db/garmin');
    const { numeroSemaineIso } = await import('@/lib/formatage');
    const semaines = lireChargeParSemaine(1, '2026-08-06');
    expect(semaines[0].isoSemaine).toBe(numeroSemaineIso('2026-08-03'));
  });

  it('renvoie un vrai zéro pour une semaine couverte par les données mais sans activité', async () => {
    const { lireChargeParSemaine } = await import('@/lib/db/garmin');
    const semaines = lireChargeParSemaine(2, '2026-08-13');
    expect(semaines.map((s) => s.debut)).toEqual(['2026-08-03', '2026-08-10']);
    expect(semaines[0].total).toBe(275);
    expect(semaines[1].total).toBe(0);
  });

  it('ne renvoie jamais plus de semaines que celles couvertes par les données, même si nb est plus grand', async () => {
    const { lireChargeParSemaine } = await import('@/lib/db/garmin');
    expect(lireChargeParSemaine(8, '2026-08-06')).toHaveLength(1);
  });

  it('renvoie un tableau vide, jamais une erreur, sur un instantané sans colonne training_load', async () => {
    const racineSansCharge = mkdtempSync(join(tmpdir(), 'garmin-test-semaine-sans-charge-'));
    mkdirSync(join(racineSansCharge, 'export'));
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(racineSansCharge, 'export', 'garmin-ro.db'));
    db.exec(`CREATE TABLE activity (activity_id INTEGER PRIMARY KEY, start_time_local TEXT);
      INSERT INTO activity VALUES (1, '2026-08-05 08:00:00');`);
    db.close();
    const precedente = process.env.GARMIN_DATA_DIR;
    process.env.GARMIN_DATA_DIR = racineSansCharge;
    try {
      const { lireChargeParSemaine } = await import('@/lib/db/garmin');
      expect(lireChargeParSemaine(8, '2026-08-06')).toEqual([]);
    } finally {
      process.env.GARMIN_DATA_DIR = precedente;
      rmSync(racineSansCharge, { recursive: true, force: true });
    }
  });

  it('renvoie un tableau vide quand aucune activité n’existe', async () => {
    const racineVide = mkdtempSync(join(tmpdir(), 'garmin-test-semaine-vide-'));
    mkdirSync(join(racineVide, 'export'));
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(racineVide, 'export', 'garmin-ro.db'));
    db.exec(`CREATE TABLE activity (activity_id INTEGER PRIMARY KEY, start_time_local TEXT, training_load REAL);`);
    db.close();
    const precedente = process.env.GARMIN_DATA_DIR;
    process.env.GARMIN_DATA_DIR = racineVide;
    try {
      const { lireChargeParSemaine } = await import('@/lib/db/garmin');
      expect(lireChargeParSemaine(8, '2026-08-06')).toEqual([]);
    } finally {
      process.env.GARMIN_DATA_DIR = precedente;
      rmSync(racineVide, { recursive: true, force: true });
    }
  });
});

describe('lireEfficaciteAerobie : allure à FC égale (tâche 25)', () => {
  it('calcule l’index d’efficacité (mètres par battement) pour une activité de course avec FC et distance', async () => {
    const { lireEfficaciteAerobie } = await import('@/lib/db/garmin');
    const e = lireEfficaciteAerobie();
    // Seule l’activité 1 (Nyon - Base, running) qualifie : l’activité 2
    // (Boxe) n’est ni du type course ni pourvue d’une distance.
    expect(e).toHaveLength(1);
    expect(e[0].nom).toBe('Nyon - Base');
    expect(e[0].fcMoy).toBe(160);
    expect(e[0].allureSecKm).toBeCloseTo(2003.3 / (4005.5 / 1000), 1);
    // indice = distance_m / (durée_min × FC_moy) = 4005.5 / ((2003.3/60) × 160).
    expect(e[0].indice).toBeCloseTo(4005.5 / ((2003.3 / 60) * 160), 4);
  });

  it('ordonne chronologiquement et ignore les activités sans FC, sans distance, ou hors course à pied', async () => {
    const racine = mkdtempSync(join(tmpdir(), 'garmin-test-efficacite-'));
    mkdirSync(join(racine, 'export'));
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(racine, 'export', 'garmin-ro.db'));
    db.exec(`
      CREATE TABLE activity (activity_id INTEGER PRIMARY KEY, start_time_local TEXT,
        activity_name TEXT, activity_type TEXT, distance_meters REAL,
        duration_seconds REAL, average_hr REAL);
      -- Course complète, la plus ancienne.
      INSERT INTO activity VALUES (10, '2026-08-01 08:00:00', 'Sortie 1', 'running', 5000, 1800, 150);
      -- Sans distance : ignorée malgré le type course.
      INSERT INTO activity VALUES (11, '2026-08-03 08:00:00', 'Sortie 2', 'trail_running', NULL, 1200, 140);
      -- Sans FC : ignorée malgré le type course.
      INSERT INTO activity VALUES (12, '2026-08-05 08:00:00', 'Sortie 3', 'running', 6000, 2000, NULL);
      -- Type hors course : ignorée malgré FC et distance.
      INSERT INTO activity VALUES (13, '2026-08-02 08:00:00', 'Vélo', 'cycling', 20000, 3000, 130);
      -- Course complète, la plus récente (treadmill_running inclus).
      INSERT INTO activity VALUES (14, '2026-08-07 08:00:00', 'Sortie 4', 'treadmill_running', 3000, 1000, 145);
    `);
    db.close();
    const precedente = process.env.GARMIN_DATA_DIR;
    process.env.GARMIN_DATA_DIR = racine;
    try {
      const { lireEfficaciteAerobie } = await import('@/lib/db/garmin');
      const e = lireEfficaciteAerobie();
      expect(e.map((x) => x.nom)).toEqual(['Sortie 1', 'Sortie 4']);
      expect(e[0].indice).toBeCloseTo(5000 / (30 * 150), 4);
      expect(e[1].indice).toBeCloseTo(3000 / ((1000 / 60) * 145), 4);
    } finally {
      process.env.GARMIN_DATA_DIR = precedente;
      rmSync(racine, { recursive: true, force: true });
    }
  });
});

describe('lireZonesParSemaine : part Z1-Z2 par semaine ISO (tâche 25)', () => {
  it('calcule pctZ1Z2 et le nombre d’activités avec zones, mêmes bornes que lireChargeParSemaine', async () => {
    const { lireZonesParSemaine } = await import('@/lib/db/garmin');
    const semaines = lireZonesParSemaine(3, '2026-08-06');
    expect(semaines).toHaveLength(1);
    expect(semaines[0].debut).toBe('2026-08-03');
    // Z1 18.8 + Z2 95.0 = 113.8 s sur un total de 2003.3 s → 5.68 %, arrondi.
    expect(semaines[0].pctZ1Z2).toBe(6);
    expect(semaines[0].activitesAvecZones).toBe(1);
  });

  it('renvoie pctZ1Z2 null (jamais 0) pour une semaine couverte par les données mais sans zone connue', async () => {
    const { lireZonesParSemaine } = await import('@/lib/db/garmin');
    const semaines = lireZonesParSemaine(2, '2026-08-13');
    expect(semaines.map((s) => s.debut)).toEqual(['2026-08-03', '2026-08-10']);
    expect(semaines[0].pctZ1Z2).toBe(6);
    expect(semaines[1].pctZ1Z2).toBeNull();
    expect(semaines[1].activitesAvecZones).toBe(0);
  });

  it('exclut les semaines antérieures à la première activité, même si nb est plus grand', async () => {
    const { lireZonesParSemaine } = await import('@/lib/db/garmin');
    expect(lireZonesParSemaine(8, '2026-08-06')).toHaveLength(1);
  });

  it('renvoie un tableau vide, jamais une erreur, sur un instantané sans table activity_hr_zones', async () => {
    const racine = mkdtempSync(join(tmpdir(), 'garmin-test-zones-semaine-sans-table-'));
    mkdirSync(join(racine, 'export'));
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(racine, 'export', 'garmin-ro.db'));
    db.exec(`CREATE TABLE activity (activity_id INTEGER PRIMARY KEY, start_time_local TEXT);
      INSERT INTO activity VALUES (1, '2026-08-05 08:00:00');`);
    db.close();
    const precedente = process.env.GARMIN_DATA_DIR;
    process.env.GARMIN_DATA_DIR = racine;
    try {
      const { lireZonesParSemaine } = await import('@/lib/db/garmin');
      const semaines = lireZonesParSemaine(1, '2026-08-06');
      expect(semaines).toHaveLength(1);
      expect(semaines[0].pctZ1Z2).toBeNull();
    } finally {
      process.env.GARMIN_DATA_DIR = precedente;
      rmSync(racine, { recursive: true, force: true });
    }
  });

  it('renvoie un tableau vide quand aucune activité n’existe', async () => {
    const racine = mkdtempSync(join(tmpdir(), 'garmin-test-zones-semaine-vide-'));
    mkdirSync(join(racine, 'export'));
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(racine, 'export', 'garmin-ro.db'));
    db.exec(`CREATE TABLE activity (activity_id INTEGER PRIMARY KEY, start_time_local TEXT);
      CREATE TABLE activity_hr_zones (activity_id INTEGER PRIMARY KEY, zone1_seconds REAL,
        zone2_seconds REAL, zone3_seconds REAL, zone4_seconds REAL, zone5_seconds REAL);`);
    db.close();
    const precedente = process.env.GARMIN_DATA_DIR;
    process.env.GARMIN_DATA_DIR = racine;
    try {
      const { lireZonesParSemaine } = await import('@/lib/db/garmin');
      expect(lireZonesParSemaine(8, '2026-08-06')).toEqual([]);
    } finally {
      process.env.GARMIN_DATA_DIR = precedente;
      rmSync(racine, { recursive: true, force: true });
    }
  });
});

describe('lirePlanPasse : plan Garmin passé vs activité réalisée (tâche 25)', () => {
  it('liste les séances échues du plan (nbJours derniers jours, aujourd’hui exclu), jour de repos filtré', async () => {
    const { lirePlanPasse } = await import('@/lib/db/garmin');
    const plan = lirePlanPasse(14, '2026-08-06');
    // 03/08 est un jour de repos : filtré, ce n’est pas une « séance » du plan.
    expect(plan.map((p) => p.date)).toEqual(['2026-08-04', '2026-08-05']);
  });

  it('associe une activité de course réalisée le même jour (FAIT)', async () => {
    const { lirePlanPasse } = await import('@/lib/db/garmin');
    const plan = lirePlanPasse(14, '2026-08-06');
    const jour05 = plan.find((p) => p.date === '2026-08-05');
    expect(jour05?.nom).toBe('Base');
    expect(jour05?.distanceM).toBe(4000);
    expect(jour05?.realisee).toEqual({ id: 1, nom: 'Nyon - Base', distanceM: 4005.5 });
  });

  it('renvoie realisee null quand seule une activité non-course existe ce jour-là (boxe → NON COURU)', async () => {
    const { lirePlanPasse } = await import('@/lib/db/garmin');
    const plan = lirePlanPasse(14, '2026-08-06');
    const jour04 = plan.find((p) => p.date === '2026-08-04');
    expect(jour04?.realisee).toBeNull();
  });

  it('exclut aujourd’hui même si une séance du plan y est datée', async () => {
    const { lirePlanPasse } = await import('@/lib/db/garmin');
    // « Aujourd’hui » = 05/08 (qui porte une séance planifiée) : doit rester
    // exclu, seul 04/08 (03/08 repos filtré) doit apparaître.
    const plan = lirePlanPasse(14, '2026-08-05');
    expect(plan.map((p) => p.date)).toEqual(['2026-08-04']);
  });

  it('renvoie une liste vide quand la fenêtre ne couvre qu’un jour de repos', async () => {
    const { lirePlanPasse } = await import('@/lib/db/garmin');
    expect(lirePlanPasse(1, '2026-08-04')).toEqual([]);
  });
});

describe('lireSeanceDetail : détail complet d’une séance (tâche 20)', () => {
  it('lit les mesures étendues d’une activité avec splits, zones et météo', async () => {
    const { lireSeanceDetail } = await import('@/lib/db/garmin');
    const d = lireSeanceDetail(1);
    expect(d).not.toBeNull();
    expect(d?.nom).toBe('Nyon - Base');
    expect(d?.type).toBe('running');
    expect(d?.debut).toBe('2026-08-05 19:01:04');
    expect(d?.lieu).toBe('Nyon');
    expect(d?.distanceM).toBe(4005.5);
    expect(d?.calories).toBe(411);
    expect(d?.fcMoy).toBe(160);
    expect(d?.fcMax).toBe(186);
    expect(d?.fcMin).toBe(100);
    expect(d?.cadenceMoy).toBeCloseTo(129.6, 1);
    expect(d?.cadenceMax).toBe(207);
    expect(d?.deniveleMonte).toBe(37);
    expect(d?.deniveleDescente).toBe(40);
    expect(d?.puissanceMoy).toBe(244);
    expect(d?.puissanceMax).toBe(466);
    expect(d?.puissanceNorm).toBe(289);
    expect(d?.effetAerobie).toBe(3.2);
    expect(d?.effetAnaerobie).toBe(0.4);
  });

  it('lit les splits kilométriques dans l’ordre', async () => {
    const { lireSeanceDetail } = await import('@/lib/db/garmin');
    const d = lireSeanceDetail(1);
    expect(d?.splits).toHaveLength(4);
    expect(d?.splits.map((s) => s.numero)).toEqual([1, 2, 3, 4]);
    expect(d?.splits[0]).toEqual({
      numero: 1, distanceM: 1000, dureeSec: 520, vitesseMoyMps: 1.92,
      fcMoy: 152, deniveleMonte: 8, cadenceMoy: 126,
    });
  });

  it('convertit les zones de FC en minutes, comme lireZonesFc', async () => {
    const { lireSeanceDetail } = await import('@/lib/db/garmin');
    const d = lireSeanceDetail(1);
    expect(d?.zones?.z3).toBeCloseTo(14.4, 1);
  });

  it('convertit la météo de °F en °C (piège de production, cf. lib/db/garmin.ts)', async () => {
    const { lireSeanceDetail } = await import('@/lib/db/garmin');
    const d = lireSeanceDetail(1);
    expect(d?.meteo?.temperatureC).toBeCloseTo(31.1, 1);
    expect(d?.meteo?.temperatureRessentieC).toBeCloseTo(31.1, 1);
    expect(d?.meteo?.humidite).toBe(38);
    expect(d?.meteo?.ventDirectionDeg).toBe(300);
    expect(d?.meteo?.type).toBe('Mostly Clear');
  });

  it('rattache la saisie manuelle (RPE, notes) à l’activité Garmin correspondante', async () => {
    const { initialiserSchema } = await import('@/lib/db/schema');
    const { enregistrerSeance } = await import('@/lib/db/training');
    const { lireSeanceDetail } = await import('@/lib/db/garmin');
    initialiserSchema();
    enregistrerSeance({
      date: '2026-08-05', sport: 'autre', dureeMin: 33, rpe: 6,
      notes: 'jambes lourdes', garminActivityId: 1,
    });
    const d = lireSeanceDetail(1);
    // date incluse (tâche 21, méta mono du panneau d'accompagnement Cadence) :
    // reprise telle quelle de la saisie manuelle, jamais celle de l'activité.
    expect(d?.saisie).toEqual({ rpe: 6, notes: 'jambes lourdes', date: '2026-08-05', segments: [] });
  });

  it('inclut les segments de la saisie rattachée (tâche 28, saisie vocale)', async () => {
    const { initialiserSchema } = await import('@/lib/db/schema');
    const { enregistrerSeance, enregistrerSegments } = await import('@/lib/db/training');
    const { lireSeanceDetail } = await import('@/lib/db/garmin');
    initialiserSchema();
    const seanceId = enregistrerSeance({
      date: '2026-08-05', sport: 'boxe', rpe: 7, garminActivityId: 1,
    });
    enregistrerSegments(seanceId, [
      { type: 'échauffement', dureeMin: 10, notes: null },
      { type: 'sac', dureeMin: 20, notes: 'jambes lourdes' },
    ]);
    const d = lireSeanceDetail(1);
    expect(d?.saisie?.segments).toEqual([
      { type: 'échauffement', dureeMin: 10, notes: null },
      { type: 'sac', dureeMin: 20, notes: 'jambes lourdes' },
    ]);
  });

  it('renvoie des sections vides/nulles pour une séance sans détails riches (boxe)', async () => {
    const { lireSeanceDetail } = await import('@/lib/db/garmin');
    const d = lireSeanceDetail(2);
    expect(d).not.toBeNull();
    expect(d?.nom).toBe('Boxe');
    expect(d?.splits).toEqual([]);
    expect(d?.zones).toBeNull();
    expect(d?.meteo).toBeNull();
    expect(d?.saisie).toBeNull();
    // Tâche 31 : aucune de ces colonnes n'est renseignée pour la boxe en salle.
    expect(d?.vo2max).toBeNull();
    expect(d?.ressentiGarmin).toBeNull();
    expect(d?.dynamique).toBeNull();
    // Tâche 40 (radar comparatif) : `training_load` reste connu même pour une
    // séance « sans détails riches » (cf. commentaire du seed : « une séance
    // sans GPS a quand même une charge d'entraînement chez Garmin »).
    expect(d?.chargeEntrainement).toBe(95);
  });

  it('lit la charge d’entraînement (training_load, tâche 40, radar comparatif)', async () => {
    const { lireSeanceDetail } = await import('@/lib/db/garmin');
    expect(lireSeanceDetail(1)?.chargeEntrainement).toBe(180);
  });

  it('renvoie chargeEntrainement null, jamais une erreur, sur un instantané sans colonne training_load', async () => {
    const racineSansCharge = mkdtempSync(join(tmpdir(), 'garmin-test-detail-sans-charge-'));
    mkdirSync(join(racineSansCharge, 'export'));
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(racineSansCharge, 'export', 'garmin-ro.db'));
    // Mêmes colonnes que la requête principale de lireSeanceDetail (lib/db/garmin.ts),
    // `training_load` en moins — reproduit un instantané généré par une version
    // antérieure du collecteur, avant l'ajout de cette colonne (tâche 21).
    db.exec(`
      CREATE TABLE activity (
        activity_id INTEGER PRIMARY KEY, activity_name TEXT, activity_type TEXT,
        start_time_local TEXT, location_name TEXT, distance_meters REAL, duration_seconds REAL,
        calories REAL, average_hr REAL, max_hr REAL, activity_min_hr REAL,
        avg_cadence REAL, max_cadence REAL, elevation_gain REAL, elevation_loss REAL,
        avg_power REAL, max_power REAL, norm_power REAL,
        aerobic_training_effect REAL, anaerobic_training_effect REAL,
        vo2max_value REAL, body_battery_change REAL, direct_workout_feel REAL, direct_workout_rpe REAL
      );
      CREATE TABLE activity_splits (activity_id INTEGER, split_number INTEGER, distance_meters REAL,
        duration_seconds REAL, average_speed REAL, average_hr REAL, elevation_gain REAL, avg_cadence REAL);
      CREATE TABLE activity_hr_zones (activity_id INTEGER PRIMARY KEY, zone1_seconds REAL,
        zone2_seconds REAL, zone3_seconds REAL, zone4_seconds REAL, zone5_seconds REAL);
      CREATE TABLE activity_weather (activity_id INTEGER PRIMARY KEY, temperature REAL,
        apparent_temperature REAL, humidity REAL, wind_speed REAL, wind_direction REAL, weather_type TEXT);
      INSERT INTO activity (activity_id, activity_name, activity_type, start_time_local)
        VALUES (1, 'Sortie sans charge', 'running', '2026-08-05 08:00:00');
    `);
    db.close();
    const precedente = process.env.GARMIN_DATA_DIR;
    process.env.GARMIN_DATA_DIR = racineSansCharge;
    try {
      const { lireSeanceDetail } = await import('@/lib/db/garmin');
      const d = lireSeanceDetail(1);
      expect(d).not.toBeNull();
      expect(d?.chargeEntrainement).toBeNull();
    } finally {
      process.env.GARMIN_DATA_DIR = precedente;
      rmSync(racineSansCharge, { recursive: true, force: true });
    }
  });

  it('lit VO2max, impact Body Battery, ressenti Garmin et dynamique de course (tâche 31)', async () => {
    const { lireSeanceDetail } = await import('@/lib/db/garmin');
    const d = lireSeanceDetail(1);
    expect(d?.vo2max).toBe(41.0);
    expect(d?.bodyBatteryChange).toBe(-8);
    expect(d?.ressentiGarmin).toEqual({ feel: 25, rpe: 80 });
    expect(d?.dynamique).toEqual({
      tempsContactSolMs: 314.1, balanceGctPct: null, oscillationVerticaleCm: 7.57,
      ratioVerticalPct: 8.28, longueurFouleeCm: 90.74,
    });
  });

  it('renvoie null pour un identifiant d’activité inconnu', async () => {
    const { lireSeanceDetail } = await import('@/lib/db/garmin');
    expect(lireSeanceDetail(999999)).toBeNull();
  });
});

describe('lireActivitesMemeSport : sélecteur de comparaison du radar (tâche 40)', () => {
  it('ne renvoie que les autres activités du même activity_type, la plus récente d’abord', async () => {
    const racine = mkdtempSync(join(tmpdir(), 'garmin-test-meme-sport-'));
    mkdirSync(join(racine, 'export'));
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(racine, 'export', 'garmin-ro.db'));
    db.exec(`
      CREATE TABLE activity (activity_id INTEGER PRIMARY KEY, start_time_local TEXT,
        activity_name TEXT, activity_type TEXT, distance_meters REAL, duration_seconds REAL,
        average_hr REAL, max_hr REAL, aerobic_training_effect REAL);
      INSERT INTO activity VALUES (1, '2026-08-01 08:00:00', 'Sortie 1', 'running', 5000, 1800, 150, 170, 3.0);
      INSERT INTO activity VALUES (2, '2026-08-03 08:00:00', 'Sortie 2', 'running', 6000, 2000, 152, 172, 3.1);
      INSERT INTO activity VALUES (3, '2026-08-05 08:00:00', 'Sortie 3 (affichée)', 'running', 7000, 2100, 155, 175, 3.2);
      INSERT INTO activity VALUES (4, '2026-08-02 08:00:00', 'Boxe', 'boxing', NULL, 3600, 140, 178, NULL);
    `);
    db.close();
    const precedente = process.env.GARMIN_DATA_DIR;
    process.env.GARMIN_DATA_DIR = racine;
    try {
      const { lireActivitesMemeSport } = await import('@/lib/db/garmin');
      const autres = lireActivitesMemeSport('running', 3);
      expect(autres.map((a) => a.id)).toEqual([2, 1]); // ni la boxe, ni la séance affichée (3)
      expect(autres.map((a) => a.nom)).toEqual(['Sortie 2', 'Sortie 1']);
    } finally {
      process.env.GARMIN_DATA_DIR = precedente;
      rmSync(racine, { recursive: true, force: true });
    }
  });

  it('la casse n’a pas d’importance sur activity_type', async () => {
    const racine = mkdtempSync(join(tmpdir(), 'garmin-test-meme-sport-casse-'));
    mkdirSync(join(racine, 'export'));
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(racine, 'export', 'garmin-ro.db'));
    db.exec(`
      CREATE TABLE activity (activity_id INTEGER PRIMARY KEY, start_time_local TEXT,
        activity_name TEXT, activity_type TEXT, distance_meters REAL, duration_seconds REAL,
        average_hr REAL, max_hr REAL, aerobic_training_effect REAL);
      INSERT INTO activity VALUES (1, '2026-08-01 08:00:00', 'Sortie 1', 'RUNNING', 5000, 1800, 150, 170, 3.0);
      INSERT INTO activity VALUES (2, '2026-08-05 08:00:00', 'Sortie 2', 'running', 7000, 2100, 155, 175, 3.2);
    `);
    db.close();
    const precedente = process.env.GARMIN_DATA_DIR;
    process.env.GARMIN_DATA_DIR = racine;
    try {
      const { lireActivitesMemeSport } = await import('@/lib/db/garmin');
      expect(lireActivitesMemeSport('running', 2).map((a) => a.id)).toEqual([1]);
    } finally {
      process.env.GARMIN_DATA_DIR = precedente;
      rmSync(racine, { recursive: true, force: true });
    }
  });

  it('renvoie [] pour un type null — une activité sans type connu ne peut être comparée à « une autre du même »', async () => {
    const { lireActivitesMemeSport } = await import('@/lib/db/garmin');
    expect(lireActivitesMemeSport(null, 1)).toEqual([]);
  });

  it('renvoie [] quand aucune autre activité du même sport n’existe (fixture partagée : une seule course)', async () => {
    const { lireActivitesMemeSport } = await import('@/lib/db/garmin');
    expect(lireActivitesMemeSport('running', 1)).toEqual([]);
  });
});

describe('lireTrackpoints : trace sous-échantillonnée (tâche 20)', () => {
  it('sous-échantillonne ~2000 points vers ~300, en gardant le premier et le dernier', async () => {
    const { lireTrackpoints } = await import('@/lib/db/garmin');
    const pts = lireTrackpoints(1);
    expect(pts.length).toBeGreaterThan(250);
    expect(pts.length).toBeLessThan(350);
    expect(pts[0].distanceM).toBe(0);
    expect(pts[pts.length - 1].distanceM).toBeCloseTo(4005.5, 1);
  });

  it('conserve un trou (null) pour la FC absente, jamais un zéro fabriqué', async () => {
    const { lireTrackpoints } = await import('@/lib/db/garmin');
    // maxPoints assez grand pour garantir que la fenêtre sans FC (seq 500-504
    // de la fixture) survit au sous-échantillonnage.
    const pts = lireTrackpoints(1, 2005);
    expect(pts.some((p) => p.fcBpm == null)).toBe(true);
  });

  it('conserve une vitesse nulle réelle (arrêt), distincte d’une FC absente', async () => {
    const { lireTrackpoints } = await import('@/lib/db/garmin');
    const pts = lireTrackpoints(1, 2005);
    expect(pts[0].vitesseMps).toBe(0);
  });

  it('renvoie un tableau vide pour une activité sans trackpoints', async () => {
    const { lireTrackpoints } = await import('@/lib/db/garmin');
    expect(lireTrackpoints(2)).toEqual([]);
  });

  it('renvoie un tableau vide pour un identifiant d’activité inconnu', async () => {
    const { lireTrackpoints } = await import('@/lib/db/garmin');
    expect(lireTrackpoints(999999)).toEqual([]);
  });

  it('lit la cadence, toujours connue sur la fixture (tâche 48, courbes enrichies)', async () => {
    const { lireTrackpoints } = await import('@/lib/db/garmin');
    const pts = lireTrackpoints(1, 2005);
    expect(pts.every((p) => p.cadenceSpm != null)).toBe(true);
  });

  it('conserve le trou de puissance (seq 999) sans le transformer en zéro', async () => {
    const { lireTrackpoints } = await import('@/lib/db/garmin');
    const pts = lireTrackpoints(1, 2005);
    expect(pts.some((p) => p.puissanceW == null)).toBe(true);
    expect(pts.some((p) => p.puissanceW != null)).toBe(true);
  });
});

describe('lireTraceGps : trace GPS sous-échantillonnée pour la carte 3D (tâche 27)', () => {
  it('exclut les points sans lat/lon (avant fix GPS) et sous-échantillonne le reste', async () => {
    const { lireTraceGps } = await import('@/lib/db/garmin');
    // Fixture : 2005 trackpoints, les 10 premiers (seq 0-9) sans lat/lon.
    // 1995 lignes valides, maxPoints par défaut 1500 → pas = 2 → ~998 points.
    const pts = lireTraceGps(1);
    expect(pts.length).toBeGreaterThan(900);
    expect(pts.length).toBeLessThan(1100);
  });

  it('conserve le premier point VALIDE (seq 10, pas seq 0 qui est sans lat/lon)', async () => {
    const { lireTraceGps } = await import('@/lib/db/garmin');
    const pts = lireTraceGps(1);
    expect(pts[0].lat).toBeCloseTo(46.3766 + 10 * 0.00001, 6);
    expect(pts[0].lon).toBeCloseTo(6.2214 + 10 * 0.00001, 6);
  });

  it('conserve le dernier point (seq 2004)', async () => {
    const { lireTraceGps } = await import('@/lib/db/garmin');
    const pts = lireTraceGps(1);
    const dernier = pts[pts.length - 1];
    expect(dernier.lat).toBeCloseTo(46.3766 + 2004 * 0.00001, 6);
    expect(dernier.lon).toBeCloseTo(6.2214 + 2004 * 0.00001, 6);
  });

  it('porte une altitude connue (jamais null) sur une trace GPS complète', async () => {
    const { lireTraceGps } = await import('@/lib/db/garmin');
    const pts = lireTraceGps(1);
    expect(pts.every((p) => p.altitudeM != null)).toBe(true);
  });

  it('respecte un maxPoints explicite plus petit', async () => {
    const { lireTraceGps } = await import('@/lib/db/garmin');
    const pts = lireTraceGps(1, 100);
    // pas = ceil(1995/100) = 20 → environ 100 points.
    expect(pts.length).toBeGreaterThan(80);
    expect(pts.length).toBeLessThan(120);
  });

  it('renvoie un tableau vide pour une activité sans trackpoints', async () => {
    const { lireTraceGps } = await import('@/lib/db/garmin');
    expect(lireTraceGps(2)).toEqual([]);
  });

  it('renvoie un tableau vide pour un identifiant d’activité inconnu', async () => {
    const { lireTraceGps } = await import('@/lib/db/garmin');
    expect(lireTraceGps(999999)).toEqual([]);
  });
});

describe('fraîcheur de l ancrage : lireEtatDuJour toutes tables confondues', () => {
  let racineRetard: string;

  beforeAll(() => {
    racineRetard = mkdtempSync(join(tmpdir(), 'garmin-test-retard-'));
    mkdirSync(join(racineRetard, 'export'));
    semerReadinessRetardataire(join(racineRetard, 'export', 'garmin-ro.db'));
  });

  afterAll(() => rmSync(racineRetard, { recursive: true, force: true }));

  it('ancre sur le jour le plus récent même si seule la readiness manque', async () => {
    const precedente = process.env.GARMIN_DATA_DIR;
    process.env.GARMIN_DATA_DIR = racineRetard;
    try {
      const { lireEtatDuJour } = await import('@/lib/db/garmin');
      const etat = lireEtatDuJour();
      // Readiness connue seulement au 05/08 ; HRV et sommeil déjà là le 06/08.
      expect(etat?.date).toBe('2026-08-06');
      expect(etat?.readiness).toBeNull();
      expect(etat?.hrvNuit).toBe(38);
    } finally {
      process.env.GARMIN_DATA_DIR = precedente;
    }
  });
});

describe('lireJourneeComplete : sections enrichies de l écran Aujourd’hui (tâche 12)', () => {
  it('ancre par défaut sur le même jour que lireEtatDuJour', async () => {
    const { lireEtatDuJour, lireJourneeComplete } = await import('@/lib/db/garmin');
    const etat = lireEtatDuJour();
    const j = lireJourneeComplete();
    expect(j.date).toBe(etat?.date);
    expect(j.date).toBe('2026-08-06');
  });

  it('lit le Body Battery avec le récit réveil → actuel → pic/creux → charge', async () => {
    const { lireJourneeComplete } = await import('@/lib/db/garmin');
    const j = lireJourneeComplete();
    expect(j.bodyBattery).toEqual({
      reveil: 65, actuel: 50, pic: 69, creux: 5, recharge: 64, depense: 19,
    });
  });

  it('traduit le statut d’entraînement et restitue les charges sans transformation', async () => {
    const { lireJourneeComplete } = await import('@/lib/db/garmin');
    const j = lireJourneeComplete();
    expect(j.statutEntrainement).toEqual({
      code: 'STRAINED_1', libelle: 'Sollicité', chargeAigue: 106, chargeChronique: 137,
    });
  });

  it('lit l’activité de la journée telle quelle', async () => {
    const { lireJourneeComplete } = await import('@/lib/db/garmin');
    const j = lireJourneeComplete();
    expect(j.activite).toEqual({
      pas: 8342, objectifPas: 10000, distanceM: 6200,
      kilocalories: 2450, kilocaloriesActives: 680, etagesMontes: 9,
    });
  });

  it('lit les minutes d’intensité du seul jour ancré — jamais additionnées à un autre jour', async () => {
    const { lireJourneeComplete } = await import('@/lib/db/garmin');
    const j = lireJourneeComplete();
    // moderate/vigorous sont déjà le cumul hebdomadaire Garmin (piège vérifié
    // sur les données réelles) : la ligne du 05/08 (269, 131 — autre semaine)
    // ne doit surtout pas s'ajouter à celle du 06/08.
    expect(j.minutesIntensite).toEqual({
      moderee: 66, vigoureuse: 34, objectifHebdo: 150,
    });
  });

  it('n’alimente pas objectifHebdo quand la colonne goal est nulle (cas réel observé en production)', async () => {
    const { lireJourneeComplete } = await import('@/lib/db/garmin');
    const j = lireJourneeComplete('2026-08-05');
    expect(j.minutesIntensite).toEqual({ moderee: 269, vigoureuse: 131, objectifHebdo: null });
  });

  it('lit le stress sans transformation', async () => {
    const { lireJourneeComplete } = await import('@/lib/db/garmin');
    const j = lireJourneeComplete();
    expect(j.stress).toEqual({ moyenne: 28, max: 71, qualificatif: 'BALANCED' });
  });

  it('lit respiration et SpO2 pour le jour ancré, tous deux présents', async () => {
    const { lireJourneeComplete } = await import('@/lib/db/garmin');
    const j = lireJourneeComplete();
    expect(j.respirationSpo2).toEqual({
      respirationReveil: 16.0, respirationSommeil: 14.1, respirationMin: 12.5, respirationMax: 20.0,
      spo2Moyen: 95, spo2Min: 90,
    });
  });

  it('arrondit l’âge de forme à une décimale', async () => {
    const { lireJourneeComplete } = await import('@/lib/db/garmin');
    const j = lireJourneeComplete();
    expect(j.ageDeForme).toEqual({ age: 32.4, ageChronologique: 29, ageAtteignable: 27.8 });
  });

  it('masque une section dont la table est entièrement vide (prédictions de course)', async () => {
    const { lireJourneeComplete } = await import('@/lib/db/garmin');
    const j = lireJourneeComplete();
    expect(j.predictionsCourse).toBeNull();
  });

  it('lit les prédictions de course quand la table est peuplée (tâche 31)', async () => {
    const { lireJourneeComplete } = await import('@/lib/db/garmin');
    const j = lireJourneeComplete('2026-08-05');
    expect(j.predictionsCourse).toEqual({
      temps5kSec: 1380, temps10kSec: 2880, tempsSemiSec: 6420, tempsMarathonSec: 13500,
    });
  });

  it('lit les verdicts training_readiness bruts (feedback_short, recovery_time, acwr_factor_feedback), tâche 31', async () => {
    const { lireJourneeComplete } = await import('@/lib/db/garmin');
    const j = lireJourneeComplete();
    expect(j.readinessFeedback).toBe('TAKE_IT_EASY');
    expect(j.readinessRecupMin).toBe(1080);
    expect(j.acwrFeedback).toBe('POOR');
  });

  it('renvoie des verdicts training_readiness nuls quand aucune ligne ne couvre la date', async () => {
    const { lireJourneeComplete } = await import('@/lib/db/garmin');
    const j = lireJourneeComplete('2026-08-01');
    expect(j.readinessFeedback).toBeNull();
    expect(j.readinessRecupMin).toBeNull();
    expect(j.acwrFeedback).toBeNull();
  });

  it('masque le sommeil détaillé pour le jour ancré : aucune ligne ce jour-là (montre non portée)', async () => {
    const { lireJourneeComplete } = await import('@/lib/db/garmin');
    const j = lireJourneeComplete();
    expect(j.sommeilDetaille).toBeNull();
  });

  it('convertit les stades de sommeil en heures pour un autre jour, sans planter malgré la SpO2 absente ce jour-là', async () => {
    const { lireJourneeComplete } = await import('@/lib/db/garmin');
    const j = lireJourneeComplete('2026-08-05');
    expect(j.date).toBe('2026-08-05');
    expect(j.sommeilDetaille).toEqual({
      profondH: expect.closeTo(6180 / 3600, 4),
      remH: expect.closeTo(5220 / 3600, 4),
      legerH: expect.closeTo(14220 / 3600, 4),
      reveils: 3, fcMoyenneSommeil: 52, spo2MoyenSommeil: 96, siesteMin: 15,
      feedback: 'POSITIVE_DEEP', insight: 'POSITIVE_STRESSFUL_DAY', besoinMin: 500,
    });
    // Sommeil présent le 05, mais aucune ligne SpO2 ce jour-là (seedée
    // uniquement pour le 06) : la lecture ne doit pas planter, et seule la
    // respiration (présente) doit ressortir, la SpO2 en null.
    expect(j.respirationSpo2).toEqual({
      respirationReveil: 15.2, respirationSommeil: 13.8, respirationMin: 12.0, respirationMax: 19.5,
      spo2Moyen: null, spo2Min: null,
    });
  });

  it('renvoie null pour une journée sans aucune donnée ancrable', async () => {
    const racineVide = mkdtempSync(join(tmpdir(), 'garmin-test-journee-vide-'));
    mkdirSync(join(racineVide, 'export'));
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(racineVide, 'export', 'garmin-ro.db'));
    db.exec(`
      CREATE TABLE training_readiness (calendar_date TEXT PRIMARY KEY);
      CREATE TABLE hrv (calendar_date TEXT PRIMARY KEY);
      CREATE TABLE sleep (calendar_date TEXT PRIMARY KEY);
      CREATE TABLE heart_rate (calendar_date TEXT PRIMARY KEY);
    `);
    db.close();
    const precedente = process.env.GARMIN_DATA_DIR;
    process.env.GARMIN_DATA_DIR = racineVide;
    try {
      const { lireJourneeComplete } = await import('@/lib/db/garmin');
      const j = lireJourneeComplete();
      expect(j).toEqual({
        date: null, bodyBattery: null, statutEntrainement: null, activite: null,
        minutesIntensite: null, stress: null, respirationSpo2: null,
        sommeilDetaille: null, predictionsCourse: null, ageDeForme: null,
        readinessFeedback: null, readinessRecupMin: null, acwrFeedback: null,
      });
    } finally {
      process.env.GARMIN_DATA_DIR = precedente;
      rmSync(racineVide, { recursive: true, force: true });
    }
  });
});

describe('lireStatsParSport : stats agrégées par sport Garmin (tâche 26, écran Séances)', () => {
  it('agrège nombre, km, durée, D+ et allure (course uniquement) par activity_type', async () => {
    const { lireStatsParSport } = await import('@/lib/db/garmin');
    const stats = lireStatsParSport();
    // Deux activités de la fixture (running, other) à égalité de nombre (1
    // chacune) : départage alphabétique par activity_type.
    expect(stats.map((s) => s.sport)).toEqual(['other', 'running']);

    const boxe = stats.find((s) => s.sport === 'other');
    // Boxe en salle : sans distance ni dénivelé connus, jamais fabriqués.
    expect(boxe).toMatchObject({ nombre: 1, kmTotal: null, deniveleM: null, allureSecKm: null });
    expect(boxe?.dureeTotaleMin).toBe(60);

    const course = stats.find((s) => s.sport === 'running');
    expect(course).toMatchObject({ nombre: 1, deniveleM: 37 });
    expect(course?.kmTotal).toBeCloseTo(4.0, 1);
    expect(course?.dureeTotaleMin).toBe(33);
    // Même formule que lireEfficaciteAerobie (allure = durée / distance).
    expect(course?.allureSecKm).toBeCloseTo(2003.3 / (4005.5 / 1000), 1);
  });

  it('exclut les activités sans activity_type connu (jamais de tuile sans libellé)', async () => {
    const racine = mkdtempSync(join(tmpdir(), 'garmin-test-stats-sport-sans-type-'));
    mkdirSync(join(racine, 'export'));
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(racine, 'export', 'garmin-ro.db'));
    db.exec(`CREATE TABLE activity (activity_id INTEGER PRIMARY KEY, start_time_local TEXT,
      activity_type TEXT, distance_meters REAL, duration_seconds REAL, elevation_gain REAL);
      INSERT INTO activity VALUES (1, '2026-08-05 08:00:00', NULL, 5000, 1800, 10);`);
    db.close();
    const precedente = process.env.GARMIN_DATA_DIR;
    process.env.GARMIN_DATA_DIR = racine;
    try {
      const { lireStatsParSport } = await import('@/lib/db/garmin');
      expect(lireStatsParSport()).toEqual([]);
    } finally {
      process.env.GARMIN_DATA_DIR = precedente;
      rmSync(racine, { recursive: true, force: true });
    }
  });

  it('renvoie un tableau vide, jamais une erreur, sur un instantané sans colonne elevation_gain', async () => {
    const racine = mkdtempSync(join(tmpdir(), 'garmin-test-stats-sport-sans-denivele-'));
    mkdirSync(join(racine, 'export'));
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(racine, 'export', 'garmin-ro.db'));
    db.exec(`CREATE TABLE activity (activity_id INTEGER PRIMARY KEY, start_time_local TEXT,
      activity_type TEXT, distance_meters REAL, duration_seconds REAL);
      INSERT INTO activity VALUES (1, '2026-08-05 08:00:00', 'running', 5000, 1800);`);
    db.close();
    const precedente = process.env.GARMIN_DATA_DIR;
    process.env.GARMIN_DATA_DIR = racine;
    try {
      const { lireStatsParSport } = await import('@/lib/db/garmin');
      expect(lireStatsParSport()).toEqual([]);
    } finally {
      process.env.GARMIN_DATA_DIR = precedente;
      rmSync(racine, { recursive: true, force: true });
    }
  });
});

describe('lireVo2maxRecent : dernière valeur non nulle d’activity.vo2max_value (tâche 31)', () => {
  it('lit la valeur de l’activité la plus récente qui en porte une', async () => {
    const { lireVo2maxRecent } = await import('@/lib/db/garmin');
    // Fixture : activité 1 (05/08, vo2max 41.0) plus récente que toute autre
    // activité porteuse d'un vo2max — activité 2 (boxe, 04/08) n'en a pas.
    expect(lireVo2maxRecent()).toEqual({ valeur: 41.0, date: '2026-08-05 19:01:04' });
  });

  it('renvoie null quand aucune activité ne porte de vo2max', async () => {
    const racine = mkdtempSync(join(tmpdir(), 'garmin-test-vo2max-vide-'));
    mkdirSync(join(racine, 'export'));
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(racine, 'export', 'garmin-ro.db'));
    db.exec(`CREATE TABLE activity (activity_id INTEGER PRIMARY KEY, start_time_local TEXT, vo2max_value REAL);
      INSERT INTO activity VALUES (1, '2026-08-05 08:00:00', NULL);`);
    db.close();
    const precedente = process.env.GARMIN_DATA_DIR;
    process.env.GARMIN_DATA_DIR = racine;
    try {
      const { lireVo2maxRecent } = await import('@/lib/db/garmin');
      expect(lireVo2maxRecent()).toBeNull();
    } finally {
      process.env.GARMIN_DATA_DIR = precedente;
      rmSync(racine, { recursive: true, force: true });
    }
  });
});

describe('lireZonesFcBornes : bornes BPM des zones Z1-Z5 (tâche 31)', () => {
  it('décode les planchers de zone et les 3 FC de référence depuis raw_json', async () => {
    const { lireZonesFcBornes } = await import('@/lib/db/garmin');
    expect(lireZonesFcBornes()).toEqual({
      z1Plancher: 101, z2Plancher: 121, z3Plancher: 141, z4Plancher: 161, z5Plancher: 181,
      fcMax: 201, fcRepos: 87, fcSeuilLactate: 175,
    });
  });

  it('renvoie null quand la table hr_zones est vide ou absente', async () => {
    const racine = mkdtempSync(join(tmpdir(), 'garmin-test-hrzones-vide-'));
    mkdirSync(join(racine, 'export'));
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(racine, 'export', 'garmin-ro.db'));
    db.exec(`CREATE TABLE activity (activity_id INTEGER PRIMARY KEY);`);
    db.close();
    const precedente = process.env.GARMIN_DATA_DIR;
    process.env.GARMIN_DATA_DIR = racine;
    try {
      const { lireZonesFcBornes } = await import('@/lib/db/garmin');
      expect(lireZonesFcBornes()).toBeNull();
    } finally {
      process.env.GARMIN_DATA_DIR = precedente;
      rmSync(racine, { recursive: true, force: true });
    }
  });
});

describe('lirePersonalRecords : records personnels rattachés à une activité et une date (tâche 31)', () => {
  it('ne renvoie que les records dont le type est traduit avec certitude, chronologique décroissant', async () => {
    const { lirePersonalRecords } = await import('@/lib/db/garmin');
    const records = lirePersonalRecords();
    // Type 12 (record agrégé sans date/activité) et type 99 (non couvert par
    // traduireTypeRecord) exclus — seuls les types 7 et 1 restent.
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({
      libelle: 'Plus longue sortie', nature: 'distance', valeur: 4005.52,
      date: '2026-08-05', activiteId: 1, activiteNom: 'Nyon - Base',
    });
    expect(records[1]).toEqual({
      libelle: '1 km', nature: 'temps', valeur: 405.23,
      date: '2026-08-05', activiteId: 1, activiteNom: 'Nyon - Base',
    });
  });
});

describe('lirePoids : mesures de poids, grammes convertis en kg (tâche 31)', () => {
  it('ne garde que la mesure la plus récente par date, kg arrondi à une décimale', async () => {
    const { lirePoids } = await import('@/lib/db/garmin');
    // Fixture : deux entrées le 17/07 (95000g puis 94800g, timestamp croissant)
    // — seule la plus récente (94800g = 94.8 kg) doit survivre.
    expect(lirePoids()).toEqual([{ date: '2026-07-17', kg: 94.8 }]);
  });

  it('renvoie un tableau vide quand la table weight est vide ou absente', async () => {
    const racine = mkdtempSync(join(tmpdir(), 'garmin-test-poids-vide-'));
    mkdirSync(join(racine, 'export'));
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(racine, 'export', 'garmin-ro.db'));
    db.exec(`CREATE TABLE activity (activity_id INTEGER PRIMARY KEY);`);
    db.close();
    const precedente = process.env.GARMIN_DATA_DIR;
    process.env.GARMIN_DATA_DIR = racine;
    try {
      const { lirePoids } = await import('@/lib/db/garmin');
      expect(lirePoids()).toEqual([]);
    } finally {
      process.env.GARMIN_DATA_DIR = precedente;
      rmSync(racine, { recursive: true, force: true });
    }
  });
});

describe('instantané Garmin absent', () => {
  it("lève une erreur explicite contenant le chemin quand l'instantané n'existe pas", async () => {
    const racineVide = mkdtempSync(join(tmpdir(), 'garmin-test-vide-'));
    const precedente = process.env.GARMIN_DATA_DIR;
    process.env.GARMIN_DATA_DIR = racineVide;
    try {
      const { ouvrirGarmin } = await import('@/lib/db/connection');
      expect(() => ouvrirGarmin()).toThrow(racineVide);
    } finally {
      process.env.GARMIN_DATA_DIR = precedente;
      rmSync(racineVide, { recursive: true, force: true });
    }
  });
});
