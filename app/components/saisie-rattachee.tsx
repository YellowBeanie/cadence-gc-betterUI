import Link from 'next/link';
import type { SaisieRattachee } from '@/lib/types';
import { formaterDateCourte } from '@/lib/formatage';

/** Panneau d'accompagnement de la page de détail de séance (re-stylage
 *  Cadence v2, tâche 22) — PAS d'IA par séance inventée (contrairement à la
 *  maquette de démo, qui affiche une fausse analyse) : uniquement la saisie
 *  manuelle réelle rattachée (RPE, notes), si elle existe. Panneau bordé 2px
 *  (pas de fond), avec un lien vers l'analyse hebdomadaire réelle. `null`
 *  fait disparaître le panneau entièrement — les splits prennent alors toute
 *  la largeur (page de détail, grid 1 colonne). */
export function SaisieRattacheeTuile({ saisie }: { saisie: SaisieRattachee | null }) {
  if (!saisie) return null;

  return (
    <div style={{
      border: '2px solid var(--color-divider)', padding: 'clamp(24px, 3.5vw, 40px)', alignSelf: 'start',
    }}>
      <div className="flex items-baseline justify-between gap-3">
        <h6 style={{ margin: 0, color: 'var(--color-accent)' }}>Ressenti — saisie</h6>
        <span style={{
          fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 10,
          letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-neutral-600)',
        }}>
          {formaterDateCourte(saisie.date)}
        </span>
      </div>
      {saisie.rpe != null && (
        <p className="mt-4" style={{ fontSize: '1.05rem', fontWeight: 600 }}>RPE {saisie.rpe}/10</p>
      )}
      {saisie.notes && (
        <p className="mt-3" style={{ fontSize: '1.05rem', lineHeight: 1.62, color: 'var(--color-neutral-700)' }}>{saisie.notes}</p>
      )}
      {saisie.segments.length > 0 && (
        <div className="mt-4 flex flex-col" style={{ gap: 6 }}>
          {saisie.segments.map((s, i) => (
            <p key={`${i}-${s.type}`} className="p" style={{ fontSize: 13, color: 'var(--color-neutral-700)' }}>
              {s.type}
              {s.dureeMin != null && ` · ${s.dureeMin} min`}
              {s.notes && ` · ${s.notes}`}
            </p>
          ))}
        </div>
      )}
      <Link href="/historique" className="btn btn-primary" style={{ marginTop: 20, justifyContent: 'flex-start' }}>
        Analyse complète →
      </Link>
    </div>
  );
}
