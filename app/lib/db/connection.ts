import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

// Résolue à chaque appel plutôt que figée au chargement du module : GARMIN_DATA_DIR
// est fixe en production (un seul process, un seul répertoire de données pour toute
// sa durée de vie), mais les tests font varier cette variable d'un scénario à l'autre
// dans le même process — une constante de module la figerait au premier import.
function racineDonnees(): string {
  return process.env.GARMIN_DATA_DIR ?? '/work';
}

/** Instantané Garmin, strictement en lecture. Jamais garmin.db, qui est en WAL. */
export function ouvrirGarmin(): DatabaseSync {
  const chemin = `${racineDonnees()}/export/garmin-ro.db`;
  if (!existsSync(chemin)) {
    throw new Error(
      `Instantané Garmin introuvable à ${chemin} — aucune synchronisation n'a encore abouti.`,
    );
  }
  return new DatabaseSync(chemin, { readOnly: true });
}

/** Base des saisies, propriété exclusive de l'app. */
export function ouvrirTraining(): DatabaseSync {
  return new DatabaseSync(`${racineDonnees()}/training.db`);
}
