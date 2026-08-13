'use client';

import { useState } from 'react';
import { EnteteTuile } from './ligne-mesure';

type EtatEnvoi =
  | { statut: 'repos' }
  | { statut: 'envoi' }
  | { statut: 'ok' }
  | { statut: 'erreur'; message: string };

/** Upload de l'audio de saisie vocale (tâche 28, spec 2) : la transcription et
 *  la structuration se font ensuite côté NAS (cron `traite-audio.sh`, hors
 *  requête HTTP) — cette section ne fait qu'envoyer le fichier et confirmer
 *  la réception, jamais une promesse de délai précis.
 *
 *  Route handler (`/api/audio-saisie`) et pas une server action : un
 *  formulaire multipart classique déclenché ici via `fetch` + état local
 *  (cohérent avec les autres formulaires de l'écran, qui utilisent
 *  `useActionState` — ici impossible, la cible n'est pas une server action). */
export function EnvoiAudio() {
  const [etat, setEtat] = useState<EtatEnvoi>({ statut: 'repos' });

  async function envoyer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const donnees = new FormData(form);
    setEtat({ statut: 'envoi' });
    try {
      const res = await fetch('/api/audio-saisie', { method: 'POST', body: donnees });
      if (!res.ok) {
        const corps = await res.json().catch(() => ({}));
        setEtat({ statut: 'erreur', message: corps.erreur ?? "Envoi échoué." });
        return;
      }
      form.reset();
      setEtat({ statut: 'ok' });
    } catch {
      setEtat({ statut: 'erreur', message: 'Envoi échoué (réseau).' });
    }
  }

  return (
    <form onSubmit={envoyer}>
      <EnteteTuile>Saisie vocale</EnteteTuile>
      <p className="p mt-3" style={{ maxWidth: 560 }}>
        Raconte ton cours au micro en sortant — Claude en fera une proposition
        de séance à valider ici.
      </p>
      <div className="mt-6">
        <div className="field">
          <label>Fichier audio</label>
          <input type="file" name="audio" accept="audio/*" capture required className="input" />
        </div>
        {etat.statut === 'erreur' && (
          <p role="alert" className="p" style={{ color: 'var(--color-accent-700)' }}>{etat.message}</p>
        )}
        {etat.statut === 'ok' && (
          <p className="p" style={{ color: 'var(--color-accent)' }}>
            Audio reçu — la proposition apparaîtra ici d&apos;ici quelques minutes.
          </p>
        )}
        <button type="submit" disabled={etat.statut === 'envoi'} className="btn btn-primary mt-2">
          Envoyer l&apos;audio
        </button>
      </div>
    </form>
  );
}
