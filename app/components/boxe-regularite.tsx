import type { RegulariteBoxe } from '@/lib/db/training';
import { EnteteTuile } from './ligne-mesure';

/** Boxe — régularité (écran « analyses », tâche 25) : `lireRegulariteBoxe`,
 *  grille bordée façon Layers (`.layers-grid`/`.layers-cellule`, tâche 22).
 *  Semaine à 2 séances ou plus en accent — l'objectif est celui qu'l'utilisateur s'est
 *  fixé lui-même (2/semaine), c'est un fait par rapport à ce repère déclaré,
 *  pas un jugement inventé. Absente entièrement si aucune saisie de boxe
 *  n'existe dans l'historique. */
export function BoxeRegularite({ semaines }: { semaines: RegulariteBoxe[] }) {
  if (semaines.length === 0) return null;

  return (
    <section className="section">
      <div className="wrap" style={{ paddingBlock: 'clamp(40px,6vh,72px)' }}>
        <EnteteTuile>Boxe — régularité</EnteteTuile>
        <p style={{ fontSize: 13, color: 'var(--color-neutral-600)', lineHeight: 1.45, maxWidth: '52ch', marginTop: 8 }}>
          Tes cours de boxe saisis à la main, semaine par semaine — l&apos;objectif que tu t&apos;es fixé : 2 par semaine.
        </p>
        <div className="layers-grid" style={{ marginTop: 20 }}>
          {semaines.map((s) => {
            const objectifAtteint = s.nbSeances >= 2;
            return (
              <div key={s.debut} className="layers-cellule">
                <span style={{
                  fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 11, letterSpacing: '.06em',
                  textTransform: 'uppercase', color: 'var(--color-neutral-600)',
                }}>
                  S{s.isoSemaine}
                </span>
                <div style={{
                  fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(2.2rem, 3.6vw, 3rem)',
                  letterSpacing: '-0.04em', lineHeight: 1, marginTop: 10,
                  color: objectifAtteint ? 'var(--color-accent)' : 'var(--color-text)',
                }}>
                  {s.nbSeances}
                </div>
                {s.rpeMoyen != null && <p className="desc">RPE MOY {s.rpeMoyen}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
