import Link from 'next/link';
import {
  lireChargeParSemaine, lireEfficaciteAerobie, lirePersonalRecords, lirePlanPasse, lirePoids,
  lireProchainesSeances, lireStatsSemaine, lireTendances, lireZonesParSemaine,
} from '@/lib/db/garmin';
import { lireRegulariteBoxe } from '@/lib/db/training';
import { lireAnalyse, ageAnalyseHeures, MENTION_SUGGESTIONS } from '@/lib/analyse';
import { initialiserSchema } from '@/lib/db/schema';
import { numeroSemaineIso } from '@/lib/formatage';
import { lirePreference } from '@/lib/db/preferences';
import {
  LAYOUT_HISTORIQUE_PAR_DEFAUT, appliquerLayoutHistorique, type IdSectionHistorique, type LayoutHistorique,
} from '@/lib/layout-historique';
import { appliquerFenetre, type FenetreJours } from '@/lib/fenetre-temporelle';
import { BoxeRegularite } from '@/components/boxe-regularite';
import { EfficaciteAerobie } from '@/components/efficacite-aerobie';
import { Graphiques } from '@/components/graphiques';
import { StatsSemaineBande } from '@/components/stats-semaine';
import { TendanceSemaines } from '@/components/tendance-semaines';
import { ZonesParSemaine } from '@/components/zones-par-semaine';
import { Guidance } from '@/components/guidance';
import { RecordsPersonnels, PoidsTuile } from '@/components/records-poids';

// Comme app/page.tsx et app/saisie/page.tsx : pas de Cache Components activés
// (next.config.ts), donc `force-dynamic` reste le mécanisme valide pour forcer
// une lecture SQLite (instantané Garmin + saisies + préférences) à chaque
// requête plutôt qu'au build — cet écran est celui qui lit le plus large
// historique.
export const dynamic = 'force-dynamic';

/** Un id de section mappé sur son rendu, dans l'ordre du layout (/reglages,
 *  tâche 45). Le bloc « stats-semaine » combine STATIQUEMENT
 *  `StatsSemaineBande` et `PoidsTuile` (comme l'écran actuel les affiche déjà
 *  l'un après l'autre) — pas deux sections séparées : ni le rapport B1 ni la
 *  mission ne les distinguent, et fabriquer une section « poids » à part
 *  serait une section artificielle pour un unique champ. */
function rendreSectionHistorique(
  id: IdSectionHistorique, ctx: {
    stats: ReturnType<typeof lireStatsSemaine>;
    poids: ReturnType<typeof lirePoids>;
    semaines: ReturnType<typeof lireChargeParSemaine>;
    zonesSemaines: ReturnType<typeof lireZonesParSemaine>;
    efficacite: ReturnType<typeof lireEfficaciteAerobie>;
    records: ReturnType<typeof lirePersonalRecords>;
    tendances: ReturnType<typeof lireTendances>;
    prochaines: ReturnType<typeof lireProchainesSeances>;
    prudence: string | null;
    planPasse: ReturnType<typeof lirePlanPasse>;
    boxeSemaines: ReturnType<typeof lireRegulariteBoxe>;
    fenetre: FenetreJours;
  },
) {
  switch (id) {
    case 'stats-semaine':
      return (
        <section className="section" key={id}>
          <div className="wrap" style={{ paddingBlock: 'clamp(40px,6vh,72px)' }}>
            <StatsSemaineBande stats={ctx.stats} fenetre={ctx.fenetre} />
            <PoidsTuile mesures={ctx.poids} />
          </div>
        </section>
      );
    case 'tendance-semaines':
      return <TendanceSemaines key={id} semaines={ctx.semaines} />;
    case 'zones-par-semaine':
      return <ZonesParSemaine key={id} semaines={ctx.zonesSemaines} />;
    case 'efficacite-aerobie':
      return <EfficaciteAerobie key={id} seances={ctx.efficacite} />;
    case 'records':
      return <RecordsPersonnels key={id} records={ctx.records} />;
    case 'graphiques':
      return <Graphiques key={id} t={ctx.tendances} />;
    case 'guidance':
      return <Guidance key={id} prochaines={ctx.prochaines} prudence={ctx.prudence} planPasse={ctx.planPasse} />;
    case 'boxe-regularite':
      return <BoxeRegularite key={id} semaines={ctx.boxeSemaines} />;
    default:
      return null;
  }
}

/** Écran « analyses » (design Cadence v2, tâche 22 ; mesures de progrès
 *  tâche 25 ; personnalisable depuis la tâche 45) : en-tête = analyse Claude
 *  réelle (ou « Tendances. » simple si aucune analyse) — c'est l'IDENTITÉ de
 *  la page, toujours en tête, jamais réordonnable ni masquable (même
 *  décision que le héros de brouillons de l'accueil ou le bloc photo+stats de
 *  la page séance). Le reste — stats de semaine, tendance 8 semaines, part
 *  Z1-Z2, efficacité aérobie, records, graphiques de tendance, guidance,
 *  régularité boxe — suit l'ordre choisi dans /reglages (défaut = cet ordre
 *  exact), section masquée simplement sautée. Le lien final vers /seances
 *  reste fixe : c'est de la navigation, pas une préférence d'affichage. */
export default function Historique() {
  initialiserSchema();
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const tendances = lireTendances();
  const analyse = lireAnalyse();
  // Fenêtre temporelle (/reglages, tâche 47) : préférence globale, pilote
  // uniquement la bande de stats « N derniers jours » ci-dessous — pas les
  // vues à période propre par nature (semaines ISO, plan passé 14 j...).
  const fenetre = appliquerFenetre(lirePreference<unknown>('fenetre_jours', null));
  const stats = lireStatsSemaine(aujourdhui, fenetre);
  const semaines = lireChargeParSemaine(8);
  const zonesSemaines = lireZonesParSemaine(8);
  const efficacite = lireEfficaciteAerobie();
  const prochaines = lireProchainesSeances(aujourdhui, 3);
  const planPasse = lirePlanPasse(14, aujourdhui);
  const boxeSemaines = lireRegulariteBoxe(8);
  const records = lirePersonalRecords();
  const poids = lirePoids();

  const sauvegardeLayout = lirePreference<LayoutHistorique | null>('historique', null);
  const layout = appliquerLayoutHistorique(LAYOUT_HISTORIQUE_PAR_DEFAUT, sauvegardeLayout);

  return (
    <main className="flex w-full flex-1 flex-col" style={{ animation: 'rise .6s cubic-bezier(.16,1,.3,1) both' }}>
      <section>
        <div className="wrap" style={{ paddingTop: 'clamp(48px,8vh,96px)', paddingBottom: 0 }}>
          <h6 style={{ color: 'var(--color-accent)' }}>Semaine {numeroSemaineIso(aujourdhui)} — analyse</h6>
          <h1 style={{
            fontSize: 'clamp(2.6rem, 6.5vw, 5rem)', letterSpacing: '-0.035em',
            lineHeight: .98, margin: '12px 0 0', maxWidth: '20ch', textTransform: 'uppercase',
          }}>
            {analyse ? analyse.resume : 'Tendances.'}
          </h1>
          {analyse?.prudence && (
            <p className="p mt-5" style={{ borderLeft: '2px solid var(--color-accent)', paddingLeft: 16, maxWidth: '60ch' }}>
              {analyse.prudence}
            </p>
          )}
          {analyse?.aSurveiller && analyse.aSurveiller.length > 0 && (
            // Tâche 43 : registre daté de l'analyste — une ligne sobre, jamais
            // une alerte (ce n'est pas `prudence`) : pas de filet accent, juste
            // un petit label en capitales devant les points, séparés par « · ».
            <p className="mt-4" style={{ fontSize: 13, color: 'var(--color-neutral-600)', maxWidth: '60ch' }}>
              <span style={{
                fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 11, letterSpacing: '.06em',
                textTransform: 'uppercase', marginRight: 8,
              }}>
                À surveiller
              </span>
              {analyse.aSurveiller.join(' · ')}
            </p>
          )}
          {analyse?.question && (
            // Tâche 43 : question d'auto-coaching — une invitation à réfléchir,
            // pas une alerte : accent réservé au petit label, texte en italique
            // plutôt qu'un filet vertical (déjà pris par `prudence`).
            <div className="mt-5" style={{ maxWidth: '60ch' }}>
              <h6 style={{ color: 'var(--color-accent)' }}>Une question</h6>
              <p className="p mt-2" style={{ fontStyle: 'italic' }}>{analyse.question}</p>
            </div>
          )}
          {analyse && (
            <p className="mt-4" style={{
              fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 10, letterSpacing: '.08em',
              textTransform: 'uppercase', color: 'var(--color-neutral-600)',
            }}>
              Claude · il y a {Math.floor(ageAnalyseHeures(analyse))}h
            </p>
          )}
          {analyse && analyse.observations.length > 0 && (
            <div className="mt-6" style={{ maxWidth: '66ch' }}>
              <h6 style={{ color: 'var(--color-accent)' }}>Observations</h6>
              <div className="mt-3">
                {analyse.observations.map((o, i) => (
                  // Pas de clé stable (observations potentiellement dupliquées
                  // par l'analyste) : index + texte, ordre du tableau inchangé.
                  <p key={`${i}-${o}`} style={{
                    fontSize: 15, lineHeight: 1.55, color: 'var(--color-neutral-700)',
                    margin: 0, padding: '14px 0', borderTop: '1px solid var(--color-divider)',
                  }}>
                    {o}
                  </p>
                ))}
              </div>
            </div>
          )}
          {analyse?.suggestions && analyse.suggestions.length > 0 && (
            // Tâche 50 (niveau N2) : bloc DISTINCT, sobre — un contenu calme
            // (principes génériques attribués), pas une alerte, donc pas le
            // filet accent de `prudence`. Filet 2px pour le séparer des
            // observations juste au-dessus (DS Modernist, rayon 0).
            <div className="mt-8" style={{ maxWidth: '66ch', borderTop: '2px solid var(--color-divider)', paddingTop: 24 }}>
              <h6 style={{ color: 'var(--color-accent)' }}>Suggestions — corpus de principes</h6>
              <div className="mt-3">
                {analyse.suggestions.map((s, i) => (
                  <div key={`${i}-${s.principe}`} style={{
                    display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 14, alignItems: 'baseline',
                    padding: '14px 0', borderTop: i > 0 ? '1px solid var(--color-divider)' : undefined,
                  }}>
                    <span className="tag-v2" style={{ background: 'var(--color-neutral-200)', color: 'var(--color-text)' }}>
                      {s.principe}
                    </span>
                    <p style={{
                      fontSize: 15, lineHeight: 1.55, color: 'var(--color-neutral-700)', margin: 0,
                    }}>
                      {s.texte}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3" style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-neutral-600)' }}>
                {MENTION_SUGGESTIONS}
              </p>
            </div>
          )}
        </div>
      </section>

      {layout.sections.filter((s) => s.visible).map((s) => rendreSectionHistorique(s.id, {
        stats, poids, semaines, zonesSemaines, efficacite, records, tendances,
        prochaines, prudence: analyse?.prudence ?? null, planPasse, boxeSemaines, fenetre,
      }))}

      <section className="section">
        <div className="wrap" style={{ paddingBlock: 'clamp(40px,6vh,72px)' }}>
          <Link href="/seances" className="link-arrow">
            Toutes les séances
            <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden="true">
              <path d="M0 5h12M8 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.25" />
            </svg>
          </Link>
        </div>
      </section>
    </main>
  );
}
