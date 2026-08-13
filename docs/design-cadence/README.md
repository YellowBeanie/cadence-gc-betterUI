# Design « Cadence » — référence importée

Source : projet Claude Design « Garmin Sport App Layer »
(`claude.ai/design/p/c8cf5302-7bd3-4571-bda9-3bada75575ed`), importé via
DesignSync. Copies de référence versionnées ici pour que les passes
d'implémentation ne dépendent pas d'un accès réseau au projet.

## v2 — « Modernist » (2026-08-09, version implémentée)

- `cadence-v2.dc.html` — la maquette v2 : mêmes 3 écrans (`Dashboard`,
  `Activity detail`, `AI insights`) sur le design system **Modernist** +
  données factices de démonstration dans le script `x-dc`. Les données
  réelles de l'app remplacent ces valeurs.
- `modernist.css` — l'unique feuille du DS Modernist : fond `#f3f2f2`,
  encre `#201e1d`, accent rouge `#ec3013` avec rampes tonales OKLCH 100-900,
  Archivo seul (400/600/800), rayon 0 partout, filets 2px
  (`--color-divider` = encre à 40 %), composants `.btn/.tag/.field/.input/
  .seg/.card/.nav/.table`.

Règles du readme Modernist à respecter : grille modulaire visible, tout fer
à gauche (y compris les libellés de boutons larges), filets 2px jamais
adoucis en hairline, aucun coin arrondi, accent parcimonieux sauf le
bandeau-affiche (footer rouge plein), texte courant sur teinte accent en
`--color-accent-700`, photos en `.grayscale`, focus clavier
`2px solid var(--color-accent)`.

## v1 — MANA (2026-08-09, remplacée par la v2)

- `cadence.dc.html` — la maquette v1 (papier blanc, encre, argile).
- `tokens.css` — jetons MANA (papier/encre, neutres chauds, accent argile,
  Archivo + Space Mono, échelle typographique, mouvement).
- `kit.css` — composants du kit MANA (header, work-list, link-arrow,
  footer, reveals…).

Fontes : le DS source charge Google Fonts par `@import` — dans l'app,
chargées par `next/font/google`, jamais par `@import`. La v2 n'utilise
qu'Archivo (400/600/800) ; Space Mono disparaît avec MANA.

## Composants ajoutés par l'app

Composants introduits après l'import du DS Cadence v2, absents de la
maquette source — mêmes jetons (`--color-*`, Archivo, rayon 0, filets 2px),
documentés ici plutôt que dans le DS importé.

- **`JaugeAnneau`** (`app/components/jauge-anneau.tsx`, tâche 39,
  personnalisation des visuels) : anneau d'objectif sobre — piste
  `--color-neutral-200`, arc encre (`--color-text`), ACCENT uniquement quand
  l'objectif est atteint (seule sortie du mono-accent de ce composant).
  Valeur en Archivo 800 au centre, objectif dessous en 11px uppercase
  (`/ 9 460`). Rayon 0, extrémités de tracé franches (jamais de bout
  arrondi), aucune animation — même choix que les graphiques Recharts
  (`isAnimationActive={false}`) et la règle « un seul moment animé : l'entrée
  des tuiles ». N'est monté QUE pour une mesure à objectif RÉEL fourni par
  Garmin (jamais un objectif inventé) : à ce jour, pas/objectif et
  intensité/objectif hebdo (`lib/visuels-mesures.ts`).
- **`CourbeMesure`** (`app/components/graphiques.tsx`, tâche 39) : section
  pleine largeur réutilisant le `Panneau`/les couleurs des quatre graphiques
  de tendance existants — rend une mesure de la bande PROMUE en courbe
  (variante `courbe-section`) sous la bande de mesures du dashboard, plutôt
  que dans les graphiques de l'écran analyses.
- **`RadarSeances`** (`app/components/radar-seances.tsx`, tâche 40,
  personnalisation) : RadarChart Recharts comparant la séance affichée à une
  autre séance du même sport (section « Comparer — toile d'araignée », page
  de détail de séance) — grille polaire `--color-neutral-300`, séance
  affichée en ACCENT (trait + remplissage ~12 %, seule sortie du mono-accent
  de ce composant), séance comparée en encre (`--color-text`, trait plein,
  remplissage `--color-neutral-200`). Axes construits par
  `lib/radar-seances.ts` (`construireRadar`) : chaque axe est normalisé sur
  le max des deux séances (honnêteté — jamais un axe fabriqué quand l'une des
  deux séances n'a pas la mesure, jamais un score composite inventé), les
  étiquettes d'axe et le tooltip affichent toujours les valeurs RÉELLES
  formatées, jamais le pourcentage normalisé seul — `PolarRadiusAxis` reste
  donc sans graduation visible (l'échelle radiale n'a de sens que par axe).
  Allure à échelle INVERSÉE (plus rapide = plus loin du centre), documentée
  et testée dans `lib/radar-seances.ts`. Aucune animation
  (`isAnimationActive={false}`), même règle que le reste des graphiques du DS.
