import { describe, it, expect } from 'vitest';
import {
  allureSecParKm, formaterAllure, formaterDateHeureSeance, formaterDureeCourse,
  formaterDateLongueFr, formaterHeureCourte, formaterDateHeureCourte, formaterDureeHeuresMinutes,
  numeroSemaineIso, traduireSport,
} from '@/lib/formatage';

describe('formaterDureeCourse : secondes vers h:mm:ss / m:ss', () => {
  it('formate en m:ss sous l’heure, sans zéro de tête sur les minutes', () => {
    expect(formaterDureeCourse(1522)).toBe('25:22');
    expect(formaterDureeCourse(325)).toBe('5:25');
  });

  it('formate en h:mm:ss au-delà d’une heure, minutes et secondes sur deux chiffres', () => {
    expect(formaterDureeCourse(5719)).toBe('1:35:19');
    expect(formaterDureeCourse(3600)).toBe('1:00:00');
  });

  it('renvoie un tiret pour une valeur absente, jamais 0:00', () => {
    expect(formaterDureeCourse(null)).toBe('—');
  });
});

describe('allureSecParKm : allure moyenne à partir de durée et distance (tâche 20)', () => {
  it('calcule l’allure en secondes par kilomètre', () => {
    // 33 min (1980 s) sur 4 km → 8:15 /km = 495 s/km.
    expect(allureSecParKm(1980, 4000)).toBe(495);
  });

  it('renvoie null quand la distance est nulle ou absente (jamais une division par zéro)', () => {
    expect(allureSecParKm(1980, 0)).toBeNull();
    expect(allureSecParKm(1980, null)).toBeNull();
  });

  it('renvoie null quand la durée est absente', () => {
    expect(allureSecParKm(null, 4000)).toBeNull();
  });
});

describe('formaterAllure : secondes par kilomètre vers m:ss /km', () => {
  it('formate sans zéro de tête sur les minutes', () => {
    expect(formaterAllure(495)).toBe('8:15 /km');
    expect(formaterAllure(305)).toBe('5:05 /km');
  });

  it('renvoie un tiret pour une valeur absente', () => {
    expect(formaterAllure(null)).toBe('—');
  });
});

describe('formaterDateHeureSeance : en-tête de la page de détail (tâche 20)', () => {
  it('formate date et heure au format court JJ.MM.AAAA · HH:MM', () => {
    expect(formaterDateHeureSeance('2026-08-05 19:01:04')).toBe('05.08.2026 · 19:01');
  });

  it('se rabat sur la date seule si l’heure est absente', () => {
    expect(formaterDateHeureSeance('2026-08-05')).toBe('05.08.2026');
  });
});

describe('formaterDateLongueFr : label du rapport du matin (design Cadence, tâche 21)', () => {
  it('formate en date longue française, capitalisée', () => {
    // 2026-08-09 est un dimanche.
    expect(formaterDateLongueFr('2026-08-09')).toBe('Dimanche 9 août 2026');
  });
});

describe('formaterHeureCourte : pastille de synchro du header (tâche 21 ; fuseau explicite tâche 49)', () => {
  // Epochs UTC fixes (Date.UTC), jamais `new Date(an, mois, jour, h, m)` (heure
  // LOCALE du poste qui exécute les tests, cf. régression tâche 49 — un epoch
  // fixe est la seule façon de vérifier une conversion vers un fuseau EXPLICITE
  // indépendamment du fuseau de la machine qui fait tourner vitest).
  it('formate un epoch UTC en heure murale Europe/Zurich HH:MM (été, CEST UTC+2)', () => {
    // 2026-08-09T06:05:00Z = 08:05 Europe/Zurich.
    expect(formaterHeureCourte(new Date(Date.UTC(2026, 7, 9, 6, 5)))).toBe('08:05');
    // 2026-08-09T21:59:00Z = 23:59 Europe/Zurich.
    expect(formaterHeureCourte(new Date(Date.UTC(2026, 7, 9, 21, 59)))).toBe('23:59');
  });

  it('formate un epoch UTC en heure murale Europe/Zurich HH:MM (hiver, CET UTC+1)', () => {
    // 2026-01-15T07:05:00Z = 08:05 Europe/Zurich.
    expect(formaterHeureCourte(new Date(Date.UTC(2026, 0, 15, 7, 5)))).toBe('08:05');
  });

  it('passe minuit sans le bug ICU "24:00" (hourCycle h23)', () => {
    // 2026-08-09T22:00:00Z = 2026-08-10T00:00 Europe/Zurich (CEST, UTC+2).
    expect(formaterHeureCourte(new Date(Date.UTC(2026, 7, 9, 22, 0)))).toBe('00:00');
  });
});

describe('formaterDateHeureCourte : méta du panneau Analyse — Claude (tâche 24 ; fuseau explicite tâche 49)', () => {
  it('formate un epoch UTC en date + heure murales Europe/Zurich JJ.MM · HH:MM', () => {
    // 2026-08-09T06:05:00Z = 09.08 · 08:05 Europe/Zurich (CEST, UTC+2).
    expect(formaterDateHeureCourte(new Date(Date.UTC(2026, 7, 9, 6, 5)))).toBe('09.08 · 08:05');
  });

  it('bascule le jour affiché quand le fuseau fait passer minuit', () => {
    // 2026-08-09T22:00:00Z = 10.08 · 00:00 Europe/Zurich (CEST, UTC+2).
    expect(formaterDateHeureCourte(new Date(Date.UTC(2026, 7, 9, 22, 0)))).toBe('10.08 · 00:00');
  });
});

describe('formaterDureeHeuresMinutes : bande de mesures Cadence (tâche 21)', () => {
  it('formate des secondes en durée courte XhYY', () => {
    expect(formaterDureeHeuresMinutes(7 * 3600 + 42 * 60)).toBe('7h42');
    expect(formaterDureeHeuresMinutes(3600)).toBe('1h00');
  });

  it('renvoie null pour une valeur absente, jamais un texte fabriqué', () => {
    expect(formaterDureeHeuresMinutes(null)).toBeNull();
  });
});

describe('traduireSport : libellés français des activity_type Garmin (tâche 22)', () => {
  it('traduit les types vérifiés, sans tenir compte de la casse', () => {
    expect(traduireSport('running')).toBe('course');
    expect(traduireSport('HIKING')).toBe('randonnée');
    expect(traduireSport('trail_running')).toBe('trail');
  });

  it('rend lisible un type inconnu sans inventer de traduction', () => {
    expect(traduireSport('stand_up_paddleboarding')).toBe('stand up paddleboarding');
  });

  it('laisse passer null (jamais de libellé fabriqué)', () => {
    expect(traduireSport(null)).toBeNull();
  });
});

describe('numeroSemaineIso : label « SEMAINE n » de l’écran Historique (tâche 21)', () => {
  it('calcule le numéro de semaine ISO 8601', () => {
    expect(numeroSemaineIso('2026-08-09')).toBe(32);
    // 1er janvier 2026 est un jeudi → semaine 1.
    expect(numeroSemaineIso('2026-01-01')).toBe(1);
    // 31 décembre 2025 est un mercredi, dans la semaine 1 de 2026 (le jeudi
    // suivant, 1er janvier, appartient à cette même semaine ISO).
    expect(numeroSemaineIso('2025-12-31')).toBe(1);
  });
});
