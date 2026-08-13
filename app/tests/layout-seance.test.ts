import { describe, it, expect } from 'vitest';
import {
  SECTIONS_SEANCE, appliquerLayoutSeance, defautPourSport,
} from '@/lib/layout-seance';

// Tâche 38 (templates de page de séance par sport) : transposition directe de
// layout-accueil.ts/tests (tâche 37) — `appliquerLayoutSeance` réutilise la
// même fusion tolérante (`fusionnerListe`, exportée de lib/layout-accueil.ts)
// que `appliquerLayout`, donc ses cas limites (id inconnu, doublon, entrée
// malformée, sauvegarde non-tableau) sont déjà couverts par
// tests/layout-accueil.test.ts. Ce fichier se concentre sur ce qui est
// spécifique à la séance : les six sections identifiables, et surtout les
// défauts PAR SPORT (`defautPourSport`), le cœur de cette tâche.
//
// Volontairement absente de `SECTIONS_SEANCE` : la section « photo+stats ».
// Comme la bannière de brouillons vocaux à l'accueil (lib/layout-accueil.ts),
// ce n'est pas une préférence d'affichage — c'est l'identité de la page,
// TOUJOURS en tête, jamais masquable ni réordonnable. app/seance/[id]/page.tsx
// la rend à part, avant d'itérer sur les sections du layout.

describe('SECTIONS_SEANCE : les sept sections configurables de la page séance', () => {
  it('liste exactement analyse, courbes, carte, splits-ressenti, zones, dynamique, radar', () => {
    expect(SECTIONS_SEANCE).toEqual(['analyse', 'courbes', 'carte', 'splits-ressenti', 'zones', 'dynamique', 'radar']);
  });

  it('n’inclut pas photo-stats — identité de la page, jamais une préférence', () => {
    expect(SECTIONS_SEANCE).not.toContain('photo-stats');
  });
});

describe('defautPourSport : course à pied / trail / tapis — ordre actuel de la page', () => {
  it.each(['running', 'trail_running', 'treadmill_running'])('%s : analyse, courbes, carte, splits, zones, dynamique, radar — tout visible', (type) => {
    const d = defautPourSport(type);
    expect(d.sections.map((s) => s.id)).toEqual(['analyse', 'courbes', 'carte', 'splits-ressenti', 'zones', 'dynamique', 'radar']);
    expect(d.sections.every((s) => s.visible)).toBe(true);
  });
});

describe('defautPourSport : randonnée / marche — la carte raconte l’histoire, elle passe en premier', () => {
  it.each(['hiking', 'walking'])('%s : carte d’abord (juste après photo+stats), puis analyse/courbes/splits/zones/radar', (type) => {
    const d = defautPourSport(type);
    expect(d.sections.map((s) => s.id)).toEqual(['carte', 'analyse', 'courbes', 'splits-ressenti', 'zones', 'dynamique', 'radar']);
    expect(d.sections.every((s) => s.visible)).toBe(true);
  });
});

describe('defautPourSport : boxe et sports manuels — ressenti d’abord, pas de carte, de courbe d’allure ni de radar', () => {
  it.each(['boxing', 'strength_training'])('%s : splits-ressenti en tête, carte/courbes/radar désactivés', (type) => {
    const d = defautPourSport(type);
    expect(d.sections[0]).toEqual({ id: 'splits-ressenti', visible: true });
    expect(d.sections.find((s) => s.id === 'carte')).toEqual({ id: 'carte', visible: false });
    expect(d.sections.find((s) => s.id === 'courbes')).toEqual({ id: 'courbes', visible: false });
    expect(d.sections.find((s) => s.id === 'radar')).toEqual({ id: 'radar', visible: false });
    // Les sections désactivées « pour l’intention » restent listées (pas
    // supprimées) : /reglages doit pouvoir les réactiver depuis cette liste.
    expect(d.sections.map((s) => s.id).sort()).toEqual([...SECTIONS_SEANCE].sort());
  });
});

describe('defautPourSport : sport inconnu ou « autre » — même ordre que course à pied', () => {
  it('un activity_type jamais vu reçoit l’ordre actuel de la page', () => {
    const d = defautPourSport('un-sport-jamais-vu');
    expect(d.sections.map((s) => s.id)).toEqual(['analyse', 'courbes', 'carte', 'splits-ressenti', 'zones', 'dynamique', 'radar']);
    expect(d.sections.every((s) => s.visible)).toBe(true);
  });

  it('type null : même repli que « autre »', () => {
    const d = defautPourSport(null);
    expect(d.sections.map((s) => s.id)).toEqual(['analyse', 'courbes', 'carte', 'splits-ressenti', 'zones', 'dynamique', 'radar']);
  });

  it('la casse n’a pas d’importance (HIKING doit tomber sur le défaut randonnée)', () => {
    expect(defautPourSport('HIKING').sections.map((s) => s.id))
      .toEqual(defautPourSport('hiking').sections.map((s) => s.id));
  });
});

describe('appliquerLayoutSeance : fusion tolérante (même moteur que appliquerLayout)', () => {
  it('renvoie le défaut tel quel quand la sauvegarde est null', () => {
    const defaut = defautPourSport('running');
    expect(appliquerLayoutSeance(defaut, null)).toEqual(defaut);
  });

  it('renvoie le défaut tel quel quand la sauvegarde n’est pas un objet', () => {
    const defaut = defautPourSport('running');
    expect(appliquerLayoutSeance(defaut, 'texte' as unknown)).toEqual(defaut);
  });

  it('respecte l’ordre et la visibilité sauvegardés quand tous les ids sont connus', () => {
    const defaut = defautPourSport('running');
    const sauvegarde = {
      sections: [
        { id: 'carte', visible: true },
        { id: 'analyse', visible: false },
        { id: 'courbes', visible: true },
        { id: 'splits-ressenti', visible: true },
        { id: 'zones', visible: true },
        { id: 'dynamique', visible: true },
        { id: 'radar', visible: true },
      ],
    };
    const r = appliquerLayoutSeance(defaut, sauvegarde);
    expect(r.sections.map((s) => s.id)).toEqual(['carte', 'analyse', 'courbes', 'splits-ressenti', 'zones', 'dynamique', 'radar']);
    expect(r.sections.find((s) => s.id === 'analyse')?.visible).toBe(false);
  });

  it('ignore un id de section inconnu et ajoute en fin les ids manquants du défaut', () => {
    const defaut = defautPourSport('running');
    const sauvegarde = { sections: [{ id: 'section-fantome', visible: true }, { id: 'carte', visible: true }] };
    const r = appliquerLayoutSeance(defaut, sauvegarde);
    expect(r.sections.map((s) => s.id)).not.toContain('section-fantome');
    expect(r.sections).toHaveLength(7);
    expect(r.sections[0]).toEqual({ id: 'carte', visible: true });
  });

  it('une sauvegarde antérieure à la tâche 40 (sans « radar ») le reçoit en fin de liste, visible', () => {
    // Cas réel visé par la spec (« fusion tolérante ... le comportement
    // d'appliquerLayoutSeance doit déjà le faire ») : une préférence écrite
    // avant l'ajout de cette section ne porte pas d'entrée 'radar' du tout —
    // pas malformée, juste incomplète au regard du nouveau défaut.
    const defaut = defautPourSport('running');
    const sauvegarde = {
      sections: [
        { id: 'dynamique', visible: true },
        { id: 'zones', visible: false },
        { id: 'splits-ressenti', visible: true },
        { id: 'carte', visible: true },
        { id: 'courbes', visible: true },
        { id: 'analyse', visible: true },
      ],
    };
    const r = appliquerLayoutSeance(defaut, sauvegarde);
    expect(r.sections).toHaveLength(7);
    expect(r.sections[r.sections.length - 1]).toEqual({ id: 'radar', visible: true });
  });
});
