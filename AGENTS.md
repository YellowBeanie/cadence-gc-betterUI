# AGENTS.md — Garmin Monitor

Conventions du projet pour tout agent (humain ou IA) qui travaille sur ce
dépôt. Sert de socle commun ; le sous-dossier `app/` a ses propres règles
d'agent, voir tout en bas.

## Langue

Tout est en français : commentaires de code, documentation, messages de
commit, textes affichés dans l'interface. Les noms de variables/fonctions
métier suivent la même convention (ex. `lireSeanceDetail`, `ouvrirGarmin`).

## Règle d'or : jamais de zéro fabriqué

Une donnée absente ne s'affiche jamais comme un zéro, une moyenne à 0 % ou
toute autre valeur par défaut qui se lirait comme une vraie mesure. Elle
disparaît de l'écran à la place : section masquée, trou dans un tracé,
`null` propagé jusqu'à l'affichage plutôt qu'une valeur inventée pour
« boucher le trou ». Un manque visible vaut toujours mieux qu'une fausse
certitude — un zéro fabriqué fausse la lecture des tendances (endurance,
récupération, charge d'entraînement) sans que rien ne signale l'anomalie.

Voir les commentaires « jamais de zéro fabriqué » dans `app/lib/`,
`app/components/` et les tests associés pour des cas concrets traités
(division par zéro évitée, segments de courbe coupés plutôt qu'interpolés,
distinction entre « 0 minute mesurée » et « pas de mesure du tout »).

## TDD sur `lib/` et `db/`

Toute logique dans `app/lib/` (agrégations, formatage, fusion de séances
Garmin/manuelles) et tout accès base dans `app/lib/db/` se développe tests
d'abord. `cd app && npx vitest run` doit rester vert avant et après chaque
changement. La logique pure n'a pas d'excuse à ne pas être testée, même
quand le composant React qui l'utilise se vérifie surtout à l'œil (voir plus
bas).

## Base de données : `node:sqlite` isolé dans `connection.ts`

Seul `app/lib/db/connection.ts` ouvre une connexion `node:sqlite`
(`new DatabaseSync(...)`) — le reste du code peut importer le *type*
`DatabaseSync` pour typer un paramètre, mais n'ouvre jamais lui-même de
connexion. Deux fonctions, jamais davantage :

- `ouvrirGarmin()` — instantané `export/garmin-ro.db`, **lecture seule**.
  Jamais `garmin.db` directement : c'est la base vive du collector, en mode
  WAL, non ouvrable depuis un montage en lecture seule.
- `ouvrirTraining()` — `training.db`, propriété exclusive de l'app
  (lecture/écriture : saisies manuelles, ressentis, brouillons).

Passer par ces deux fonctions partout ailleurs. Ouvrir une connexion SQLite
ailleurs casse l'isolation lecture seule sur les données Garmin et complique
les tests, qui substituent `GARMIN_DATA_DIR` pour pointer vers des bases de
test.

## Design system Modernist

L'interface suit le design system **Modernist** : fond clair, encre foncée,
accent rouge, Archivo, filets 2px, aucun coin arrondi, grille modulaire
visible, tout fer à gauche. Référence complète (jetons CSS, maquettes,
règles de mise en page) : [`docs/design-cadence/`](docs/design-cadence/README.md).
Un nouveau composant reprend ces jetons plutôt que d'improviser une variante
hors système.

## Piège de vérification visuelle

Pour vérifier qu'une passe de design ou un composant graphique rend
correctement, une capture d'écran headless (Chrome `--headless=new
--no-sandbox --screenshot=... --window-size=... <url>`) est plus fiable
qu'une lecture du DOM seule : un layout peut être structurellement correct et
visuellement cassé (rangée vide, tuile qui déborde).

⚠️ Piège vérifié en pratique sur ce projet : l'option `--virtual-time-budget`
de Chrome headless fige les animations Recharts en plein vol — courbes
réduites à des points, barres écrasées au quart — et peut faire croire à
tort à une régression de données plutôt qu'à une capture prise en plein
milieu d'une animation. Les graphiques de ce projet désactivent donc leurs
animations (`isAnimationActive={false}`) : capture reproductible, et
cohérent avec la direction visuelle du DS Modernist (un seul moment animé —
l'entrée des tuiles). Ne pas réactiver les animations Recharts sans repenser
la méthode de vérification par capture.

Règle Bento apprise sur ce projet : toujours arrondir un empan de rangée CSS
Grid (`minmax`, etc.) **vers le bas**. `minmax` fait grandir les rangées pour
absorber un manque (serré mais correct) ; arrondir vers le haut crée au
contraire du vide incompressible qui gonfle les tuiles voisines.

## Interdits de sécurité

- **Jamais logger d'identifiants, de cookies ou de jetons** — ni en clair,
  ni dans une trace de debug, ni dans un message d'erreur. Le collector
  comme les scripts d'analyse (`deploy/nas/*.sh`) suivent cette règle sans
  exception : en cas d'échec, un message d'erreur court suffit ; jamais
  l'environnement du process, jamais la réponse brute d'un appel externe.
- **L'app n'a jamais accès au socket Docker.** Une demande de
  synchronisation passe par un fichier-drapeau (`data/.sync-requested`)
  consommé par un service dédié — jamais par un appel direct à Docker depuis
  l'app. Ne pas introduire de dépendance qui donnerait à l'app un accès,
  direct ou indirect, au démon Docker de l'hôte.

## Next.js 16 (`app/`)

Le sous-dossier `app/` a ses propres règles d'agent, générées et maintenues
par `next dev` : voir [`app/AGENTS.md`](app/AGENTS.md). Cette version de
Next.js a des ruptures d'API par rapport aux habitudes générales — le lire
avant d'écrire du code dans `app/`.
