import { describe, it, expect } from 'vitest';
import {
  genererLibelle, sportCorrespond, calculerAvancementSemaine, lundiDeLaSemaine, semaineIso,
  formaterAvancement,
} from '@/lib/objectifs';
import type { SeanceUnifiee } from '@/lib/fusion';

function seance(partiel: Partial<SeanceUnifiee>): SeanceUnifiee {
  return {
    cle: partiel.cle ?? 'x', date: partiel.date ?? '2026-08-10', nom: partiel.nom ?? 'Séance',
    sport: partiel.sport ?? null, sousType: partiel.sousType ?? null,
    distanceM: partiel.distanceM ?? null, dureeMin: partiel.dureeMin ?? null,
    fcMoy: partiel.fcMoy ?? null, effetAerobie: partiel.effetAerobie ?? null,
    rpe: partiel.rpe ?? null, garminId: partiel.garminId ?? null,
  };
}

describe('genererLibelle', () => {
  it('accorde séance/séances selon la cible', () => {
    expect(genererLibelle('boxe', 'seances_par_semaine', 1)).toBe('1 séance de boxe par semaine');
    expect(genererLibelle('boxe', 'seances_par_semaine', 2)).toBe('2 séances de boxe par semaine');
  });

  it('km_par_semaine ne pluralise jamais l unité', () => {
    expect(genererLibelle('course', 'km_par_semaine', 15)).toBe('15 km de course par semaine');
    expect(genererLibelle('course', 'km_par_semaine', 1)).toBe('1 km de course par semaine');
  });

  it('accorde minute/minutes selon la cible', () => {
    expect(genererLibelle('randonnee', 'minutes_par_semaine', 1)).toBe('1 minute de randonnée par semaine');
    expect(genererLibelle('randonnee', 'minutes_par_semaine', 90)).toBe('90 minutes de randonnée par semaine');
  });

  it('sport "tous" omet la mention du sport', () => {
    expect(genererLibelle('tous', 'seances_par_semaine', 4)).toBe('4 séances par semaine');
  });

  it('écrit une cible décimale en notation française (virgule)', () => {
    expect(genererLibelle('course', 'km_par_semaine', 12.5)).toBe('12,5 km de course par semaine');
  });
});

describe('sportCorrespond', () => {
  it('"tous" matche n importe quel sport, y compris null', () => {
    expect(sportCorrespond('tous', 'running')).toBe(true);
    expect(sportCorrespond('tous', null)).toBe(true);
  });

  it('"boxe" matche le sport manuel "boxe" et l activity_type Garmin "boxing", insensible à la casse', () => {
    expect(sportCorrespond('boxe', 'boxe')).toBe(true);
    expect(sportCorrespond('boxe', 'Boxe')).toBe(true);
    expect(sportCorrespond('boxe', 'boxing')).toBe(true);
    expect(sportCorrespond('boxe', 'autre')).toBe(false);
  });

  it('"course" matche les activity_type Garmin de course', () => {
    expect(sportCorrespond('course', 'running')).toBe(true);
    expect(sportCorrespond('course', 'trail_running')).toBe(true);
    expect(sportCorrespond('course', 'treadmill_running')).toBe(true);
    expect(sportCorrespond('course', 'walking')).toBe(false);
  });

  it('"randonnee" matche hiking/walking', () => {
    expect(sportCorrespond('randonnee', 'hiking')).toBe(true);
    expect(sportCorrespond('randonnee', 'walking')).toBe(true);
    expect(sportCorrespond('randonnee', 'running')).toBe(false);
  });

  it('sport null ne matche aucune catégorie hors "tous"', () => {
    expect(sportCorrespond('boxe', null)).toBe(false);
    expect(sportCorrespond('course', null)).toBe(false);
  });
});

describe('calculerAvancementSemaine', () => {
  const semaine = { lundi: '2026-08-10', dimanche: '2026-08-16' };

  it('compte les séances du bon sport dans la semaine (seances_par_semaine)', () => {
    const seances = [
      seance({ date: '2026-08-11', sport: 'boxe' }),
      seance({ date: '2026-08-13', sport: 'boxe' }),
      seance({ date: '2026-08-14', sport: 'autre' }), // mauvais sport
      seance({ date: '2026-08-09', sport: 'boxe' }), // hors semaine (avant lundi)
    ];
    expect(calculerAvancementSemaine(seances, { sport: 'boxe', type: 'seances_par_semaine' }, semaine.lundi, semaine.dimanche)).toBe(2);
  });

  it('renvoie 0 (compte réel, pas fabriqué) quand rien ne matche dans la semaine', () => {
    expect(calculerAvancementSemaine([], { sport: 'boxe', type: 'seances_par_semaine' }, semaine.lundi, semaine.dimanche)).toBe(0);
  });

  it('somme les distances en km, arrondi à une décimale (km_par_semaine)', () => {
    const seances = [
      seance({ date: '2026-08-11', sport: 'running', distanceM: 5234 }),
      seance({ date: '2026-08-13', sport: 'trail_running', distanceM: 3000 }),
    ];
    expect(calculerAvancementSemaine(seances, { sport: 'course', type: 'km_par_semaine' }, semaine.lundi, semaine.dimanche)).toBe(8.2);
  });

  it('ignore une distance absente (jamais une erreur, contribue 0)', () => {
    const seances = [seance({ date: '2026-08-11', sport: 'boxe', distanceM: null })];
    expect(calculerAvancementSemaine(seances, { sport: 'boxe', type: 'km_par_semaine' }, semaine.lundi, semaine.dimanche)).toBe(0);
  });

  it('somme les minutes, arrondi à l entier (minutes_par_semaine)', () => {
    const seances = [
      seance({ date: '2026-08-11', sport: 'boxe', dureeMin: 60 }),
      seance({ date: '2026-08-13', sport: 'boxe', dureeMin: 45.4 }),
    ];
    expect(calculerAvancementSemaine(seances, { sport: 'boxe', type: 'minutes_par_semaine' }, semaine.lundi, semaine.dimanche)).toBe(105);
  });

  it('"tous" compte toutes les séances de la semaine, peu importe le sport', () => {
    const seances = [
      seance({ date: '2026-08-11', sport: 'boxe' }),
      seance({ date: '2026-08-12', sport: 'running' }),
      seance({ date: '2026-08-13', sport: null }),
    ];
    expect(calculerAvancementSemaine(seances, { sport: 'tous', type: 'seances_par_semaine' }, semaine.lundi, semaine.dimanche)).toBe(3);
  });

  it('les bornes lundi/dimanche sont incluses', () => {
    const seances = [
      seance({ date: '2026-08-10', sport: 'boxe' }), // lundi, inclus
      seance({ date: '2026-08-16', sport: 'boxe' }), // dimanche, inclus
      seance({ date: '2026-08-17', sport: 'boxe' }), // lundi suivant, exclu
    ];
    expect(calculerAvancementSemaine(seances, { sport: 'boxe', type: 'seances_par_semaine' }, semaine.lundi, semaine.dimanche)).toBe(2);
  });
});

describe('lundiDeLaSemaine / semaineIso', () => {
  it('renvoie le lundi de la semaine ISO, y compris pour un dimanche', () => {
    expect(lundiDeLaSemaine('2026-08-13')).toBe('2026-08-10'); // jeudi -> lundi de la même semaine
    expect(lundiDeLaSemaine('2026-08-16')).toBe('2026-08-10'); // dimanche -> lundi de la même semaine
    expect(lundiDeLaSemaine('2026-08-10')).toBe('2026-08-10'); // lundi -> lui-même
  });

  it('semaineIso renvoie les bornes lundi-dimanche', () => {
    expect(semaineIso('2026-08-13')).toEqual({ lundi: '2026-08-10', dimanche: '2026-08-16' });
  });
});

describe('formaterAvancement', () => {
  it('séances : pas d unité, gabarit "X sur N cette semaine"', () => {
    expect(formaterAvancement(1, 2, 'seances_par_semaine')).toBe('1 sur 2 cette semaine');
  });

  it('km : unité "km" des deux côtés', () => {
    expect(formaterAvancement(8.2, 15, 'km_par_semaine')).toBe('8,2 km sur 15 km cette semaine');
  });

  it('minutes : unité "min" des deux côtés', () => {
    expect(formaterAvancement(45, 90, 'minutes_par_semaine')).toBe('45 min sur 90 min cette semaine');
  });

  it('0 sur N est un résultat légitime (compte réel, pas un zéro fabriqué)', () => {
    expect(formaterAvancement(0, 2, 'seances_par_semaine')).toBe('0 sur 2 cette semaine');
  });
});
