import { existsSync, readFileSync } from 'node:fs';
import type { Fraicheur } from '@/lib/types';

const SEUIL_PERIME_H = 26;

/** Âge du dernier sync réussi. Une readiness silencieusement périmée est pire
 *  qu'une absence de donnée : l'écran doit toujours pouvoir l'afficher. */
export function lireFraicheur(): Fraicheur {
  const racine = process.env.GARMIN_DATA_DIR ?? '/work';
  try {
    const epoch = parseInt(readFileSync(`${racine}/last_success`, 'utf8').trim(), 10);
    if (!Number.isFinite(epoch)) return { dernierSucces: null, ageHeures: null, perime: true };
    const date = new Date(epoch * 1000);
    const ageHeures = (Date.now() - date.getTime()) / 3_600_000;
    return { dernierSucces: date, ageHeures, perime: ageHeures > SEUIL_PERIME_H };
  } catch {
    return { dernierSucces: null, ageHeures: null, perime: true };
  }
}

/** Le drapeau `.sync-requested` existe entre le clic sur « Synchroniser » et sa
 *  consommation par le conteneur veilleur (scrutation ~10 s) — l'app n'a pas
 *  d'accès Docker et ne peut donc pas savoir si le sync tourne encore après
 *  coup. Cette fonction ne dit que « une demande est en attente », jamais
 *  « le sync est en cours » : c'est tout ce que ce fichier permet d'observer. */
export function syncEnAttente(): boolean {
  const racine = process.env.GARMIN_DATA_DIR ?? '/work';
  return existsSync(`${racine}/.sync-requested`);
}
