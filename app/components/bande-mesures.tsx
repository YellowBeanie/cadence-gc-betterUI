import type { EtatDuJour, JourneeComplete, Tendances, VO2maxRecent } from '@/lib/types';
import {
  traduireNiveauReadiness, traduireFeedbackReadiness, traduireFeedbackSommeil,
  traduireQualificatifStress, tonDepuisPrefixe, type Ton,
} from '@/lib/statuts-entrainement';
import { formaterDureeHeuresMinutes, formaterDateCourte } from '@/lib/formatage';
import type { ElementLayout, IdTuile } from '@/lib/layout-accueil';
import { varianteEffective, choixVisuel, type VarianteVisuel } from '@/lib/visuels-mesures';
import { classeBandeMesures, DENSITE_PAR_DEFAUT, type Densite } from '@/lib/densite';
import { FENETRE_PAR_DEFAUT, type FenetreJours } from '@/lib/fenetre-temporelle';
import { Sparkline } from './sparkline';
import { JaugeAnneau } from './jauge-anneau';
import { CourbeMesure } from './graphiques';

type Mesure = {
  cle: string;
  label: string;
  valeur: number;
  unite?: string;
  delta?: string;
  deltaTon?: Ton;
  sparkline?: (number | null)[];
  explication: string;
  // Tâche 39 (variantes de visuel) : données optionnelles, chacune exploitée
  // par UNE seule variante non-défaut — jamais requises par chiffre/
  // chiffre-sparkline. Absentes ⇒ la variante correspondante replie sur le
  // défaut (lib/visuels-mesures.ts, `varianteEffective`), jamais un visuel vide.
  serie7j?: (number | null)[];                              // barres-7j
  serieTendance?: { date: string; valeur: number | null }[]; // courbe-section (promotion)
  objectif?: number | null;                                 // jauge — objectif RÉEL Garmin uniquement
};

/** Tâche 31 (mise en évidence positive/négative, demande explicite de l'utilisateur) :
 *  le DS Modernist reste mono-accent — pas de vert « bon ». Positif = encre
 *  forte (`--color-text`), neutre = `--color-neutral-600`, négatif =
 *  `--color-accent-700` (déjà la convention existante). C'est le TEXTE du
 *  delta qui porte le sens (verdict Garmin traduit en toutes lettres quand il
 *  existe), la couleur ne fait qu'appuyer. */
function couleurTon(ton: Ton | undefined): string {
  if (ton === 'negatif') return 'var(--color-accent-700)';
  if (ton === 'positif') return 'var(--color-text)';
  return 'var(--color-neutral-600)';
}

/** Mini-barres 7 jours dans la tuile (variante `barres-7j`, tâche 39) — même
 *  langage visuel que components/charge-semaine.tsx : barre du jour courant
 *  (dernier élément) en accent, vrai zéro en barre quasi nulle plutôt que
 *  masquée, trou (`null`, jour sans donnée) affiché comme une absence
 *  totale — jamais un zéro fabriqué. Même empan que Sparkline (72×22) pour
 *  qu'un changement de variante ne fasse pas sauter la hauteur de la tuile. */
function BarresSept({ valeurs }: { valeurs: (number | null)[] }) {
  const connues = valeurs.filter((v): v is number => v != null);
  const max = Math.max(1, ...connues);
  return (
    <div className="flex items-end gap-1" style={{ width: 72, height: 22 }} aria-hidden="true">
      {valeurs.map((v, i) => {
        const estAujourdhui = i === valeurs.length - 1;
        const hauteur = v == null ? 0 : v > 0 ? (v / max) * 100 : 6;
        return (
          <div key={i} className="flex flex-1 items-end" style={{ height: '100%' }}>
            <div style={{
              width: '100%', height: `${hauteur}%`,
              background: estAujourdhui ? 'var(--color-accent)' : (v != null && v > 0 ? 'var(--color-text)' : 'var(--color-neutral-500)'),
              transformOrigin: 'bottom',
              animation: `growY .7s cubic-bezier(.16,1,.3,1) ${(0.1 + i * 0.05).toFixed(2)}s both`,
            }} />
          </div>
        );
      })}
    </div>
  );
}

function Tuile({ m, variante }: { m: Mesure; variante: VarianteVisuel }) {
  const jaugeUtilisable = variante === 'jauge' && m.objectif != null;

  return (
    <div className="mesure-tuile">
      <h6 style={{ margin: 0, fontSize: 11 }}>{m.label}</h6>
      {jaugeUtilisable ? (
        <div style={{ marginTop: 14 }}>
          <JaugeAnneau valeur={m.valeur} objectif={m.objectif as number} unite={m.unite} />
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5" style={{ marginTop: 14 }}>
            <span style={{
              fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(2.8rem, 4.2vw, 3.8rem)',
              letterSpacing: '-0.04em', lineHeight: 1,
            }}>
              {m.valeur}
            </span>
            {m.unite && <span style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>{m.unite}</span>}
          </div>
          <div className="flex items-center justify-between gap-3" style={{ marginTop: 16 }}>
            {m.delta
              ? (
                <span style={{
                  fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 11, letterSpacing: '.05em',
                  textTransform: 'uppercase', color: couleurTon(m.deltaTon),
                }}>
                  {m.delta}
                </span>
              )
              : <span />}
            {variante === 'chiffre-sparkline' && m.sparkline && <Sparkline valeurs={m.sparkline} />}
            {variante === 'barres-7j' && m.serie7j && <BarresSept valeurs={m.serie7j} />}
          </div>
        </>
      )}
      <p style={{
        fontSize: 12, lineHeight: 1.45, color: 'var(--color-neutral-600)', marginTop: 10, marginBottom: 0,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {m.explication}
      </p>
    </div>
  );
}

/** Bande de mesures du dashboard (design Cadence v2, tâche 22, correspondance
 *  §2 ; enrichie tâche 31 — revue A1 priorité Haute ; ordre/visibilité
 *  personnalisables depuis la tâche 37) : chaque mesure est indépendamment
 *  absente si sa donnée du jour ne l'est pas — jamais un zéro fabriqué ni un
 *  tiret aligné (règle du brief). Sparklines issues de `lireTendances()`, sur
 *  `fenetre` jours (7 par défaut, cf. paramètre ci-dessous). La grille est en
 *  `auto-fit` (globals.css) : une tuile ajoutée au tableau s'insère seule,
 *  aucune mise en page à toucher.
 *
 *  `tuiles` (layout appliqué, /reglages) pilote l'ordre et la visibilité —
 *  jamais la présence : une tuile masquée ou réordonnée reste absente si sa
 *  donnée réelle l'est (règle « jamais de donnée inventée »).
 *
 *  `fenetre` (/reglages, tâche 47) pilote la longueur des sparklines — sauf
 *  celle de la tuile « Charge 7 j » (`cle: 'charge'` ci-dessous), volontairement
 *  exclue : sa valeur ET son libellé désignent la charge aiguë de Garmin, une
 *  définition physiologique fixe à 7 jours (comme le ratio aigu/chronique),
 *  pas une préférence d'affichage — l'élargir créerait un intitulé qui ment
 *  (« Charge 7 j » à côté d'une tendance sur 30 jours). Voir le rapport de la
 *  tâche 47 pour la justification complète de cette exclusion. */
export function BandeMesures({
  etat, journee, tendances, vo2max, tuiles, visuels = null, densite = DENSITE_PAR_DEFAUT,
  fenetre = FENETRE_PAR_DEFAUT,
}: {
  etat: EtatDuJour | null;
  journee: JourneeComplete;
  tendances: Tendances;
  vo2max: VO2maxRecent | null;
  tuiles: ElementLayout<IdTuile>[];
  // Sauvegarde brute de la préférence 'visuels' (/reglages, tâche 39) — jamais
  // validée en amont (lib/db/preferences.ts ne garantit que « du JSON
  // valide ») : chaque choix est revérifié par `varianteEffective` ci-dessous,
  // mesure par mesure. `null` (jamais personnalisé) revient au défaut partout.
  visuels?: unknown;
  // Densité d'affichage (/reglages, tâche 45) : c'est ICI la seule bande de
  // mesures du dashboard qui n'est pas déjà fixée à `.bande-170` par un choix
  // de design antérieur — celle qui répond réellement au réglage.
  densite?: Densite;
  // Fenêtre temporelle des sparklines (/reglages, tâche 47) — voir le
  // commentaire de fonction ci-dessus pour l'exclusion de la tuile « charge ».
  fenetre?: FenetreJours;
}) {
  const mesures: Mesure[] = [];

  // 30 derniers jours pour une section « courbe-section » (promotion) — même
  // fenêtre que la lecture de tendances.charge/hrv/etc. n'est jamais bornée en
  // base (lireTendances) ; on tranche ici pour rester dans le "7-30 derniers
  // jours" du brief tâche 39 sans changer la lecture partagée avec /historique.
  const FENETRE_TENDANCE = 30;

  if (etat?.readiness != null) {
    const niveau = etat.niveauReadiness;
    const tonReadiness: Ton = (niveau === 'POOR' || niveau === 'LOW') ? 'negatif'
      : (niveau === 'GOOD' || niveau === 'HIGH' || niveau === 'EXCELLENT') ? 'positif' : 'neutre';
    // Sous-texte demandé par la revue A1 : verdict Garmin traduit en toutes
    // lettres (feedback_short) — texte de tête de l'explication, jamais un
    // second bloc qui déséquilibrerait la hauteur de la tuile dans la grille.
    const feedback = traduireFeedbackReadiness(journee.readinessFeedback);
    const recup = journee.readinessRecupMin != null
      ? formaterDureeHeuresMinutes(journee.readinessRecupMin * 60) : null;
    mesures.push({
      cle: 'readiness', label: 'Préparation', valeur: etat.readiness, unite: '/100',
      delta: traduireNiveauReadiness(niveau)?.toUpperCase() ?? undefined,
      deltaTon: tonReadiness,
      sparkline: tendances.readiness.slice(-fenetre).map((r) => r.score),
      serieTendance: tendances.readiness.slice(-FENETRE_TENDANCE).map((r) => ({ date: r.date, valeur: r.score })),
      explication: [
        feedback && `${feedback}.`,
        recup && `Récup. conseillée ${recup}.`,
        !feedback && !recup && "Capacité à encaisser une séance aujourd'hui, selon Garmin.",
      ].filter(Boolean).join(' '),
    });
  }

  if (etat?.hrvNuit != null) {
    const sousLePlancher = etat.hrvBasseLimite != null && etat.hrvNuit < etat.hrvBasseLimite;
    mesures.push({
      cle: 'hrv', label: 'HRV nuit', valeur: etat.hrvNuit, unite: 'ms',
      delta: (etat.hrvBasseLimite != null && etat.hrvHauteLimite != null)
        ? `Base ${etat.hrvBasseLimite}–${etat.hrvHauteLimite}` : undefined,
      deltaTon: sousLePlancher ? 'negatif' : 'neutre',
      sparkline: tendances.hrv.slice(-fenetre).map((h) => h.nuit),
      serieTendance: tendances.hrv.slice(-FENETRE_TENDANCE).map((h) => ({ date: h.date, valeur: h.nuit })),
      explication: 'Variabilité du rythme cardiaque la nuit — au-dessus de ta base = bonne récupération.',
    });
  }

  if (etat?.fcRepos != null) {
    // Comparaison à la moyenne 7 j (revue A1 : « aucune comparaison visuelle
    // à la moyenne 7 j pourtant affichée à côté ») — plus bas que sa propre
    // moyenne = bon signe, comparaison numérique directe, jamais un verdict
    // Garmin inventé (il n'existe pas de champ *_feedback pour la FC repos).
    const tonFcRepos: Ton | undefined = etat.fcReposMoy7j != null
      ? (etat.fcRepos < etat.fcReposMoy7j ? 'positif' : etat.fcRepos > etat.fcReposMoy7j ? 'negatif' : 'neutre')
      : undefined;
    mesures.push({
      cle: 'fc-repos', label: 'FC repos', valeur: etat.fcRepos, unite: 'bpm',
      delta: etat.fcReposMoy7j != null ? `Moy 7 j ${etat.fcReposMoy7j}` : undefined,
      deltaTon: tonFcRepos,
      sparkline: tendances.fcRepos.slice(-fenetre).map((f) => f.valeur),
      serieTendance: tendances.fcRepos.slice(-FENETRE_TENDANCE).map((f) => ({ date: f.date, valeur: f.valeur })),
      explication: 'Pouls au repos — plus bas que ta moyenne = bon signe.',
    });
  }

  if (etat?.scoreSommeil != null) {
    const besoin = journee.sommeilDetaille?.besoinMin;
    const dormi = formaterDureeHeuresMinutes(etat.sommeilSec);
    const feedbackSommeil = traduireFeedbackSommeil(journee.sommeilDetaille?.feedback ?? null);
    const insightSommeil = traduireFeedbackSommeil(journee.sommeilDetaille?.insight ?? null);
    mesures.push({
      cle: 'sommeil', label: 'Score sommeil', valeur: etat.scoreSommeil, unite: '/100',
      delta: (dormi && besoin != null)
        ? `${dormi} / ${formaterDureeHeuresMinutes(besoin * 60)} besoin`.toUpperCase()
        : dormi?.toUpperCase() ?? undefined,
      deltaTon: tonDepuisPrefixe(journee.sommeilDetaille?.feedback ?? null) ?? 'neutre',
      sparkline: tendances.scoreSommeil.slice(-fenetre).map((s) => s.valeur),
      serieTendance: tendances.scoreSommeil.slice(-FENETRE_TENDANCE).map((s) => ({ date: s.date, valeur: s.valeur })),
      explication: [feedbackSommeil && `${feedbackSommeil}.`, insightSommeil && `${insightSommeil}.`]
        .filter(Boolean).join(' ') || 'Qualité globale de ta nuit, selon Garmin.',
    });
  }

  const chargeAigue = journee.statutEntrainement?.chargeAigue ?? null;
  if (chargeAigue != null) {
    // Sparkline volontairement hors fenêtre (`fenetre`, tâche 47) : le
    // libellé « Charge 7 j » et la valeur affichée désignent tous deux la
    // charge aiguë Garmin, une définition fixe à 7 jours — voir le
    // commentaire de fonction ci-dessus.
    mesures.push({
      cle: 'charge', label: 'Charge 7 j', valeur: chargeAigue,
      delta: journee.statutEntrainement?.chargeChronique != null
        ? `Chronique ${journee.statutEntrainement.chargeChronique}` : undefined,
      sparkline: tendances.charge.slice(-7).map((c) => c.aigue),
      explication: 'Effort cumulé des 7 derniers jours (charge aiguë).',
    });
  }

  if (journee.activite?.kilocalories != null) {
    mesures.push({
      cle: 'calories', label: 'Calories', valeur: Math.round(journee.activite.kilocalories), unite: 'kcal',
      delta: journee.activite.kilocaloriesActives != null
        ? `Dont ${Math.round(journee.activite.kilocaloriesActives)} actives` : undefined,
      sparkline: tendances.calories.slice(-fenetre).map((c) => c.valeur),
      // `serie7j` (variante barres-7j, tâche 39) reste fixe à 7 : le nom même
      // de la variante et son rendu (BarresSept, gap fixe dans une largeur
      // fixe de 72 px) sont pensés pour 7 barres — voir le rapport tâche 47.
      serie7j: tendances.calories.slice(-7).map((c) => c.valeur),
      explication: 'Dépense totale du jour, activité comprise.',
    });
  }

  // Tâche 31 (revue A1, priorité Haute) : pas/étages/minutes d'intensité/
  // stress/SpO2/VO2max, déjà lus par lireJourneeComplete mais jamais rendus
  // avant cette tâche (à l'exception de VO2max, nouvelle lecture dédiée).

  if (journee.activite?.pas != null) {
    const objectif = journee.activite.objectifPas;
    const distanceKm = journee.activite.distanceM != null
      ? (journee.activite.distanceM / 1000).toFixed(1) : null;
    mesures.push({
      cle: 'pas', label: 'Pas', valeur: journee.activite.pas,
      delta: objectif != null ? `Objectif ${objectif}` : undefined,
      sparkline: undefined,
      // Objectif RÉEL Garmin (jamais inventé, cf. lib/visuels-mesures.ts) —
      // variante jauge ; pas de série 7 j exposée par lireTendances() à ce
      // jour pour les pas, donc barres-7j replie sur le défaut si choisie.
      objectif,
      explication: distanceKm ? `${distanceKm} km parcourus aujourd'hui.` : 'Pas comptés aujourd’hui.',
    });
  }

  if (journee.activite?.etagesMontes != null) {
    mesures.push({
      // Arrondi : Garmin fournit un flottant de podomètre (17.148…) — brut,
      // il débordait de la tuile (capture T31, round 1).
      cle: 'etages', label: 'Étages', valeur: Math.round(journee.activite.etagesMontes),
      explication: 'Étages montés aujourd’hui (dénivelé estimé par le podomètre).',
    });
  }

  if (journee.minutesIntensite?.moderee != null || journee.minutesIntensite?.vigoureuse != null) {
    const moderee = journee.minutesIntensite?.moderee ?? 0;
    const vigoureuse = journee.minutesIntensite?.vigoureuse ?? 0;
    const objectifHebdo = journee.minutesIntensite?.objectifHebdo;
    mesures.push({
      cle: 'intensite', label: 'Intensité — semaine', valeur: moderee, unite: 'min modérée',
      delta: [
        vigoureuse > 0 && `+${vigoureuse} min vigoureuse`,
        objectifHebdo != null && `Objectif ${objectifHebdo}`,
      ].filter(Boolean).join(' · ') || undefined,
      // Objectif RÉEL Garmin (jauge) — pas de série 7 j exposée par
      // lireTendances() pour les minutes d'intensité : barres-7j replie sur
      // le défaut si choisie (même repli que « pas » ci-dessus).
      objectif: objectifHebdo ?? null,
      explication: 'Minutes d’intensité modérée/vigoureuse cumulées sur la semaine Garmin en cours.',
    });
  }

  if (journee.stress?.moyenne != null) {
    const qualificatif = traduireQualificatifStress(journee.stress.qualificatif);
    mesures.push({
      cle: 'stress', label: 'Stress', valeur: journee.stress.moyenne, unite: '/100',
      delta: [
        journee.stress.max != null && `Max ${journee.stress.max}`,
        qualificatif,
      ].filter(Boolean).join(' · ') || undefined,
      explication: 'Niveau de stress moyen du jour, mesuré par la variabilité cardiaque.',
    });
  }

  if (journee.respirationSpo2?.spo2Moyen != null) {
    const spo2Min = journee.respirationSpo2.spo2Min;
    // Seuil clinique usuel (< 90 %) — convention médicale générale, pas un
    // jugement Garmin : aucun champ *_feedback n'existe pour la SpO2.
    const spo2Bas = spo2Min != null && spo2Min < 90;
    mesures.push({
      cle: 'spo2', label: 'SpO2', valeur: journee.respirationSpo2.spo2Moyen, unite: '%',
      delta: spo2Min != null ? `Min ${spo2Min}%` : undefined,
      deltaTon: spo2Bas ? 'negatif' : 'neutre',
      explication: 'Saturation en oxygène du sang pendant le sommeil.',
    });
  }

  if (vo2max != null) {
    mesures.push({
      cle: 'vo2max', label: 'VO2max', valeur: vo2max.valeur, unite: 'ml/kg/min',
      delta: `Séance du ${formaterDateCourte(vo2max.date.slice(0, 10))}`,
      explication: 'Capacité aérobie maximale estimée par Garmin lors de tes sorties.',
    });
  }

  // Respiration (citée avec SpO2 dans le décompte des manques priorité Haute
  // de la revue A1, cf. SYNTHESE.md) : déjà lue par lireJourneeComplete au
  // même titre que SpO2 ci-dessus, jamais rendue avant cette tâche.
  if (journee.respirationSpo2?.respirationSommeil != null) {
    mesures.push({
      cle: 'respiration', label: 'Respiration', valeur: journee.respirationSpo2.respirationSommeil, unite: '/min',
      delta: journee.respirationSpo2.respirationReveil != null
        ? `Réveil ${journee.respirationSpo2.respirationReveil}/min` : undefined,
      explication: 'Fréquence respiratoire moyenne pendant le sommeil.',
    });
  }

  // Âge de forme (nommé dans le brief de la tâche 31 et dans SYNTHESE.md) :
  // Moyenne-Haute dans la matrice détaillée mais explicitement cité parmi les
  // manques à câbler — déjà lu par lireJourneeComplete, jamais rendu.
  if (journee.ageDeForme?.age != null) {
    mesures.push({
      cle: 'age-forme', label: 'Âge de forme', valeur: journee.ageDeForme.age, unite: 'ans',
      delta: journee.ageDeForme.ageAtteignable != null
        ? `Atteignable ${journee.ageDeForme.ageAtteignable}` : undefined,
      explication: 'Âge « physiologique » estimé par Garmin à partir de ta VO2max et ton activité.',
    });
  }

  // Réordonne/filtre selon le layout appliqué (/reglages) : une tuile masquée
  // est retirée, l'ordre suit celui du layout. Toute mesure réelle non
  // répertoriée dans `tuiles` (layout obsolète, tuile ajoutée à ce fichier
  // après la sauvegarde d'un layout) est ajoutée en fin plutôt que perdue —
  // filet de sécurité, ne devrait pas arriver en usage normal puisque
  // `appliquerLayout` complète déjà les ids manquants (lib/layout-accueil.ts).
  const parCle = new Map(mesures.map((m) => [m.cle, m]));
  const vus = new Set<string>();
  const ordonnees: Mesure[] = [];
  for (const t of tuiles) {
    vus.add(t.id);
    if (!t.visible) continue;
    const m = parCle.get(t.id);
    if (m) ordonnees.push(m);
  }
  for (const m of mesures) {
    if (!vus.has(m.cle)) ordonnees.push(m);
  }

  if (ordonnees.length === 0) return null;

  // Variante effective par mesure (tâche 39) : `varianteEffective` revalide le
  // choix sauvegardé contre la table de compatibilité ET la donnée réellement
  // disponible pour CETTE instance (au moins 2 points connus, même seuil que
  // Sparkline) — jamais un visuel vide affiché à la place d'un visuel qui
  // aurait eu quelque chose à montrer.
  const avecVariante = ordonnees.map((m) => ({
    m,
    variante: varianteEffective(m.cle as IdTuile, choixVisuel(visuels, m.cle as IdTuile), {
      serie7j: (m.serie7j?.filter((v) => v != null).length ?? 0) >= 2,
      serieTendance: (m.serieTendance?.filter((p) => p.valeur != null).length ?? 0) >= 2,
      objectif: m.objectif != null,
    }),
  }));

  // Une mesure en variante `courbe-section` quitte la bande : elle se rend
  // plus bas, en section pleine largeur, dans l'ordre des tuiles promues.
  const enTuile = avecVariante.filter(({ variante }) => variante !== 'courbe-section');
  const enSection = avecVariante.filter(({ variante }) => variante === 'courbe-section');

  return (
    <>
      {enTuile.length > 0 && (
        <section className="section">
          <div className={`wrap ${classeBandeMesures(densite)}`}>
            {enTuile.map(({ m, variante }) => <Tuile key={m.cle} m={m} variante={variante} />)}
          </div>
        </section>
      )}
      {enSection.map(({ m }) => (
        <CourbeMesure key={m.cle} titre={m.label} donnees={m.serieTendance ?? []} unite={m.unite ? ` ${m.unite}` : ''} />
      ))}
    </>
  );
}
