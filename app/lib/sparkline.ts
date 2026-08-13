// Logique pure de la sparkline 7 jours (tâche 19, « ce que dynamique veut
// dire ici ») : positionne une série de valeurs (chronologique, la plus
// récente en dernier) dans un tracé SVG ~90×28 px, rendu serveur (jamais de
// bibliothèque de graphes pour un si petit tracé). Séparée du composant React
// pour rester testable sans DOM (vitest, env node) — même découpage que
// `lib/couloir.ts`.
//
// Règle « jamais de zéro fabriqué » (brief) : un jour sans donnée casse le
// tracé en segments distincts plutôt que d'interpoler ou de tomber à 0 — un
// trou visible est plus honnête qu'une valeur inventée.

const MARGE_VERTICALE = 3;

export type PointSparkline = { x: number; y: number };

/** Segments de tracé + point final (dernière valeur connue, pas forcément le
 *  dernier jour de la série) pour le marqueur plein. `segments` est vide (et
 *  `dernierPoint` `null`) en dessous de 2 valeurs connues : une sparkline
 *  n'a rien à montrer avec un seul point, mieux vaut ne rien tracer que de
 *  suggérer une tendance sur un point isolé. */
export function segmentsSparkline(
  valeurs: (number | null)[], largeur: number, hauteur: number,
): { segments: PointSparkline[][]; dernierPoint: PointSparkline | null } {
  const connues = valeurs.filter((v): v is number => v != null);
  if (connues.length < 2) return { segments: [], dernierPoint: null };

  const min = Math.min(...connues);
  const max = Math.max(...connues);
  const n = valeurs.length;
  const hauteurUtile = hauteur - MARGE_VERTICALE * 2;

  const y = (v: number) => (max === min
    ? hauteur / 2
    : MARGE_VERTICALE + hauteurUtile - ((v - min) / (max - min)) * hauteurUtile);
  const x = (i: number) => (n === 1 ? 0 : (i / (n - 1)) * largeur);

  const segments: PointSparkline[][] = [];
  let courant: PointSparkline[] = [];
  valeurs.forEach((v, i) => {
    if (v == null) {
      if (courant.length > 0) {
        segments.push(courant);
        courant = [];
      }
      return;
    }
    courant.push({ x: x(i), y: y(v) });
  });
  if (courant.length > 0) segments.push(courant);

  const dernierSegment = segments[segments.length - 1];
  const dernierPoint = dernierSegment && dernierSegment.length > 0
    ? dernierSegment[dernierSegment.length - 1]
    : null;

  return { segments, dernierPoint };
}
