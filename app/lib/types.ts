// Liste fermée des sports saisissables à l'écran Saisie (tâche 7) : partagée
// entre le formulaire (options du <select>) et la validation de la server
// action, pour qu'il n'existe qu'un seul endroit où l'ajout d'un sport
// pourrait faire diverger l'un de l'autre.
export const SPORTS = ['boxe', 'autre'] as const;
export type Sport = (typeof SPORTS)[number];

export type SeancePrescrite = {
  date: string;
  nom: string | null;
  type: string | null;
  repos: boolean;
  distanceM: number | null;
  dureeSec: number | null;
  intention: string | null;   // workoutPhrase, ex. EASY_WEEK_LOAD_BASE
  plan: string | null;        // tpPlanName
};

export type EtatDuJour = {
  date: string;
  readiness: number | null;
  niveauReadiness: string | null;
  hrvNuit: number | null;
  hrvBasseLimite: number | null;
  hrvHauteLimite: number | null;
  sommeilSec: number | null;
  scoreSommeil: number | null;
  fcRepos: number | null;
  // Moyenne Garmin des 7 derniers jours (tâche 21, bande de mesures Cadence :
  // delta réel de la tuile FC repos) — distincte de fcRepos (valeur du jour).
  fcReposMoy7j: number | null;
};

export type Activite = {
  id: number;
  debut: string;
  nom: string | null;
  type: string | null;
  distanceM: number | null;
  dureeSec: number | null;
  fcMoy: number | null;
  fcMax: number | null;
  effetAerobie: number | null;
};

export type ZonesSeance = {
  activiteId: number;
  debut: string;
  nom: string | null;
  z1: number; z2: number; z3: number; z4: number; z5: number;  // minutes
};

export type Tendances = {
  hrv: { date: string; nuit: number | null; moyenne7j: number | null; basse: number | null; haute: number | null }[];
  readiness: { date: string; score: number | null }[];
  // Stades nullables : une nuit enregistrée sans détail de stade ne doit pas
  // s'afficher comme « 0 h de sommeil profond », qui est une information fausse.
  sommeil: { date: string; profond: number | null; rem: number | null; leger: number | null; eveille: number | null }[];
  charge: { date: string; aigue: number | null; chronique: number | null }[];
  // Série Body Battery (tâche 19, sparklines) : `most_recent` par jour, même
  // convention que les autres séries de Tendances (date ISO, valeur nullable
  // — un jour sans ligne body_battery est un trou, jamais un 0 fabriqué).
  bodyBattery: { date: string; actuel: number | null }[];
  // Trois séries ajoutées pour la bande de mesures du dashboard Cadence
  // (tâche 21) : FC de repos, score de sommeil et calories du jour, même
  // convention date ISO / valeur nullable que les séries ci-dessus.
  fcRepos: { date: string; valeur: number | null }[];
  scoreSommeil: { date: string; valeur: number | null }[];
  calories: { date: string; valeur: number | null }[];
};

export type Fraicheur = {
  dernierSucces: Date | null;
  ageHeures: number | null;
  perime: boolean;   // au-delà de 26 h
};

// Types de la tâche 12 (enrichissement de l'écran Aujourd'hui). Chaque section
// est nullable dans son ensemble : si toutes ses données sont absentes pour le
// jour ancré, la fonction de lecture renvoie `null` plutôt qu'un objet aux
// champs tous à `null` — au composant de ne rien afficher dans ce cas, jamais
// des tirets alignés.

export type BodyBattery = {
  reveil: number | null;
  actuel: number | null;
  pic: number | null;
  creux: number | null;
  recharge: number | null;
  depense: number | null;
};

export type StatutEntrainement = {
  code: string | null;        // valeur brute Garmin, ex. STRAINED_1
  libelle: string | null;     // traduction fidèle (lib/statuts-entrainement.ts)
  chargeAigue: number | null;
  chargeChronique: number | null;
};

export type ActiviteJournee = {
  pas: number | null;
  objectifPas: number | null;
  distanceM: number | null;
  kilocalories: number | null;
  kilocaloriesActives: number | null;
  etagesMontes: number | null;
};

export type MinutesIntensite = {
  // ⚠️ Vérifié sur les données réelles de production : intensity_minutes
  // .moderate/.vigorous sont DÉJÀ le cumul de la semaine Garmin en cours
  // (weeklyModerate/weeklyVigorous du payload brut), pas les minutes du seul
  // jour — Garmin répète la même valeur sur chaque jour de la semaine. Elles
  // ne doivent donc jamais être additionnées sur plusieurs jours (ce serait
  // compter la même semaine plusieurs fois) : la ligne du jour ancré, lue
  // telle quelle, est déjà la bonne valeur hebdomadaire à comparer à
  // `objectifHebdo` (lui aussi hebdomadaire chez Garmin).
  moderee: number | null;
  vigoureuse: number | null;
  objectifHebdo: number | null;
};

export type StressJournee = {
  moyenne: number | null;
  max: number | null;
  qualificatif: string | null;
};

export type RespirationSpo2 = {
  respirationReveil: number | null;
  respirationSommeil: number | null;
  respirationMin: number | null;
  respirationMax: number | null;
  spo2Moyen: number | null;
  spo2Min: number | null;
};

export type SommeilDetaille = {
  // Stades en heures (même convention que Tendances/Graphiques) ; le reste
  // sans transformation.
  profondH: number | null;
  remH: number | null;
  legerH: number | null;
  reveils: number | null;          // awake_count
  fcMoyenneSommeil: number | null; // average_hr_sleep
  spo2MoyenSommeil: number | null; // average_spo2 (distinct de la table spo2)
  siesteMin: number | null;        // nap_time_seconds, en minutes
  // Tâche 31 : verdicts Garmin bruts (traduits côté composant,
  // lib/statuts-entrainement.ts) et besoin de sommeil personnalisé — à
  // comparer à sleepSec (EtatDuJour) ou sommeilSec, pas dupliqué ici.
  feedback: string | null;   // sleep.sleep_score_feedback
  insight: string | null;    // sleep.sleep_score_insight (pourquoi, ex. exercice intense)
  besoinMin: number | null;  // sleep.sleep_need_minutes
};

export type PredictionsCourse = {
  temps5kSec: number | null;
  temps10kSec: number | null;
  tempsSemiSec: number | null;
  tempsMarathonSec: number | null;
};

export type AgeDeForme = {
  age: number | null;              // arrondi à une décimale
  ageChronologique: number | null; // arrondi à une décimale
  ageAtteignable: number | null;   // arrondi à une décimale
};

// Tâche 17 : l'analyse produite côté NAS par l'analyste Claude (tâche 16),
// lue telle quelle depuis `${GARMIN_DATA_DIR}/export/analyse.json`. `genereLe`
// est converti en `Date` par `lib/analyse.ts` (le fichier source porte un
// epoch en secondes) ; `prudence` est nullable — l'analyste ne force jamais
// une mise en garde quand les signaux ne convergent pas.
//
// Tâche 43 : `aSurveiller` (registre daté de l'analyste, rapport B2 §A.6/
// §B.2 N1a) et `question` (question d'auto-coaching optionnelle, §B.2 N1c)
// sont `null` quand la clé JSON est absente — cas nominal le plus fréquent,
// et forme de toute analyse archivée avant leur introduction : l'écran doit
// rester correct face aux deux formes.
//
// Tâche 50 (niveau N2, rapport B2 §B.2) : `suggestions` — 0 à 2 principes
// génériques du corpus versionné (deploy/nas/corpus-principes.md), cités
// avec leur id, JAMAIS calculés ou recalculés par l'app. `null` quand la
// clé est absente (cas nominal le plus fréquent : garde-fou santé actif, ou
// simplement rien à suggérer ce jour-là) et pour toute analyse archivée
// avant l'introduction de ce champ — même discipline que `aSurveiller`.
export type SuggestionPrincipe = { principe: string; texte: string };

export type Analyse = {
  genereLe: Date;
  resume: string;
  observations: string[];
  prudence: string | null;
  aSurveiller: string[] | null;
  question: string | null;
  suggestions: SuggestionPrincipe[] | null;
};

// Tâche 24 : l'analyse comparative PAR SÉANCE produite côté NAS par
// `deploy/nas/analyse-seance.sh`, lue telle quelle depuis
// `${GARMIN_DATA_DIR}/export/analyses-seances/{id}.json` par
// `lib/analyse-seance.ts`. Même forme que `Analyse` (même enveloppe de
// sortie que l'analyste quotidien), type distinct pour ne pas mélanger les
// deux échelles d'analyse (tendances globales vs une séance donnée).
export type AnalyseSeance = {
  genereLe: Date;
  resume: string;
  observations: string[];
  prudence: string | null;
};

// Types de la tâche 20 (écran Historique enrichi + page de détail de séance).
// `SeanceDetail` regroupe tout ce qu'une seule activité Garmin peut porter :
// mesures étendues de `activity`, splits, zones de FC (mêmes minutes que
// `ZonesSeance` mais sans les champs d'identification déjà connus du contexte
// de la page), météo, et la saisie manuelle éventuellement rattachée (RPE,
// notes). Chaque sous-section est nullable indépendamment — même discipline
// que `JourneeComplete` : une donnée absente efface la section, jamais un
// tiret ou un zéro inventé.

export type SplitSeance = {
  numero: number;
  distanceM: number | null;
  dureeSec: number | null;
  vitesseMoyMps: number | null;
  fcMoy: number | null;
  deniveleMonte: number | null;
  cadenceMoy: number | null;
};

export type MinutesZones = { z1: number; z2: number; z3: number; z4: number; z5: number };

export type MeteoSeance = {
  // Garmin renvoie temp/apparentTemp en °F et le vent en mph quel que soit le
  // réglage d'unités du compte (vérifié sur les données réelles de
  // production, cf. lib/db/garmin.ts) — converties ici en °C/km-h, jamais
  // affichées brutes sous un mauvais nom d'unité.
  temperatureC: number | null;
  temperatureRessentieC: number | null;
  humidite: number | null;
  ventKmh: number | null;
  ventDirectionDeg: number | null;
  type: string | null;
};

// Tâche 28 (saisie vocale) : segment d'une séance manuelle (échauffement,
// technique, sac, renfo…), tel que lu par `lireSegments` (lib/db/training.ts).
export type SegmentSeance = {
  type: string;
  dureeMin: number | null;
  notes: string | null;
};

export type SaisieRattachee = {
  rpe: number | null;
  notes: string | null;
  // Date de la saisie manuelle elle-même (tâche 21, méta mono du panneau
  // d'accompagnement Cadence) — jamais celle de l'activité Garmin, les deux
  // pouvant diverger d'un jour (saisie faite après coup).
  date: string;
  // Segments de la saisie vocale rattachée (tâche 28) — [] pour une saisie
  // classique (tapée), jamais fabriqués.
  segments: SegmentSeance[];
};

// Tâche 21 (dashboard Cadence) : charge d'entraînement par jour civil
// (lireChargeParJour) et stats agrégées de la semaine (lireStatsSemaine),
// toutes deux dans lib/db/garmin.ts.
export type ChargeJour = { date: string; total: number };

// Tâche 22 (tendance 8 semaines, écran analyses) : charge d'entraînement
// sommée par semaine ISO (lundi-dimanche). `debut` = lundi de la semaine
// (clé stable, sert de repère chronologique) ; `isoSemaine` = numéro affiché
// (formaterDateLongueFr-like, cf. lib/formatage.ts numeroSemaineIso).
export type ChargeHebdo = { isoSemaine: number; debut: string; total: number };

export type StatsSemaine = {
  volumeKm: number;
  deniveleM: number;
  // null si aucune activité de la semaine n'a de zones de FC connues —
  // jamais un 0 qui se lirait comme « aucun temps en Z1-Z2 ».
  pourcentZ12: number | null;
  seances: number;
};

// Tâche 25 (mesures de progrès, écran Historique) : efficacité aérobie,
// part Z1-Z2 hebdomadaire, plan Garmin passé vs réalisé. Même discipline
// « jamais de zéro fabriqué » que ChargeHebdo/StatsSemaine ci-dessus.

/** `lireEfficaciteAerobie` (lib/db/garmin.ts) : une ligne par activité de
 *  course à pied qui porte à la fois une distance et une FC moyenne connues
 *  (les activités sans l'une ou l'autre sont exclues en amont, pas
 *  représentées ici avec des champs nuls). `indice` = mètres parcourus par
 *  battement de cœur (`distanceM / (dureeMin × fcMoy)`), `null` si la durée
 *  manque malgré tout. */
export type EfficaciteAerobie = {
  debut: string;    // start_time_local, même convention que Activite.debut
  nom: string | null;
  allureSecKm: number | null;
  fcMoy: number | null;
  indice: number | null;
};

/** `lireZonesParSemaine` (lib/db/garmin.ts) : mêmes bornes/exclusions que
 *  `ChargeHebdo` (semaines antérieures à la première activité exclues).
 *  `pctZ1Z2` est `null` — jamais `0` — quand aucune activité de la semaine
 *  n'a de zones de FC connues (même règle que `StatsSemaine.pourcentZ12`). */
export type ZonesHebdo = {
  isoSemaine: number;
  debut: string;
  pctZ1Z2: number | null;
  activitesAvecZones: number;
};

/** Activité de course trouvée le même jour qu'une séance planifiée
 *  (`lirePlanPasse`) — `null` si aucune n'existe ce jour-là. */
export type SeanceRealisee = { id: number; nom: string | null; distanceM: number | null };

/** `lirePlanPasse` (lib/db/garmin.ts) : séances échues du plan Garmin
 *  (jours de repos exclus), chacune éventuellement rapprochée d'une activité
 *  de course réalisée le même jour calendaire. */
export type PlanPasse = {
  date: string;
  nom: string | null;
  distanceM: number | null;
  realisee: SeanceRealisee | null;
};

export type SeanceDetail = {
  id: number;
  nom: string | null;
  type: string | null;
  debut: string;
  lieu: string | null;
  distanceM: number | null;
  dureeSec: number | null;
  calories: number | null;
  fcMoy: number | null;
  fcMax: number | null;
  fcMin: number | null;
  cadenceMoy: number | null;
  cadenceMax: number | null;
  deniveleMonte: number | null;
  deniveleDescente: number | null;
  puissanceMoy: number | null;
  puissanceMax: number | null;
  puissanceNorm: number | null;
  effetAerobie: number | null;
  effetAnaerobie: number | null;
  splits: SplitSeance[];
  zones: MinutesZones | null;
  meteo: MeteoSeance | null;
  saisie: SaisieRattachee | null;
  // Tâche 31 : vo2max_value/body_battery_change vivent directement sur
  // `activity` (pas de jointure) ; ressentiGarmin/dynamique viennent
  // respectivement des mêmes colonnes `activity` et de `running_dynamics`.
  vo2max: number | null;
  bodyBatteryChange: number | null;
  ressentiGarmin: RessentiGarmin | null;
  dynamique: DynamiqueCourse | null;
  // Tâche 40 (radar comparatif) : `activity.training_load`, même colonne que
  // lireChargeParJour/lireChargeParSemaine — lue à part et tolérante (try/catch,
  // cf. lib/db/garmin.ts) car absente d'un instantané généré par une version
  // antérieure du collecteur, exactement comme running_dynamics ci-dessus.
  chargeEntrainement: number | null;
};

/** Point de la trace seconde par seconde, sous-échantillonné (lireTrackpoints,
 *  lib/db/garmin.ts). `vitesseMps` à 0 est une valeur réelle (arrêt/marche) ;
 *  `fcBpm` à `null` est un trou de capteur — ne jamais confondre les deux
 *  (règle « jamais de zéro fabriqué »).
 *
 *  `cadenceSpm`/`puissanceW` ajoutés tâche 48 (courbes enrichies, gisement G7
 *  du rapport d'audit B1) : colonnes `cadence`/`power_w` d'`activity_trackpoints`,
 *  jamais lues avant cette tâche bien que présentes en base (revue A1). Comme
 *  `altitudeM`, `null` signifie « pas de capteur/mesure à cet instant », jamais
 *  un zéro — et une série peut être entièrement absente pour UNE séance donnée
 *  (ex. puissance en randonnée, sans footpod) sans l'être pour une autre du
 *  même sport : voir `seriesDisponibles` (lib/trackpoints.ts), qui décide au
 *  cas par cas plutôt que par sport. */
export type TrackpointSeance = {
  distanceM: number | null;
  fcBpm: number | null;
  vitesseMps: number | null;
  altitudeM: number | null;
  cadenceSpm: number | null;
  puissanceW: number | null;
};

/** Point de la trace GPS pour la carte 3D du parcours (`lireTraceGps`,
 *  lib/db/garmin.ts, tâche 27). Contrairement à `TrackpointSeance` (mesures
 *  physio sous-échantillonnées pour les courbes), ne porte que la géométrie
 *  nécessaire à MapLibre : les lignes sans lat/lon sont filtrées à la source,
 *  `lat`/`lon` sont donc toujours connus ici — seule l'altitude reste
 *  nullable (piste GPS valide mais capteur baro absent). */
export type PointTraceGps = { lat: number; lon: number; altitudeM: number | null };

export type JourneeComplete = {
  date: string | null;
  bodyBattery: BodyBattery | null;
  statutEntrainement: StatutEntrainement | null;
  activite: ActiviteJournee | null;
  minutesIntensite: MinutesIntensite | null;
  stress: StressJournee | null;
  respirationSpo2: RespirationSpo2 | null;
  sommeilDetaille: SommeilDetaille | null;
  predictionsCourse: PredictionsCourse | null;
  ageDeForme: AgeDeForme | null;
  // Tâche 31 (revue A1, mise en évidence positive/négative) : verdicts Garmin
  // bruts de training_readiness, traduits côté composant
  // (lib/statuts-entrainement.ts) — pas un « objet section » nullSiVide,
  // simples champs scalaires indépendants (la tuile Préparation existe déjà
  // via EtatDuJour, ceci ne fait que l'enrichir).
  readinessFeedback: string | null;   // feedback_short
  readinessRecupMin: number | null;   // recovery_time (minutes)
  acwrFeedback: string | null;        // acwr_factor_feedback
};

// Types de la tâche 31 (revue A1 — câblage des manques priorité Haute).

/** `lireVo2maxRecent` (lib/db/garmin.ts) : dernière valeur non nulle
 *  d'`activity.vo2max_value`, par date d'activité — la table dédiée `vo2max`
 *  reste vide pour cet utilisateur (montre neuve), mais la valeur existe déjà
 *  au niveau de l'activité (cf. CLAUDE.md, découverte de la revue A1). */
export type VO2maxRecent = { valeur: number; date: string };

/** `lireZonesFcBornes` (lib/db/garmin.ts) : bornes BPM des zones Z1-Z5
 *  (`hr_zones.raw_json`, une seule ligne de configuration — pas de
 *  `calendar_date`, contrairement au reste du schéma). `fcMax`/`fcRepos`/
 *  `fcSeuilLactate` sont les valeurs utilisées par Garmin pour calculer ces
 *  bornes, nullables indépendamment (`nullSiVide` ne s'applique pas ici :
 *  les 5 planchers de zone sont toujours ensemble ou la ligne n'existe pas). */
export type ZonesFcBornes = {
  z1Plancher: number;
  z2Plancher: number;
  z3Plancher: number;
  z4Plancher: number;
  z5Plancher: number;
  fcMax: number | null;
  fcRepos: number | null;
  fcSeuilLactate: number | null;
};

/** `lirePersonalRecords` (lib/db/garmin.ts) : records personnels rattachés à
 *  une activité et une date connues (`personal_record.pr_date IS NOT NULL`),
 *  seuls types dont le sens est établi (`traduireTypeRecord`,
 *  lib/statuts-entrainement.ts) — les records agrégés sans activité/date
 *  (pas, étages) sont exclus, jamais un type deviné. `nature` détermine le
 *  formatage de `valeur` côté composant (`temps` = secondes, `distance` =
 *  mètres). */
export type PersonalRecord = {
  libelle: string;
  nature: 'temps' | 'distance';
  valeur: number;
  date: string;
  activiteId: number | null;
  activiteNom: string | null;
};

/** `lirePoids` (lib/db/garmin.ts) : mesures de poids (`weight.weight`, en
 *  grammes en base, converti en kg ici). */
export type PoidsMesure = { date: string; kg: number };

/** `lireSeanceDetail` (tâche 31) : ressenti saisi par l'utilisateur directement dans
 *  Garmin Connect (`activity.direct_workout_feel/_rpe`) — distinct de
 *  `SaisieRattachee` (RPE saisi dans CETTE app), à rapprocher côté écran,
 *  jamais fusionné automatiquement (les deux sources peuvent diverger). */
export type RessentiGarmin = { feel: number | null; rpe: number | null };

/** `lireSeanceDetail` (tâche 31) : dynamique de course (`running_dynamics`),
 *  table entière jamais lue avant cette tâche — temps de contact au sol,
 *  équilibre gauche/droite, oscillation et ratio verticaux, longueur de
 *  foulée. `null` dans son ensemble si l'activité n'a pas cette mesure
 *  (capteur de dynamique de course absent, ex. boxe/marche). */
export type DynamiqueCourse = {
  tempsContactSolMs: number | null;
  balanceGctPct: number | null;
  oscillationVerticaleCm: number | null;
  ratioVerticalPct: number | null;
  longueurFouleeCm: number | null;
};
