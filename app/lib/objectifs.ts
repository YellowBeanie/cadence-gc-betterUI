import type { SeanceUnifiee } from './fusion';

// Tâche 43 (objectifs déclarés, rapport B2 §B.2 N1b) : le système savait ce
// qu'l'utilisateur avait FAIT, jamais ce qu'il VEUT. V1 volontairement bornée aux trois
// types CALCULABLES ci-dessous — pas d'objectif en texte libre, inexploitable
// sans faire interpréter le modèle (contraire à la loi B2 §A.8 : le modèle
// cite, Python/TypeScript compte).

/** Catégories de sport d'un objectif — mêmes clés que le reste de l'app
 *  utilise pour regrouper les activités (`TYPES_COURSE`/`TYPES_RANDO` de
 *  lib/db/garmin.ts et lib/layout-seance.ts, `sport = 'boxe'` des saisies
 *  manuelles) plutôt que les `activity_type` Garmin bruts. `tous` : tout
 *  sport confondu (ex. « 4 séances par semaine », peu importe lesquelles). */
export const SPORTS_OBJECTIF = ['course', 'boxe', 'randonnee', 'tous'] as const;
export type SportObjectif = (typeof SPORTS_OBJECTIF)[number];

export const TYPES_OBJECTIF = ['seances_par_semaine', 'km_par_semaine', 'minutes_par_semaine'] as const;
export type TypeObjectif = (typeof TYPES_OBJECTIF)[number];

export type Objectif = {
  id: number;
  sport: SportObjectif;
  type: TypeObjectif;
  cible: number;
  libelle: string;
  actif: boolean;
  creeLe: string;
};

const LIBELLE_SPORT: Record<SportObjectif, string | null> = {
  course: 'course', boxe: 'boxe', randonnee: 'randonnée', tous: null,
};

/** `12` -> `"12"`, `12.5` -> `"12,5"` — écriture française, jamais de zéro
 *  décimal superflu pour une cible entière. */
function formaterCible(cible: number): string {
  const arrondie = Math.round(cible * 10) / 10;
  return Number.isInteger(arrondie) ? String(arrondie) : String(arrondie).replace('.', ',');
}

/** Libellé généré à la création de l'objectif (jamais saisi en texte libre,
 *  cf. note de tête de fichier) — utilisé tel quel par l'écran /saisie et
 *  cité par l'analyste (prompt-analyse.md). */
export function genererLibelle(sport: SportObjectif, type: TypeObjectif, cible: number): string {
  const c = formaterCible(cible);
  const suffixe = LIBELLE_SPORT[sport];
  const deSport = suffixe ? ` de ${suffixe}` : '';
  switch (type) {
    case 'seances_par_semaine':
      return `${c} séance${cible > 1 ? 's' : ''}${deSport} par semaine`;
    case 'km_par_semaine':
      return `${c} km${deSport} par semaine`;
    case 'minutes_par_semaine':
      return `${c} minute${cible > 1 ? 's' : ''}${deSport} par semaine`;
    default:
      return `${c}${deSport} par semaine`;
  }
}

/** `activity_type` Garmin (course à pied) — même liste que `TYPES_COURSE`
 *  de lib/db/garmin.ts, dupliquée ici : ce module ne peut pas importer
 *  lib/db/garmin.ts (module serveur qui ouvre `node:sqlite`) depuis un
 *  fichier destiné à rester testable sans base de données. */
const TYPES_GARMIN_COURSE = ['running', 'trail_running', 'treadmill_running'];
/** Même liste que `TYPES_RANDO` de lib/layout-seance.ts (non exportée là-bas). */
const TYPES_GARMIN_RANDONNEE = ['hiking', 'walking'];

/** Un `sport` de `SeanceUnifiee` (soit un `activity_type` Garmin brut comme
 *  `running`/`boxing`, soit un sport de saisie manuelle comme `boxe`)
 *  appartient-il à la catégorie d'objectif `categorie` ? Insensible à la
 *  casse, comme les autres comparaisons de sport de l'app
 *  (`lireRegulariteBoxe`, `defautPourSport`). */
export function sportCorrespond(categorie: SportObjectif, sportBrut: string | null): boolean {
  if (categorie === 'tous') return true;
  if (sportBrut == null) return false;
  const s = sportBrut.toLowerCase();
  switch (categorie) {
    case 'boxe': return s === 'boxe' || s === 'boxing';
    case 'course': return TYPES_GARMIN_COURSE.includes(s);
    case 'randonnee': return TYPES_GARMIN_RANDONNEE.includes(s);
    default: return false;
  }
}

/** Avancement RÉEL (décompte, jamais un verdict) d'un objectif sur la
 *  semaine `[lundi, dimanche]` (bornes incluses, format AAAA-MM-JJ) — à
 *  partir de la liste déjà fusionnée Garmin + saisies manuelles
 *  (`fusionnerSeances`, lib/fusion.ts), pour ne jamais compter une séance en
 *  double (une saisie manuelle rattachée à une activité Garmin l'enrichit,
 *  elle ne s'y ajoute pas — même règle que `fusionnerSeances`).
 *  `km_par_semaine` arrondi à une décimale, `minutes_par_semaine` à l'entier
 *  le plus proche. Aucune activité de la semaine ne fait *jamais* renvoyer
 *  autre chose que `0` ici : un `0` sur un vrai décompte de séances n'est pas
 *  la même chose qu'une mesure de santé absente (règle « jamais de zéro
 *  fabriqué » — ce zéro-ci est un compte réel, pas une invention). */
export function calculerAvancementSemaine(
  seances: SeanceUnifiee[], objectif: Pick<Objectif, 'sport' | 'type'>, lundi: string, dimanche: string,
): number {
  const dansLaSemaine = seances.filter((s) => {
    const jour = s.date.slice(0, 10);
    return jour >= lundi && jour <= dimanche && sportCorrespond(objectif.sport, s.sport);
  });
  switch (objectif.type) {
    case 'seances_par_semaine':
      return dansLaSemaine.length;
    case 'km_par_semaine':
      return Math.round(dansLaSemaine.reduce((acc, s) => acc + (s.distanceM ?? 0), 0) / 100) / 10;
    case 'minutes_par_semaine':
      return Math.round(dansLaSemaine.reduce((acc, s) => acc + (s.dureeMin ?? 0), 0));
    default:
      return 0;
  }
}

/** `AAAA-MM-JJ` décalée de `delta` jours — copie locale du même utilitaire
 *  que lib/db/garmin.ts/lib/db/training.ts (arithmétique de date UTC, jamais
 *  un glissement d'un jour sur un changement d'heure), dupliquée pour la même
 *  raison qu'eux : garder ce module indépendant de lib/db (import cycle) et
 *  testable sans base de données. */
function decalerDate(iso: string, delta: number): string {
  const [an, mois, jour] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(an, mois - 1, jour + delta));
  return d.toISOString().slice(0, 10);
}

/** Lundi (ISO) de la semaine contenant `iso` — même copie locale que
 *  `decalerDate` ci-dessus. */
export function lundiDeLaSemaine(iso: string): string {
  const [an, mois, jour] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(an, mois - 1, jour));
  const jourIso = d.getUTCDay() || 7; // 1 = lundi … 7 = dimanche
  d.setUTCDate(d.getUTCDate() - (jourIso - 1));
  return d.toISOString().slice(0, 10);
}

/** Bornes lundi-dimanche de la semaine ISO contenant `dateRef`. */
export function semaineIso(dateRef: string): { lundi: string; dimanche: string } {
  const lundi = lundiDeLaSemaine(dateRef);
  return { lundi, dimanche: decalerDate(lundi, 6) };
}

/** Texte d'avancement affiché sur /saisie, ex. « 1 sur 2 cette semaine »
 *  (séances) ou « 12,5 km sur 15 km cette semaine ». Gabarit neutre, aucun
 *  verdict de réussite/échec — un compte, jamais un jugement (même
 *  contrainte que prompt-analyse.md pour l'analyste). */
export function formaterAvancement(realise: number, cible: number, type: TypeObjectif): string {
  const unite = type === 'km_par_semaine' ? ' km' : type === 'minutes_par_semaine' ? ' min' : '';
  return `${formaterCible(realise)}${unite} sur ${formaterCible(cible)}${unite} cette semaine`;
}
