import type { SplitSeance } from '@/lib/types';
import { allureSecParKm, formaterAllure } from '@/lib/formatage';
import { EnteteTuile } from './ligne-mesure';

/** Allure d'un split : dérivée de la vitesse moyenne Garmin quand elle est
 *  connue (mesure directe), sinon recalculée depuis durée/distance du split
 *  — même repli que l'Historique, jamais un split sans allure alors que ses
 *  deux composantes sont connues. */
function allureSplit(s: SplitSeance): number | null {
  if (s.vitesseMoyMps != null && s.vitesseMoyMps > 0) return 1000 / s.vitesseMoyMps;
  return allureSecParKm(s.dureeSec, s.distanceM);
}

/** Splits kilométriques (page de détail de séance, re-stylage Cadence v2
 *  tâche 22) : barre encre 10px sur piste neutral-200, largeur = vitesse
 *  relative réelle — le split le plus rapide (allure la plus basse en s/km)
 *  obtient 100 %, les autres une largeur proportionnellement réduite
 *  (`w = allureMin / allureCe × 100`, brief), cascade `growX`. La tuile
 *  disparaît entièrement si l'activité n'a pas de splits (ex. séance
 *  manuelle rattachée sans détail Garmin). */
export function SplitsSeance({ splits }: { splits: SplitSeance[] }) {
  if (splits.length === 0) return null;

  const allures = splits.map((s) => allureSplit(s));
  const connues = allures.filter((a): a is number => a != null);
  const allureMin = connues.length > 0 ? Math.min(...connues) : null;

  return (
    <div>
      <EnteteTuile>Splits — temps par km</EnteteTuile>
      <div className="mt-4">
        {splits.map((s, i) => {
          const allure = allures[i];
          const largeur = allure != null && allureMin != null ? (allureMin / allure) * 100 : 0;
          return (
            <div key={s.numero} className="split-ligne">
              <span style={{
                fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 12,
                color: 'var(--color-neutral-600)', width: 22, flex: 'none',
              }}>
                {s.numero}
              </span>
              <div className="split-piste">
                <div className="split-remplissage" style={{
                  width: `${largeur}%`, animationDelay: `${(0.15 + i * 0.06).toFixed(2)}s`,
                }} />
              </div>
              <span style={{
                fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15,
                width: 56, textAlign: 'right', flex: 'none',
              }}>
                {formaterAllure(allure)}
              </span>
              <span style={{
                fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 12,
                color: 'var(--color-accent)', width: 44, textAlign: 'right', flex: 'none',
              }}>
                {s.fcMoy != null ? `${Math.round(s.fcMoy)}` : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
