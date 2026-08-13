import Link from 'next/link';
import type { PlanPasse, SeancePrescrite } from '@/lib/types';
import { formaterDateCourte, formaterPhraseSeance } from '@/lib/formatage';

type LigneGuidance = { label: string; titre: string; body?: string; tag: string; tagBg: string; tagFg: string };

/** Guidance de la semaine (écran « analyses », tâche 22, correspondance §5) :
 *  lignes réelles uniquement — le plan Garmin réel (`lireProchainesSeances`)
 *  et, si présente, la prudence de l'analyse Claude. Jamais de ligne
 *  inventée (pas de Food Advisor ici, contrairement à la maquette de démo).
 *  Sous-bloc « Semaine passée » (tâche 25) : le plan Garmin échu confronté à
 *  une activité de course réalisée le même jour (`lirePlanPasse`) —
 *  formulation factuelle (« NON COURU », jamais « manqué »), section absente
 *  si aucune séance n'est échue. */
export function Guidance({
  prochaines, prudence, planPasse = [],
}: {
  prochaines: SeancePrescrite[];
  prudence: string | null;
  planPasse?: PlanPasse[];
}) {
  const lignes: LigneGuidance[] = [
    ...prochaines.filter((p) => !p.repos).map((p): LigneGuidance => ({
      label: 'Plan Garmin',
      titre: `${formaterDateCourte(p.date)} — ${p.nom ?? 'Séance'}`
        + (p.distanceM != null ? `, ${(p.distanceM / 1000).toFixed(1)} km` : ''),
      body: p.intention ? formaterPhraseSeance(p.intention) : undefined,
      tag: 'Planifié', tagBg: 'var(--color-neutral-200)', tagFg: 'var(--color-text)',
    })),
    ...(prudence ? [{
      label: 'Analyse Claude', titre: prudence, tag: 'Prudence',
      tagBg: 'var(--color-accent-100)', tagFg: 'var(--color-accent-700)',
    }] : []),
  ];

  if (lignes.length === 0 && planPasse.length === 0) return null;

  return (
    <section className="section">
      <div className="wrap" style={{ paddingBlock: 'clamp(40px,6vh,72px)' }}>
        <h2 style={{ textTransform: 'uppercase' }}>Cette semaine</h2>
        {lignes.length > 0 && (
          <div className="mt-6">
            {lignes.map((l) => (
              // Pas de clé stable disponible (titre potentiellement dupliqué,
              // ex. deux séances planifiées le même jour) : `label+titre`
              // concaténés servent de clé, ordre du tableau inchangé au rendu.
              <div key={`${l.label}-${l.titre}`} className="guidance-ligne">
                <h6 style={{ margin: 0, color: 'var(--color-accent)' }}>{l.label}</h6>
                <div>
                  <div style={{
                    fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.2rem, 2.2vw, 1.5rem)',
                    letterSpacing: '-0.015em', textTransform: 'uppercase',
                  }}>
                    {l.titre}
                  </div>
                  {l.body && <p className="p mt-2" style={{ maxWidth: '64ch' }}>{l.body}</p>}
                </div>
                <span className="tag-v2" style={{ background: l.tagBg, color: l.tagFg, justifySelf: 'end' }}>{l.tag}</span>
              </div>
            ))}
          </div>
        )}
        {planPasse.length > 0 && (
          <div className="mt-8">
            <h6 style={{ color: 'var(--color-neutral-600)' }}>Semaine passée</h6>
            <div className="mt-3">
              {planPasse.map((p) => {
                const fait = p.realisee != null;
                return (
                  <div key={p.date} className="guidance-ligne">
                    <h6 style={{ margin: 0, color: 'var(--color-accent)' }}>Plan Garmin</h6>
                    <div>
                      <div style={{
                        fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.2rem, 2.2vw, 1.5rem)',
                        letterSpacing: '-0.015em', textTransform: 'uppercase',
                      }}>
                        {formaterDateCourte(p.date)} — {p.nom ?? 'Séance'}
                      </div>
                      {fait ? (
                        <Link href={`/seance/${p.realisee!.id}`} className="p mt-2" style={{ display: 'block', maxWidth: '64ch' }}>
                          Couru ce jour-là : {p.realisee!.nom ?? 'Séance'}
                          {p.realisee!.distanceM != null ? `, ${(p.realisee!.distanceM / 1000).toFixed(1)} km` : ''}
                        </Link>
                      ) : (
                        <p className="p mt-2" style={{ maxWidth: '64ch' }}>Aucune activité enregistrée ce jour-là.</p>
                      )}
                    </div>
                    <span className="tag-v2" style={{
                      background: fait ? 'var(--color-accent)' : 'var(--color-neutral-200)',
                      color: fait ? 'var(--color-bg)' : 'var(--color-text)',
                      justifySelf: 'end',
                    }}>
                      {fait ? 'Fait' : 'Non couru'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
