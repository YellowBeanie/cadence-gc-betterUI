import Link from 'next/link';
import type { SeanceUnifiee } from '@/lib/fusion';
import { traduireSport } from '@/lib/formatage';
import { classeLigneSeance, DENSITE_PAR_DEFAUT, type Densite } from '@/lib/densite';

/** Contenu d'une ligne — factorisé pour rester identique cliquable
 *  (activité Garmin, `garminId` connu) ou non (séance manuelle autonome,
 *  ex. boxe sans montre) : même règle que la tâche 21. */
function ContenuLigne({ s, idx }: { s: SeanceUnifiee; idx: number }) {
  // Distance en priorité (course/hike), durée en repli (boxe sans distance) —
  // brief §4 : « distance mono à droite (ou durée pour la boxe sans distance) ».
  const droite = s.distanceM != null
    ? `${(s.distanceM / 1000).toFixed(1)} km`
    : (s.dureeMin != null ? `${s.dureeMin} min` : null);

  return (
    <>
      <span className="idx">{String(idx + 1).padStart(2, '0')}</span>
      <span className="nm">{s.nom}</span>
      {droite ? <span className="dist">{droite}</span> : <span />}
      <span className="st">{[traduireSport(s.sport), s.date.slice(0, 10)].filter(Boolean).join(' · ')}</span>
    </>
  );
}

/** Une ligne `.work-row` du DS Modernist — factorisée (tâche 26) pour être
 *  rendue à l'identique par le dashboard (« Séances récentes »,
 *  `components/seances-recentes.tsx`) et l'écran « toutes les séances »
 *  (`/seances`), plutôt que dupliquer le rendu entre les deux. Cliquable vers
 *  `/seance/[id]` seulement quand `garminId` est connu (une saisie manuelle
 *  autonome n'a pas de page de détail). */
export function LigneSeance({
  s, idx, densite = DENSITE_PAR_DEFAUT,
}: {
  s: SeanceUnifiee; idx: number;
  // Densité d'affichage (/reglages, tâche 45) : resserre l'espacement
  // vertical en « compacte » (règle CSS `.work-row.densite-compacte`).
  densite?: Densite;
}) {
  return s.garminId != null ? (
    <Link href={`/seance/${s.garminId}`} className={classeLigneSeance(densite, true)}>
      <ContenuLigne s={s} idx={idx} />
    </Link>
  ) : (
    <div className={classeLigneSeance(densite, false)}>
      <ContenuLigne s={s} idx={idx} />
    </div>
  );
}
