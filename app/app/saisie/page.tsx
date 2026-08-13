import { lireActivites } from '@/lib/db/garmin';
import { lirePointDuJour, lireSeancesManuelles } from '@/lib/db/training';
import { lireObjectifs } from '@/lib/db/objectifs';
import { initialiserSchema } from '@/lib/db/schema';
import { lireBrouillons } from '@/lib/brouillons';
import { fusionnerSeances } from '@/lib/fusion';
import { calculerAvancementSemaine, semaineIso } from '@/lib/objectifs';
import { FormulaireSeance } from '@/components/formulaire-seance';
import { FormulairePoint } from '@/components/formulaire-point';
import { EnvoiAudio } from '@/components/envoi-audio';
import { CarteBrouillon } from '@/components/carte-brouillon';
import { Objectifs } from '@/components/objectifs';

// Fenêtre large (pas les 20 activités du menu de rattachement ci-dessous) :
// l'avancement d'un objectif ne regarde que la semaine ISO en cours, mais
// « en cours » peut être n'importe où dans les 7 derniers jours — 200
// couvre très largement l'échelle d'un journal d'entraînement personnel
// (même ordre de grandeur que SANS_LIMITE de app/seances/page.tsx, en plus
// modeste puisqu'ici seule la semaine courante compte).
const FENETRE_OBJECTIFS = 200;

// Comme app/page.tsx : pas de Cache Components activés (next.config.ts), donc
// `force-dynamic` reste le mécanisme valide pour forcer une lecture SQLite à
// chaque requête (activités Garmin, point du jour déjà saisi) plutôt qu'au build.
export const dynamic = 'force-dynamic';

/** Écran Saisie (hors maquette Cadence v2, re-stylé avec les classes du DS
 *  Modernist — tâche 22) : les deux formulaires deviennent deux sections
 *  séparées par un filet 2px, champs `.field`/`.input`/`.seg` du DS, focus
 *  accent, rayon 0. */
export default function Saisie() {
  initialiserSchema();
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const activites = lireActivites(20);
  const brouillons = lireBrouillons();

  // Objectifs déclarés (tâche 43) : avancement calculé ICI, en TypeScript,
  // jamais laissé à un composant client ou à l'analyste — même loi que le
  // reste du projet (rapport B2 §A.8 : on cite un compte précalculé, on ne
  // le fait jamais recalculer). Fusion Garmin + manuel identique à celle
  // déjà utilisée par /seances (lib/fusion.ts) pour ne compter aucune
  // séance en double.
  const objectifsBruts = lireObjectifs();
  const { lundi, dimanche } = semaineIso(aujourdhui);
  const seancesPourObjectifs = fusionnerSeances(
    lireActivites(FENETRE_OBJECTIFS), lireSeancesManuelles(FENETRE_OBJECTIFS),
  );
  const objectifs = objectifsBruts.map((o) => ({
    ...o, realiseSemaine: calculerAvancementSemaine(seancesPourObjectifs, o, lundi, dimanche),
  }));

  return (
    <main className="flex w-full flex-1 flex-col" style={{ animation: 'rise .6s cubic-bezier(.16,1,.3,1) both' }}>
      <section>
        <div className="wrap" style={{ paddingTop: 'clamp(48px,8vh,96px)', paddingBottom: 'clamp(40px,6vh,72px)' }}>
          <EnvoiAudio />
        </div>
      </section>
      {brouillons.length > 0 && (
        <section className="section">
          <div className="wrap" style={{ paddingBlock: 'clamp(40px,6vh,72px)' }}>
            {brouillons.map((b) => (
              <CarteBrouillon key={b.id} brouillon={b} activites={activites} />
            ))}
          </div>
        </section>
      )}
      <section className="section">
        <div className="wrap" style={{ paddingTop: 'clamp(40px,6vh,72px)', paddingBottom: 'clamp(40px,6vh,72px)' }}>
          <h6 style={{ color: 'var(--color-accent)' }}>Saisir</h6>
          <div className="mt-9">
            <FormulaireSeance date={aujourdhui} activites={activites} />
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap" style={{ paddingBlock: 'clamp(40px,6vh,72px)' }}>
          <FormulairePoint date={aujourdhui} existant={lirePointDuJour(aujourdhui)} />
        </div>
      </section>
      <Objectifs objectifs={objectifs} />
    </main>
  );
}
