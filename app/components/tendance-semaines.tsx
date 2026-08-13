import type { ChargeHebdo } from '@/lib/types';
import { EnteteTuile } from './ligne-mesure';

/** Tendance 8 semaines (écran analyses, tâche 22, nouveau) : charge
 *  d'entraînement par semaine ISO (`lireChargeParSemaine`). Les semaines
 *  antérieures à la première donnée n'existent déjà plus dans le tableau
 *  reçu (montre neuve, largeur partagée entre les semaines réellement
 *  connues) — une semaine couverte par les données mais sans activité reste
 *  un vrai 0, affiché en barre quasi nulle plutôt que masquée. Semaine
 *  courante (dernier élément, chronologique croissant) seule en accent. */
export function TendanceSemaines({ semaines }: { semaines: ChargeHebdo[] }) {
  if (semaines.length === 0) return null;

  const max = Math.max(1, ...semaines.map((s) => s.total));
  const derniere = semaines[semaines.length - 1]?.debut;

  return (
    <section className="section">
      <div className="wrap" style={{ paddingTop: 'clamp(32px,5vh,56px)', paddingBottom: 'clamp(40px,6vh,72px)' }}>
        <EnteteTuile>Charge — 8 semaines</EnteteTuile>
        <div className="flex items-end gap-2.5 md:gap-5" style={{ height: 190, marginTop: 20 }}>
          {semaines.map((s, i) => {
            const estCourante = s.debut === derniere;
            const hauteur = s.total > 0 ? (s.total / max) * 100 : 1;
            return (
              <div key={s.debut} className="flex flex-1 flex-col justify-end gap-2" style={{ height: '100%', maxWidth: 220 }}>
                <div style={{
                  fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 11,
                  color: 'var(--color-neutral-600)', textAlign: 'center',
                }}>
                  {Math.round(s.total)}
                </div>
                <div style={{
                  height: `${hauteur}%`,
                  background: estCourante ? 'var(--color-accent)' : (s.total > 0 ? 'var(--color-text)' : 'var(--color-neutral-500)'),
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
