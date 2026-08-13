import { lireActivites, lireStatsParSport } from '@/lib/db/garmin';
import { lireSeancesManuelles, lireStatsManuelles } from '@/lib/db/training';
import { initialiserSchema } from '@/lib/db/schema';
import { fusionnerSeances } from '@/lib/fusion';
import { formaterDateCourteAvecAnnee } from '@/lib/formatage';
import { lirePreference } from '@/lib/db/preferences';
import {
  LAYOUT_SEANCES_PAR_DEFAUT, appliquerLayoutSeances, type IdSectionSeances, type LayoutSeances,
} from '@/lib/layout-seances';
import { appliquerDensite, type Densite } from '@/lib/densite';
import { StatsParSport } from '@/components/stats-par-sport';
import { SeancesParMois } from '@/components/seances-par-mois';

// Comme les autres écrans (app/page.tsx, app/historique/page.tsx) : pas de
// Cache Components activés (next.config.ts), donc `force-dynamic` reste le
// mécanisme valide pour forcer une lecture SQLite (instantané Garmin +
// saisies + préférences) à chaque requête plutôt qu'au build.
export const dynamic = 'force-dynamic';

// « Sans limite » (brief tâche 26) : les fonctions de lecture exigent un
// paramètre `LIMIT` lié — un plafond très large en tient lieu, largement
// suffisant pour l'échelle d'un journal d'entraînement personnel.
const SANS_LIMITE = 100_000;

/** Un id de section mappé sur son rendu, dans l'ordre du layout (/reglages,
 *  tâche 45) — deux sections seulement, volontairement (mission : « ne
 *  fabrique pas des sections artificielles »). `stats-par-sport` reste
 *  absente si aucune stat n'existe (même garde qu'avant cette tâche). */
function rendreSectionSeances(
  id: IdSectionSeances, ctx: {
    statsGarmin: ReturnType<typeof lireStatsParSport>;
    statsManuelles: ReturnType<typeof lireStatsManuelles>;
    seances: ReturnType<typeof fusionnerSeances>;
    densite: Densite;
  },
) {
  switch (id) {
    case 'stats-par-sport':
      if (ctx.statsGarmin.length === 0 && ctx.statsManuelles.length === 0) return null;
      return (
        <section className="section" key={id}>
          <div className="wrap" style={{ paddingBlock: 'clamp(40px,6vh,72px)' }}>
            <StatsParSport statsGarmin={ctx.statsGarmin} statsManuelles={ctx.statsManuelles} densite={ctx.densite} />
          </div>
        </section>
      );
    case 'liste-seances':
      return (
        <section className="section" key={id}>
          <div className="wrap" style={{ paddingBlock: 'clamp(40px,6vh,72px)' }}>
            <SeancesParMois seances={ctx.seances} densite={ctx.densite} />
          </div>
        </section>
      );
    default:
      return null;
  }
}

/** Écran « toutes les séances » (tâche 26, DS Modernist ; personnalisable
 *  depuis la tâche 45) : compteur réel d'ouverture (identité de la page,
 *  fixe), puis stats agrégées par sport et liste complète groupée par mois,
 *  dans l'ordre choisi dans /reglages (défaut = cet ordre exact). */
export default function Seances() {
  initialiserSchema();
  const seances = fusionnerSeances(lireActivites(SANS_LIMITE), lireSeancesManuelles(SANS_LIMITE));
  const statsGarmin = lireStatsParSport();
  const statsManuelles = lireStatsManuelles();
  // `seances` est triée antichronologiquement (fusionnerSeances) : la première
  // séance jamais enregistrée est donc le dernier élément du tableau.
  const premiere = seances.length > 0 ? seances[seances.length - 1].date : null;

  const sauvegardeLayout = lirePreference<LayoutSeances | null>('seances', null);
  const layout = appliquerLayoutSeances(LAYOUT_SEANCES_PAR_DEFAUT, sauvegardeLayout);
  const densite = appliquerDensite(lirePreference<unknown>('densite', null));

  return (
    <main className="flex w-full flex-1 flex-col" style={{ animation: 'rise .6s cubic-bezier(.16,1,.3,1) both' }}>
      <section>
        <div className="wrap" style={{ paddingTop: 'clamp(48px,8vh,96px)', paddingBottom: 0 }}>
          <h6 style={{ color: 'var(--color-accent)' }}>Séances</h6>
          <h1 style={{
            fontSize: 'clamp(2.6rem, 6.5vw, 5rem)', letterSpacing: '-0.035em',
            lineHeight: .98, margin: '12px 0 0', maxWidth: '20ch', textTransform: 'uppercase',
          }}>
            Toutes les séances.
          </h1>
          {premiere && (
            <p className="mt-4" style={{
              fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 11, letterSpacing: '.08em',
              textTransform: 'uppercase', color: 'var(--color-neutral-600)',
            }}>
              {seances.length} séance{seances.length > 1 ? 's' : ''} depuis le {formaterDateCourteAvecAnnee(premiere)}
            </p>
          )}
        </div>
      </section>

      {layout.sections.filter((s) => s.visible).map((s) => rendreSectionSeances(s.id, { statsGarmin, statsManuelles, seances, densite }))}
    </main>
  );
}
