import type { StatsSemaine } from '@/lib/types';
import { FENETRE_PAR_DEFAUT, libelleFenetre, type FenetreJours } from '@/lib/fenetre-temporelle';

type Stat = { k: string; v: string; u?: string; delta?: string };

/** Bande de stats de semaine (écran « analyses », tâche 22, correspondance
 *  §2) : Volume, D+, Temps Z1-Z2, Séances — calculées réellement par
 *  `lireStatsSemaine()`. Deltas factuels uniquement (nombre de séances),
 *  jamais un jugement de progression inventé.
 *
 *  Étiquette « N derniers jours » (revue A2, tâche 32 ; fenêtre configurable
 *  depuis la tâche 47, `lib/fenetre-temporelle.ts`) : `lireStatsSemaine` est
 *  une FENÊTRE GLISSANTE, pas la semaine ISO du titre au-dessus — un lundi
 *  matin, la bande porte les chiffres de la semaine précédente alors que la
 *  tendance 8 semaines affiche honnêtement une S{n} vide. Sans cette
 *  étiquette, on lisait « 16,6 km cette semaine » un jour sans activité.
 *  `fenetre` doit toujours correspondre au `jours` réellement passé à
 *  `lireStatsSemaine` par l'appelant — un en-tête figé qui ment est un bug. */
export function StatsSemaineBande({
  stats, fenetre = FENETRE_PAR_DEFAUT,
}: {
  stats: StatsSemaine;
  fenetre?: FenetreJours;
}) {
  const items: Stat[] = [
    { k: 'Volume', v: stats.volumeKm.toFixed(1), u: 'km' },
    { k: 'D+', v: `${stats.deniveleM}`, u: 'm' },
    ...(stats.pourcentZ12 != null ? [{ k: 'Temps Z1-Z2', v: `${stats.pourcentZ12}`, u: '%' }] : []),
    { k: 'Séances', v: `${stats.seances}`, delta: `Sur ${stats.seances} activité${stats.seances > 1 ? 's' : ''}` },
  ];

  return (
    <div style={{ marginTop: 'clamp(30px,5vh,48px)' }}>
      <h6 style={{ margin: 0, color: 'var(--color-neutral-600)' }}>{libelleFenetre(fenetre)}</h6>
      <div className="bande-mesures bande-170" style={{ marginTop: 12, borderTop: '2px solid var(--color-divider)' }}>
      {items.map((s) => (
        <div key={s.k} className="mesure-tuile" style={{ padding: '24px 20px 24px 0' }}>
          <h6 style={{ margin: 0, fontSize: 11 }}>{s.k}</h6>
          <div className="flex items-baseline gap-1.5" style={{ marginTop: 10 }}>
            <span style={{
              fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(2.4rem, 4.4vw, 3.8rem)',
              letterSpacing: '-0.04em', lineHeight: 1,
            }}>
              {s.v}
            </span>
            {s.u && <span style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>{s.u}</span>}
          </div>
          {s.delta && (
            <div style={{
              fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 11, letterSpacing: '.05em',
              textTransform: 'uppercase', color: 'var(--color-neutral-600)', marginTop: 10,
            }}>
              {s.delta}
            </div>
          )}
        </div>
      ))}
      </div>
    </div>
  );
}
