import { existsSync, readFileSync } from 'node:fs';
import type { Analyse, SuggestionPrincipe } from '@/lib/types';

// Même seuil de péremption que la fraîcheur du sync (freshness.ts, tâche 17
// du brief : « seuil partagé avec lireFraicheur »).
const SEUIL_PERIME_H = 26;

// Tâche 50 (niveau N2) : mention PERMANENTE affichée sous le bloc
// suggestions, jamais omise quand le bloc existe — partagée avec le
// composant qui rend le bloc pour qu'un test puisse vérifier son contenu
// exact sans dupliquer la chaîne.
export const MENTION_SUGGESTIONS =
  'Suggestions génériques issues du corpus versionné du projet — ni un avis médical, ni un plan personnalisé.';

function estSuggestionPrincipe(v: unknown): v is SuggestionPrincipe {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.principe === 'string' && typeof o.texte === 'string';
}

/** Forme brute du fichier écrit par `deploy/nas/analyse.sh` (hôte, hors
 *  contrôle de l'app) — validée avant conversion en `Analyse`. `a_surveiller`,
 *  `question` (tâche 43) et `suggestions` (tâche 50) sont des clés
 *  OPTIONNELLES côté contrat (prompt-analyse.md) : absentes dans le cas
 *  nominal, et dans toute analyse archivée avant leur introduction — jamais
 *  requises ici. */
type AnalyseBrute = {
  genere_le: number;
  resume: string;
  observations: string[];
  prudence: string | null;
  a_surveiller?: string[];
  question?: string;
  suggestions?: SuggestionPrincipe[];
};

function estAnalyseBrute(v: unknown): v is AnalyseBrute {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  const aSurveillerValide = o.a_surveiller === undefined
    || (Array.isArray(o.a_surveiller) && o.a_surveiller.every((x) => typeof x === 'string'));
  const questionValide = o.question === undefined || typeof o.question === 'string';
  const suggestionsValide = o.suggestions === undefined
    || (Array.isArray(o.suggestions) && o.suggestions.every(estSuggestionPrincipe));
  return (
    typeof o.genere_le === 'number' && Number.isFinite(o.genere_le) &&
    typeof o.resume === 'string' &&
    Array.isArray(o.observations) && o.observations.every((x) => typeof x === 'string') &&
    (o.prudence === null || typeof o.prudence === 'string') &&
    aSurveillerValide && questionValide && suggestionsValide
  );
}

/** Lecture tolérante de `${GARMIN_DATA_DIR}/export/analyse.json` : produit
 *  hors du contrôle de l'app par un script hôte (tâche 16) — fichier absent,
 *  JSON invalide, ou JSON valide mais aux clés inattendues renvoient tous
 *  `null`, jamais une exception à l'écran (même logique que lireFraicheur). */
export function lireAnalyse(): Analyse | null {
  const racine = process.env.GARMIN_DATA_DIR ?? '/work';
  try {
    const brut: unknown = JSON.parse(readFileSync(`${racine}/export/analyse.json`, 'utf8'));
    if (!estAnalyseBrute(brut)) return null;
    return {
      genereLe: new Date(brut.genere_le * 1000),
      resume: brut.resume,
      observations: brut.observations,
      prudence: brut.prudence,
      aSurveiller: brut.a_surveiller ?? null,
      question: brut.question ?? null,
      suggestions: brut.suggestions ?? null,
    };
  } catch {
    return null;
  }
}

/** Le drapeau `.analyse-requested` existe entre le clic sur « Analyser » et sa
 *  consommation par le cron hôte (scrutation à la minute, latence réelle
 *  ≤ 90 s) — même limite d'observabilité que `syncEnAttente` : l'app n'a pas
 *  d'accès Docker pour savoir si l'analyse tourne encore après coup. */
export function analyseEnAttente(): boolean {
  const racine = process.env.GARMIN_DATA_DIR ?? '/work';
  return existsSync(`${racine}/.analyse-requested`);
}

/** Âge de l'analyse en heures depuis `genereLe`. */
export function ageAnalyseHeures(a: Analyse): number {
  return (Date.now() - a.genereLe.getTime()) / 3_600_000;
}

/** Péremption au-delà de 26 h — seuil partagé avec `lireFraicheur`
 *  (freshness.ts). */
export function analysePerimee(a: Analyse): boolean {
  return ageAnalyseHeures(a) > SEUIL_PERIME_H;
}
