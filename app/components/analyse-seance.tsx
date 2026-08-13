import type { AnalyseSeance } from '@/lib/types';
import { formaterDateHeureCourte } from '@/lib/formatage';

/** Panneau « Analyse — Claude » de la page de détail de séance (tâche 24,
 *  maquette Cadence v2, section « AI Analysis — Layer ») : analyse
 *  comparative réelle produite par `deploy/nas/analyse-seance.sh`, jamais
 *  inventée côté app. Panneau bordé 2px (même style que
 *  `SaisieRattacheeTuile`), pas de bouton « Full analysis » (rien à lier).
 *  `null` fait disparaître le panneau entièrement — jamais de coquille vide. */
export function AnalyseSeanceTuile({ analyse }: { analyse: AnalyseSeance | null }) {
  if (!analyse) return null;

  return (
    <div style={{
      border: '2px solid var(--color-divider)', padding: 'clamp(24px, 3.5vw, 40px)', alignSelf: 'start',
    }}>
      <div className="flex items-baseline justify-between gap-3">
        <h6 style={{ margin: 0, color: 'var(--color-accent)' }}>Analyse — Claude</h6>
        <span style={{
          fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 10,
          letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-neutral-600)',
        }}>
          Claude · {formaterDateHeureCourte(analyse.genereLe)}
        </span>
      </div>
      <p className="mt-4" style={{ fontSize: 15, fontWeight: 600 }}>{analyse.resume}</p>
      {analyse.observations.map((o, i) => (
        // Pas de clé stable (observations potentiellement dupliquées par
        // l'analyste) : index + texte, ordre du tableau inchangé — même
        // convention que /historique (page.tsx).
        <p key={`${i}-${o}`} className="mt-3" style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--color-neutral-700)' }}>
          {o}
        </p>
      ))}
      {analyse.prudence && (
        <p className="mt-4" style={{
          borderLeft: '2px solid var(--color-accent)', paddingLeft: 16,
          fontSize: 15, lineHeight: 1.55, color: 'var(--color-neutral-700)',
        }}>
          {analyse.prudence}
        </p>
      )}
    </div>
  );
}
