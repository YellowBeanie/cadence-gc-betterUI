import type { SaisiePoint } from '@/lib/db/training';

/** Ressenti du jour (retour l'utilisateur du 2026-08-09 : « j'ai saisi le ressenti du
 *  jour mais il ne s'affiche nulle part ») — section du dashboard, sous la
 *  bande de mesures : les notes /5 saisies à la main, douleurs et notes
 *  libres. N'existe que si un point a été saisi aujourd'hui. Ces données
 *  partent déjà dans le contexte de l'analyste quotidien
 *  (collector/extraire_contexte.py, clé `points_du_jour`) — la ligne
 *  d'explication le rappelle pour lever le doute. */
export function RessentiDuJour({ point }: { point: SaisiePoint | null }) {
  if (!point) return null;

  const notes = ([
    point.forme != null && { k: 'Forme', v: point.forme },
    point.motivation != null && { k: 'Motivation', v: point.motivation },
    point.sommeilPercu != null && { k: 'Sommeil ressenti', v: point.sommeilPercu },
  ] as ({ k: string; v: number } | false)[]).filter((n): n is { k: string; v: number } => n !== false);

  if (notes.length === 0 && !point.douleurs && !point.notes) return null;

  return (
    <section className="section">
      <div className="section-inner">
        <h6 style={{ margin: 0, color: 'var(--color-accent)' }}>Ressenti du jour — ta saisie</h6>
        <p style={{ fontSize: 13, color: 'var(--color-neutral-600)', lineHeight: 1.45, maxWidth: '60ch', marginTop: 8 }}>
          Ce que la montre ne mesure pas — Claude le lit dans son analyse quotidienne.
        </p>
        {notes.length > 0 && (
          <div className="flex flex-wrap" style={{ gap: 'clamp(24px,4vw,56px)', marginTop: 20 }}>
            {notes.map((n) => (
              <div key={n.k}>
                <h6 style={{ margin: 0, fontSize: 11 }}>{n.k}</h6>
                <div className="flex items-baseline gap-1.5" style={{ marginTop: 8 }}>
                  <span style={{
                    fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '2.2rem',
                    letterSpacing: '-0.03em', lineHeight: 1,
                  }}>
                    {n.v}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>/5</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {point.douleurs && (
          <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--color-neutral-700)', marginTop: 18, maxWidth: '66ch' }}>
            <span style={{ fontWeight: 600 }}>Douleurs : </span>{point.douleurs}
          </p>
        )}
        {point.notes && (
          <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--color-neutral-700)', marginTop: point.douleurs ? 8 : 18, maxWidth: '66ch' }}>
            {point.notes}
          </p>
        )}
      </div>
    </section>
  );
}
