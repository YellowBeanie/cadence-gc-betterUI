'use client';

import { useActionState } from 'react';
import { importerConfiguration, type EtatImportConfig } from '@/app/actions';

const etatInitial: EtatImportConfig = { erreur: null, importees: 0, ignorees: 0 };

/** Formulaire d'import de configuration (tâche 46) : Client Component pour la
 *  même raison que FormulairePoint/FormulaireSeance — afficher le résultat
 *  (erreur, ou compte importées/ignorées) sans perdre l'état du formulaire.
 *  N'affiche jamais le CONTENU importé, seulement des comptes — le fichier
 *  vient potentiellement d'un tiers (garde-fou de la mission). */
export function ImportConfiguration() {
  const [etat, action, enCours] = useActionState(importerConfiguration, etatInitial);

  return (
    <form action={action} className="mt-6">
      <div className="field">
        <label>Fichier de configuration (JSON)</label>
        <input type="file" name="fichier" accept="application/json,.json" required className="input" />
      </div>
      {etat.erreur && (
        <p role="alert" className="p" style={{ color: 'var(--color-accent-700)' }}>{etat.erreur}</p>
      )}
      {!etat.erreur && (etat.importees > 0 || etat.ignorees > 0) && (
        <p className="p" style={{ color: 'var(--color-accent)' }}>
          {etat.importees} préférence{etat.importees > 1 ? 's' : ''} importée{etat.importees > 1 ? 's' : ''},
          {' '}{etat.ignorees} ignorée{etat.ignorees > 1 ? 's' : ''}.
        </p>
      )}
      <button type="submit" disabled={enCours} className="btn btn-secondary mt-2">
        Importer
      </button>
    </form>
  );
}
