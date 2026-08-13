import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Les server actions de saisie (app/actions.ts) valident la FormData avant
// tout appel d'écriture : ces tests vérifient que le rejet est réel (rien en
// base) et pas seulement un message affiché en façade, et que rien n'est
// jamais silencieusement transformé en `null`/0 pour une valeur invalide
// (un champ absent, lui, a le droit de rester `null` — voir lib/db/training.ts).

// `basculerObjectif`/`retirerObjectif` (tâche 43) appellent `revalidatePath`
// (comme les actions de /reglages) : hors du runtime Next, il n'y a pas de
// « static generation store » — même point mort que tests/export-import-config.test.ts.
// Neutralisé ici plutôt que dans le code de production, qui n'a pas besoin de le savoir.
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

let racine: string;

beforeEach(async () => {
  racine = mkdtempSync(join(tmpdir(), 'actions-test-'));
  process.env.GARMIN_DATA_DIR = racine;
  const { initialiserSchema } = await import('@/lib/db/schema');
  initialiserSchema();
});

afterAll(() => rmSync(racine, { recursive: true, force: true }));

/** `redirect()` de next/navigation lève une erreur de contrôle de flux dont le
 *  `digest` encode la destination (cf. node_modules/next/dist/client/components/
 *  redirect.js) — c'est la façon normale de vérifier un succès en dehors du
 *  runtime Next, sans avoir à instancier une vraie requête. */
async function destinationRedirection(appel: () => Promise<unknown>): Promise<string> {
  try {
    await appel();
  } catch (e) {
    const digest = (e as { digest?: string }).digest ?? '';
    if (digest.startsWith('NEXT_REDIRECT')) return digest.split(';')[2];
    throw e;
  }
  throw new Error('attendu : une redirection, aucune n a été levée');
}

function formData(champs: Record<string, string>): FormData {
  const f = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) f.append(cle, valeur);
  return f;
}

describe('soumettreSeance : validation avant écriture', () => {
  it('enregistre une séance valide et redirige vers /historique', async () => {
    const { soumettreSeance } = await import('@/app/actions');
    const { lireSeancesManuelles } = await import('@/lib/db/training');

    const destination = await destinationRedirection(() =>
      soumettreSeance({ erreur: null }, formData({
        date: '2026-08-06', sport: 'boxe', sousType: 'sparring',
        dureeMin: '90', rpe: '8', garminActivityId: '2',
      })));

    expect(destination).toBe('/historique');
    const [s] = lireSeancesManuelles();
    expect(s).toMatchObject({ date: '2026-08-06', sport: 'boxe', dureeMin: 90, rpe: 8, garminActivityId: 2 });
  });

  it('accepte une séance sans champs facultatifs : null, jamais 0', async () => {
    const { soumettreSeance } = await import('@/app/actions');
    const { lireSeancesManuelles } = await import('@/lib/db/training');

    await destinationRedirection(() =>
      soumettreSeance({ erreur: null }, formData({ date: '2026-08-06', sport: 'autre' })));

    const [s] = lireSeancesManuelles();
    expect(s.rpe).toBeNull();
    expect(s.dureeMin).toBeNull();
    expect(s.garminActivityId).toBeNull();
  });

  it('rejette une date au mauvais format sans rien écrire', async () => {
    const { soumettreSeance } = await import('@/app/actions');
    const { lireSeancesManuelles } = await import('@/lib/db/training');

    const etat = await soumettreSeance({ erreur: null }, formData({ date: '06/08/2026', sport: 'boxe' }));

    expect(etat.erreur).toMatch(/date/i);
    expect(lireSeancesManuelles()).toHaveLength(0);
  });

  it('rejette une date calendaire inexistante (2026-02-31)', async () => {
    const { soumettreSeance } = await import('@/app/actions');
    const { lireSeancesManuelles } = await import('@/lib/db/training');

    const etat = await soumettreSeance({ erreur: null }, formData({ date: '2026-02-31', sport: 'boxe' }));

    expect(etat.erreur).toMatch(/date/i);
    expect(lireSeancesManuelles()).toHaveLength(0);
  });

  it('rejette un sport hors liste', async () => {
    const { soumettreSeance } = await import('@/app/actions');
    const { lireSeancesManuelles } = await import('@/lib/db/training');

    const etat = await soumettreSeance({ erreur: null },
      formData({ date: '2026-08-06', sport: 'natation' }));

    expect(etat.erreur).toMatch(/sport/i);
    expect(lireSeancesManuelles()).toHaveLength(0);
  });

  it('rejette un RPE hors bornes (0 et 11) sans jamais l écrire', async () => {
    const { soumettreSeance } = await import('@/app/actions');
    const { lireSeancesManuelles } = await import('@/lib/db/training');

    for (const rpe of ['0', '11']) {
      const etat = await soumettreSeance({ erreur: null },
        formData({ date: '2026-08-06', sport: 'boxe', rpe }));
      expect(etat.erreur).toMatch(/rpe/i);
    }
    expect(lireSeancesManuelles()).toHaveLength(0);
  });

  it('rejette un RPE non numérique plutôt que de le ramener à null', async () => {
    const { soumettreSeance } = await import('@/app/actions');
    const { lireSeancesManuelles } = await import('@/lib/db/training');

    const etat = await soumettreSeance({ erreur: null },
      formData({ date: '2026-08-06', sport: 'boxe', rpe: 'beaucoup' }));

    expect(etat.erreur).toMatch(/rpe/i);
    expect(lireSeancesManuelles()).toHaveLength(0);
  });

  it('rejette un RPE décimal', async () => {
    const { soumettreSeance } = await import('@/app/actions');
    const { lireSeancesManuelles } = await import('@/lib/db/training');

    const etat = await soumettreSeance({ erreur: null },
      formData({ date: '2026-08-06', sport: 'boxe', rpe: '7.5' }));

    expect(etat.erreur).toMatch(/rpe/i);
    expect(lireSeancesManuelles()).toHaveLength(0);
  });

  it('rejette une durée hors bornes (0 et 601)', async () => {
    const { soumettreSeance } = await import('@/app/actions');
    const { lireSeancesManuelles } = await import('@/lib/db/training');

    for (const dureeMin of ['0', '601']) {
      const etat = await soumettreSeance({ erreur: null },
        formData({ date: '2026-08-06', sport: 'boxe', dureeMin }));
      expect(etat.erreur).toMatch(/durée/i);
    }
    expect(lireSeancesManuelles()).toHaveLength(0);
  });

  it('rejette un identifiant d activité Garmin non positif', async () => {
    const { soumettreSeance } = await import('@/app/actions');
    const { lireSeancesManuelles } = await import('@/lib/db/training');

    const etat = await soumettreSeance({ erreur: null },
      formData({ date: '2026-08-06', sport: 'boxe', garminActivityId: '0' }));

    expect(etat.erreur).toMatch(/activité garmin/i);
    expect(lireSeancesManuelles()).toHaveLength(0);
  });
});

describe('soumettrePoint : validation avant écriture', () => {
  it('enregistre un point valide et redirige vers /', async () => {
    const { soumettrePoint } = await import('@/app/actions');
    const { lirePointDuJour } = await import('@/lib/db/training');

    const destination = await destinationRedirection(() =>
      soumettrePoint({ erreur: null }, formData({
        date: '2026-08-06', forme: '4', motivation: '3', sommeilPercu: '5',
      })));

    expect(destination).toBe('/');
    expect(lirePointDuJour('2026-08-06')).toMatchObject({ forme: 4, motivation: 3, sommeilPercu: 5 });
  });

  it('accepte un point sans curseurs renseignés : null, jamais 0', async () => {
    const { soumettrePoint } = await import('@/app/actions');
    const { lirePointDuJour } = await import('@/lib/db/training');

    await destinationRedirection(() => soumettrePoint({ erreur: null }, formData({ date: '2026-08-06' })));

    const p = lirePointDuJour('2026-08-06');
    expect(p?.forme).toBeNull();
    expect(p?.motivation).toBeNull();
    expect(p?.sommeilPercu).toBeNull();
  });

  it('rejette une forme hors bornes (0 et 6) sans écrire de point', async () => {
    const { soumettrePoint } = await import('@/app/actions');
    const { lirePointDuJour } = await import('@/lib/db/training');

    for (const forme of ['0', '6']) {
      const etat = await soumettrePoint({ erreur: null }, formData({ date: '2026-08-06', forme }));
      expect(etat.erreur).toMatch(/forme/i);
    }
    expect(lirePointDuJour('2026-08-06')).toBeNull();
  });

  it('rejette une date invalide avant même de regarder les curseurs', async () => {
    const { soumettrePoint } = await import('@/app/actions');
    const { lirePointDuJour } = await import('@/lib/db/training');

    const etat = await soumettrePoint({ erreur: null },
      formData({ date: 'pas-une-date', forme: '3' }));

    expect(etat.erreur).toMatch(/date/i);
    expect(lirePointDuJour('2026-08-06')).toBeNull();
  });

  it('n écrase pas un point existant avec une soumission invalide', async () => {
    const { soumettrePoint } = await import('@/app/actions');
    const { lirePointDuJour } = await import('@/lib/db/training');

    await destinationRedirection(() =>
      soumettrePoint({ erreur: null }, formData({ date: '2026-08-06', forme: '4' })));

    const etat = await soumettrePoint({ erreur: null },
      formData({ date: '2026-08-06', forme: '99' }));

    expect(etat.erreur).toMatch(/forme/i);
    expect(lirePointDuJour('2026-08-06')?.forme).toBe(4);
  });
});

// --- Saisie vocale : validerBrouillon / rejeterBrouillon (tâche 28) --------

function ecrireBrouillon(id: string): void {
  const dossier = join(racine, 'export', 'brouillons-saisie');
  mkdirSync(dossier, { recursive: true });
  writeFileSync(join(dossier, `${id}.json`), JSON.stringify({
    genere_le: 1786212246,
    transcript: 'Ce soir cours de boxe, échauffement puis sac.',
    proposition: {
      date: '2026-08-09', sport: 'boxe', duree_min: 60, rpe: 7,
      segments: [{ type: 'échauffement', duree_min: 10, notes: null }],
      notes: null,
    },
  }));
}

function cheminBrouillon(id: string): string {
  return join(racine, 'export', 'brouillons-saisie', `${id}.json`);
}

describe('validerBrouillon : écrit la séance + segments, supprime le brouillon', () => {
  it('enregistre la séance et ses segments, redirige vers /historique, supprime le brouillon', async () => {
    const id = '20260809-153000-a1b2c3d4';
    ecrireBrouillon(id);
    const { validerBrouillon } = await import('@/app/actions');
    const { lireSeancesManuelles, lireSegments } = await import('@/lib/db/training');

    const destination = await destinationRedirection(() =>
      validerBrouillon({ erreur: null }, formData({
        id, date: '2026-08-09', sport: 'boxe', dureeMin: '60', rpe: '7',
        segmentType: 'échauffement', segmentDureeMin: '10', segmentNotes: '',
      })));

    expect(destination).toBe('/historique');
    const [s] = lireSeancesManuelles();
    expect(s).toMatchObject({ date: '2026-08-09', sport: 'boxe', dureeMin: 60, rpe: 7 });
    expect(s.source).toBe('saisie-vocale');
    expect(lireSegments(s.id)).toMatchObject([{ type: 'échauffement', dureeMin: 10 }]);
    expect(existsSync(cheminBrouillon(id))).toBe(false);
  });

  it('accepte plusieurs segments (FormData en listes parallèles alignées par index)', async () => {
    const id = '20260809-153000-b2c3d4e5';
    ecrireBrouillon(id);
    const { validerBrouillon } = await import('@/app/actions');
    const { lireSeancesManuelles, lireSegments } = await import('@/lib/db/training');

    const f = new FormData();
    f.append('id', id); f.append('date', '2026-08-09'); f.append('sport', 'boxe');
    f.append('dureeMin', '75'); f.append('rpe', '8');
    f.append('segmentType', 'échauffement'); f.append('segmentDureeMin', '10'); f.append('segmentNotes', '');
    f.append('segmentType', 'sac'); f.append('segmentDureeMin', '20'); f.append('segmentNotes', 'jambes lourdes');

    await destinationRedirection(() => validerBrouillon({ erreur: null }, f));

    const [s] = lireSeancesManuelles();
    const segments = lireSegments(s.id);
    expect(segments).toHaveLength(2);
    expect(segments[1]).toMatchObject({ type: 'sac', dureeMin: 20, notes: 'jambes lourdes' });
  });

  it('ignore une ligne de segment vidée par l utilisateur (type vide)', async () => {
    const id = '20260809-153000-c3d4e5f6';
    ecrireBrouillon(id);
    const { validerBrouillon } = await import('@/app/actions');
    const { lireSeancesManuelles, lireSegments } = await import('@/lib/db/training');

    const f = new FormData();
    f.append('id', id); f.append('date', '2026-08-09'); f.append('sport', 'boxe');
    f.append('segmentType', ''); f.append('segmentDureeMin', ''); f.append('segmentNotes', '');

    await destinationRedirection(() => validerBrouillon({ erreur: null }, f));
    const [s] = lireSeancesManuelles();
    expect(lireSegments(s.id)).toEqual([]);
  });

  it('rejette un id de brouillon invalide sans rien écrire', async () => {
    const { validerBrouillon } = await import('@/app/actions');
    const { lireSeancesManuelles } = await import('@/lib/db/training');

    const etat = await validerBrouillon({ erreur: null }, formData({
      id: '../../secret', date: '2026-08-09', sport: 'boxe',
    }));

    expect(etat.erreur).toMatch(/brouillon/i);
    expect(lireSeancesManuelles()).toHaveLength(0);
  });

  it('rejette une durée de segment invalide sans rien écrire (ni séance ni segment)', async () => {
    const id = '20260809-153000-d4e5f6a7';
    ecrireBrouillon(id);
    const { validerBrouillon } = await import('@/app/actions');
    const { lireSeancesManuelles } = await import('@/lib/db/training');

    const f = new FormData();
    f.append('id', id); f.append('date', '2026-08-09'); f.append('sport', 'boxe');
    f.append('segmentType', 'sac'); f.append('segmentDureeMin', '99999'); f.append('segmentNotes', '');

    const etat = await validerBrouillon({ erreur: null }, f);
    expect(etat.erreur).toMatch(/durée de segment/i);
    expect(lireSeancesManuelles()).toHaveLength(0);
    expect(existsSync(cheminBrouillon(id))).toBe(true); // brouillon conservé : rien n'a été validé
  });

  it('rejette une date invalide sans supprimer le brouillon', async () => {
    const id = '20260809-153000-e5f6a7b8';
    ecrireBrouillon(id);
    const { validerBrouillon } = await import('@/app/actions');

    const etat = await validerBrouillon({ erreur: null }, formData({
      id, date: 'pas-une-date', sport: 'boxe',
    }));

    expect(etat.erreur).toMatch(/date/i);
    expect(existsSync(cheminBrouillon(id))).toBe(true);
  });
});

describe('rejeterBrouillon : suppression seule, rien n est jamais écrit', () => {
  it('supprime le fichier du brouillon', async () => {
    const id = '20260809-153000-f6a7b8c9';
    ecrireBrouillon(id);
    const { rejeterBrouillon } = await import('@/app/actions');
    const { lireSeancesManuelles } = await import('@/lib/db/training');

    await rejeterBrouillon(formData({ id }));

    expect(existsSync(cheminBrouillon(id))).toBe(false);
    expect(lireSeancesManuelles()).toHaveLength(0);
  });

  it('ne fait rien pour un id déjà absent (pas d exception)', async () => {
    const { rejeterBrouillon } = await import('@/app/actions');
    await expect(rejeterBrouillon(formData({ id: '20260809-153000-aaaaaaaa' }))).resolves.toBeUndefined();
  });
});

// --- Objectifs déclarés (tâche 43) ------------------------------------------

describe('ajouterObjectif : validation avant écriture', () => {
  it('crée un objectif valide et redirige vers /saisie', async () => {
    const { ajouterObjectif } = await import('@/app/actions');
    const { lireObjectifs } = await import('@/lib/db/objectifs');

    const destination = await destinationRedirection(() =>
      ajouterObjectif({ erreur: null }, formData({ sport: 'boxe', type: 'seances_par_semaine', cible: '2' })));

    expect(destination).toBe('/saisie');
    const objectifs = lireObjectifs();
    expect(objectifs).toHaveLength(1);
    expect(objectifs[0]).toMatchObject({
      sport: 'boxe', type: 'seances_par_semaine', cible: 2,
      libelle: '2 séances de boxe par semaine', actif: true,
    });
  });

  it('accepte une cible décimale (km)', async () => {
    const { ajouterObjectif } = await import('@/app/actions');
    const { lireObjectifs } = await import('@/lib/db/objectifs');

    await destinationRedirection(() =>
      ajouterObjectif({ erreur: null }, formData({ sport: 'course', type: 'km_par_semaine', cible: '12.5' })));

    expect(lireObjectifs()[0].cible).toBe(12.5);
  });

  it('rejette un sport hors liste sans rien écrire', async () => {
    const { ajouterObjectif } = await import('@/app/actions');
    const { lireObjectifs } = await import('@/lib/db/objectifs');

    const etat = await ajouterObjectif({ erreur: null },
      formData({ sport: 'natation', type: 'seances_par_semaine', cible: '2' }));

    expect(etat.erreur).toMatch(/sport/i);
    expect(lireObjectifs()).toHaveLength(0);
  });

  it('rejette un type hors liste sans rien écrire', async () => {
    const { ajouterObjectif } = await import('@/app/actions');
    const { lireObjectifs } = await import('@/lib/db/objectifs');

    const etat = await ajouterObjectif({ erreur: null },
      formData({ sport: 'boxe', type: 'calories_par_semaine', cible: '2' }));

    expect(etat.erreur).toMatch(/type/i);
    expect(lireObjectifs()).toHaveLength(0);
  });

  it('rejette une cible nulle, négative, ou hors bornes', async () => {
    const { ajouterObjectif } = await import('@/app/actions');
    const { lireObjectifs } = await import('@/lib/db/objectifs');

    for (const cible of ['0', '-1', '1001']) {
      const etat = await ajouterObjectif({ erreur: null },
        formData({ sport: 'boxe', type: 'seances_par_semaine', cible }));
      expect(etat.erreur).toMatch(/cible/i);
    }
    expect(lireObjectifs()).toHaveLength(0);
  });

  it('rejette une cible non numérique plutôt que de la ramener à 0', async () => {
    const { ajouterObjectif } = await import('@/app/actions');
    const { lireObjectifs } = await import('@/lib/db/objectifs');

    const etat = await ajouterObjectif({ erreur: null },
      formData({ sport: 'boxe', type: 'seances_par_semaine', cible: 'beaucoup' }));

    expect(etat.erreur).toMatch(/cible/i);
    expect(lireObjectifs()).toHaveLength(0);
  });
});

describe('basculerObjectif', () => {
  it('bascule l état actif d un objectif existant', async () => {
    const { creerObjectif, lireObjectifs } = await import('@/lib/db/objectifs');
    const { basculerObjectif } = await import('@/app/actions');
    const id = creerObjectif({ sport: 'boxe', type: 'seances_par_semaine', cible: 2 });

    await basculerObjectif(formData({ id: String(id) }));

    expect(lireObjectifs()[0].actif).toBe(false);
  });

  it('ignore un id non numérique (requête forgée), sans exception', async () => {
    const { basculerObjectif } = await import('@/app/actions');
    await expect(basculerObjectif(formData({ id: 'abc' }))).resolves.toBeUndefined();
  });
});

describe('retirerObjectif', () => {
  it('supprime un objectif existant', async () => {
    const { creerObjectif, lireObjectifs } = await import('@/lib/db/objectifs');
    const { retirerObjectif } = await import('@/app/actions');
    const id = creerObjectif({ sport: 'boxe', type: 'seances_par_semaine', cible: 2 });

    await retirerObjectif(formData({ id: String(id) }));

    expect(lireObjectifs()).toEqual([]);
  });

  it('ignore un id non numérique (requête forgée), sans exception', async () => {
    const { retirerObjectif } = await import('@/app/actions');
    await expect(retirerObjectif(formData({ id: 'abc' }))).resolves.toBeUndefined();
  });
});
