// Rampe des zones de FC Z1→Z5 (tâche 21) — extraite de l'ancien lib/couloir.ts
// (supprimé avec le pivot visuel Cadence, plus de couloir ni de dégradé) :
// seule la couleur par zone reste utile, pour les barres de zones de FC de
// l'écran de détail de séance et de la liste de séances — c'est de la
// donnée réelle (temps mesuré par zone), pas un habillage. Hex verbatim de
// la direction visuelle d'origine, inchangés par le pivot Cadence.

export const ZONES = [
  { cle: 'z1', label: 'Z1', couleur: '#5AA9E6' },
  { cle: 'z2', label: 'Z2', couleur: '#4ED4A0' },
  { cle: 'z3', label: 'Z3', couleur: '#F2C94C' },
  { cle: 'z4', label: 'Z4', couleur: '#F2994A' },
  { cle: 'z5', label: 'Z5', couleur: '#EB5757' },
] as const;
