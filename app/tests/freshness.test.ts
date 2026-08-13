import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let racine: string;

beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), 'freshness-test-'));
  process.env.GARMIN_DATA_DIR = racine;
});

afterAll(() => rmSync(racine, { recursive: true, force: true }));

describe('syncEnAttente', () => {
  it('renvoie false quand aucun drapeau de sync n est déposé', async () => {
    const { syncEnAttente } = await import('@/lib/db/freshness');
    expect(syncEnAttente()).toBe(false);
  });

  it('renvoie true quand le drapeau .sync-requested est présent', async () => {
    writeFileSync(join(racine, '.sync-requested'), '');
    const { syncEnAttente } = await import('@/lib/db/freshness');
    expect(syncEnAttente()).toBe(true);
  });
});
