// Registre central des préférences d'affichage (tâche 46, export/import JSON,
// gisement G5 du rapport d'audit B1) : la liste canonique {clé → normaliseur},
// SEULE source de vérité pour l'export ET l'import. Aucune duplication de
// logique de fusion tolérante — chaque normaliseur ci-dessous appelle
// directement la fonction déjà exportée et déjà testée par le moteur de
// layout concerné (appliquerLayout, appliquerLayoutSeance,
// appliquerLayoutHistorique, appliquerLayoutSeances, appliquerDensite) ou,
// pour 'visuels' (un objet plat, pas une liste ordonnée), la table de
// compatibilité déjà exportée par lib/visuels-mesures.ts.
//
// Deux formes de clé :
//   - STATIQUE : une chaîne fixe ('accueil', 'visuels', 'historique',
//     'seances', 'densite').
//   - DYNAMIQUE : une famille de clés par préfixe (`seance:<sport>`) — le
//     sport n'est pas une liste fermée (c'est l'`activity_type` Garmin brut),
//     donc non énumérable à l'avance ; seul le PATRON de la clé l'est.
//
// `normaliseurPour` est le point d'entrée unique consommé par la route
// d'export (app/api/export-config) et par l'action d'import (app/actions.ts,
// `importerConfiguration`) : une clé hors registre renvoie `undefined`, à
// ignorer silencieusement par l'appelant — jamais une exception, jamais une
// clé ou une valeur non validée écrite en base.
import { LAYOUT_PAR_DEFAUT, appliquerLayout, TUILES_MESURES, estObjet, type IdTuile } from './layout-accueil';
import { appliquerLayoutSeance, defautPourSport, sportValide } from './layout-seance';
import { LAYOUT_HISTORIQUE_PAR_DEFAUT, appliquerLayoutHistorique } from './layout-historique';
import { LAYOUT_SEANCES_PAR_DEFAUT, appliquerLayoutSeances } from './layout-seances';
import { appliquerDensite } from './densite';
import { appliquerFenetre } from './fenetre-temporelle';
import { appliquerSeriesCourbe } from './series-courbe';
import { variantesCompatibles, type VarianteVisuel } from './visuels-mesures';

const PREFIXE_SEANCE = 'seance:';
// Tâche 48 (courbes enrichies, gisement G7) : famille dynamique jumelle de
// `seance:<sport>`, mais dont le normaliseur ne dépend PAS du sport encodé
// dans la clé (contrairement à `defautPourSport` ci-dessous) — `appliquerSeriesCourbe`
// ne valide que la FORME (ids connus, sans doublon, au plus deux), la même
// quel que soit le sport ; la disponibilité réelle pour une activité précise
// reste hors du registre (lib/series-courbe.ts).
const PREFIXE_COURBES = 'courbes:';

/** Normalise la sauvegarde brute de la clé 'visuels' (préférence tâche 39,
 *  un objet PLAT { [tuile]: variante }, pas une liste ordonnée) : ne garde
 *  qu'une entrée par mesure CONNUE (`TUILES_MESURES`) dont la variante est
 *  RÉELLEMENT compatible avec cette mesure (`variantesCompatibles`, la même
 *  table que /reglages et `definirVarianteVisuel` utilisent déjà) — jamais de
 *  défaut fabriqué pour une tuile non personnalisée : contrairement aux
 *  layouts (listes complètes), 'visuels' est volontairement CREUX. */
function normaliserVisuels(valeur: unknown): Record<string, VarianteVisuel> {
  if (!estObjet(valeur)) return {};
  const resultat: Record<string, VarianteVisuel> = {};
  for (const id of TUILES_MESURES) {
    const brut = (valeur as Record<string, unknown>)[id];
    if (typeof brut === 'string' && variantesCompatibles(id as IdTuile).includes(brut as VarianteVisuel)) {
      resultat[id] = brut as VarianteVisuel;
    }
  }
  return resultat;
}

type EntreeStatique = {
  readonly type: 'statique';
  readonly cle: string;
  readonly normaliser: (valeur: unknown) => unknown;
};

type EntreeDynamique = {
  readonly type: 'dynamique';
  readonly prefixe: string;
  readonly suffixeValide: (suffixe: string) => boolean;
  readonly normaliser: (cleComplete: string, valeur: unknown) => unknown;
};

export type EntreeRegistre = EntreeStatique | EntreeDynamique;

/** Les 6 clés fixes + 2 familles dynamiques — exactement les clés réellement
 *  écrites par app/actions.ts (`ecrirePreference`) à ce jour. Toute nouvelle
 *  préférence doit être ajoutée ici pour devenir exportable/importable —
 *  tests/preferences-registre.test.ts échoue sinon (cf. ce test). */
export const REGISTRE_PREFERENCES: readonly EntreeRegistre[] = [
  { type: 'statique', cle: 'accueil', normaliser: (v) => appliquerLayout(LAYOUT_PAR_DEFAUT, v) },
  { type: 'statique', cle: 'visuels', normaliser: normaliserVisuels },
  { type: 'statique', cle: 'historique', normaliser: (v) => appliquerLayoutHistorique(LAYOUT_HISTORIQUE_PAR_DEFAUT, v) },
  { type: 'statique', cle: 'seances', normaliser: (v) => appliquerLayoutSeances(LAYOUT_SEANCES_PAR_DEFAUT, v) },
  { type: 'statique', cle: 'densite', normaliser: (v) => appliquerDensite(v) },
  { type: 'statique', cle: 'fenetre_jours', normaliser: (v) => appliquerFenetre(v) },
  {
    type: 'dynamique',
    prefixe: PREFIXE_SEANCE,
    suffixeValide: sportValide,
    normaliser: (cleComplete, v) => appliquerLayoutSeance(defautPourSport(cleComplete.slice(PREFIXE_SEANCE.length)), v),
  },
  {
    type: 'dynamique',
    prefixe: PREFIXE_COURBES,
    suffixeValide: sportValide,
    normaliser: (_cleComplete, v) => appliquerSeriesCourbe(v),
  },
];

/** Résout une clé réelle (venant de la base pour l'export, ou d'un fichier
 *  importé pour l'import) vers sa fonction de normalisation — `undefined` si
 *  la clé est hors registre (statique inconnue, ou préfixe dynamique reconnu
 *  mais suffixe invalide) : c'est le SEUL point de décision « cette clé
 *  compte-t-elle ? », partagé par l'export et l'import. */
export function normaliseurPour(cle: string): ((valeur: unknown) => unknown) | undefined {
  for (const entree of REGISTRE_PREFERENCES) {
    if (entree.type === 'statique') {
      if (entree.cle === cle) return entree.normaliser;
    } else if (cle.startsWith(entree.prefixe) && entree.suffixeValide(cle.slice(entree.prefixe.length))) {
      return (v: unknown) => entree.normaliser(cle, v);
    }
  }
  return undefined;
}
