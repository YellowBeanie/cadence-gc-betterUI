'use client';

import { useActionState } from 'react';
import { SPORTS, type Activite } from '@/lib/types';
import { soumettreSeance, type EtatSoumission } from '@/app/actions';
import { EnteteTuile } from './ligne-mesure';

const LIBELLES_SPORT: Record<(typeof SPORTS)[number], string> = {
  boxe: 'Boxe',
  autre: 'Autre',
};

const etatInitial: EtatSoumission = { erreur: null };

// Client Component : `useActionState` garde l'utilisateur sur l'écran de
// saisie et réaffiche ses champs remplis si la server action rejette la
// soumission, au lieu de faire disparaître le formulaire derrière la page
// d'erreur générique (`app/error.tsx`) sur un simple RPE mal formé.
export function FormulaireSeance({ date, activites }: {
  date: string; activites: Activite[];
}) {
  const [etat, action, enCours] = useActionState(soumettreSeance, etatInitial);

  return (
    <form action={action}>
      <EnteteTuile>Séance</EnteteTuile>
      <div className="mt-6">
        <div className="field">
          <label>Date</label>
          <input type="date" name="date" defaultValue={date} required className="input" />
        </div>
        <div className="field">
          <label>Sport</label>
          <div className="seg">
            {SPORTS.map((s, i) => (
              <label key={s} className="seg-opt">
                <input type="radio" name="sport" value={s} defaultChecked={i === 0} />
                {LIBELLES_SPORT[s]}
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Type de travail</label>
          <select name="sousType" className="input">
            <option value="">—</option>
            <option value="technique">Technique</option>
            <option value="sparring">Sparring</option>
            <option value="sac">Sac</option>
            <option value="physique">Physique</option>
          </select>
        </div>
        <div className="field">
          <label>Durée (min)</label>
          <input type="number" name="dureeMin" min="1" max="600" className="input" />
        </div>
        <div className="field">
          <label>Intensité ressentie (RPE 1–10)</label>
          <input type="range" name="rpe" min="1" max="10" defaultValue="5" style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
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
          <textarea name="notes" rows={3} className="input" />
        </div>
        {etat.erreur && (
          <p role="alert" className="p" style={{ color: 'var(--color-accent-700)' }}>{etat.erreur}</p>
        )}
        <button type="submit" disabled={enCours} className="btn btn-primary mt-2">
          Enregistrer la séance
        </button>
      </div>
    </form>
  );
}
