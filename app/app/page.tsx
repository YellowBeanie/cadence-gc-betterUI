import { Fragment } from 'react';
import Link from 'next/link';
import {
  lireActivites, lireChargeParJour, lireEtatDuJour, lireJourneeComplete, lireTendances, lireVo2maxRecent,
} from '@/lib/db/garmin';
import { lirePointDuJour, lireSeancesManuelles } from '@/lib/db/training';
import { lirePreference } from '@/lib/db/preferences';
import { LAYOUT_PAR_DEFAUT, appliquerLayout, type LayoutAccueil, type IdSection } from '@/lib/layout-accueil';
import { appliquerDensite, type Densite } from '@/lib/densite';
import { appliquerFenetre, type FenetreJours } from '@/lib/fenetre-temporelle';
import { RessentiDuJour } from '@/components/ressenti-du-jour';
import { lireAnalyse } from '@/lib/analyse';
import { lireFraicheur } from '@/lib/db/freshness';
import { initialiserSchema } from '@/lib/db/schema';
import { fusionnerSeances } from '@/lib/fusion';
import { lireBrouillons } from '@/lib/brouillons';
import { RapportMatin } from '@/components/rapport-matin';
import { BandeMesures } from '@/components/bande-mesures';
import { ChargeSemaine } from '@/components/charge-semaine';
import { PredictionsCourseTuile } from '@/components/predictions-course';
import { SeancesRecentes } from '@/components/seances-recentes';
import { Layers } from '@/components/layers';

// `dynamic` reste un export de configuration de segment valide : les Cache
// Components (flag `cacheComponents`, Next 16+) ne sont pas activés dans
// next.config.ts, donc ce projet suit encore l'ancien modèle de cache où
// `force-dynamic` s'applique. Nécessaire ici : la page lit un fichier SQLite
// à chaque requête (état du jour, séance, fraîcheur), jamais au build.
export const dynamic = 'force-dynamic';

/** Un id de section mappé sur son composant, dans l'ordre du layout
 *  (/reglages, tâche 37). `heros` est traité à part dans le rendu ci-dessous
 *  (il porte deux réglages — visibilité de la section ET choix de la mesure
 *  affichée — et sert d'ancre fixe à la bannière brouillons, cf. plus bas). */
function rendreSection(
  id: Exclude<IdSection, 'heros'>, ctx: {
    etat: ReturnType<typeof lireEtatDuJour>;
    journee: ReturnType<typeof lireJourneeComplete>;
    tendances: ReturnType<typeof lireTendances>;
    vo2max: ReturnType<typeof lireVo2maxRecent>;
    layout: LayoutAccueil;
    visuels: unknown;
    aujourdhui: string;
    seances: ReturnType<typeof fusionnerSeances>;
    analyseActive: boolean;
    densite: Densite;
    fenetre: FenetreJours;
  },
) {
  switch (id) {
    case 'bande-mesures':
      return (
        <BandeMesures key={id} etat={ctx.etat} journee={ctx.journee} tendances={ctx.tendances}
                      vo2max={ctx.vo2max} tuiles={ctx.layout.tuiles} visuels={ctx.visuels} densite={ctx.densite}
                      fenetre={ctx.fenetre} />
      );
    case 'ressenti':
      return <RessentiDuJour key={id} point={lirePointDuJour(ctx.aujourdhui)} />;
    case 'charge-7j':
      return (
        <ChargeSemaine key={id} statut={ctx.journee.statutEntrainement}
                       joursCharge={lireChargeParJour(7)} acwrFeedback={ctx.journee.acwrFeedback} />
      );
    case 'predictions':
      return <PredictionsCourseTuile key={id} predictions={ctx.journee.predictionsCourse} />;
    case 'seances-recentes':
      return <SeancesRecentes key={id} seances={ctx.seances} densite={ctx.densite} />;
    case 'layers':
      return <Layers key={id} analyseActive={ctx.analyseActive} />;
    default:
      return null;
  }
}

/** Dashboard « Cadence v2 » (tâche 22, DS Modernist ; personnalisable depuis
 *  la tâche 37) : sections et tuiles de mesures rendues dans l'ordre choisi
 *  dans /reglages (défaut = cet ordre exact), sections masquées sautées.
 *  Chaque section se masque aussi d'elle-même si sa donnée réelle manque
 *  (règle « jamais de donnée inventée » — un réglage ne fabrique jamais une
 *  tuile vide). */
export default function Aujourdhui() {
  initialiserSchema();
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const etat = lireEtatDuJour();
  const journee = lireJourneeComplete();
  const tendances = lireTendances();
  const vo2max = lireVo2maxRecent();
  const analyse = lireAnalyse();
  const fraicheur = lireFraicheur();
  const seances = fusionnerSeances(lireActivites(20), lireSeancesManuelles());
  const derniereSeanceId = seances.find((s) => s.garminId != null)?.garminId ?? null;
  const brouillons = lireBrouillons();

  const sauvegarde = lirePreference<LayoutAccueil | null>('accueil', null);
  const layout = appliquerLayout(LAYOUT_PAR_DEFAUT, sauvegarde);
  // Variantes de visuel par tuile (tâche 39, /reglages) : lue brute, jamais
  // validée ici — chaque tuile revérifie son propre choix via
  // `varianteEffective` (lib/visuels-mesures.ts), dans BandeMesures.
  const visuels = lirePreference<unknown>('visuels', null);
  // Densité d'affichage (/reglages, tâche 45) : préférence globale, pas liée
  // à ce layout — revalidée par `appliquerDensite` (lib/densite.ts).
  const densite = appliquerDensite(lirePreference<unknown>('densite', null));
  // Fenêtre temporelle des sparklines (/reglages, tâche 47) : préférence
  // globale — pilote uniquement la longueur des sparklines dans BandeMesures
  // (sauf la tuile « charge », cf. components/bande-mesures.tsx).
  const fenetre = appliquerFenetre(lirePreference<unknown>('fenetre_jours', null));

  return (
    <main className="flex w-full flex-1 flex-col">
      {layout.sections.map((s) => {
        if (s.id === 'heros') {
          return (
            <Fragment key={s.id}>
              {s.visible && (
                <RapportMatin date={aujourdhui} bodyBattery={journee.bodyBattery} etat={etat} analyse={analyse}
                              derniereSeanceId={derniereSeanceId} fraicheur={fraicheur} heroChoisi={layout.heros}
                              stressMoyen={journee.stress?.moyenne ?? null} pas={journee.activite?.pas ?? null} />
              )}
              {/* La bannière « brouillons vocaux à valider » n'est PAS une
                  préférence d'affichage : c'est une information d'action (des
                  saisies en attente), jamais masquable ni réordonnable (voir
                  aussi lib/layout-accueil.ts) — toujours ancrée ici, à
                  l'emplacement fixe du héros, quel que soit son réglage. */}
              {brouillons.length > 0 && (
                <section className="wrap" style={{ paddingBlock: 12 }}>
                  <Link href="/saisie" style={{
                    display: 'block', borderTop: '1px solid var(--color-accent)', paddingTop: 12,
                    fontSize: 13, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '.04em',
                  }}>
                    {brouillons.length} saisie{brouillons.length > 1 ? 's' : ''} vocale{brouillons.length > 1 ? 's' : ''} à valider →
                  </Link>
                </section>
              )}
            </Fragment>
          );
        }
        if (!s.visible) return null;
        return rendreSection(s.id, {
          etat, journee, tendances, vo2max, layout, visuels, aujourdhui, seances,
          analyseActive: analyse != null, densite, fenetre,
        });
      })}
    </main>
  );
}
