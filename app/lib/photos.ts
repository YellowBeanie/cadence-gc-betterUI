import { existsSync, readdirSync } from 'node:fs';

/** Photos d'activité (tâche 27) : liste triée des fichiers
 *  `{GARMIN_DATA_DIR}/export/photos-activites/{id}/*.jpg` téléchargés par
 *  `collector/telecharger_photos.py`. Ce script est lui-même best-effort
 *  (endpoint Garmin non documenté, cf. son en-tête) : la très grande majorité
 *  des séances n'auront jamais de photo, ce qui est un état normal, pas une
 *  erreur. Répertoire absent = liste vide, jamais une exception — même
 *  discipline que `lireAnalyseSeance` (lib/analyse-seance.ts) pour un produit
 *  écrit hors du contrôle de l'app. Node `fs` classique (pas node:sqlite) :
 *  ce n'est pas une lecture de base, donc volontairement pas dans lib/db
 *  malgré la parenté de sujet (photo d'une séance). */
export function lirePhotosSeance(id: number): string[] {
  const racine = process.env.GARMIN_DATA_DIR ?? '/work';
  const dossier = `${racine}/export/photos-activites/${id}`;
  if (!existsSync(dossier)) return [];
  try {
    return readdirSync(dossier)
      .filter((f) => /^\d+\.jpg$/.test(f))
      .sort((a, b) => Number(a.slice(0, -4)) - Number(b.slice(0, -4)));
  } catch {
    return [];
  }
}
