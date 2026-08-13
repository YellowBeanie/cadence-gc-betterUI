import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Route handler `/api/audio-saisie` (tâche 28) : validations strictes AVANT
// toute écriture disque — taille, extension déduite du nom client, nom de
// fichier généré par LE SERVEUR (jamais le nom client, potentiel vecteur de
// traversée de chemin).

let racine: string;

beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), 'audio-saisie-route-test-'));
  process.env.GARMIN_DATA_DIR = racine;
});

afterAll(() => rmSync(racine, { recursive: true, force: true }));

function requeteAvecFichier(fichier: File): Request {
  const donnees = new FormData();
  donnees.append('audio', fichier);
  return new Request('http://x/api/audio-saisie', { method: 'POST', body: donnees });
}

function dossierEntrants(): string {
  return join(racine, 'audio-saisies', 'entrants');
}

describe('POST /api/audio-saisie', () => {
  it('accepte un fichier valide, l’écrit sous un nom généré par le serveur', async () => {
    const { POST } = await import('@/app/api/audio-saisie/route');
    const contenu = new Uint8Array([1, 2, 3, 4]);
    const fichier = new File([contenu], 'mon cours de boxe.m4a', { type: 'audio/m4a' });

    const res = await POST(requeteAvecFichier(fichier));
    expect(res.status).toBe(200);

    const fichiers = readdirSync(dossierEntrants());
    expect(fichiers).toHaveLength(1);
    // Jamais le nom client : format serveur AAAAMMJJ-HHMMSS-hex.ext.
    expect(fichiers[0]).toMatch(/^\d{8}-\d{6}-[0-9a-f]+\.m4a$/);
    expect(fichiers[0]).not.toContain('mon cours');

    const octets = readFileSync(join(dossierEntrants(), fichiers[0]));
    expect(Buffer.from(octets)).toEqual(Buffer.from(contenu));
  });

  it('accepte les extensions de la liste fermée (mp3, ogg, wav, webm, aac)', async () => {
    const { POST } = await import('@/app/api/audio-saisie/route');
    for (const ext of ['mp3', 'ogg', 'wav', 'webm', 'aac']) {
      const fichier = new File([new Uint8Array([9])], `x.${ext}`, { type: 'audio/x' });
      const res = await POST(requeteAvecFichier(fichier));
      expect(res.status).toBe(200);
    }
    expect(readdirSync(dossierEntrants())).toHaveLength(5);
  });

  it('rejette un format hors liste sans rien écrire', async () => {
    const { POST } = await import('@/app/api/audio-saisie/route');
    const fichier = new File([new Uint8Array([1])], 'x.exe', { type: 'application/octet-stream' });
    const res = await POST(requeteAvecFichier(fichier));
    expect(res.status).toBe(400);
    const corps = await res.json();
    expect(corps.erreur).toMatch(/format/i);
    expect(existsSync(dossierEntrants())).toBe(false);
  });

  it('rejette un fichier sans extension', async () => {
    const { POST } = await import('@/app/api/audio-saisie/route');
    const fichier = new File([new Uint8Array([1])], 'sansextension', { type: 'audio/m4a' });
    const res = await POST(requeteAvecFichier(fichier));
    expect(res.status).toBe(400);
    expect(existsSync(dossierEntrants())).toBe(false);
  });

  it('rejette un fichier trop volumineux (> 25 Mo) sans rien écrire', async () => {
    const { POST } = await import('@/app/api/audio-saisie/route');
    const trop = new Uint8Array(25 * 1024 * 1024 + 1);
    const fichier = new File([trop], 'gros.m4a', { type: 'audio/m4a' });
    const res = await POST(requeteAvecFichier(fichier));
    expect(res.status).toBe(400);
    const corps = await res.json();
    expect(corps.erreur).toMatch(/volumineux/i);
    expect(existsSync(dossierEntrants())).toBe(false);
  });

  it('rejette un fichier vide (0 octet)', async () => {
    const { POST } = await import('@/app/api/audio-saisie/route');
    const fichier = new File([], 'vide.m4a', { type: 'audio/m4a' });
    const res = await POST(requeteAvecFichier(fichier));
    expect(res.status).toBe(400);
    expect(existsSync(dossierEntrants())).toBe(false);
  });

  it('rejette une requête sans champ audio', async () => {
    const { POST } = await import('@/app/api/audio-saisie/route');
    const donnees = new FormData();
    donnees.append('autreChamp', 'valeur');
    const res = await POST(new Request('http://x/api/audio-saisie', { method: 'POST', body: donnees }));
    expect(res.status).toBe(400);
    expect(existsSync(dossierEntrants())).toBe(false);
  });

  it('deux envois successifs produisent deux fichiers distincts (nom aléatoire)', async () => {
    const { POST } = await import('@/app/api/audio-saisie/route');
    const f1 = new File([new Uint8Array([1])], 'a.m4a', { type: 'audio/m4a' });
    const f2 = new File([new Uint8Array([2])], 'a.m4a', { type: 'audio/m4a' });
    await POST(requeteAvecFichier(f1));
    await POST(requeteAvecFichier(f2));
    const fichiers = readdirSync(dossierEntrants());
    expect(fichiers).toHaveLength(2);
    expect(fichiers[0]).not.toBe(fichiers[1]);
  });
});
