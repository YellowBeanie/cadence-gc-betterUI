import { initialiserSchema } from '@/lib/db/schema';
import { lirePreference, listerClesPreferences } from '@/lib/db/preferences';
import { normaliseurPour } from '@/lib/preferences-registre';

/** Export JSON des préférences d'affichage (tâche 46, gisement G5 du rapport
 *  d'audit B1) : télécharge exactement les clés du REGISTRE
 *  (lib/preferences-registre.ts) qui ont une valeur en base — jamais les
 *  défauts (une préférence jamais personnalisée n'apparaît pas dans le
 *  fichier). Chaque valeur passe par le normaliseur du registre avant export
 *  — même source de vérité que l'import (`app/actions.ts`,
 *  `importerConfiguration`) — pour que le fichier téléchargé soit déjà
 *  l'exacte forme qu'un import ré-écrirait (aller-retour idempotent).
 *
 *  Aucune donnée de santé, aucune donnée personnelle : uniquement des
 *  préférences d'affichage (ordre/visibilité de sections, choix de visuels,
 *  densité) — jamais garmin.db ni training.db en entier. */
export async function GET(): Promise<Response> {
  initialiserSchema();

  const preferences: Record<string, unknown> = {};
  for (const cle of listerClesPreferences()) {
    const normaliser = normaliseurPour(cle);
    if (!normaliser) continue; // clé hors registre : jamais exportée
    preferences[cle] = normaliser(lirePreference<unknown>(cle, null));
  }

  const corps = {
    format: 'cadence-config',
    version: 1,
    exporte_le: new Date().toISOString(),
    preferences,
  };

  return new Response(JSON.stringify(corps, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="cadence-config.json"',
    },
  });
}
