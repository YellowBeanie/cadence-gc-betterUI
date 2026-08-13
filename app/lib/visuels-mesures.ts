// Variantes de visuel par mesure (tâche 39, personnalisation) : chaque tuile
// de la bande de mesures (lib/layout-accueil.ts, `TUILES_MESURES`) peut être
// affichée sous plusieurs visuels — chiffre seul, chiffre + sparkline
// (l'existant, toujours le défaut), mini-barres 7 jours (langage de
// charge-semaine, components/charge-semaine.tsx), jauge-anneau (nouveau
// composant DS, components/jauge-anneau.tsx), ou promue en section pleine
// largeur sous forme de courbe (style des courbes claires de /historique,
// components/graphiques.tsx). Deux niveaux de repli, jamais une exception,
// jamais un visuel vide :
//   1. `varianteEnregistree` — le choix a-t-il seulement un SENS pour cette
//      mesure (table de compatibilité ci-dessous) ?
//   2. `varianteEffective` — la DONNÉE qu'exige ce visuel existe-t-elle pour
//      CETTE instance (série 7 j, série de tendance, objectif réel) ? Une
//      mesure listée compatible dans la table peut très bien ne pas avoir
//      encore la donnée nécessaire câblée (ex. `etages`/`intensite` n'ont pas
//      de série 7 j exposée par `lireTendances()` à ce jour) — le repli sur
//      le défaut est alors normal, pas une erreur (cf. spec personnalisation,
//      « Interdits »).
import { TUILES_MESURES, estObjet, type IdTuile } from './layout-accueil';

export type VarianteVisuel = 'chiffre' | 'chiffre-sparkline' | 'barres-7j' | 'courbe-section' | 'jauge';

/** Le visuel actuel de chaque tuile, inchangé par cette tâche — c'est le
 *  repli de tout choix incompatible, inconnu, ou dont la donnée manque. */
export const VARIANTE_PAR_DEFAUT: VarianteVisuel = 'chiffre-sparkline';

const TOUTES_VARIANTES: readonly VarianteVisuel[] = [
  'chiffre', 'chiffre-sparkline', 'barres-7j', 'courbe-section', 'jauge',
];

// Mesures cumulatives (brief tâche 39) : additionnées sur la journée/la
// semaine, un mini-historique de 7 jours a du sens en barres — même langage
// visuel que charge-semaine.tsx (barre du jour courant en accent, vrai zéro
// en barre quasi nulle plutôt que masquée, trou = rien affiché).
const CUMULATIVES = new Set<IdTuile>(['pas', 'calories', 'etages', 'intensite']);

// Jauge : réservée aux DEUX mesures dont Garmin fournit un objectif RÉEL —
// jamais un objectif inventé pour les autres (règle du brief). `calories` est
// cumulative mais n'a pas d'objectif Garmin exploité par cette app : pas de
// jauge pour elle.
const AVEC_OBJECTIF_REEL = new Set<IdTuile>(['pas', 'intensite']);

// Mesures de tendance (brief tâche 39) : peuvent être PROMUES en section
// pleine largeur (courbe) sous la bande plutôt que rendues en tuile.
const TENDANCES = new Set<IdTuile>(['hrv', 'readiness', 'fc-repos', 'sommeil', 'stress']);

function compatibles(id: IdTuile): VarianteVisuel[] {
  const v: VarianteVisuel[] = ['chiffre', 'chiffre-sparkline'];
  if (CUMULATIVES.has(id)) v.push('barres-7j');
  if (AVEC_OBJECTIF_REEL.has(id)) v.push('jauge');
  if (TENDANCES.has(id)) v.push('courbe-section');
  return v;
}

/** Table de compatibilité PAR MESURE — construite une seule fois à partir de
 *  `TUILES_MESURES` (lib/layout-accueil.ts) pour ne jamais désynchroniser des
 *  14 tuiles réelles de la bande de mesures. */
export const VARIANTES_COMPATIBLES: Record<IdTuile, readonly VarianteVisuel[]> = Object.fromEntries(
  TUILES_MESURES.map((id) => [id, compatibles(id)]),
) as unknown as Record<IdTuile, readonly VarianteVisuel[]>;

export function variantesCompatibles(mesure: IdTuile): readonly VarianteVisuel[] {
  return VARIANTES_COMPATIBLES[mesure];
}

function estVarianteConnue(v: unknown): v is VarianteVisuel {
  return typeof v === 'string' && (TOUTES_VARIANTES as readonly string[]).includes(v);
}

/** Premier niveau de repli : un choix qui n'a pas de sens pour cette mesure
 *  (table de compatibilité) ou qui n'est même pas une variante connue (JSON
 *  tapé à la main, ancienne version) retombe sur le défaut. Ne regarde pas la
 *  donnée réelle du jour — c'est le rôle de `varianteEffective` ci-dessous. */
export function varianteEnregistree(mesure: IdTuile, choix: unknown): VarianteVisuel {
  if (estVarianteConnue(choix) && VARIANTES_COMPATIBLES[mesure].includes(choix)) return choix;
  return VARIANTE_PAR_DEFAUT;
}

/** Données réellement disponibles pour CETTE instance de mesure (pas
 *  seulement « la variante a-t-elle un sens pour ce type de mesure », déjà
 *  tranché par la table de compatibilité) : un booléen par exigence, à
 *  construire par l'appelant (components/bande-mesures.tsx) à partir de ce
 *  qu'il a réellement sous la main pour le jour ancré. */
export type DonneesDisponibles = {
  serie7j?: boolean;
  serieTendance?: boolean;
  objectif?: boolean;
};

/** Cœur de la personnalisation des visuels : `varianteEnregistree` d'abord
 *  (choix incompatible ou inconnu → défaut), puis une garde par donnée
 *  requise (choix compatible mais rien à montrer pour CETTE instance →
 *  défaut aussi). Jamais d'erreur, jamais un visuel vide affiché à la place
 *  d'un visuel qui aurait eu quelque chose à montrer. */
export function varianteEffective(
  mesure: IdTuile, choix: unknown, donnees: DonneesDisponibles = {},
): VarianteVisuel {
  const variante = varianteEnregistree(mesure, choix);
  if (variante === 'barres-7j' && !donnees.serie7j) return VARIANTE_PAR_DEFAUT;
  if (variante === 'courbe-section' && !donnees.serieTendance) return VARIANTE_PAR_DEFAUT;
  if (variante === 'jauge' && !donnees.objectif) return VARIANTE_PAR_DEFAUT;
  return variante;
}

/** Lecture tolérante d'une entrée de la sauvegarde `visuels`
 *  (preferences_affichage, clé 'visuels') : la sauvegarde n'est jamais
 *  validée en profondeur en amont (lib/db/preferences.ts ne garantit que « du
 *  JSON valide », cf. lib/layout-accueil.ts sur le même principe) — un objet
 *  quelconque, ou même autre chose qu'un objet, ne doit jamais lever. La
 *  valeur renvoyée n'est PAS validée ici : c'est le rôle de
 *  `varianteEnregistree`/`varianteEffective` en aval. */
export function choixVisuel(sauvegarde: unknown, mesure: IdTuile): unknown {
  if (!estObjet(sauvegarde)) return undefined;
  return (sauvegarde as Record<string, unknown>)[mesure];
}
