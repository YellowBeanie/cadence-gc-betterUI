import type { PredictionsCourse } from '@/lib/types';
import { formaterDureeCourse } from '@/lib/formatage';
import { EnteteTuile } from './ligne-mesure';

type Ligne = { label: string; sec: number };

/** Panneau « Prédictions de course » (tâche 31, revue A1, priorité Haute —
 *  « objectif motivant pour un débutant ») : `race_predictions`, déjà lue par
 *  `lireJourneeComplete` mais jamais affichée avant cette tâche. `null`
 *  (composant absent) tant que Garmin n'a pas encore calculé de prédiction —
 *  jamais un panneau vide ni un tiret. */
export function PredictionsCourseTuile({ predictions }: { predictions: PredictionsCourse | null }) {
  if (!predictions) return null;

  const lignes: Ligne[] = ([
    predictions.temps5kSec != null && { label: '5 km', sec: predictions.temps5kSec },
    predictions.temps10kSec != null && { label: '10 km', sec: predictions.temps10kSec },
    predictions.tempsSemiSec != null && { label: 'Semi-marathon', sec: predictions.tempsSemiSec },
    predictions.tempsMarathonSec != null && { label: 'Marathon', sec: predictions.tempsMarathonSec },
  ] as (Ligne | false)[]).filter((l): l is Ligne => l !== false);

  if (lignes.length === 0) return null;

  return (
    <section className="section">
      <div className="wrap" style={{ paddingBlock: 'clamp(40px,6vh,72px)' }}>
        <EnteteTuile>Prédictions de course</EnteteTuile>
        <div className="bande-mesures bande-170" style={{ marginTop: 16 }}>
          {lignes.map((l) => (
            <div key={l.label} className="mesure-tuile" style={{ padding: '20px 20px 20px 0' }}>
              <h6 style={{ margin: 0, fontSize: 11 }}>{l.label}</h6>
              <div style={{
                fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(2rem, 3.4vw, 2.8rem)',
                letterSpacing: '-0.03em', lineHeight: 1, marginTop: 10,
              }}>
                {formaterDureeCourse(l.sec)}
              </div>
            </div>
          ))}
        </div>
        <p className="p mt-3" style={{ color: 'var(--color-neutral-600)', fontSize: 13, maxWidth: '48ch' }}>
          Temps prédits par Garmin à partir de tes dernières séances — pas un objectif fixé, une estimation qui évolue avec ta forme.
        </p>
      </div>
    </section>
  );
}
