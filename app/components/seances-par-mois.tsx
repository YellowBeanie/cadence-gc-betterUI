import type { SeanceUnifiee } from '@/lib/fusion';
import { DENSITE_PAR_DEFAUT, type Densite } from '@/lib/densite';
import { LigneSeance } from './ligne-seance';

/** `AAAA-MM-JJ[...]` → `AAAA-MM`, clé de regroupement par mois calendaire. */
function cleMois(dateIso: string): string {
  return dateIso.slice(0, 7);
}

/** `AAAA-MM` → libellé « MOIS AAAA » en toutes lettres, ex. « AOÛT 2026 » —
 *  même esprit que `formaterDateLongueFr` (lib/formatage.ts) : `Intl` plutôt
 *  qu'une table de mois écrite à la main. */
function libelleMois(cle: string): string {
  const [an, mois] = cle.split('-').map(Number);
  const d = new Date(Date.UTC(an, mois - 1, 1));
  const texte = new Intl.DateTimeFormat('fr-CH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
  return texte.toUpperCase();
}

/** Liste complète des séances (écran « toutes les séances », tâche 26),
 *  groupée par mois calendaire — `seances` déjà triée antichronologiquement
 *  par `fusionnerSeances`, l'ordre des groupes en découle sans tri
 *  supplémentaire. Rendu de chaque ligne factorisé (`ligne-seance.tsx`,
 *  identique au dashboard) plutôt que dupliqué. */
export function SeancesParMois({
  seances, densite = DENSITE_PAR_DEFAUT,
}: {
  seances: SeanceUnifiee[];
  // Densité d'affichage (/reglages, tâche 45).
  densite?: Densite;
}) {
  if (seances.length === 0) {
    return <p className="p">Aucune séance enregistrée.</p>;
  }

  const groupes: { cle: string; seances: SeanceUnifiee[] }[] = [];
  for (const s of seances) {
    const cle = cleMois(s.date);
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.cle === cle) dernier.seances.push(s);
    else groupes.push({ cle, seances: [s] });
  }

  return (
    <div>
      {groupes.map((g, i) => (
        <div key={g.cle} style={{ marginTop: i === 0 ? 0 : 40 }}>
          <h6 style={{ color: 'var(--color-neutral-600)' }}>{libelleMois(g.cle)}</h6>
          <div style={{ marginTop: 12 }}>
            {g.seances.map((s, idx) => <LigneSeance key={s.cle} s={s} idx={idx} densite={densite} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
