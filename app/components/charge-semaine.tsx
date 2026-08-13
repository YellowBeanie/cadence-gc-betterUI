import type { ChargeJour, StatutEntrainement } from '@/lib/types';
import { tonDepuisFacteur, traduireFacteur } from '@/lib/statuts-entrainement';

const JOURS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function libelleJour(iso: string): string {
  const [an, mois, jour] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(an, mois - 1, jour));
  // getUTCDay() : 0 = dimanche … 6 = samedi ; JOURS_FR commence au lundi.
  return JOURS_FR[(d.getUTCDay() + 6) % 7];
}

/** Section « Charge 7 jours » (dashboard Cadence v2, tâche 22, correspondance
 *  §3, fond `--color-surface`) : gros chiffre = charge aiguë réelle, PAS de
 *  plage « optimale » inventée (contrairement à la maquette de démo). Barres
 *  = `lireChargeParJour(7)` (somme réelle de `training_load`) ; un jour sans
 *  activité reste une barre quasi nulle en neutral-500, jamais masquée —
 *  c'est aussi de l'information. La barre du jour courant (dernier élément du
 *  tableau, chronologique croissant) est seule en accent, cascade `growY`.
 *
 *  Tâche 31 (revue A1) : le ratio aigu/chronique est déjà qualifié par Garmin
 *  (`training_readiness.acwr_factor_feedback`, zone de risque connue en
 *  physiologie du sport) — coloré et traduit en toutes lettres au lieu d'un
 *  texte neutre, `acwrFeedback` optionnel car cette section apparaît aussi
 *  sur le dashboard, où le lien vers `training_readiness` du même jour existe
 *  déjà (`journee.acwrFeedback`, lib/db/garmin.ts). */
export function ChargeSemaine({
  statut, joursCharge, acwrFeedback = null,
}: {
  statut: StatutEntrainement | null;
  joursCharge: ChargeJour[];
  acwrFeedback?: string | null;
}) {
  if (statut?.chargeAigue == null) return null;

  const ratio = statut.chargeChronique != null && statut.chargeChronique !== 0
    ? statut.chargeAigue / statut.chargeChronique : null;
  const tonRatio = tonDepuisFacteur(acwrFeedback);
  const libelleRatio = traduireFacteur(acwrFeedback);

  const paragraphe = [
    statut.libelle && `${statut.libelle}.`,
    ratio != null && `Charge aiguë ${statut.chargeAigue}, chronique ${statut.chargeChronique} — ratio ${ratio.toFixed(2)}${libelleRatio ? ` (${libelleRatio})` : ''}.`,
  ].filter(Boolean).join(' ');

  const max = Math.max(1, ...joursCharge.map((j) => j.total));
  const aujourdhui = joursCharge[joursCharge.length - 1]?.date;

  return (
    <section className="section" style={{ background: 'var(--color-surface)' }}>
      <div className="section-inner grid-charge">
        <div>
          <h6 style={{ color: 'var(--color-accent)' }}>Charge 7 jours</h6>
          <div className="flex items-baseline gap-3" style={{ marginTop: 12 }}>
            <span style={{
              fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(3.6rem, 6vw, 5.6rem)',
              letterSpacing: '-0.045em', lineHeight: 1,
            }}>
              {statut.chargeAigue}
            </span>
            {ratio != null && (
              <span style={{
                fontSize: 12,
                color: tonRatio === 'negatif' ? 'var(--color-accent-700)'
                  : tonRatio === 'positif' ? 'var(--color-text)' : 'var(--color-neutral-600)',
              }}>
                Chronique {statut.chargeChronique} · ratio {ratio.toFixed(2)}
                {libelleRatio && ` — ${libelleRatio}`}
              </span>
            )}
          </div>
          {ratio != null && (
            <p style={{ fontSize: 13, color: 'var(--color-neutral-600)', lineHeight: 1.45, maxWidth: '38ch', marginTop: 8 }}>
              Aiguë = 7 derniers jours · chronique = ton habitude des 4 dernières semaines · ratio proche de 1 = progression régulière.
            </p>
          )}
          {paragraphe && <p className="p" style={{ maxWidth: '38ch', marginTop: 18 }}>{paragraphe}</p>}
        </div>
        {joursCharge.length > 0 && (
          <div className="flex items-end gap-2 md:gap-4" style={{ height: 160 }}>
            {joursCharge.map((j, i) => {
              const estAujourdhui = j.date === aujourdhui;
              const hauteur = j.total > 0 ? (j.total / max) * 100 : 1;
              return (
                <div key={j.date} className="flex flex-1 flex-col justify-end gap-2" style={{ height: '100%' }}>
                  <div style={{
                    height: `${hauteur}%`,
                    background: estAujourdhui ? 'var(--color-accent)' : (j.total > 0 ? 'var(--color-text)' : 'var(--color-neutral-500)'),
                    transformOrigin: 'bottom',
                    animation: `growY .8s cubic-bezier(.16,1,.3,1) ${(0.15 + i * 0.08).toFixed(2)}s both`,
                  }} />
                  <div style={{
                    fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 10, letterSpacing: '.08em',
                    textTransform: 'uppercase', color: 'var(--color-neutral-600)', textAlign: 'center',
                  }}>
                    {libelleJour(j.date)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
