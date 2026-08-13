'use client';

import { useActionState } from 'react';
import type { SaisiePoint } from '@/lib/db/training';
import { soumettrePoint, type EtatSoumission } from '@/app/actions';
import { EnteteTuile } from './ligne-mesure';

function Curseur({ nom, libelle, valeur }: {
  nom: string; libelle: string; valeur: number | null | undefined;
}) {
  return (
    <div className="field">
      <label>{libelle}</label>
      <input type="range" name={nom} min="1" max="5" defaultValue={valeur ?? 3} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
    </div>
  );
}

const etatInitial: EtatSoumission = { erreur: null };

// Client Component pour la même raison que FormulaireSeance : afficher
// l'erreur de validation sans perdre la saisie déjà faite.
export function FormulairePoint({ date, existant }: {
  date: string; existant: SaisiePoint | null;
}) {
  const [etat, action, enCours] = useActionState(soumettrePoint, etatInitial);

  return (
    <form action={action}>
      <EnteteTuile>Point du jour</EnteteTuile>
      <div className="mt-6">
        <input type="hidden" name="date" value={date} />
        <Curseur nom="forme" libelle="Forme (1–5)" valeur={existant?.forme} />
        <Curseur nom="motivation" libelle="Motivation (1–5)" valeur={existant?.motivation} />
        <Curseur nom="sommeilPercu" libelle="Sommeil ressenti (1–5)" valeur={existant?.sommeilPercu} />
        <div className="field">
          <label>Douleurs (zone)</label>
          <input name="douleurs" defaultValue={existant?.douleurs ?? ''} className="input" />
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea name="notes" rows={2} defaultValue={existant?.notes ?? ''} className="input" />
        </div>
        {etat.erreur && (
          <p role="alert" className="p" style={{ color: 'var(--color-accent-700)' }}>{etat.erreur}</p>
        )}
        <button type="submit" disabled={enCours} className="btn btn-secondary mt-2">
          Enregistrer le point
        </button>
      </div>
    </form>
  );
}
