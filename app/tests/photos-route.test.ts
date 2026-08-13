import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Route handler `/api/photos/[id]/[fichier]` (tâche 27) : validation stricte
// anti-traversal AVANT toute lecture disque. N'utilise que les Web APIs
// (Request/Response), directement appelable en test sans runtime Next.

let racine: string;

beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), 'photos-route-test-'));
  process.env.GARMIN_DATA_DIR = racine;
});

afterAll(() => rmSync(racine, { recursive: true, force: true }));

function params(id: string, fichier: string) {
  return Promise.resolve({ id, fichier });
}

describe('GET /api/photos/[id]/[fichier]', () => {
  it('sert le fichier jpg avec le bon Content-Type quand il existe', async () => {
    const dossier = join(racine, 'export', 'photos-activites', '111');
    mkdirSync(dossier, { recursive: true });
    writeFileSync(join(dossier, '1.jpg'), Buffer.from([0xff, 0xd8, 0xff]));

    const { GET } = await import('@/app/api/photos/[id]/[fichier]/route');
    const res = await GET(new Request('http://x/api/photos/111/1.jpg'), { params: params('111', '1.jpg') });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    const corps = Buffer.from(await res.arrayBuffer());
    expect(corps).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });

  it('renvoie 404 quand le fichier est absent', async () => {
    const { GET } = await import('@/app/api/photos/[id]/[fichier]/route');
    const res = await GET(new Request('http://x/api/photos/999/1.jpg'), { params: params('999', '1.jpg') });
    expect(res.status).toBe(404);
  });

  it('rejette un id non numérique (404, jamais une exception)', async () => {
    const { GET } = await import('@/app/api/photos/[id]/[fichier]/route');
    const res = await GET(new Request('http://x/api/photos/../../etc/1.jpg'), { params: params('../../etc', '1.jpg') });
    expect(res.status).toBe(404);
  });

  it('rejette un nom de fichier hors motif `n.jpg` (traversal, autre extension)', async () => {
    const dossier = join(racine, 'export', 'photos-activites', '111');
    mkdirSync(dossier, { recursive: true });
    writeFileSync(join(racine, 'export', 'secret.txt'), 'top secret');

    const { GET } = await import('@/app/api/photos/[id]/[fichier]/route');

    const traversal = await GET(new Request('http://x/api/photos/111/..%2F..%2Fsecret.txt'), {
      params: params('111', '../../secret.txt'),
    });
    expect(traversal.status).toBe(404);

    const autreExtension = await GET(new Request('http://x/api/photos/111/1.png'), {
      params: params('111', '1.png'),
    });
    expect(autreExtension.status).toBe(404);
  });
});
