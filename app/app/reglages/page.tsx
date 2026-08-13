import { lirePreference } from '@/lib/db/preferences';
import {
  LAYOUT_PAR_DEFAUT, appliquerLayout, HEROS_OPTIONS,
  type LayoutAccueil, type IdSection, type IdTuile, type IdHeros,
} from '@/lib/layout-accueil';
import {
  appliquerLayoutSeance, defautPourSport, type IdSectionSeance, type LayoutSeance,
} from '@/lib/layout-seance';
import {
  variantesCompatibles, varianteEnregistree, choixVisuel, type VarianteVisuel,
} from '@/lib/visuels-mesures';
import {
  LAYOUT_HISTORIQUE_PAR_DEFAUT, appliquerLayoutHistorique, type IdSectionHistorique, type LayoutHistorique,
} from '@/lib/layout-historique';
import {
  LAYOUT_SEANCES_PAR_DEFAUT, appliquerLayoutSeances, type IdSectionSeances, type LayoutSeances,
} from '@/lib/layout-seances';
import { DENSITES, appliquerDensite, type Densite } from '@/lib/densite';
import { FENETRES, appliquerFenetre, type FenetreJours } from '@/lib/fenetre-temporelle';
import { initialiserSchema } from '@/lib/db/schema';
import { lireStatsParSport } from '@/lib/db/garmin';
import { traduireSport } from '@/lib/formatage';
import { LigneOrdre, EnteteBloc } from '@/components/reglages-controles';
import { ImportConfiguration } from '@/components/import-configuration';
import {
  deplacerElementLayout, basculerVisibiliteLayout, definirHerosLayout, reinitialiserBlocLayout,
  deplacerElementLayoutSeance, basculerVisibiliteLayoutSeance, reinitialiserLayoutSeance,
  definirVarianteVisuel, reinitialiserVisuels,
  deplacerElementLayoutHistorique, basculerVisibiliteLayoutHistorique, reinitialiserLayoutHistorique,
  deplacerElementLayoutSeances, basculerVisibiliteLayoutSeances, reinitialiserLayoutSeances,
  definirDensite, definirFenetre,
} from '@/app/actions';

// Comme les autres routes (app/page.tsx, app/saisie/page.tsx) : lecture
// SQLite à chaque requête (préférences), jamais figée au build.
export const dynamic = 'force-dynamic';

const LIBELLES_SECTION: Record<IdSection, string> = {
  heros: 'Rapport du matin (héros)',
  'bande-mesures': 'Bande de mesures',
  ressenti: 'Ressenti du jour',
  'charge-7j': 'Charge 7 jours',
  predictions: 'Prédictions de course',
  'seances-recentes': 'Séances récentes',
  layers: 'Layers',
};

const LIBELLES_TUILE: Record<IdTuile, string> = {
  readiness: 'Préparation',
  hrv: 'HRV nuit',
  'fc-repos': 'FC repos',
  sommeil: 'Score sommeil',
  charge: 'Charge 7 j',
  calories: 'Calories',
  pas: 'Pas',
  etages: 'Étages',
  intensite: 'Intensité — semaine',
  stress: 'Stress',
  spo2: 'SpO2',
  vo2max: 'VO2max',
  respiration: 'Respiration',
  'age-forme': 'Âge de forme',
};

const LIBELLES_HEROS: Record<IdHeros, string> = {
  body_battery: 'Body Battery',
  readiness: 'Préparation (readiness)',
  sommeil: 'Score sommeil',
  stress: 'Stress',
  pas: 'Pas',
};

const LIBELLES_VARIANTE: Record<VarianteVisuel, string> = {
  chiffre: 'Chiffre',
  'chiffre-sparkline': 'Chiffre + tendance',
  'barres-7j': 'Barres 7 jours',
  'courbe-section': 'Courbe pleine largeur',
  jauge: "Jauge d'objectif",
};

const LIBELLES_SECTION_SEANCE: Record<IdSectionSeance, string> = {
  analyse: 'Analyse — Claude',
  courbes: 'Courbes FC · allure',
  carte: 'Carte du parcours',
  'splits-ressenti': 'Splits + ressenti',
  zones: 'Zones de FC',
  dynamique: 'Dynamique de course',
  radar: 'Comparer — toile d’araignée',
};

const LIBELLES_SECTION_HISTORIQUE: Record<IdSectionHistorique, string> = {
  'stats-semaine': 'Stats de la semaine (+ poids)',
  'tendance-semaines': 'Charge — 8 semaines',
  'zones-par-semaine': 'Endurance fondamentale — Z1-Z2',
  'efficacite-aerobie': 'Efficacité aérobie',
  records: 'Records personnels',
  graphiques: 'Graphiques de tendance',
  guidance: 'Cette semaine (plan + prudence)',
  'boxe-regularite': 'Boxe — régularité',
};

const LIBELLES_SECTION_SEANCES: Record<IdSectionSeances, string> = {
  'stats-par-sport': 'Stats par sport',
  'liste-seances': 'Liste complète des séances',
};

const LIBELLES_DENSITE: Record<Densite, string> = {
  normale: 'Normale',
  compacte: 'Compacte',
};

const LIBELLES_FENETRE: Record<FenetreJours, string> = {
  7: '7 jours',
  14: '14 jours',
  30: '30 jours',
};

/** Sports proposés au sélecteur : ceux réellement présents en base
 *  (`lireStatsParSport`, écran Séances) + boxe systématiquement, même si
 *  aucune séance de boxe n'a encore été synchronisée — c'est un des deux
 *  défauts documentés de la spec, il doit rester éditable par anticipation. */
function sportsDisponibles(): string[] {
  const presents = lireStatsParSport().map((s) => s.sport.toLowerCase());
  return presents.includes('boxing') ? presents : [...presents, 'boxing'];
}

/** Page /reglages (tâche 37, puis 38) : vue d'ensemble de la personnalisation
 *  de l'accueil et de la page de séance — pas d'édition in-place (décision
 *  verrouillée de la spec). Chaque bloc (sections/tuiles/héros de l'accueil,
 *  sections de la page séance par sport, sections de /historique et de
 *  /seances, tâche 45) est réinitialisable indépendamment.
 *  `searchParams.sport` (Next 16 : Promise, cf. node_modules/next/dist/docs/
 *  01-app/03-api-reference/03-file-conventions/page.md, vérifié avant
 *  d'écrire cette page) choisit le sport en cours d'édition dans le bloc
 *  séance — un simple `<form method="get">`, sans JavaScript client. */
export default async function Reglages({ searchParams }: { searchParams: Promise<{ sport?: string }> }) {
  initialiserSchema();
  const sauvegarde = lirePreference<LayoutAccueil | null>('accueil', null);
  const layout = appliquerLayout(LAYOUT_PAR_DEFAUT, sauvegarde);
  // Variantes de visuel par tuile (tâche 39) : lue brute, jamais validée ici —
  // `varianteEnregistree` revérifie chaque choix contre la table de
  // compatibilité avant de préremplir le sélecteur de chaque tuile.
  const sauvegardeVisuels = lirePreference<unknown>('visuels', null);

  const sports = sportsDisponibles();
  const { sport: sportDemande } = await searchParams;
  const sport = sportDemande && sports.includes(sportDemande.toLowerCase()) ? sportDemande.toLowerCase() : sports[0];
  const sauvegardeSeance = lirePreference<LayoutSeance | null>(`seance:${sport}`, null);
  const layoutSeance = appliquerLayoutSeance(defautPourSport(sport), sauvegardeSeance);

  // Layouts de /historique et /seances (tâche 45) : même mécanique que
  // ci-dessus, sous une clé fixe chacun (pas per-sport).
  const sauvegardeHistorique = lirePreference<LayoutHistorique | null>('historique', null);
  const layoutHistorique = appliquerLayoutHistorique(LAYOUT_HISTORIQUE_PAR_DEFAUT, sauvegardeHistorique);
  const sauvegardeListeSeances = lirePreference<LayoutSeances | null>('seances', null);
  const layoutSeances = appliquerLayoutSeances(LAYOUT_SEANCES_PAR_DEFAUT, sauvegardeListeSeances);

  // Densité d'affichage (tâche 45) : préférence globale, une simple valeur
  // parmi deux, pas de fusion structurelle.
  const densite = appliquerDensite(lirePreference<unknown>('densite', null));
  // Fenêtre temporelle (tâche 47) : même mécanique que la densité ci-dessus,
  // une valeur parmi trois.
  const fenetre = appliquerFenetre(lirePreference<unknown>('fenetre_jours', null));

  return (
    <main className="flex w-full flex-1 flex-col" style={{ animation: 'rise .6s cubic-bezier(.16,1,.3,1) both' }}>
      <section>
        <div className="wrap" style={{ paddingTop: 'clamp(48px,8vh,96px)', paddingBottom: 'clamp(32px,5vh,56px)' }}>
          <h6 style={{ color: 'var(--color-accent)' }}>Réglages</h6>
          <h1 style={{
            fontSize: 'clamp(2.6rem, 6.5vw, 5rem)', letterSpacing: '-0.035em',
            lineHeight: .98, margin: '12px 0 0', maxWidth: '20ch', textTransform: 'uppercase',
          }}>
            Personnaliser l&apos;affichage.
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--color-neutral-700)', maxWidth: '60ch', marginTop: 14 }}>
            Choisis ce que tu vois en premier — ces réglages ne créent jamais de donnée : une mesure absente reste absente.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="section-inner">
          <EnteteBloc titre="Sections de l'accueil" actionReinitialiser={reinitialiserBlocLayout.bind(null, 'sections')} />
          <div className="mt-4">
            {layout.sections.map((s, i) => (
              <LigneOrdre key={s.id} libelle={LIBELLES_SECTION[s.id]}
                          visible={s.visible} index={i} total={layout.sections.length}
                          actionMonter={deplacerElementLayout.bind(null, 'sections', s.id, 'haut')}
                          actionDescendre={deplacerElementLayout.bind(null, 'sections', s.id, 'bas')}
                          actionBasculer={basculerVisibiliteLayout.bind(null, 'sections', s.id)} />
            ))}
          </div>
          <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-neutral-600)', marginTop: 16, maxWidth: '60ch' }}>
            La bannière « saisies vocales à valider » n&apos;apparaît pas dans cette liste : c&apos;est une information
            d&apos;action, pas une préférence d&apos;affichage — elle reste toujours visible quand une saisie vocale
            attend une validation, quel que soit ce réglage.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="section-inner">
          <EnteteBloc titre="Tuiles de mesures" actionReinitialiser={reinitialiserBlocLayout.bind(null, 'tuiles')} />
          <div className="mt-4">
            {layout.tuiles.map((t, i) => {
              const choixActuel = varianteEnregistree(t.id, choixVisuel(sauvegardeVisuels, t.id));
              const options = variantesCompatibles(t.id);
              return (
                <div key={t.id}>
                  <LigneOrdre libelle={LIBELLES_TUILE[t.id]}
                              visible={t.visible} index={i} total={layout.tuiles.length}
                              actionMonter={deplacerElementLayout.bind(null, 'tuiles', t.id, 'haut')}
                              actionDescendre={deplacerElementLayout.bind(null, 'tuiles', t.id, 'bas')}
                              actionBasculer={basculerVisibiliteLayout.bind(null, 'tuiles', t.id)} />
                  {/* Variante de visuel (tâche 39) : seulement les options compatibles
                      avec CETTE mesure (lib/visuels-mesures.ts) — jamais de jauge hors
                      pas/intensité, jamais de courbe pleine largeur hors mesures de
                      tendance. Micro-form indépendante, même convention que les
                      contrôles ci-dessus (aucun JavaScript client requis). */}
                  <form action={definirVarianteVisuel.bind(null, t.id)}
                        className="flex items-center gap-2 flex-wrap" style={{ paddingBottom: 20 }}>
                    <label htmlFor={`variante-${t.id}`} style={{
                      fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 10, letterSpacing: '.08em',
                      textTransform: 'uppercase', color: 'var(--color-neutral-600)',
                    }}>
                      Visuel
                    </label>
                    <select id={`variante-${t.id}`} name="variante" defaultValue={choixActuel}
                            className="input" style={{ maxWidth: 260 }}>
                      {options.map((v) => (
                        <option key={v} value={v}>{LIBELLES_VARIANTE[v]}</option>
                      ))}
                    </select>
                    <button type="submit" className="btn btn-secondary" style={{ fontSize: 11, padding: '5px 10px' }}>
                      Appliquer
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
          {/* Réinitialisation des visuels (garde-fou relevé par l'audit B1) :
              le bouton de l'EnteteBloc ci-dessus ne remet à zéro que l'ordre
              et la visibilité (clé 'accueil') — jamais les variantes de
              visuel choisies tuile par tuile (clé 'visuels', tâche 39), qui
              n'avaient encore aucun retour au défaut en un clic. */}
          <div className="flex items-center justify-between flex-wrap gap-3" style={{
            marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--color-divider)',
          }}>
            <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-neutral-600)', maxWidth: '52ch', margin: 0 }}>
              « Réinitialiser » ci-dessus ne touche que l&apos;ordre et la visibilité — les visuels choisis tuile par
              tuile (chiffre, barres, jauge…) restent. Pour les remettre tous au défaut :
            </p>
            <form action={reinitialiserVisuels}>
              <button type="submit" className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }}>
                Réinitialiser les visuels
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-inner">
          <EnteteBloc titre="Mesure du héros" actionReinitialiser={reinitialiserBlocLayout.bind(null, 'heros')} />
          <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-neutral-600)', marginTop: 8, maxWidth: '60ch' }}>
            Le gros chiffre du rapport du matin. Body Battery garde son repli habituel vers la préparation (readiness)
            quand la donnée du jour manque ; les autres choix n&apos;ont pas de repli — mesure absente, gros chiffre absent.
          </p>
          <form action={definirHerosLayout} className="mt-6">
            <div className="field" style={{ maxWidth: 340 }}>
              <label>Mesure affichée en gros</label>
              <select name="heros" defaultValue={layout.heros} className="input">
                {HEROS_OPTIONS.map((h) => (
                  <option key={h} value={h}>{LIBELLES_HEROS[h]}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary">Enregistrer</button>
          </form>
        </div>
      </section>

      <section className="section">
        <div className="section-inner">
          <h6 style={{ margin: 0 }}>Densité d&apos;affichage</h6>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-neutral-600)', marginTop: 8, maxWidth: '60ch' }}>
            Resserre la bande de mesures principale et les listes de séances (récentes sur l&apos;accueil, complète sur
            /seances). Les bandes déjà resserrées (stats de la semaine, poids) ne changent pas — elles le sont déjà.
          </p>
          <form action={definirDensite} className="mt-6">
            <div className="field" style={{ maxWidth: 340 }}>
              <label>Densité</label>
              <select name="densite" defaultValue={densite} className="input">
                {DENSITES.map((d) => (
                  <option key={d} value={d}>{LIBELLES_DENSITE[d]}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary">Enregistrer</button>
          </form>
        </div>
      </section>

      <section className="section">
        <div className="section-inner">
          <h6 style={{ margin: 0 }}>Fenêtre temporelle</h6>
          <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-neutral-600)', marginTop: 8, maxWidth: '60ch' }}>
            Pilote la bande « N derniers jours » de l&apos;écran /historique et les sparklines des tuiles de mesures
            de l&apos;accueil. N&apos;élargit jamais une fenêtre qui a un sens physiologique fixe (charge aiguë de
            Garmin, semaines ISO, plan des 14 derniers jours) — ces vues restent inchangées.
          </p>
          <form action={definirFenetre} className="mt-6">
            <div className="field" style={{ maxWidth: 340 }}>
              <label>Fenêtre</label>
              <select name="fenetre_jours" defaultValue={fenetre} className="input">
                {FENETRES.map((f) => (
                  <option key={f} value={f}>{LIBELLES_FENETRE[f]}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary">Enregistrer</button>
          </form>
        </div>
      </section>

      <section className="section">
        <div className="section-inner">
          <EnteteBloc titre="Sections de l'historique" actionReinitialiser={reinitialiserLayoutHistorique} />
          <div className="mt-4">
            {layoutHistorique.sections.map((s, i) => (
              <LigneOrdre key={s.id} libelle={LIBELLES_SECTION_HISTORIQUE[s.id]}
                          visible={s.visible} index={i} total={layoutHistorique.sections.length}
                          actionMonter={deplacerElementLayoutHistorique.bind(null, s.id, 'haut')}
                          actionDescendre={deplacerElementLayoutHistorique.bind(null, s.id, 'bas')}
                          actionBasculer={basculerVisibiliteLayoutHistorique.bind(null, s.id)} />
            ))}
          </div>
          <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-neutral-600)', marginTop: 16, maxWidth: '60ch' }}>
            Le résumé en tête de page (analyse Claude ou « Tendances. », observations) n&apos;apparaît pas dans cette
            liste : c&apos;est l&apos;identité de l&apos;écran — toujours en premier, quel que soit ce réglage.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="section-inner">
          <EnteteBloc titre="Sections de /seances" actionReinitialiser={reinitialiserLayoutSeances} />
          <div className="mt-4">
            {layoutSeances.sections.map((s, i) => (
              <LigneOrdre key={s.id} libelle={LIBELLES_SECTION_SEANCES[s.id]}
                          visible={s.visible} index={i} total={layoutSeances.sections.length}
                          actionMonter={deplacerElementLayoutSeances.bind(null, s.id, 'haut')}
                          actionDescendre={deplacerElementLayoutSeances.bind(null, s.id, 'bas')}
                          actionBasculer={basculerVisibiliteLayoutSeances.bind(null, s.id)} />
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-inner">
          <h6 style={{ margin: 0 }}>Page de séance — par sport</h6>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-neutral-600)', marginTop: 8, maxWidth: '60ch' }}>
            Chaque sport a sa mise en page : la carte d&apos;abord en rando, le ressenti d&apos;abord en boxe.
          </p>
          <form method="get" className="mt-6 flex items-end gap-3 flex-wrap">
            <div className="field" style={{ maxWidth: 260, marginBottom: 0 }}>
              <label htmlFor="sport">Sport</label>
              <select id="sport" name="sport" defaultValue={sport} className="input">
                {sports.map((s) => (
                  <option key={s} value={s}>{traduireSport(s) ?? s}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-secondary">Afficher</button>
          </form>

          <div className="mt-6">
            <EnteteBloc titre={traduireSport(sport) ?? sport} actionReinitialiser={reinitialiserLayoutSeance.bind(null, sport)} />
            <div className="mt-4">
              {layoutSeance.sections.map((s, i) => (
                <LigneOrdre key={s.id} libelle={LIBELLES_SECTION_SEANCE[s.id]}
                            visible={s.visible} index={i} total={layoutSeance.sections.length}
                            actionMonter={deplacerElementLayoutSeance.bind(null, sport, s.id, 'haut')}
                            actionDescendre={deplacerElementLayoutSeance.bind(null, sport, s.id, 'bas')}
                            actionBasculer={basculerVisibiliteLayoutSeance.bind(null, sport, s.id)} />
              ))}
            </div>
          </div>
          <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-neutral-600)', marginTop: 16, maxWidth: '60ch' }}>
            La photo et les stats en tête de page ne sont pas dans cette liste : c&apos;est l&apos;identité de la page —
            toujours en premier, quel que soit le sport ou ce réglage.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="section-inner">
          <h6 style={{ margin: 0 }}>Sauvegarde de la configuration</h6>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-neutral-600)', marginTop: 8, maxWidth: '60ch' }}>
            Exporte tous les réglages d&apos;affichage ci-dessus (ordre des sections, tuiles, visuels, densité) dans un
            fichier JSON — pour les sauvegarder avant un essai, les remettre en place plus tard, ou les partager.
            Aucune donnée de santé ni d&apos;activité n&apos;y figure, seulement des préférences d&apos;écran.
          </p>
          <a href="/api/export-config" className="btn btn-primary mt-6" download>
            Exporter la configuration
          </a>

          <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-neutral-600)', marginTop: 24, maxWidth: '60ch' }}>
            Réimporte un fichier exporté depuis cette app (la tienne ou celle d&apos;un autre utilisateur) : seuls les
            réglages reconnus sont repris, chacun revalidé avant d&apos;être appliqué — un fichier corrompu ou modifié
            à la main ne peut jamais casser un écran.
          </p>
          <ImportConfiguration />
        </div>
      </section>
    </main>
  );
}
