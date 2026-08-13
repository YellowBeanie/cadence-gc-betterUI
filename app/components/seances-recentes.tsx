import Link from 'next/link';
import type { SeanceUnifiee } from '@/lib/fusion';
import { traduireSport } from '@/lib/formatage';
import { DENSITE_PAR_DEFAUT, type Densite } from '@/lib/densite';
import { LigneSeance } from './ligne-seance';

const LIMITE = 6;

/** Séances récentes (dashboard Cadence v2, tâche 22, correspondance §4) —
 *  `.work-row` du DS Modernist (rendu factorisé dans `ligne-seance.tsx`,
 *  tâche 26). Limite 6, puis liens vers la liste complète (`/seances`) et
 *  l'écran « analyses » (`/historique`). Ligne cliquable vers `/seance/[id]`
 *  seulement quand `garminId` est connu (une saisie manuelle autonome n'a
 *  pas de page de détail). */
export function SeancesRecentes({
  seances, densite = DENSITE_PAR_DEFAUT,
}: {
  seances: SeanceUnifiee[];
  // Densité d'affichage (/reglages, tâche 45).
  densite?: Densite;
}) {
  if (seances.length === 0) return null;
  const recentes = seances.slice(0, LIMITE);
  const sports = [...new Set(
    recentes.map((s) => traduireSport(s.sport)).filter((s): s is string => s != null),
  )];

  return (
    <section className="section">
      <div className="section-inner">
        <div className="flex items-baseline justify-between gap-4">
          <h2 style={{ textTransform: 'uppercase', letterSpacing: '-0.01em' }}>Séances récentes</h2>
          {sports.length > 0 && (
            <h6 style={{ color: 'var(--color-neutral-600)' }}>{sports.join(' · ')}</h6>
          )}
        </div>
        <div style={{ marginTop: 24 }}>
          {recentes.map((s, i) => <LigneSeance key={s.cle} s={s} idx={i} densite={densite} />)}
        </div>
        <div className="flex items-center gap-6" style={{ marginTop: 24, flexWrap: 'wrap' }}>
          <Link href="/seances" className="link-arrow">
            Toutes les séances
            <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden="true">
              <path d="M0 5h12M8 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.25" />
            </svg>
          </Link>
          <Link href="/historique" className="link-arrow">
            Analyses
            <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden="true">
              <path d="M0 5h12M8 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.25" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
