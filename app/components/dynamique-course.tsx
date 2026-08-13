import type { DynamiqueCourse } from '@/lib/types';
import { EnteteTuile, LigneMesure } from './ligne-mesure';

/** Panneau « Dynamique de course » (tâche 31, revue A1, priorité Haute) :
 *  `running_dynamics`, table entière jamais lue avant cette tâche — temps de
 *  contact au sol, équilibre gauche/droite, oscillation et ratio verticaux,
 *  longueur de foulée. `null` (composant absent) si l'activité n'a pas cette
 *  mesure (capteur de dynamique de course absent, ex. boxe/marche/tapis sans
 *  capteur compatible) — jamais un panneau vide. */
export function DynamiqueCourseTuile({ dynamique }: { dynamique: DynamiqueCourse | null }) {
  if (!dynamique) return null;

  return (
    <section className="section">
      <div className="wrap" style={{ paddingBlock: 'clamp(40px,6vh,72px)' }}>
        <EnteteTuile>Dynamique de course</EnteteTuile>
        <div className="flex flex-wrap gap-5.5" style={{ marginTop: 20 }}>
          {dynamique.tempsContactSolMs != null && (
            <LigneMesure libelle="Contact au sol" valeurAffichee={`${Math.round(dynamique.tempsContactSolMs)} ms`} />
          )}
          {dynamique.balanceGctPct != null && (
            <LigneMesure libelle="Équilibre G/D" valeurAffichee={`${dynamique.balanceGctPct.toFixed(1)} %`} />
          )}
          {dynamique.oscillationVerticaleCm != null && (
            <LigneMesure libelle="Oscillation verticale" valeurAffichee={`${dynamique.oscillationVerticaleCm.toFixed(1)} cm`} />
          )}
          {dynamique.ratioVerticalPct != null && (
            <LigneMesure libelle="Ratio vertical" valeurAffichee={`${dynamique.ratioVerticalPct.toFixed(1)} %`} />
          )}
          {dynamique.longueurFouleeCm != null && (
            <LigneMesure libelle="Longueur de foulée" valeurAffichee={`${Math.round(dynamique.longueurFouleeCm)} cm`} />
          )}
        </div>
      </div>
    </section>
  );
}
