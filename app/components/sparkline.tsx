import { segmentsSparkline } from '@/lib/sparkline';

const LARGEUR = 72;
const HAUTEUR = 22;

/** Sparkline 7 jours (tâche 19, restylée « Cadence v2 » tâche 22 — encre
 *  72×22, brief §2 bande de mesures) : mini-tracé SVG inline sous une tuile
 *  de mesure. Composant Serveur — pas de Recharts pour un tracé aussi petit,
 *  pas de `'use client'` puisqu'aucun état ni interaction.
 *
 *  Trait encre (`--color-text`) : le DS Modernist n'a plus de rampe Z1-Z5 à
 *  distinguer visuellement d'une tendance — encre partout, sobre. Animation
 *  `draw` (tracé qui se dessine, brief tâche 22) via `pathLength`. N'affiche
 *  rien en dessous de deux valeurs connues (voir `lib/sparkline.ts`), et
 *  casse le tracé en segments distincts autour d'un trou plutôt que
 *  d'inventer un point à 0. */
export function Sparkline({ valeurs }: { valeurs: (number | null)[] }) {
  const { segments, dernierPoint } = segmentsSparkline(valeurs, LARGEUR, HAUTEUR);
  if (segments.length === 0) return null;

  return (
    <svg width={LARGEUR} height={HAUTEUR} viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
         style={{ display: 'block' }} aria-hidden="true">
      {segments.map((segment, i) => (
        <polyline
          key={i}
          points={segment.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#201e1d"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          style={{ strokeDasharray: 1, animation: 'draw 1.4s cubic-bezier(.16,1,.3,1) .4s both' }}
        />
      ))}
      {dernierPoint && (
        <circle cx={dernierPoint.x} cy={dernierPoint.y} r="1.75" fill="#201e1d" />
      )}
    </svg>
  );
}
