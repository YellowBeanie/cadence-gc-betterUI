import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// `importerConfiguration` appelle `revalidatePath` (comme toutes les actions
// de /reglages) : hors du runtime Next (ici, un simple appel de fonction
// depuis un test Vitest), il n'y a pas de « static generation store » — le
// même point mort que n'importe quelle action de app/actions.ts rencontrerait
// si elle était appelée hors requête HTTP. Neutralisé ici plutôt que dans le
// code de production, qui n'a pas besoin de le savoir.
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

// Tâche 46 (export/import JSON des préférences) : la route GET
// /api/export-config et l'action `importerConfiguration` (app/actions.ts)
// partagent le même registre (lib/preferences-registre.ts, cf.
// tests/preferences-registre.test.ts) — ces tests couvrent le contrat de
// bout en bout : un export ne contient QUE les clés réellement
// personnalisées (jamais les défauts), un import ne peut écrire QUE des clés
// du registre avec des valeurs revalidées, et l'aller-retour export→import
// est idempotent.

const racines: string[] = [];

function nouvelleRacine(prefixe: string): void {
  const racine = mkdtempSync(join(tmpdir(), prefixe));
  racines.push(racine);
  process.env.GARMIN_DATA_DIR = racine;
}

beforeEach(async () => {
  nouvelleRacine('export-import-test-');
  const { initialiserSchema } = await import('@/lib/db/schema');
  initialiserSchema();
});

afterAll(() => {
  for (const racine of racines) rmSync(racine, { recursive: true, force: true });
});

function fichierJson(contenu: unknown, nom = 'cadence-config.json'): File {
  return new File([JSON.stringify(contenu)], nom, { type: 'application/json' });
}

function formulaireAvecFichier(fichier: File): FormData {
  const f = new FormData();
  f.append('fichier', fichier);
  return f;
}

const ETAT_INITIAL = { erreur: null, importees: 0, ignorees: 0 };

describe('GET /api/export-config', () => {
  it('renvoie une enveloppe vide (preferences: {}) quand rien n’a été personnalisé', async () => {
    const { GET } = await import('@/app/api/export-config/route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="cadence-config.json"');
    const corps = await res.json();
    expect(corps).toMatchObject({ format: 'cadence-config', version: 1, preferences: {} });
    expect(corps.exporte_le).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('n’exporte que les clés réellement écrites en base, jamais les défauts', async () => {
    const { ecrirePreference } = await import('@/lib/db/preferences');
    ecrirePreference('densite', 'compacte');
    ecrirePreference('accueil', { heros: 'stress' });

    const { GET } = await import('@/app/api/export-config/route');
    const corps = await (await GET()).json();
    expect(Object.keys(corps.preferences).sort()).toEqual(['accueil', 'densite']);
    expect(corps.preferences.densite).toBe('compacte');
    expect(corps.preferences.accueil.heros).toBe('stress');
  });

  it('exporte une clé dynamique seance:<sport>, ignore une clé hors registre', async () => {
    const { ecrirePreference } = await import('@/lib/db/preferences');
    ecrirePreference('seance:hiking', { sections: [{ id: 'carte', visible: false }] });
    ecrirePreference('cle-inconnue-hors-registre', { x: 1 });

    const { GET } = await import('@/app/api/export-config/route');
    const corps = await (await GET()).json();
    expect(corps.preferences['seance:hiking']).toBeDefined();
    expect(corps.preferences['cle-inconnue-hors-registre']).toBeUndefined();
  });
});

describe('importerConfiguration : validation stricte avant écriture', () => {
  it('rejette l’absence de fichier', async () => {
    const { importerConfiguration } = await import('@/app/actions');
    const etat = await importerConfiguration(ETAT_INITIAL, new FormData());
    expect(etat.erreur).toMatch(/fichier/i);
    expect(etat.importees).toBe(0);
  });

  it('rejette un fichier vide (0 octet)', async () => {
    const { importerConfiguration } = await import('@/app/actions');
    const etat = await importerConfiguration(
      ETAT_INITIAL, formulaireAvecFichier(new File([], 'vide.json', { type: 'application/json' })),
    );
    expect(etat.erreur).toMatch(/fichier/i);
  });

  it('rejette un fichier trop volumineux (> 100 Ko) sans rien écrire', async () => {
    const { importerConfiguration } = await import('@/app/actions');
    const { listerClesPreferences } = await import('@/lib/db/preferences');
    const gros = 'x'.repeat(100 * 1024 + 1);
    const etat = await importerConfiguration(
      ETAT_INITIAL, formulaireAvecFichier(new File([gros], 'gros.json', { type: 'application/json' })),
    );
    expect(etat.erreur).toMatch(/volumineux/i);
    expect(listerClesPreferences()).toHaveLength(0);
  });

  it('rejette un JSON invalide', async () => {
    const { importerConfiguration } = await import('@/app/actions');
    const etat = await importerConfiguration(
      ETAT_INITIAL, formulaireAvecFichier(new File(['{ pas du json valide'], 'x.json', { type: 'application/json' })),
    );
    expect(etat.erreur).toMatch(/JSON invalide/i);
  });

  it('rejette un format inconnu', async () => {
    const { importerConfiguration } = await import('@/app/actions');
    const etat = await importerConfiguration(
      ETAT_INITIAL,
      formulaireAvecFichier(fichierJson({ format: 'autre-chose', version: 1, preferences: {} })),
    );
    expect(etat.erreur).toMatch(/format/i);
  });

  it('rejette un fichier qui n’est pas un objet JSON (tableau, chaîne, nombre)', async () => {
    const { importerConfiguration } = await import('@/app/actions');
    const etat = await importerConfiguration(ETAT_INITIAL, formulaireAvecFichier(fichierJson([1, 2, 3])));
    expect(etat.erreur).toMatch(/format/i);
  });

  it('rejette une version inconnue', async () => {
    const { importerConfiguration } = await import('@/app/actions');
    const etat = await importerConfiguration(
      ETAT_INITIAL,
      formulaireAvecFichier(fichierJson({ format: 'cadence-config', version: 99, preferences: {} })),
    );
    expect(etat.erreur).toMatch(/version/i);
  });

  it('rejette un fichier sans objet preferences exploitable', async () => {
    const { importerConfiguration } = await import('@/app/actions');
    const etat = await importerConfiguration(
      ETAT_INITIAL,
      formulaireAvecFichier(fichierJson({ format: 'cadence-config', version: 1, preferences: 'pas-un-objet' })),
    );
    expect(etat.erreur).toMatch(/préférences/i);
  });

  it('ignore silencieusement les clés hors registre, importe les clés connues', async () => {
    const { importerConfiguration } = await import('@/app/actions');
    const { lirePreference } = await import('@/lib/db/preferences');
    const etat = await importerConfiguration(
      ETAT_INITIAL,
      formulaireAvecFichier(fichierJson({
        format: 'cadence-config', version: 1,
        preferences: { densite: 'compacte', 'cle-inconnue': { x: 1 } },
      })),
    );
    expect(etat.erreur).toBeNull();
    expect(etat.importees).toBe(1);
    expect(etat.ignorees).toBe(1);
    expect(lirePreference('densite', null)).toBe('compacte');
    expect(lirePreference('cle-inconnue', null)).toBeNull();
  });

  it('normalise une valeur invalide vers le défaut plutôt que de rejeter tout l’import', async () => {
    const { importerConfiguration } = await import('@/app/actions');
    const { lirePreference } = await import('@/lib/db/preferences');
    const etat = await importerConfiguration(
      ETAT_INITIAL,
      formulaireAvecFichier(fichierJson({
        format: 'cadence-config', version: 1,
        preferences: { densite: 'valeur-qui-nexiste-pas' },
      })),
    );
    expect(etat.importees).toBe(1);
    // Jamais le JSON tel quel : la valeur invalide retombe sur le défaut,
    // exactement comme appliquerDensite le fait déjà pour l'écran.
    expect(lirePreference('densite', null)).toBe('normale');
  });

  it('importe une clé dynamique seance:<sport> valide, la revalide via defautPourSport', async () => {
    const { importerConfiguration } = await import('@/app/actions');
    const { lirePreference } = await import('@/lib/db/preferences');
    const etat = await importerConfiguration(
      ETAT_INITIAL,
      formulaireAvecFichier(fichierJson({
        format: 'cadence-config', version: 1,
        preferences: { 'seance:hiking': { sections: [{ id: 'carte', visible: false }] } },
      })),
    );
    expect(etat.importees).toBe(1);
    const layout = lirePreference<{ sections: { id: string; visible: boolean }[] } | null>('seance:hiking', null);
    expect(layout!.sections.find((s) => s.id === 'carte')!.visible).toBe(false);
  });

  it('rejette une clé seance:<sport> au suffixe invalide (ignorée, pas d’exception)', async () => {
    const { importerConfiguration } = await import('@/app/actions');
    const etat = await importerConfiguration(
      ETAT_INITIAL,
      formulaireAvecFichier(fichierJson({
        format: 'cadence-config', version: 1,
        preferences: { 'seance:Boxe Française!': { sections: [] } },
      })),
    );
    expect(etat.erreur).toBeNull();
    expect(etat.importees).toBe(0);
    expect(etat.ignorees).toBe(1);
  });
});

describe('Aller-retour export → import : idempotent', () => {
  it('réimporter un export produit exactement les mêmes valeurs, et un second export est identique', async () => {
    const { ecrirePreference } = await import('@/lib/db/preferences');
    ecrirePreference('accueil', { heros: 'stress', sections: [{ id: 'heros', visible: false }] });
    ecrirePreference('densite', 'compacte');
    ecrirePreference('seance:hiking', { sections: [{ id: 'carte', visible: false }] });

    const { GET } = await import('@/app/api/export-config/route');
    const premierExport = await (await GET()).json();
    expect(Object.keys(premierExport.preferences).sort()).toEqual(['accueil', 'densite', 'seance:hiking']);

    // Base "vierge" pour simuler un import chez un autre utilisateur/après
    // reset — l'écriture réelle passe forcément par un nouveau training.db.
    nouvelleRacine('export-import-test-cible-');
    const { initialiserSchema } = await import('@/lib/db/schema');
    initialiserSchema();

    const { importerConfiguration } = await import('@/app/actions');
    const etat = await importerConfiguration(ETAT_INITIAL, formulaireAvecFichier(fichierJson(premierExport)));
    expect(etat.erreur).toBeNull();
    expect(etat.importees).toBe(3);
    expect(etat.ignorees).toBe(0);

    const secondExport = await (await GET()).json();
    expect(secondExport.preferences).toEqual(premierExport.preferences);
  });
});
