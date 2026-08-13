const TAILLE = 128;
const RAYON = 52;
const EPAISSEUR = 10;
const CENTRE = TAILLE / 2;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

/** Anneau d'objectif — nouveau composant DS Modernist (tâche 39,
 *  personnalisation des visuels ; documenté docs/design-cadence/README.md) :
 *  piste `--color-neutral-200`, arc encre (`--color-text`) — ACCENT
 *  uniquement quand l'objectif est atteint, seule sortie du mono-accent de ce
 *  composant (cf. docs/design-cadence/README.md §v2, « accent parcimonieux »).
 *
 *  N'existe QUE pour des mesures à objectif RÉEL fourni par Garmin (jamais un
 *  objectif inventé — cf. lib/visuels-mesures.ts, `AVEC_OBJECTIF_REEL`) :
 *  `objectif` est donc toujours un nombre réel ici, jamais une valeur
 *  fabriquée par défaut — à l'appelant (components/bande-mesures.tsx) de ne
 *  monter ce composant que lorsque la donnée existe.
 *
 *  Rayon 0 partout ailleurs dans le DS : le tracé garde des extrémités
 *  franches (`strokeLinecap` par défaut, jamais arrondi). Pas d'animation —
 *  même choix que les graphiques Recharts (`isAnimationActive={false}`) et la
 *  règle du projet « un seul moment animé : l'entrée des tuiles » (cf.
 *  CLAUDE.md, piège des captures headless qui figent une animation en cours). */
export function JaugeAnneau({
  valeur, objectif, unite,
}: {
  valeur: number;
  objectif: number;
  unite?: string;
}) {
  const pct = objectif > 0 ? Math.min(1, valeur / objectif) : 0;
  const atteint = objectif > 0 && valeur >= objectif;
  const dash = pct * CIRCONFERENCE;

  return (
    <div style={{ position: 'relative', width: TAILLE, height: TAILLE }}>
      <svg width={TAILLE} height={TAILLE} viewBox={`0 0 ${TAILLE} ${TAILLE}`} aria-hidden="true">
        <circle cx={CENTRE} cy={CENTRE} r={RAYON} fill="none" stroke="var(--color-neutral-200)" strokeWidth={EPAISSEUR} />
        <circle
          cx={CENTRE} cy={CENTRE} r={RAYON} fill="none"
          stroke={atteint ? 'var(--color-accent)' : 'var(--color-text)'}
          strokeWidth={EPAISSEUR}
          strokeDasharray={`${dash} ${CIRCONFERENCE - dash}`}
          transform={`rotate(-90 ${CENTRE} ${CENTRE})`}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 4,
      }}>
        <span style={{
          fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22,
          letterSpacing: '-0.03em', lineHeight: 1,
        }}>
          {Math.round(valeur).toLocaleString('fr-FR')}
        </span>
        <span style={{
          fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 11, letterSpacing: '.05em',
          textTransform: 'uppercase', color: 'var(--color-neutral-600)', textAlign: 'center',
        }}>
          / {Math.round(objectif).toLocaleString('fr-FR')}{unite ? ` ${unite}` : ''}
        </span>
      </div>
    </div>
  );
}
