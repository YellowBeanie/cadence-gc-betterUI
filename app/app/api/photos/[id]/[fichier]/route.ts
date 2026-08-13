import { readFileSync } from 'node:fs';

/** Sert une photo d'activité téléchargée par `collector/telecharger_photos.py`
 *  (tâche 27). Validation stricte anti-traversal AVANT toute construction de
 *  chemin : `id` purement numérique, `fichier` au motif exact `^\d+\.jpg$` —
 *  jamais de segment `..`, de slash ou d'extension arbitraire possible dans
 *  le chemin final. Toute entrée invalide ou fichier absent renvoie 404,
 *  jamais une exception qui remonterait un chemin serveur au client.
 *
 *  Next 16 : `params` est un Promise, y compris dans les route handlers
 *  (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
 *  route.md, vérifié avant d'écrire ce fichier) — il faut l'attendre avant de
 *  lire `id`/`fichier`, jamais y accéder de façon synchrone. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; fichier: string }> },
) {
  const { id, fichier } = await params;

  if (!/^\d+$/.test(id) || !/^\d+\.jpg$/.test(fichier)) {
    return new Response(null, { status: 404 });
  }

  const racine = process.env.GARMIN_DATA_DIR ?? '/work';
  const chemin = `${racine}/export/photos-activites/${id}/${fichier}`;

  try {
    const contenu = readFileSync(chemin);
    return new Response(contenu, {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg' },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
