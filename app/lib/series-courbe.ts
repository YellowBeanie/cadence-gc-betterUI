// Séries optionnelles de la courbe de séance (tâche 48, courbes enrichies —
// gisement G7 du rapport d'audit B1) : cadence, altitude, puissance, toutes
// portées par activity_trackpoints (lib/db/garmin.ts) mais jamais affichées
// avant cette tâche (manque documenté par la revue A1). Overlay strictement
// opt-in de la courbe FC (components/courbe-seance.tsx), au plus DEUX séries
// actives simultanément — jamais plus, pour rester lisible (brief tâche 48).
//
// Une série n'est PROPOSÉE à l'utilisateur que si elle a au moins une valeur
// connue pour LA séance affichée (`seriesDisponibles`, lib/trackpoints.ts) :
// l'honnêteté du projet veut qu'une série sans donnée pour cette séance
// n'existe pas pour elle, même si elle a des données pour d'autres séances du
// même sport (ex. puissance : présente en course, absente en randonnée sans
// footpod — vérifié sur les données réelles de l'utilisateur).
//
// La préférence elle-même (clé `courbes:<sport>`, lib/preferences-registre.ts)
// est un choix par SPORT, pas par séance — même modèle que `seance:<sport>`
// (lib/layout-seance.ts) : `appliquerSeriesCourbe` ne revalide donc que la
// FORME (ids connus, sans doublon, au plus deux), jamais la disponibilité
// réelle pour une activité précise, qui reste du ressort de l'appelant
// (app/seance/[id]/page.tsx croise le résultat avec `seriesDisponibles`).

export const SERIES_COURBE = ['cadence', 'altitude', 'puissance'] as const;
export type SerieCourbe = (typeof SERIES_COURBE)[number];

export const MAX_SERIES_ACTIVES = 2;

function serieValide(v: unknown): v is SerieCourbe {
  return typeof v === 'string' && (SERIES_COURBE as readonly string[]).includes(v);
}

/** Revalide une sauvegarde lue via `lirePreference` (clé `courbes:<sport>`)
 *  ou reçue de `app/actions.ts` (`definirSeriesCourbe`) : ne garde que des
 *  séries CONNUES, sans doublon (première occurrence gagnante — même règle
 *  que `fusionnerListe`, lib/layout-accueil.ts), au plus `MAX_SERIES_ACTIVES`
 *  — jamais un tableau plus long, jamais un id étranger. Une sauvegarde
 *  absente, non-tableau ou vide replie sur `[]` (aucune série ajoutée = écran
 *  actuel inchangé, règle du projet), jamais une exception. */
export function appliquerSeriesCourbe(sauvegarde: unknown): SerieCourbe[] {
  if (!Array.isArray(sauvegarde)) return [];
  const resultat: SerieCourbe[] = [];
  for (const entree of sauvegarde) {
    if (!serieValide(entree)) continue;
    if (resultat.includes(entree)) continue; // doublon : première occurrence gagnante
    resultat.push(entree);
    if (resultat.length === MAX_SERIES_ACTIVES) break;
  }
  return resultat;
}
