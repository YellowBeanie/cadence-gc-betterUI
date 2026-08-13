import type { ZonesHebdo } from '@/lib/types';
import { EnteteTuile } from './ligne-mesure';

/** Endurance fondamentale — part Z1-Z2 par semaine (écran « analyses »,
 *  tâche 25) : `lireZonesParSemaine`. Même langage visuel que
 *  `TendanceSemaines` (colonnes, semaine courante en accent) ; une semaine
 *  sans données de zones n'est PAS une semaine à 0 % (règle « jamais de zéro
 *  fabriqué ») — elle affiche `—` au-dessus d'une barre quasi nulle en
 *  neutral-500, distincte visuellement d'un vrai 0 %. */
export function ZonesParSemaine({ semaines }: { semaines: ZonesHebdo[] }) {
  if (semaines.length === 0) return null;

  const derniere = semaines[semaines.length - 1]?.debut;

  return (
    <section className="section">
      <div className="wrap" style={{ paddingTop: 'clamp(32px,5vh,56px)', paddingBottom: 'clamp(40px,6vh,72px)' }}>
        <EnteteTuile>Endurance fondamentale — part Z1-Z2</EnteteTuile>
        <p style={{ fontSize: 13, color: 'var(--color-neutral-600)', lineHeight: 1.45, maxWidth: '52ch', marginTop: 8 }}>
          Part du temps passé en zones 1-2 (effort facile) chaque semaine — l&apos;objectif de ton plan : construire la base.
        </p>
        <div className="flex items-end gap-2.5 md:gap-5" style={{ height: 190, marginTop: 20 }}>
          {semaines.map((s, i) => {
            const estCourante = s.debut === derniere;
            const sansDonnees = s.pctZ1Z2 == null;
            const hauteur = sansDonnees ? 1 : Math.max(s.pctZ1Z2 as number, 1);
            return (
              <div key={s.debut} className="flex flex-1 flex-col justify-end gap-2" style={{ height: '100%', maxWidth: 220 }}>
                <div style={{
                  fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 11,
                  color: 'var(--color-neutral-600)', textAlign: 'center',
                }}>
                  {sansDonnees ? '—' : `${s.pctZ1Z2} %`}
                </div>
                <div style={{
                  height: `${hauteur}%`,
                  background: sansDonnees ? 'var(--color-neutral-500)' : (estCourante ? 'var(--color-accent)' : 'var(--color-text)'),
                  transformOrigin: 'bottom',
                  animation: `growY .9s cubic-bezier(.16,1,.3,1) ${(0.1 + i * 0.07).toFixed(2)}s both`,
                }} />
                <div style={{
                  fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 10, letterSpacing: '.06em',
                  textTransform: 'uppercase', color: 'var(--color-neutral-600)', textAlign: 'center',
                }}>
                  S{s.isoSemaine}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
