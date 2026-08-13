// Moteur de layout de la page de séance (tâche 38, personnalisation) :
// transposition directe de lib/layout-accueil.ts (tâche 37) — mêmes idées
// (défaut canonique, fusion tolérante d'une sauvegarde partielle/obsolète/mal
// formée), mais UN défaut par sport plutôt qu'un défaut unique, puisque
// l'objectif produit est justement que chaque sport ait sa propre mise en
// page (spec personnalisation : « la carte d'abord en rando, le ressenti
// d'abord en boxe »).
import { fusionnerListe, estObjet, type ElementLayout } from './layout-accueil';

/** Les sept sections configurables de app/seance/[id]/page.tsx, dans l'ordre
 *  actuel (course à pied) : analyse Claude, courbes FC·allure, carte du
 *  parcours, splits + ressenti saisi, zones de FC, dynamique de course, radar
 *  comparatif inter-séances (tâche 40 — « Comparer — toile d'araignée »,
 *  cf. lib/radar-seances.ts).
 *
 *  ABSENTE volontairement : « photo+stats » (photo + bande de stats en tête
 *  de page). C'est l'identité de la page — non réordonnable, non masquable —
 *  exactement comme la bannière de brouillons vocaux à l'accueil
 *  (lib/layout-accueil.ts) : jamais une préférence, rendue à part par
 *  app/seance/[id]/page.tsx avant même de lire ce layout. Le bandeau
 *  titre/retour n'est pas non plus une section (il n'est même pas un
 *  candidat : il n'existe dans aucune des tuiles ci-dessous). */
export const SECTIONS_SEANCE = [
  'analyse', 'courbes', 'carte', 'splits-ressenti', 'zones', 'dynamique', 'radar',
] as const;
export type IdSectionSeance = (typeof SECTIONS_SEANCE)[number];

export type LayoutSeance = { sections: ElementLayout<IdSectionSeance>[] };

function section(id: IdSectionSeance, visible = true): ElementLayout<IdSectionSeance> {
  return { id, visible };
}

/** Course à pied / trail / tapis — et repli « inconnu / autre » : l'ordre
 *  actuel de la page, à l'identique, rien de désactivé. */
const DEFAUT_COURSE: LayoutSeance = {
  sections: [
    section('analyse'), section('courbes'), section('carte'),
    section('splits-ressenti'), section('zones'), section('dynamique'), section('radar'),
  ],
};

/** Randonnée / marche : la carte est l'histoire d'une rando (spec
 *  personnalisation), elle passe juste après photo+stats, avant même
 *  l'analyse. Rien n'est désactivé : une rando qui porte quand même une
 *  dynamique de course (tapis hybride, capteur présent) la garde. */
const DEFAUT_RANDO: LayoutSeance = {
  sections: [
    section('carte'), section('analyse'), section('courbes'),
    section('splits-ressenti'), section('zones'), section('dynamique'), section('radar'),
  ],
};

/** Boxe et sports « manuels » (renforcement) : ni carte ni courbe d'allure —
 *  ces séances n'ont de toute façon presque jamais de trace GPS seconde par
 *  seconde (invariant « donnée absente = section absente » déjà suffisant en
 *  pratique), mais le défaut les désactive explicitement pour l'INTENTION :
 *  une allure ou un tracé n'a pas de sens pour ces sports, même le jour où un
 *  capteur en produirait un. Ressenti/segments (splits-ressenti) en tête —
 *  c'est ce qui compte en premier pour ces séances. Le radar comparatif
 *  (tâche 40) est désactivé pour la même raison : distance/allure/D+, la
 *  moitié de ses axes candidats, n'ont pas de sens en boxe. Les trois
 *  sections désactivées restent dans la liste (visible: false), pas retirées :
 *  /reglages doit pouvoir les réactiver. */
const DEFAUT_MANUEL: LayoutSeance = {
  sections: [
    section('splits-ressenti'), section('analyse'), section('zones'), section('dynamique'),
    section('carte', false), section('courbes', false), section('radar', false),
  ],
};

/** `activity_type` Garmin (brut, n'importe quelle casse) → défaut de mise en
 *  page. Seuls quatre groupes sont distingués (spec personnalisation) : tout
 *  type non reconnu — y compris vélo/natation, jamais mentionnés par la spec —
 *  tombe sur le même défaut que « inconnu / autre », c'est-à-dire l'ordre
 *  actuel de la page. */
const TYPES_RANDO = ['hiking', 'walking'];
const TYPES_MANUEL = ['boxing', 'strength_training'];

export function defautPourSport(type: string | null): LayoutSeance {
  const t = type?.toLowerCase() ?? '';
  if (TYPES_RANDO.includes(t)) return DEFAUT_RANDO;
  if (TYPES_MANUEL.includes(t)) return DEFAUT_MANUEL;
  return DEFAUT_COURSE;
}

/** Un `activity_type` Garmin réel ne contient que des lettres ASCII, chiffres
 *  et soulignés (cf. SPORTS_FR, lib/formatage.ts) — tout le reste ne peut
 *  venir que d'une requête forgée à la main (app/actions.ts) ou d'un fichier
 *  d'import tiers (lib/preferences-registre.ts, tâche 46) et doit être rejeté.
 *  Exportée pour rester l'unique définition, réutilisée par les deux. */
export function sportValide(sport: string): boolean {
  return /^[a-z0-9_]+$/.test(sport);
}

/** Fusionne `defaut` (le défaut du sport affiché, cf. `defautPourSport`) avec
 *  une sauvegarde lue via `lirePreference` (clé `seance:<type>`) — même
 *  garde et même fusion générique que `appliquerLayout` (lib/layout-accueil.ts),
 *  réutilisées telles quelles plutôt que redupliquées. */
export function appliquerLayoutSeance(defaut: LayoutSeance, sauvegarde: unknown): LayoutSeance {
  if (!estObjet(sauvegarde)) return defaut;
  return { sections: fusionnerListe(defaut.sections, sauvegarde.sections) };
}
