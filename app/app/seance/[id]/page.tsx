import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  lireActivitesMemeSport, lireSeanceDetail, lireTraceGps, lireTrackpoints, lireZonesFcBornes,
} from '@/lib/db/garmin';
import { initialiserSchema } from '@/lib/db/schema';
import { formaterDateCourte, formaterDateHeureSeance, traduireSport } from '@/lib/formatage';
import { lireAnalyseSeance } from '@/lib/analyse-seance';
import { lirePhotosSeance } from '@/lib/photos';
import { lirePreference } from '@/lib/db/preferences';
import { appliquerLayoutSeance, defautPourSport, type IdSectionSeance, type LayoutSeance } from '@/lib/layout-seance';
import { seriesDisponibles } from '@/lib/trackpoints';
import { appliquerSeriesCourbe } from '@/lib/series-courbe';
import { choisirComparaisonParDefaut, construireRadar } from '@/lib/radar-seances';
import { ResumeSeance } from '@/components/resume-seance';
import { CourbeSeance } from '@/components/courbe-seance';
import { SectionCarteParcours } from '@/components/section-parcours';
import { PhotosSeance } from '@/components/photos-seance';
import { SplitsSeance } from '@/components/splits-seance';
import { PanneauZonesFcSeance } from '@/components/zones-fc';
import { SaisieRattacheeTuile } from '@/components/saisie-rattachee';
import { AnalyseSeanceTuile } from '@/components/analyse-seance';
import { DynamiqueCourseTuile } from '@/components/dynamique-course';
import { RadarSeances } from '@/components/radar-seances';
import { EnteteTuile } from '@/components/ligne-mesure';

// Comme les autres pages (app/page.tsx, historique/page.tsx, saisie/page.tsx) :
// pas de Cache Components activés (next.config.ts), `force-dynamic` force une
// lecture SQLite à chaque requête plutôt qu'au build.
export const dynamic = 'force-dynamic';

// Next 16 : `params` est un Promise dans l'App Router (vérifié dans
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
// dynamic-routes.md avant d'écrire cette page) — il faut l'attendre avant de
// lire `id`, jamais y accéder de façon synchrone.
// Next 16 : `searchParams` est lui aussi un Promise (même page citée
// ci-dessus) — utilisé par le sélecteur de comparaison du radar (tâche 40,
// `?comparer=<id>`), même convention que `app/reglages/page.tsx` (`?sport=`) :
// un simple `<form method="get">`, sans état client.
export default async function SeanceDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ comparer?: string }>;
}) {
  initialiserSchema();
  const { id: idBrut } = await params;
  const id = Number(idBrut);
  // Un id non numérique (URL tapée à la main, lien cassé) ou une activité
  // inconnue de l'instantané reçoivent le même traitement : la page 404 de
  // Next, jamais un écran vide qui laisserait croire à une séance sans données.
  if (!Number.isFinite(id)) notFound();

  const detailBrut = lireSeanceDetail(id);
  if (!detailBrut) notFound();
  // Reliaison en `const` de type déjà non-null : TS ne propage pas le
  // rétrécissement de `detailBrut` (via `notFound()`, qui ne revient jamais)
  // jusque dans la fonction imbriquée `rendreSection` définie plus bas —
  // usages ci-dessous et dans `rendreSection` restent donc `SeanceDetail`.
  const detail = detailBrut;

  const trackpoints = lireTrackpoints(id);
  const traceGps = lireTraceGps(id);
  const bornesZonesFc = lireZonesFcBornes();
  const photos = lirePhotosSeance(id);
  const analyseSeance = lireAnalyseSeance(id);
  const colonneDroite = detail.saisie != null;

  // Template de page par sport (tâche 38, personnalisation) : clé
  // `seance:<type>` (activity_type Garmin brut, minuscule), repli sur
  // « seance:autre » quand l'activité n'a pas de type connu — même bucket
  // « inconnu / autre » que `defautPourSport` (lib/layout-seance.ts).
  // Photo+stats n'en fait pas partie : rendue juste après, toujours en
  // premier, jamais réordonnable (voir le commentaire de SECTIONS_SEANCE).
  const typeSeance = detail.type?.toLowerCase() ?? 'autre';
  const sauvegardeLayout = lirePreference<LayoutSeance | null>(`seance:${typeSeance}`, null);
  const layoutSeance = appliquerLayoutSeance(defautPourSport(detail.type), sauvegardeLayout);

  // Courbes enrichies (tâche 48, gisement G7) : séries optionnelles
  // (cadence/altitude/puissance) réellement disponibles POUR CETTE séance
  // (honnêteté absolue — jamais déduites du sport), croisées avec la
  // préférence par sport (clé `courbes:<sport>`) pour ne jamais proposer une
  // série active que la séance ne porte pas réellement.
  const seriesDispoCourbe = seriesDisponibles(trackpoints);
  const sauvegardeCourbes = lirePreference<unknown>(`courbes:${typeSeance}`, null);
  const seriesActivesCourbe = appliquerSeriesCourbe(sauvegardeCourbes)
    .filter((s) => seriesDispoCourbe.includes(s));

  // Radar comparatif (tâche 40) : sélecteur des autres séances du même
  // activity_type EXACT (pas le regroupement par bucket de defautPourSport
  // ci-dessus — la spec demande « même activity_type », littéral). Un id
  // demandé via ?comparer= qui ne fait pas partie de cette liste (requête
  // forgée, séance d'un autre sport, id inconnu) est ignoré au profit du
  // défaut, même logique de rejet silencieux que les server actions de
  // /reglages (app/actions.ts) — jamais un écran cassé pour un paramètre
  // d'URL invalide.
  const autresMemeSport = lireActivitesMemeSport(detail.type, id);
  const { comparer: comparerBrut } = await searchParams;
  const comparerDemande = comparerBrut != null ? Number(comparerBrut) : null;
  const comparerValide = comparerDemande != null && autresMemeSport.some((a) => a.id === comparerDemande);
  const comparerId = comparerValide ? (comparerDemande as number) : choisirComparaisonParDefaut(autresMemeSport, detail.debut);
  const detailComparee = comparerId != null ? lireSeanceDetail(comparerId) : null;
  const radar = detailComparee != null ? construireRadar(
    {
      distanceM: detail.distanceM, deniveleMonte: detail.deniveleMonte, dureeSec: detail.dureeSec,
      fcMoy: detail.fcMoy, chargeEntrainement: detail.chargeEntrainement, zones: detail.zones,
    },
    {
      distanceM: detailComparee.distanceM, deniveleMonte: detailComparee.deniveleMonte, dureeSec: detailComparee.dureeSec,
      fcMoy: detailComparee.fcMoy, chargeEntrainement: detailComparee.chargeEntrainement, zones: detailComparee.zones,
    },
  ) : null;

  function rendreSection(sectionId: IdSectionSeance): ReactNode {
    switch (sectionId) {
      case 'analyse':
        // L'analyse Claude en tête de page (retour l'utilisateur : « mieux mise en
        // avant ») : juste après les stats, avant les courbes — plus jamais
        // reléguée en colonne de bas de page.
        return analyseSeance != null && (
          <section className="section" key="analyse">
            <div className="wrap" style={{ paddingBlock: 'clamp(32px,5vh,56px)' }}>
              <div style={{ maxWidth: 920 }}>
                <AnalyseSeanceTuile analyse={analyseSeance} />
              </div>
            </div>
          </section>
        );
      case 'courbes':
        return (
          <CourbeSeance key="courbes" trackpoints={trackpoints}
                        seriesDisponibles={seriesDispoCourbe} seriesActives={seriesActivesCourbe}
                        sport={typeSeance} />
        );
      case 'carte':
        return <SectionCarteParcours key="carte" trace={traceGps} />;
      case 'splits-ressenti':
        return (
          <section className="section" key="splits-ressenti">
            <div className="wrap" style={{ paddingBlock: 'clamp(40px,6vh,72px)' }}>
              <div className={colonneDroite ? 'grid-2-start' : ''}>
                <SplitsSeance splits={detail.splits} />
                {colonneDroite && (
                  <div className="flex flex-col" style={{ gap: 'clamp(28px,5vw,40px)' }}>
                    <SaisieRattacheeTuile saisie={detail.saisie} />
                  </div>
                )}
              </div>
            </div>
          </section>
        );
      case 'zones':
        return <PanneauZonesFcSeance key="zones" zones={detail.zones} bornes={bornesZonesFc} />;
      case 'dynamique':
        return <DynamiqueCourseTuile key="dynamique" dynamique={detail.dynamique} />;
      case 'radar':
        // Section entière absente s'il n'existe aucune autre séance du même
        // sport (spec : « si activée par le template ET s'il existe au moins
        // une autre séance du même sport ») — pas seulement le graphique, le
        // sélecteur non plus n'aurait rien à proposer.
        if (autresMemeSport.length === 0) return null;
        return (
          <section className="section" key="radar">
            <div className="wrap" style={{ paddingBlock: 'clamp(40px,6vh,72px)' }}>
              <EnteteTuile>Comparer — toile d&apos;araignée</EnteteTuile>
              <p className="p mt-3" style={{ maxWidth: '60ch' }}>
                Chaque axe est à l&apos;échelle du meilleur des deux — les chiffres affichés sont les vrais.
              </p>
              <form method="get" className="mt-5 flex items-end gap-3 flex-wrap">
                <div className="field" style={{ maxWidth: 340, marginBottom: 0 }}>
                  <label htmlFor="comparer">Séance comparée</label>
                  <select id="comparer" name="comparer" defaultValue={comparerId ?? undefined} className="input">
                    {autresMemeSport.map((a) => (
                      <option key={a.id} value={a.id}>
                        {(a.nom ?? 'Séance')} — {formaterDateCourte(a.debut.slice(0, 10))}
                        {a.distanceM != null && `, ${(a.distanceM / 1000).toFixed(1)} km`}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn btn-secondary">Comparer</button>
              </form>
              <div className="mt-5">
                {radar != null && detailComparee != null ? (
                  <RadarSeances
                    radar={radar}
                    nomA={detail.nom ?? 'Séance'} dateA={formaterDateCourte(detail.debut.slice(0, 10))}
                    nomB={detailComparee.nom ?? 'Séance'} dateB={formaterDateCourte(detailComparee.debut.slice(0, 10))}
                  />
                ) : (
                  <p className="p mt-3">Pas assez de mesures communes entre ces deux séances.</p>
                )}
              </div>
            </div>
          </section>
        );
      default:
        return null;
    }
  }

  return (
    <main className="flex w-full flex-1 flex-col" style={{ animation: 'rise .6s cubic-bezier(.16,1,.3,1) both' }}>
      <div className="wrap" style={{ paddingTop: 'clamp(40px,6vh,72px)', paddingBottom: 0 }}>
        <Link href="/" className="btn btn-ghost" style={{ justifyContent: 'flex-start', textTransform: 'uppercase', letterSpacing: '.06em', fontSize: 12 }}>
          ← Retour à aujourd&apos;hui
        </Link>
        <h6 style={{ margin: '28px 0 0', color: 'var(--color-accent)' }}>
          {(traduireSport(detail.type) ?? 'Séance').toUpperCase()} — {formaterDateHeureSeance(detail.debut)}
          {detail.lieu && ` · ${detail.lieu}`}
        </h6>
        <h1 style={{
          fontSize: 'clamp(2.6rem, 7vw, 5.4rem)', letterSpacing: '-0.035em',
          lineHeight: .95, margin: '10px 0 0', textTransform: 'uppercase',
        }}>
          {detail.nom ?? 'Séance'}
        </h1>
      </div>

      {/* Avec photo : photo et stats côte à côte dans une grille — la colonne
          photo se dimensionne au ratio naturel de l'image (jamais recadrée),
          les stats replient leur auto-fit dans la largeur restante. Jamais
          d'espace vide quel que soit le format (retour l'utilisateur). Sans photo :
          bande de stats pleine largeur, comme avant. */}
      {photos.length > 0 ? (
        <section className="section">
          <div className="wrap grille-photo-stats">
            <PhotosSeance photos={photos} activiteId={id} nom={detail.nom} />
            <div><ResumeSeance d={detail} variante="colonne" /></div>
          </div>
        </section>
      ) : (
        <ResumeSeance d={detail} />
      )}
      {/* Ordre et visibilité pilotés par le template du sport (tâche 38) :
          seul photo+stats, ci-dessus, est fixe — tout le reste suit
          layoutSeance.sections, une section masquée étant simplement
          sautée (sa donnée, elle, existe peut-être toujours). */}
      {layoutSeance.sections.filter((s) => s.visible).map((s) => rendreSection(s.id))}
    </main>
  );
}
