import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normaliseurPour } from '@/lib/preferences-registre';
import { LAYOUT_PAR_DEFAUT, appliquerLayout } from '@/lib/layout-accueil';
import { appliquerLayoutSeance, defautPourSport } from '@/lib/layout-seance';
import { LAYOUT_HISTORIQUE_PAR_DEFAUT, appliquerLayoutHistorique } from '@/lib/layout-historique';
import { LAYOUT_SEANCES_PAR_DEFAUT, appliquerLayoutSeances } from '@/lib/layout-seances';
import { appliquerDensite } from '@/lib/densite';
import { appliquerFenetre } from '@/lib/fenetre-temporelle';
import { appliquerSeriesCourbe } from '@/lib/series-courbe';

// Tâche 46 (export/import JSON des préférences, gisement G5 du rapport
// d'audit B1) : lib/preferences-registre.ts est la SEULE source de vérité
// pour l'export ET l'import. Ce fichier vérifie (1) qu'il reste synchronisé
// avec les clés RÉELLEMENT écrites par app/actions.ts — en relisant le
// fichier source plutôt qu'une liste recopiée à la main, pour qu'une
// nouvelle préférence oubliée au registre casse ce test plutôt que de
// devenir un trou d'export silencieux — et (2) que chaque normaliseur
// délègue bien à la fusion tolérante déjà exportée par son moteur de layout,
// sans réimplémenter de logique.

const SOURCE_ACTIONS = readFileSync(resolve(__dirname, '../app/actions.ts'), 'utf-8');

// Les clés à clé FIXE sous liste unique ('historique', 'seances') ne sont pas
// passées à `ecrirePreference` directement dans leurs actions exportées : un
// cœur générique (`deplacerDansListe`/`basculerDansListe`, tâche 45) reçoit la
// clé en premier argument et appelle `ecrirePreference(cle, ...)` avec une
// VARIABLE — donc aussi chercher les clés littérales passées à ces deux
// fonctions (et à `lirePreference`/`supprimerPreference`, couverts par les
// mêmes call sites) plutôt que seulement à `ecrirePreference`.
const APPELS_AVEC_CLE = ['lirePreference', 'ecrirePreference', 'supprimerPreference', 'deplacerDansListe', 'basculerDansListe'];

function clesLitteralesEcrites(): string[] {
  const cles = new Set<string>();
  const motif = new RegExp(`(?:${APPELS_AVEC_CLE.join('|')})\\(\\s*'([^']+)'`, 'g');
  let m: RegExpExecArray | null;
  while ((m = motif.exec(SOURCE_ACTIONS))) cles.add(m[1]);
  return [...cles];
}

describe('REGISTRE_PREFERENCES : synchronisé avec app/actions.ts', () => {
  it('résout chaque clé littérale passée à ecrirePreference dans actions.ts', () => {
    const cles = clesLitteralesEcrites();
    // Garde-fou du test lui-même : si ce grep ne trouve plus rien, le test
    // passerait à vide sans jamais échouer — vérifie qu'il trouve bien les
    // clés connues à ce jour.
    expect(cles).toEqual(expect.arrayContaining(['accueil', 'visuels', 'historique', 'seances', 'densite', 'fenetre_jours']));
    for (const cle of cles) {
      expect(normaliseurPour(cle), `clé '${cle}' écrite par actions.ts mais absente du registre`).toBeDefined();
    }
  });

  it('couvre la famille dynamique seance:<sport> (ecrirePreference(cleSeance(sport), ...))', () => {
    expect(SOURCE_ACTIONS).toMatch(/ecrirePreference\(cleSeance\(sport\)/);
    expect(normaliseurPour('seance:running')).toBeDefined();
    expect(normaliseurPour('seance:boxing')).toBeDefined();
  });

  it('couvre la famille dynamique courbes:<sport> (ecrirePreference(cleCourbes(sport), ...), tâche 48)', () => {
    expect(SOURCE_ACTIONS).toMatch(/ecrirePreference\(cleCourbes\(sport\)/);
    expect(normaliseurPour('courbes:running')).toBeDefined();
    expect(normaliseurPour('courbes:boxing')).toBeDefined();
  });
});

describe('normaliseurPour : résolution des clés', () => {
  it('renvoie undefined pour une clé hors registre', () => {
    expect(normaliseurPour('inconnue')).toBeUndefined();
    expect(normaliseurPour('')).toBeUndefined();
    expect(normaliseurPour('seances-x')).toBeUndefined();
  });

  it('renvoie undefined pour un préfixe seance: avec un suffixe invalide', () => {
    expect(normaliseurPour('seance:')).toBeUndefined();
    expect(normaliseurPour('seance:Boxe!')).toBeUndefined();
    expect(normaliseurPour('seance:avec espace')).toBeUndefined();
  });

  it('résout seance:<sport> pour un suffixe valide (lettres/chiffres/soulignés)', () => {
    expect(normaliseurPour('seance:hiking')).toBeDefined();
    expect(normaliseurPour('seance:trail_running')).toBeDefined();
  });
});

describe("normaliseurPour('accueil') : réutilise appliquerLayout", () => {
  it('normalise une sauvegarde partielle vers le layout complet fusionné', () => {
    const n = normaliseurPour('accueil')!;
    const sauvegarde = { heros: 'stress' };
    expect(n(sauvegarde)).toEqual(appliquerLayout(LAYOUT_PAR_DEFAUT, sauvegarde));
  });

  it('replie sur le défaut exact pour une valeur non-objet', () => {
    const n = normaliseurPour('accueil')!;
    expect(n('n-importe-quoi')).toEqual(LAYOUT_PAR_DEFAUT);
    expect(n(null)).toEqual(LAYOUT_PAR_DEFAUT);
  });
});

describe("normaliseurPour('seance:<sport>') : réutilise appliquerLayoutSeance + defautPourSport", () => {
  it('normalise selon le défaut du sport encodé dans la clé', () => {
    const n = normaliseurPour('seance:hiking')!;
    const sauvegarde = { sections: [{ id: 'analyse', visible: false }] };
    expect(n(sauvegarde)).toEqual(appliquerLayoutSeance(defautPourSport('hiking'), sauvegarde));
  });

  it('deux sports différents produisent des défauts différents (carte en tête en rando)', () => {
    const n = normaliseurPour('seance:hiking')!;
    const resultat = n(null) as { sections: { id: string }[] };
    expect(resultat.sections[0].id).toBe('carte');
  });
});

describe("normaliseurPour('courbes:<sport>') : réutilise appliquerSeriesCourbe (tâche 48)", () => {
  it('normalise vers au plus deux séries connues, quel que soit le sport encodé dans la clé', () => {
    const n = normaliseurPour('courbes:running')!;
    const sauvegarde = ['cadence', 'inconnue', 'altitude', 'puissance'];
    expect(n(sauvegarde)).toEqual(appliquerSeriesCourbe(sauvegarde));
    expect(n(sauvegarde)).toEqual(['cadence', 'altitude']);
  });

  it('replie sur [] pour une sauvegarde absente ou mal formée', () => {
    const n = normaliseurPour('courbes:hiking')!;
    expect(n(null)).toEqual([]);
    expect(n('cadence')).toEqual([]);
  });

  it('rejette un préfixe courbes: avec un suffixe invalide', () => {
    expect(normaliseurPour('courbes:')).toBeUndefined();
    expect(normaliseurPour('courbes:Boxe!')).toBeUndefined();
    expect(normaliseurPour('courbes:avec espace')).toBeUndefined();
  });
});

describe("normaliseurPour('historique'|'seances'|'densite')", () => {
  it("'historique' réutilise appliquerLayoutHistorique", () => {
    const n = normaliseurPour('historique')!;
    const sauvegarde = { sections: [{ id: 'records', visible: false }] };
    expect(n(null)).toEqual(LAYOUT_HISTORIQUE_PAR_DEFAUT);
    expect(n(sauvegarde)).toEqual(appliquerLayoutHistorique(LAYOUT_HISTORIQUE_PAR_DEFAUT, sauvegarde));
  });

  it("'seances' réutilise appliquerLayoutSeances", () => {
    const n = normaliseurPour('seances')!;
    const sauvegarde = { sections: [{ id: 'stats-par-sport', visible: false }] };
    expect(n(null)).toEqual(LAYOUT_SEANCES_PAR_DEFAUT);
    expect(n(sauvegarde)).toEqual(appliquerLayoutSeances(LAYOUT_SEANCES_PAR_DEFAUT, sauvegarde));
  });

  it("'densite' réutilise appliquerDensite", () => {
    const n = normaliseurPour('densite')!;
    expect(n('compacte')).toBe('compacte');
    expect(n('inconnue')).toBe(appliquerDensite('inconnue'));
  });
});

describe("normaliseurPour('fenetre_jours') : réutilise appliquerFenetre (tâche 47)", () => {
  it('reprend une valeur connue et replie sur le défaut pour une valeur inconnue', () => {
    const n = normaliseurPour('fenetre_jours')!;
    expect(n(14)).toBe(14);
    expect(n(21)).toBe(appliquerFenetre(21));
    expect(n(null)).toBe(7);
  });
});

describe("normaliseurPour('visuels') : creux, jamais de défaut fabriqué", () => {
  it('ne garde qu’une tuile connue dont la variante est compatible', () => {
    const n = normaliseurPour('visuels')!;
    const resultat = n({
      pas: 'barres-7j', // cumulative : compatible
      hrv: 'jauge', // hrv n'a pas d'objectif réel : incompatible
      inconnue: 'chiffre', // tuile inconnue
      readiness: 'courbe-section', // mesure de tendance : compatible
    });
    expect(resultat).toEqual({ pas: 'barres-7j', readiness: 'courbe-section' });
  });

  it('renvoie un objet vide pour une sauvegarde vide, non-objet ou null', () => {
    const n = normaliseurPour('visuels')!;
    expect(n(null)).toEqual({});
    expect(n('texte')).toEqual({});
    expect(n({})).toEqual({});
  });
});
