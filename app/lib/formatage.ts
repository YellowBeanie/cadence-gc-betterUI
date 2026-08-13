/** `AAAA-MM-JJ` → `JJ.MM` : format court partagé par la barre d'état et la
 *  carte séance (prochaines séances du plan) — déplacé de barre-etat.tsx
 *  (tâche défauts Bento, défaut 3) pour être réutilisable sans dupliquer le
 *  découpage de chaîne. La date est déjà validée en amont (cf. lib/db/garmin.ts). */
export function formaterDateCourte(iso: string): string {
  const [, mois, jour] = iso.split('-');
  return `${jour}.${mois}`;
}

/** `AAAA-MM-JJ HH:MM:SS` (start_time_local de `activity`) → `JJ.MM.AAAA ·
 *  HH:MM` — en-tête de la page de détail de séance (tâche 20). Même registre
 *  numérique court que `formaterDateCourte`, jamais de nom de mois : l'app
 *  n'utilise nulle part le calendrier littéral. */
export function formaterDateHeureSeance(debutSql: string): string {
  const [datePart, heurePart] = debutSql.split(' ');
  const [annee, mois, jour] = datePart.split('-');
  return heurePart ? `${jour}.${mois}.${annee} · ${heurePart.slice(0, 5)}` : `${jour}.${mois}.${annee}`;
}

/** Formate le code brut `workoutPhrase` de Garmin (ex. EASY_WEEK_LOAD_BASE)
 *  en texte plus lisible SANS inventer de traduction — minuscules, espaces à
 *  la place des soulignés. Même prudence que `traduireStatutEntrainement`
 *  (lib/statuts-entrainement.ts) : l'app ne devine jamais un sens qu'elle ne
 *  peut pas vérifier, elle se contente de rendre le code brut lisible. */
export function formaterPhraseSeance(code: string): string {
  return code.replace(/_/g, ' ').toLowerCase();
}

/** Traduit un `activity_type` Garmin en libellé français (« running » →
 *  « course », tâche 22 : la maquette v2 affiche le sport en toutes lettres
 *  dans les lignes de séances et l'en-tête de détail). Table volontairement
 *  limitée aux types vérifiables ; un type inconnu passe par le même
 *  nettoyage prudent que `formaterPhraseSeance` (soulignés → espaces,
 *  minuscules) plutôt qu'une traduction devinée. */
const SPORTS_FR: Record<string, string> = {
  running: 'course',
  trail_running: 'trail',
  treadmill_running: 'tapis de course',
  hiking: 'randonnée',
  walking: 'marche',
  cycling: 'vélo',
  indoor_cycling: 'vélo intérieur',
  lap_swimming: 'natation',
  open_water_swimming: 'natation eau libre',
  strength_training: 'renforcement',
  boxing: 'boxe',
};
export function traduireSport(type: string | null): string | null {
  if (type == null) return null;
  return SPORTS_FR[type.toLowerCase()] ?? formaterPhraseSeance(type);
}

/** Formate une durée de prédiction de course : `h:mm:ss` au-delà d'une heure,
 *  `m:ss` en dessous — convention habituelle des chronos course à pied
 *  (jamais de zéro de tête sur les minutes sous l'heure, ex. « 24:15 »). */
export function formaterDureeCourse(sec: number | null): string {
  if (sec == null) return '—';
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

/** Allure moyenne d'une séance, en secondes par kilomètre — `dureeSec /
 *  (distanceM / 1000)`. `null` si la distance est absente ou nulle (jamais
 *  une division par zéro déguisée), ou si la durée est absente (tâche 20,
 *  ligne d'Historique enrichie et page de détail de séance). */
export function allureSecParKm(dureeSec: number | null, distanceM: number | null): number | null {
  if (dureeSec == null || distanceM == null || distanceM <= 0) return null;
  return dureeSec / (distanceM / 1000);
}

/** Formate une allure (secondes par kilomètre) en `m:ss /km` — même absence
 *  de zéro de tête sur les minutes que `formaterDureeCourse`, unité toujours
 *  explicite (une allure nue serait ambiguë avec un simple chrono). */
export function formaterAllure(secParKm: number | null): string {
  if (secParKm == null) return '—';
  const total = Math.round(secParKm);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')} /km`;
}

/** `AAAA-MM-JJ` → date longue française, ex. « dimanche 9 août 2026 » —
 *  label du rapport du matin (design Cadence, tâche 21). `Intl` plutôt qu'une
 *  table de mois : le nom du jour/mois est du texte réel, pas une donnée à
 *  formater à la main. Capitalisée (convention de titre de section de la
 *  maquette), le reste en minuscules comme l'orthographe française l'exige. */
export function formaterDateLongueFr(iso: string): string {
  const [an, mois, jour] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(an, mois - 1, jour));
  // `fr-CH` insère une virgule après le jour de semaine (« dimanche, 9 août
  // 2026 ») — retirée pour coller au label sobre de la maquette (« Dimanche 9
  // août 2026. »), Intl ne l'expose pas comme option.
  const texte = new Intl.DateTimeFormat('fr-CH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(d).replace(',', '');
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/** `AAAA-MM-JJ[...]` → `JJ.MM.AAAA` — compteur d'ouverture de l'écran
 *  « toutes les séances » (tâche 26) : `s.date` peut porter une heure
 *  (activité Garmin, `AAAA-MM-JJ HH:MM:SS`) ou non (saisie manuelle,
 *  `AAAA-MM-JJ`) — seuls les 10 premiers caractères comptent ici, jamais
 *  d'heure affichée dans ce compteur. */
export function formaterDateCourteAvecAnnee(iso: string): string {
  const [annee, mois, jour] = iso.slice(0, 10).split('-');
  return `${jour}.${mois}.${annee}`;
}

/** Fuseau d'affichage de TOUTES les heures murales de l'app (tâche 49 — bug
 *  des 2h d'écart) : `TZ` de l'environnement (défini sur le service `app` de
 *  deploy/nas/docker-compose.yml), sinon `Europe/Zurich` par défaut (dev
 *  local, autre déploiement open source sans variable positionnée).
 *
 *  Pourquoi un fuseau EXPLICITE plutôt que les accesseurs locaux de `Date`
 *  (`getHours`/`getMinutes`/`getDate`/`getMonth`, comportement d'origine) :
 *  ces accesseurs dépendent du fuseau du RUNTIME qui exécute le code, pas de
 *  celui du stack — et ce runtime diffère selon le composant. Un composant
 *  serveur (ex. `analyse-seance.tsx`, sans `'use client'`) s'exécute dans le
 *  conteneur `app` (UTC par défaut, aucun `TZ` positionné avant ce correctif)
 *  et affichait donc une heure UTC, décalée de 2h en été (CEST, UTC+2) par
 *  rapport à l'heure suisse. Un composant `'use client'` (ex. `entete.tsx`)
 *  s'hydrate en revanche dans le NAVIGATEUR : ses accesseurs locaux
 *  utilisaient le fuseau du poste de l'utilisateur, correct par coïncidence
 *  pour un usage depuis la Suisse — jamais garanti, et jamais vrai côté
 *  serveur. `Intl.DateTimeFormat` avec `timeZone` explicite rend le résultat
 *  identique quel que soit le runtime. */
const FUSEAU_AFFICHAGE = process.env.TZ && process.env.TZ.trim() !== '' ? process.env.TZ : 'Europe/Zurich';

/** Décompose une Date en champs JJ/MM/HH/MM dans FUSEAU_AFFICHAGE. `hourCycle:
 *  'h23'` (plutôt que `hour12: false` seul) : certains moteurs ICU rendent
 *  minuit `24:00` avec `hour12: false`, jamais avec `h23` — vérifié pour le
 *  moteur ICU embarqué dans Node 24 (image `node:24-slim` du Dockerfile). */
function partiesDateAffichage(d: Date): { jour: string; mois: string; heure: string; minute: string } {
  const parties = new Intl.DateTimeFormat('fr-CH', {
    timeZone: FUSEAU_AFFICHAGE,
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const valeur = (type: string) => parties.find((p) => p.type === type)?.value ?? '00';
  return {
    jour: valeur('day'), mois: valeur('month'), heure: valeur('hour'), minute: valeur('minute'),
  };
}

/** `Date` → heure courte murale `HH:MM` dans FUSEAU_AFFICHAGE (pastille de
 *  synchro du header Cadence, tâche 21 ; fuseau explicite depuis la tâche 49,
 *  voir FUSEAU_AFFICHAGE ci-dessus). */
export function formaterHeureCourte(d: Date): string {
  const { heure, minute } = partiesDateAffichage(d);
  return `${heure}:${minute}`;
}

/** `Date` → date + heure courtes murales `JJ.MM · HH:MM` dans FUSEAU_AFFICHAGE
 *  (méta du panneau Analyse — Claude, page de détail de séance, tâche 24 ;
 *  fuseau explicite depuis la tâche 49) — même registre numérique court que
 *  `formaterDateCourte`/`formaterHeureCourte`, jamais de nom de mois. */
export function formaterDateHeureCourte(d: Date): string {
  const { jour, mois, heure, minute } = partiesDateAffichage(d);
  return `${jour}.${mois} · ${heure}:${minute}`;
}

/** Secondes → durée courte `XhYY`, ex. `7h42` (delta du score de sommeil,
 *  bande de mesures Cadence, tâche 21) — jamais de zéro fabriqué : `null` en
 *  entrée reste `null` en sortie, pas de tiret ici (l'appelant décide s'il
 *  affiche la ligne). */
export function formaterDureeHeuresMinutes(sec: number | null): string | null {
  if (sec == null) return null;
  const total = Math.round(sec / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

/** Numéro de semaine ISO 8601 (lundi premier jour, semaine 1 = celle
 *  contenant le premier jeudi de l'année) — label de l'écran Historique/
 *  analyses (« SEMAINE {n}… », tâche 21). */
export function numeroSemaineIso(iso: string): number {
  const [an, mois, jour] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(an, mois - 1, jour));
  // Décale au jeudi de la même semaine ISO (lundi=1 … dimanche=7).
  const jourIso = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - jourIso);
  const debutAnnee = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - debutAnnee.getTime()) / 86_400_000 + 1) / 7);
}
