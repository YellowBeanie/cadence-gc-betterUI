'use client';

import { useActionState, useState } from 'react';
import { SPORTS, type Activite } from '@/lib/types';
import type { Brouillon, SegmentPropose } from '@/lib/brouillons';
import { validerBrouillon, rejeterBrouillon, type EtatSoumission } from '@/app/actions';

const etatInitial: EtatSoumission = { erreur: null };

/** Une proposition de Claude issue de la saisie vocale (tâche 28), affichée
 *  au-dessus du formulaire manuel : bordée 2px accent (jamais confondue avec
 *  une donnée déjà validée), transcript replié par défaut (`details`/
 *  `summary`, discret), formulaire PRÉREMPLI mais éditable — la proposition
 *  n'est écrite en base qu'après validation explicite, jamais telle quelle. */
export function CarteBrouillon({ brouillon, activites }: {
  brouillon: Brouillon; activites: Activite[];
}) {
  const [etat, action, enCours] = useActionState(validerBrouillon, etatInitial);
  const [segments, setSegments] = useState<SegmentPropose[]>(
    brouillon.proposition.segments.length > 0
      ? brouillon.proposition.segments
      : [{ type: '', dureeMin: null, notes: null }],
  );
  const sportPropose = brouillon.proposition.sport.toLowerCase();

  return (
    <div style={{
      border: '2px solid var(--color-accent)', padding: 'clamp(24px, 3.5vw, 40px)', marginBottom: 28,
    }}>
      <h6 style={{ margin: 0, color: 'var(--color-accent)' }}>Proposition de Claude — à valider</h6>

      <details className="mt-4">
        <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--color-neutral-600)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          Transcript
        </summary>
        <p className="p mt-3" style={{ whiteSpace: 'pre-wrap', color: 'var(--color-neutral-700)' }}>
          {brouillon.transcript}
        </p>
      </details>

      <form action={action} className="mt-6">
        <input type="hidden" name="id" value={brouillon.id} />
        <div className="field">
          <label>Date</label>
          <input type="date" name="date"
                 defaultValue={brouillon.proposition.date ?? new Date().toISOString().slice(0, 10)}
                 required className="input" />
        </div>
        <div className="field">
          <label>Sport</label>
          <div className="seg">
            {SPORTS.map((s, i) => (
              <label key={s} className="seg-opt">
                <input type="radio" name="sport" value={s}
                       defaultChecked={sportPropose === s || (i === 0 && !(SPORTS as readonly string[]).includes(sportPropose))} />
                {s === 'boxe' ? 'Boxe' : 'Autre'}
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Durée (min)</label>
          <input type="number" name="dureeMin" min="1" max="600"
                 defaultValue={brouillon.proposition.dureeMin ?? undefined} className="input" />
        </div>
        <div className="field">
          <label>Intensité ressentie (RPE 1–10)</label>
          <input type="number" name="rpe" min="1" max="10"
                 defaultValue={brouillon.proposition.rpe ?? undefined} className="input" />
        </div>
        <div className="field">
          <label>Rattacher à une activité Garmin</label>
          <select name="garminActivityId" className="input">
            <option value="">—</option>
            {activites.map((a) => (
              <option key={a.id} value={a.id}>
                {a.debut.slice(0, 16)} — {a.nom ?? a.type}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea name="notes" rows={2} defaultValue={brouillon.proposition.notes ?? ''} className="input" />
        </div>

        <p style={{
          fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 10,
          letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-neutral-600)',
        }}>
          Segments
        </p>
        {segments.map((seg, i) => (
          // Pas de clé stable : lignes réordonnables librement par
          // l'utilisateur (ajout/suppression), index suffit pour une liste
          // purement locale au formulaire.
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className="mt-3 flex gap-2" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ margin: 0, flex: 2 }}>
              <label>Type</label>
              <input name="segmentType" defaultValue={seg.type} className="input" />
            </div>
            <div className="field" style={{ margin: 0, width: 90 }}>
              <label>Min</label>
              <input name="segmentDureeMin" type="number" min="1" max="600"
                     defaultValue={seg.dureeMin ?? undefined} className="input" />
            </div>
            <div className="field" style={{ margin: 0, flex: 3 }}>
              <label>Notes</label>
              <input name="segmentNotes" defaultValue={seg.notes ?? ''} className="input" />
            </div>
            <button type="button" className="btn btn-ghost" style={{ marginBottom: 22 }}
                    onClick={() => setSegments(segments.filter((_, j) => j !== i))}>
              Retirer
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-secondary mt-3"
                onClick={() => setSegments([...segments, { type: '', dureeMin: null, notes: null }])}>
          + Segment
        </button>

        {etat.erreur && (
          <p role="alert" className="p mt-4" style={{ color: 'var(--color-accent-700)' }}>{etat.erreur}</p>
        )}

        <button type="submit" disabled={enCours} className="btn btn-primary mt-4">
          Valider
        </button>
      </form>

      <form action={rejeterBrouillon} className="mt-3">
        <input type="hidden" name="id" value={brouillon.id} />
        <button type="submit" className="btn btn-secondary">Rejeter</button>
      </form>
    </div>
  );
}
