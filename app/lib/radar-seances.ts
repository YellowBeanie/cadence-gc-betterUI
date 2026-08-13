// Radar comparatif inter-séances (tâche 40, personnalisation) : normalise
// deux séances du même sport sur les mêmes axes pour les superposer dans un
// RadarChart (components/radar-seances.tsx) — le cœur « honnêteté » de la
// spec (docs/superpowers/specs/2026-08-11-personnalisation.md) : jamais un
// axe fabriqué quand une des deux séances n'a pas la mesure, jamais un score
// composite inventé, toujours les valeurs réelles affichées à côté du
// pourcentage normalisé.
import type { MinutesZones } from './types';
import { allureSecParKm, formaterAllure, formaterDureeCourse } from './formatage';

/** Sous-ensemble de `SeanceDetail` (lib/types.ts) nécessaire à la
 *  construction du radar — délibérément découplé du type complet pour que
 *  cette fonction reste pure et testable sans fabriquer un `SeanceDetail`
 *  entier dans chaque test. `zones` reprend le format minutes de
 *  `SeanceDetail.zones` (déjà converti depuis les secondes par
 *  `lireSeanceDetail`). */
export type DonneesRadarSeance = {
  distanceM: number | null;
  deniveleMonte: number | null;
  dureeSec: number | null;
  fcMoy: number | null;
  chargeEntrainement: number | null;
  zones: MinutesZones | null;
};

export type AxeRadarCle = 'distance' | 'temps' | 'allure' | 'denivele' | 'fc' | 'charge' | 'z1z2';

/** `normA`/`normB` : valeurs normalisées sur le max des deux séances, ce
 *  max valant 100 (spec : « chaque axe est normalisé sur le max des deux
 *  valeurs »). `reelA`/`reelB` : valeurs réelles déjà formatées (unité
 *  incluse) — jamais les pourcentages normalisés seuls, cf. tooltip du
 *  composant. */
export type AxeRadar = {
  cle: AxeRadarCle;
  libelle: string;
  normA: number;
  normB: number;
  reelA: string;
  reelB: string;
};

export type RadarComparatif = { axes: AxeRadar[] };

/** Un radar en dessous de trois axes communs ne raconte plus rien de fiable
 *  (spec : « minimum 3 axes communs, sinon le radar ne se construit pas »). */
const MIN_AXES = 3;

/** Normalise une paire de valeurs sur leur propre max (jamais sur une
 *  échelle absolue) : la plus grande des deux atteint 100, l'autre son ratio.
 *  Les deux valeurs à 0 (ex. D+ nul des deux côtés, sortie plate) sont un cas
 *  dégénéré légitime — 0/0 renvoie [0, 0] plutôt qu'un NaN, jamais une
 *  exception. */
function normaliser(a: number, b: number): [number, number] {
  const max = Math.max(a, b);
  if (max <= 0) return [0, 0];
  return [(a / max) * 100, (b / max) * 100];
}

/** % du temps passé en zones FC 1-2 sur le temps total en zones connues —
 *  même calcul que `lireZonesParSemaine.pctZ1Z2` (lib/db/garmin.ts) : `null`
 *  (jamais 0) quand les zones sont absentes ou toutes nulles (rien à
 *  diviser), pour ne jamais laisser croire à un « aucun temps en Z1-Z2 » qui
 *  serait faux. */
function pourcentZ1Z2(z: MinutesZones | null): number | null {
  if (!z) return null;
  const total = z.z1 + z.z2 + z.z3 + z.z4 + z.z5;
  if (total <= 0) return null;
  return Math.round(((z.z1 + z.z2) / total) * 100);
}

/** Construit le radar comparant `a` (séance affichée) à `b` (séance
 *  comparée) : ne garde que les axes où LES DEUX séances ont une valeur —
 *  un axe où l'une des deux manque est omis, jamais complété par un 0
 *  fabriqué. `null` si moins de trois axes survivent à ce filtrage. */
export function construireRadar(a: DonneesRadarSeance, b: DonneesRadarSeance): RadarComparatif | null {
  const axes: AxeRadar[] = [];

  if (a.distanceM != null && b.distanceM != null) {
    const [normA, normB] = normaliser(a.distanceM, b.distanceM);
    axes.push({
      cle: 'distance', libelle: 'Distance', normA, normB,
      reelA: `${(a.distanceM / 1000).toFixed(2)} km`, reelB: `${(b.distanceM / 1000).toFixed(2)} km`,
    });
  }

  if (a.dureeSec != null && b.dureeSec != null) {
    const [normA, normB] = normaliser(a.dureeSec, b.dureeSec);
    axes.push({
      cle: 'temps', libelle: 'Temps', normA, normB,
      reelA: formaterDureeCourse(a.dureeSec), reelB: formaterDureeCourse(b.dureeSec),
    });
  }

  // Allure : ÉCHELLE INVERSÉE (spec) — normalisée sur la VITESSE (1 / allure),
  // pas sur l'allure elle-même, pour que la séance la plus rapide (allure la
  // plus basse en sec/km) atteigne 100 et s'affiche donc plus loin du centre.
  // Les valeurs réelles affichées restent l'allure classique (formaterAllure),
  // jamais la vitesse — ce n'est qu'un artifice de normalisation, invisible
  // à l'affichage.
  const allureA = allureSecParKm(a.dureeSec, a.distanceM);
  const allureB = allureSecParKm(b.dureeSec, b.distanceM);
  if (allureA != null && allureB != null) {
    const [normA, normB] = normaliser(1 / allureA, 1 / allureB);
    axes.push({
      cle: 'allure', libelle: 'Allure', normA, normB,
      reelA: formaterAllure(allureA), reelB: formaterAllure(allureB),
    });
  }

  if (a.deniveleMonte != null && b.deniveleMonte != null) {
    const [normA, normB] = normaliser(a.deniveleMonte, b.deniveleMonte);
    axes.push({
      cle: 'denivele', libelle: 'D+', normA, normB,
      reelA: `${Math.round(a.deniveleMonte)} m`, reelB: `${Math.round(b.deniveleMonte)} m`,
    });
  }

  if (a.fcMoy != null && b.fcMoy != null) {
    const [normA, normB] = normaliser(a.fcMoy, b.fcMoy);
    axes.push({
      cle: 'fc', libelle: 'FC moy.', normA, normB,
      reelA: `${Math.round(a.fcMoy)} bpm`, reelB: `${Math.round(b.fcMoy)} bpm`,
    });
  }

  if (a.chargeEntrainement != null && b.chargeEntrainement != null) {
    const [normA, normB] = normaliser(a.chargeEntrainement, b.chargeEntrainement);
    axes.push({
      cle: 'charge', libelle: 'Charge', normA, normB,
      reelA: `${Math.round(a.chargeEntrainement)}`, reelB: `${Math.round(b.chargeEntrainement)}`,
    });
  }

  const pctA = pourcentZ1Z2(a.zones);
  const pctB = pourcentZ1Z2(b.zones);
  if (pctA != null && pctB != null) {
    const [normA, normB] = normaliser(pctA, pctB);
    axes.push({
      cle: 'z1z2', libelle: '% Z1-Z2', normA, normB,
      reelA: `${pctA}%`, reelB: `${pctB}%`,
    });
  }

  return axes.length >= MIN_AXES ? { axes } : null;
}

/** Candidat au sélecteur de comparaison — juste ce qu'il faut pour choisir un
 *  défaut (`lireActivitesMemeSport`, lib/db/garmin.ts, fournit `id`/`debut`
 *  avec d'autres champs ignorés ici). */
export type CandidatComparaison = { id: number; debut: string };

/** Choisit la séance comparée par défaut (sélecteur du radar, page de
 *  séance) : la plus récente PARMI CELLES AVANT la séance affichée — « la
 *  séance précédente du même sport » (spec). Si la séance affichée est la
 *  toute première de ce sport (aucune candidate avant elle), replie sur la
 *  plus proche APRÈS : le sélecteur ne doit jamais rester sans sélection
 *  alors qu'une autre séance du même sport existe. `null` seulement si
 *  `candidats` est vide. */
export function choisirComparaisonParDefaut(
  candidats: CandidatComparaison[], debutActuel: string,
): number | null {
  if (candidats.length === 0) return null;

  const avant = candidats.filter((c) => c.debut < debutActuel);
  if (avant.length > 0) {
    return avant.reduce((plusRecent, c) => (c.debut > plusRecent.debut ? c : plusRecent)).id;
  }

  const apres = candidats.filter((c) => c.debut > debutActuel);
  if (apres.length > 0) {
    return apres.reduce((plusProche, c) => (c.debut < plusProche.debut ? c : plusProche)).id;
  }

  // Egalité exacte de date avec toutes les candidates (cas limite) : la
  // première de la liste plutôt qu'aucune sélection.
  return candidats[0].id;
}
