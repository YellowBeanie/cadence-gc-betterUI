'use client';

import { useActionState } from 'react';
import { SPORTS_OBJECTIF, TYPES_OBJECTIF, formaterAvancement, type Objectif } from '@/lib/objectifs';
import { ajouterObjectif, basculerObjectif, retirerObjectif, type EtatSoumission } from '@/app/actions';
import { EnteteTuile } from './ligne-mesure';

const LIBELLE_SPORT: Record<(typeof SPORTS_OBJECTIF)[number], string> = {
  course: 'Course', boxe: 'Boxe', randonnee: 'Randonnée', tous: 'Tous sports',
};
const LIBELLE_TYPE: Record<(typeof TYPES_OBJECTIF)[number], string> = {
  seances_par_semaine: 'Séances / semaine',
  km_par_semaine: 'Kilomètres / semaine',
  minutes_par_semaine: 'Minutes / semaine',
};

const etatInitial: EtatSoumission = { erreur: null };

export type ObjectifAvecAvancement = Objectif & { realiseSemaine: number };

/** Bloc « Objectifs » de l'écran /saisie (tâche 43, rapport B2 §B.2 N1b) :
 *  le système savait ce qu'l'utilisateur avait FAIT, jamais ce qu'il VEUT. Liste des
 *  objectifs (actifs ET inactifs, avec un bouton pour basculer l'état) suivie
 *  d'un formulaire d'ajout — sport/type/cible seulement, jamais un libellé en
 *  texte libre (V1 volontairement bornée aux trois types calculables, cf.
 *  lib/objectifs.ts). L'avancement affiché est un DÉCOMPTE réel de la semaine
 *  ISO en cours, jamais un verdict de réussite/échec (même prudence que
 *  prompt-analyse.md côté analyste : on cite un compte, on ne juge pas). */
export function Objectifs({ objectifs }: { objectifs: ObjectifAvecAvancement[] }) {
  const [etat, action, enCours] = useActionState(ajouterObjectif, etatInitial);

  return (
    <section className="section">
      <div className="wrap" style={{ paddingBlock: 'clamp(40px,6vh,72px)' }}>
        <EnteteTuile>Objectifs</EnteteTuile>

        {objectifs.length > 0 && (
          <div className="mt-6">
            {objectifs.map((o) => (
              <div key={o.id} className="guidance-ligne">
                <h6 style={{ margin: 0, color: o.actif ? 'var(--color-accent)' : 'var(--color-neutral-600)' }}>
                  {LIBELLE_SPORT[o.sport]}
                </h6>
                <div>
                  <div style={{
                    fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.2rem, 2.2vw, 1.5rem)',
                    letterSpacing: '-0.015em', textTransform: 'uppercase',
                    color: o.actif ? 'var(--color-text)' : 'var(--color-neutral-600)',
                  }}>
                    {o.libelle}
                  </div>
                  <p className="p mt-2">{formaterAvancement(o.realiseSemaine, o.cible, o.type)}</p>
                  <div className="flex gap-2 mt-3">
                    <form action={basculerObjectif}>
                      <input type="hidden" name="id" value={o.id} />
                      <button type="submit" className="btn btn-secondary">
                        {o.actif ? 'Désactiver' : 'Activer'}
                      </button>
                    </form>
                    <form action={retirerObjectif}>
                      <input type="hidden" name="id" value={o.id} />
                      <button type="submit" className="btn btn-ghost">Supprimer</button>
                    </form>
                  </div>
                </div>
                <span className="tag-v2" style={{
                  background: o.actif ? 'var(--color-accent-100)' : 'var(--color-neutral-200)',
                  color: o.actif ? 'var(--color-accent-700)' : 'var(--color-text)',
                  justifySelf: 'end',
                }}>
                  {o.actif ? 'Actif' : 'Inactif'}
                </span>
              </div>
            ))}
          </div>
        )}

        <form action={action} className="mt-8">
          <div className="field">
            <label>Sport</label>
            <div className="seg">
              {SPORTS_OBJECTIF.map((s, i) => (
                <label key={s} className="seg-opt">
                  <input type="radio" name="sport" value={s} defaultChecked={i === 0} />
                  {LIBELLE_SPORT[s]}
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Type d&apos;objectif</label>
            <select name="type" className="input" defaultValue={TYPES_OBJECTIF[0]}>
              {TYPES_OBJECTIF.map((t) => (
                <option key={t} value={t}>{LIBELLE_TYPE[t]}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Cible</label>
            <input type="number" name="cible" min="0.1" max="1000" step="0.1" className="input" required />
          </div>
          {etat.erreur && (
            <p role="alert" className="p" style={{ color: 'var(--color-accent-700)' }}>{etat.erreur}</p>
          )}
          <button type="submit" disabled={enCours} className="btn btn-primary mt-2">
            Ajouter l&apos;objectif
          </button>
        </form>
      </div>
    </section>
  );
}
