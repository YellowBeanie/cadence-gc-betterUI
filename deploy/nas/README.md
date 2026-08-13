# Déploiement du collector sur le NAS `<HOTE-NAS>`

Le collector tourne sur **`<HOTE-NAS>` (<IP-DU-SERVEUR>)** et non sur le cluster k3s :
Chrome n'existe pas en arm64, or les 6 nœuds du cluster sont des Raspberry Pi.
Détail dans [`../k3s/README.md`](../k3s/README.md).

Le NAS est sur le même LAN que le cluster, donc **même IP publique** — le cookie
`cf_clearance`, lié à l'IP, reste valide. Toujours pas de VPN pendant les syncs.

## Layout sur le NAS

```
/home/<UTILISATEUR>/garmin-monitor/
├── docker-compose.yml       services `sync` (cron), `login` (manuel, VNC),
│                            `watcher` et `app`
├── .env                     GARMIN_EMAIL / GARMIN_PASSWORD — chmod 600, hors git
├── run.sh                   wrapper appelé par le cron
├── llm-adapter.sh           adaptateur multi-fournisseurs LLM (tâche 34)
├── analyse.sh               analyste Claude quotidien (tâche 16)
├── prompt-analyse.md        contrat de l'analyste quotidien
├── corpus-principes.md      corpus de principes versionné (suggestions N2, tâche 50)
├── analyse-seance.sh        analyste Claude par séance (tâche 24)
├── prompt-analyse-seance.md contrat de l'analyste par séance
├── traite-audio.sh          transcription + structuration saisie vocale (tâche 28)
├── prompt-saisie-boxe.md    contrat de l'analyste de saisie vocale
├── build/                   Dockerfile + entrypoint.sh + patches/
├── whisper/                 Dockerfile + transcrire.py (transcription locale)
├── data/                    garmin.db, browser_profile/, fit/   (uid 1000)
│   ├── audio-saisies/
│   │   ├── entrants/               audios déposés par /saisie, à traiter
│   │   └── traites/                audios déjà traités (purge > 30 j)
│   └── export/
│       ├── garmin-ro.db           instantané lecture seule
│       ├── analyse.json           analyse quotidienne
│       ├── analyses-seances/      une analyse par activité ({id}.json)
│       ├── brouillons-saisie/     propositions de saisie vocale à valider
│       │                          ({nom-audio}.json), un par audio traité
│       └── photos-activites/      photos best-effort par activité (tâche 27) :
│                                  {activity_id}/{n}.jpg, [] si aucune
└── last_success              epoch du dernier sync réussi
```

`data/` vit sous `/home/<UTILISATEUR>`, donc il est **inclus d'office dans le
restic off-site quotidien** (`~/backup-offsite-restic.sh`, 04h00 → Google Drive).
C'est aussi pour ça que les conteneurs tournent en `user: "1000:1000"` : les
fichiers root-owned sont exclus de restic (cf. le contournement `appdata/homeassistant`).

## Installation

### 1. Copier les fichiers

Depuis le repo, sur le PC :

```bash
ssh <UTILISATEUR>@<HOTE-NAS> "mkdir -p ~/garmin-monitor/build/patches ~/garmin-monitor/data"
```

```bash
scp collector/Dockerfile collector/entrypoint.sh collector/import_plan.py \
  collector/telecharger_photos.py <UTILISATEUR>@<HOTE-NAS>:~/garmin-monitor/build/
```

```bash
scp collector/patches/*.patch <UTILISATEUR>@<HOTE-NAS>:~/garmin-monitor/build/patches/
```

```bash
scp deploy/nas/docker-compose.yml deploy/nas/run.sh <UTILISATEUR>@<HOTE-NAS>:~/garmin-monitor/
```

### 2. Créer le fichier d'identifiants

Sur le NAS, à partir de `deploy/nas/env.example` :

```bash
ssh <UTILISATEUR>@<HOTE-NAS> "install -m 600 /dev/null ~/garmin-monitor/.env && nano ~/garmin-monitor/.env"
```

### 3. Construire l'image

```bash
ssh <UTILISATEUR>@<HOTE-NAS> "cd ~/garmin-monitor && docker compose build"
```

### 4. Première session — login Garmin (MFA + captcha)

Le profil Chrome **doit être créé sur le NAS**, pas copié depuis le PC : le
user-agent passe de Windows à Linux, ce qui invaliderait `cf_clearance`.

Terminal 1 — démarrer la session sur le NAS :

```bash
ssh <UTILISATEUR>@<HOTE-NAS> "cd ~/garmin-monitor && docker compose run --rm --service-ports login"
```

Terminal 2 — tunnel SSH vers le VNC (le port n'écoute que sur la loopback du NAS) :

```bash
ssh -L 5900:localhost:5900 <UTILISATEUR>@<HOTE-NAS>
```

Puis connecter un client VNC (TightVNC, RealVNC, Remmina…) sur `localhost:5900`,
sans mot de passe. Dans la fenêtre Chrome : résoudre le captcha s'il apparaît,
puis saisir le code MFA. L'outil enchaîne sur 7 jours d'historique.

### 5. Vérifier

```bash
ssh <UTILISATEUR>@<HOTE-NAS> "cd ~/garmin-monitor && docker compose run --rm sync"
```

Attendu : `Already logged in (session restored)` puis le récapitulatif des tables.

### 6. Planifier le cron

**Déjà en place depuis le 2026-08-06** (crontab d'`<UTILISATEUR>`) :

```
15 5 * * * /home/<UTILISATEUR>/garmin-monitor/run.sh >> /home/<UTILISATEUR>/garmin-monitor/garmin.log 2>&1
```

05h15, après la synchro nocturne montre → Garmin Connect. On utilise **cron et
non un timer systemd** : pas de sudo passwordless sur `<HOTE-NAS>` (leçon du
déploiement healthcheck). Une sauvegarde du crontab précédent a été déposée
dans `~/crontab.backup.<horodatage>`.

Le wrapper a été validé en environnement cron dépouillé
(`env -i HOME=… SHELL=/bin/sh PATH=/usr/bin:/bin ./run.sh`) — c'est le test qui
attrape les erreurs de PATH, invisibles depuis un shell interactif.

> **Note sur le premier login** : Garmin n'a demandé ni captcha ni MFA depuis le
> NAS, la session VNC n'a donc pas servi. Elle reste nécessaire le jour où la
> session expirera avec un challenge.

## Visualisation

Une instance Grafana dédiée a tourné ici du 2026-08-06 au 2026-08-06, puis a été
**retirée** : l'app (`app/`, spec 1) reprend la visualisation, et maintenir deux
Grafana pour un seul homelab était une source de confusion permanente.

Les requêtes SQL qui alimentaient ses douze panneaux ont été validées contre le
schéma réel et sont conservées dans [`docs/requetes-garmin.md`](../../docs/requetes-garmin.md).
Le dashboard complet reste récupérable dans l'historique git.

### L'instantané lecture seule — toujours en place

`garmin.db` est en mode **WAL** : impossible à ouvrir depuis un montage `:ro`,
SQLite devant pouvoir créer ses fichiers `-wal`/`-shm`. Plutôt que de donner un
accès en écriture à un lecteur, `run.sh` publie après chaque sync réussi un
instantané en mode rollback :

```
data/garmin.db            base de production (WAL, écrite par le collector)
data/export/garmin-ro.db  instantané VACUUM INTO, lu en :ro par l'app
```

Le remplacement est atomique (`os.replace`), un lecteur ne peut donc jamais
tomber sur un fichier à moitié écrit. En cas d'échec du sync, le dernier
instantané valide est conservé.

## Exploitation

| Besoin | Commande |
|---|---|
| État de la base | `docker compose run --rm sync status` |
| Sync manuel (+ instantané) | `./run.sh` |
| Sync seul | `docker compose run --rm sync` |
| Republier l'instantané | `docker compose run --rm sync snapshot` |
| Logs du cron | `tail -f ~/garmin-monitor/garmin.log` |
| Figer l'état avant un changement | `./snapshot.sh <label>` |
| Refaire la session Garmin | `rm -rf data/browser_profile` puis étape 4 |

**Monitoring** : Telegraf (`~/monitoring`, port 9338) remonte automatiquement les
métriques de tout conteneur — mais `docker compose run --rm` est éphémère, donc
un sync de quelques minutes n'apparaîtra que s'il est scrapé pendant qu'il tourne.
Pour une vraie surveillance, le fichier `last_success` est le signal utile.

Piste (non faite) pour alerter sur un sync périmé : activer le collecteur
textfile de node_exporter — il monte déjà `/:/host:ro`, il suffirait d'ajouter
`--collector.textfile.directory=/host/home/<UTILISATEUR>/metrics` à sa `command`
dans `~/monitoring/docker-compose.monitoring.yml`, d'écrire une métrique
`garmin_last_success_timestamp_seconds` depuis `run.sh`, puis une règle vmalert
`time() - garmin_last_success... > 26h` dans `alerting/vmalert.yaml`.
⚠️ Ne pas toucher à vmagent sans differ d'abord le ConfigMap live contre le repo
(incident de config drift du 2026-06-16).

## Choisir son analyste IA (tâche 34)

Les trois analystes (`analyse.sh`, `analyse-seance.sh`, `traite-audio.sh`)
n'appellent plus un CLI en dur : ils passent tous par un adaptateur unique,
`llm-adapter.sh` — contrat simple (le prompt complet sur stdin, la réponse
texte brute du modèle sur stdout, code de sortie non nul si l'appel échoue),
qui route vers le fournisseur choisi par `LLM_PROVIDER` (dans `config.env`,
jamais commité) :

- `claude-cli` (**défaut, comportement historique inchangé**) : CLI Claude en
  abonnement, jeton `CLAUDE_CODE_OAUTH_TOKEN` sourcé depuis `SECRETS_FILE`.
- `gemini-cli` : CLI Gemini en mode non-interactif.
- `openai-api` : toute API compatible OpenAI (OpenAI, Mistral, Groq,
  DeepSeek…) via `LLM_BASE_URL` + `LLM_API_KEY`.
- `ollama` : instance locale, aucune clé.

Toutes les variables (`LLM_PROVIDER`, `LLM_MODEL`, `LLM_CLI_BIN`,
`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_TIMEOUT`) sont documentées avec un
exemple par fournisseur dans `env.example`. Sans configuration, rien ne
change : c'est `claude-cli` qui tourne, à l'identique de l'appel historique.
La clé API (`openai-api`) ne transite jamais par un argument `-H` de `curl`
(visible dans `ps`) : elle passe par un fichier de config temporaire, chmod
600, supprimé après l'appel.

Test : `tests/collector/test_llm_adapter.sh` (même procédure que
`test_analyse.sh` ci-dessous) — vérifie la plomberie stdin → stdout via le
fournisseur de test caché `LLM_PROVIDER=echo` (aucun appel réseau/CLI,
aucune consommation de quota) et le rejet propre d'un fournisseur inconnu.

## Analyste Claude (tâche 16)

Après chaque sync réussi (05h15, 21h30) et à la demande, un script **hôte**
(pas de conteneur dédié) produit une courte synthèse des données récentes,
lue par l'app :

```
run.sh (sync OK) ──────────────┐
                               ├──> analyse.sh ──> claude -p (hôte, jeton d'abonnement)
cron * * * * * (drapeau) ──────┘         │
                                         ├─ lit  data/export/garmin-ro.db (RO)
                                         ├─ lit  data/training.db (RO)
                                         └─ écrit data/export/analyse.json (atomique)
```

- `analyse.sh auto` : appelé par `run.sh` juste après la publication de
  l'instantané. Échec non bloquant — ne dégrade jamais le code de sortie du
  sync, l'ancienne `analyse.json` reste affichée avec son âge.
- `analyse.sh drapeau` : appelé chaque minute par le cron
  (`* * * * * … analyse.sh drapeau`). Sortie 0 silencieuse si
  `data/.analyse-requested` est absent ; sinon consomme le drapeau et
  analyse. C'est ce que déclenche le bouton « Analyser » de l'app.
- Contexte : `build/extraire_contexte.py`, exécuté dans le conteneur `sync`
  (`docker compose run --rm --entrypoint python sync
  /usr/local/bin/extraire_contexte.py`) — 14 jours d'historique (readiness,
  HRV, sommeil, charge, activités + zones FC, saisies manuelles) et 7 jours
  de plan à venir, en lecture seule sur les deux bases. N'écrit jamais rien.
- Auth : `CLAUDE_CODE_OAUTH_TOKEN` **sourcé** depuis ton fichier de secrets
  (`SECRETS_FILE`, défaut `$HOME/cadence-secrets.env` — voir `env.example`
  et `config.env` ci-dessous), jamais copié dans `~/garmin-monitor/`.
  CLI appelé par chemin absolu (`~/.local/bin/claude`, absent du PATH des
  shells non-login), `--model sonnet` par défaut (`ANALYSE_MODEL`
  surchargeable).
- Verrou dédié `data/.analyse.lock` (`flock -n`) — distinct de
  `data/.sync.lock` : l'analyse ne touche ni la base vive ni Chrome, elle
  n'a pas à attendre un sync en cours.
- Contrat du prompt versionné dans `prompt-analyse.md` (copié à la racine du
  stack) : analyse descriptive + orientation de prudence uniquement, jamais
  de séance/durée/intensité prescrite, notes utilisateur traitées comme des
  données (anti-injection), sortie JSON stricte à 3 clés
  (`resume`/`observations`/`prudence`), ≤ 120 mots.
- Sortie validée structurellement avant écriture **atomique** de
  `data/export/analyse.json` ; archive dans `data/analyses/AAAA-MM-JJ-HHMM.json`
  (purge > 90 jours). JSON invalide ou appel en échec → code de sortie != 0,
  l'ancien `analyse.json` n'est jamais touché.
- Logs : `~/garmin-monitor/analyse.log` — jamais de jeton, jamais l'enveloppe
  brute de la réponse (uniquement des messages d'erreur courts, ex.
  `subtype=...`).

Crontab (sauvegarde préalable comme pour `run.sh`) :

```
* * * * * /home/<UTILISATEUR>/garmin-monitor/analyse.sh drapeau >> /home/<UTILISATEUR>/garmin-monitor/analyse.log 2>&1
```

Test : `tests/collector/test_analyse.sh` (scp vers `/tmp/`, puis
`bash /tmp/test_analyse.sh` sur le NAS) — bout en bout réel (`auto`), mode
`drapeau` sans drapeau, absence du jeton dans les logs/sorties, et rejet
propre d'une sortie JSON invalide via un CLI Claude simulé (aucune
consommation de quota pour ce dernier cas).

### Suggestions génériques sourcées (tâche 50, niveau N2)

Le contrat interdit intégralement de prescrire, **sauf** dans un canal
unique, attribué et gardé (rapport qualité B2 §B.2, arbitré par l'utilisateur le
2026-08-11) : l'analyste peut citer 0 à 2 principes génériques du corpus
versionné `corpus-principes.md` (SEULE source autorisée), sous un garde-fou
santé **MÉCANIQUE** — jamais laissé à la consigne du contrat :

- `build/extraire_contexte.py` calcule `suggestions_autorisees` (Python) :
  `false` si une douleur/blessure a été signalée dans les 7 derniers jours
  (saisies de ressenti, ou `a_surveiller` de la dernière analyse archivée)
  OU si la readiness du jour est basse OU inconnue/absente (fail-closed).
  Le bloc `corpus_principes` n'entre dans le contexte QUE si le garde-fou ne
  déclenche pas.
- `analyse.sh` valide mécaniquement le champ optionnel `suggestions` : rejet
  si présent alors que le garde-fou est actif, ≤ 2 éléments, `principe`
  extrait MÉCANIQUEMENT des ids réels de `corpus-principes.md`, `texte`
  ≤ 35 mots, mêmes filets anti-fuite et anti-lexème-d'action que `question`.
- Côté app : bloc distinct sous l'analyse quotidienne (`/historique`),
  toujours accompagné de la mention permanente rappelant qu'il ne s'agit ni
  d'un avis médical ni d'un plan personnalisé. Absent si le champ l'est.
- Chaîne séance (`analyse-seance.sh`) : **inchangée**, ce canal est
  quotidien uniquement.

## Analyste Claude par séance (tâche 24)

Après chaque sync réussi, en plus de l'analyse quotidienne : une analyse
**par séance**, comparative à l'historique du même sport, affichée dans le
panneau « Analyse — Claude » de `/seance/[id]`. Script hôte séparé (ne
partage ni le verrou, ni le contexte, ni le contrat de prompt de l'analyse
quotidienne — un souci ici ne doit jamais mettre en danger l'autre) :

```
run.sh (sync OK) ──> analyse-seance.sh auto ──> claude -p (hôte, jeton d'abonnement)
                              │
                              ├─ liste les 10 dernières activités de garmin-ro.db
                              ├─ pour chaque id sans analyses-seances/{id}.json :
                              │    extraction (conteneur sync) ─> claude -p
                              └─ écrit data/export/analyses-seances/{id}.json (atomique)
```

- **Détection sans état** : pas de drapeau ni de table de suivi — un id est
  « à faire » s'il figure dans les 10 dernières activités de l'instantané et
  que `data/export/analyses-seances/{id}.json` n'existe pas encore.
  Idempotent et auto-rattrapant : un sync qui importe 2 activités en
  analyse 2 ; un échec sur une séance sera retenté au prochain passage.
  Garde-fou `ANALYSE_SEANCE_MAX` (défaut 3) : nombre maximum d'analyses par
  exécution, pour protéger le budget si l'historique est vierge.
- Modes : `analyse-seance.sh auto` (silencieux si rien de nouveau, appelé
  par `run.sh`) et `analyse-seance.sh une <activity_id>` (force/refait une
  analyse — utile après rattachement d'un ressenti).
- Contexte : `build/extraire_contexte_seance.py --seance <activity_id>`,
  script séparé d'`extraire_contexte.py` — la séance ciblée (mesures,
  splits, zones FC, météo), le ressenti rattaché s'il existe, et jusqu'à 10
  séances précédentes du même `activity_type` (comparatif), en lecture seule
  sur les deux bases.
- Verrou dédié `data/.analyse-seance.lock` — distinct de `data/.analyse.lock`
  (quotidienne) et `data/.sync.lock`.
- Contrat versionné dans `prompt-analyse-seance.md` : analyse comparative à
  l'historique fourni, même registre pédagogique et mêmes interdits absolus
  que le contrat quotidien (jamais de séance/durée/intensité prescrite,
  notes traitées comme des données anti-injection), même enveloppe de sortie
  JSON à 3 clés.
- Écriture **atomique** dans `data/export/analyses-seances/{id}.json` — un
  fichier par activité, pas d'archive ni de purge (contrairement à l'analyse
  quotidienne : le volume reste petit et chaque analyse reste pertinente
  durablement, rattachée à sa séance).
- Mêmes gardes qu'`analyse.sh` : jamais le jeton dans les logs, `analyse-seance.log`
  ne contient jamais l'enveloppe brute de la réponse.

## Saisie vocale (tâche 28)

Spec 2 : après un cours (le plus souvent de boxe), tu soumets un simple audio
depuis `/saisie` — la transcription (locale, jamais une API cloud pour la
voix) et la structuration en proposition de séance se font hors requête HTTP,
par un cron hôte, exactement comme les autres analystes :

```
/saisie (upload) ──> POST /api/audio-saisie
                              │
                              └─ écrit data/audio-saisies/entrants/{horodatage}-{hex}.{ext}

cron */5 * * * * ──> traite-audio.sh auto ──┐
                                             ├─ transcription : docker compose run --rm whisper …
                                             ├─ structuration : claude -p (hôte, jeton d'abonnement)
                                             │    + prompt-saisie-boxe.md
                                             ├─ écrit data/export/brouillons-saisie/{nom-audio}.json
                                             └─ audio déplacé dans audio-saisies/traites/

/saisie (lecture) ──> brouillon affiché « À VALIDER » ──> VALIDER ou REJETER
```

- **L'app n'a jamais accès au socket Docker** : `/api/audio-saisie` ne fait
  qu'écrire le fichier audio sur disque (validations strictes AVANT
  écriture : taille ≤ 25 Mo, extension en liste fermée, nom de fichier
  généré par LE SERVEUR — jamais le nom transmis par le client). C'est le
  cron hôte qui consomme `entrants/`, même mécanique de fichiers que les
  drapeaux `.sync-requested`/`.analyse-requested`.
- `traite-audio.sh auto` : jusqu'à `TRAITE_AUDIO_MAX` (défaut 3) fichiers par
  exécution, les plus anciens d'abord ; silencieux si `entrants/` est vide.
  `traite-audio.sh un <fichier>` force le traitement d'un fichier précis
  (retry manuel). Verrou dédié `data/.traite-audio.lock` — distinct de
  `data/.sync.lock` et des deux verrous d'analyse.
- Un échec sur UN fichier (transcription, appel Claude, JSON invalide) laisse
  l'audio dans `entrants/` pour retenter au prochain passage — jamais
  supprimé, jamais déplacé avant l'écriture réussie du brouillon. Un échec
  n'arrête pas les autres fichiers du même passage.
- Transcription : conteneur `whisper` (`deploy/nas/whisper/`, faster-whisper,
  modèle `small` téléchargé AU BUILD — aucun accès réseau au run), CPU,
  `compute_type=int8`, langue forcée `fr`. Conteneur à la demande
  (`docker compose run --rm whisper <chemin>`), jamais un service permanent.
- Structuration : `claude -p --model haiku` + `prompt-saisie-boxe.md` — le
  transcript est traité comme une DONNÉE de bout en bout, jamais interpolé
  dans une commande shell (fichier temporaire, comme le contexte JSON
  d'`analyse-seance.sh`), jamais une instruction à exécuter même s'il
  contient des phrases qui y ressemblent (anti-injection, cf. le contrat).
  Sortie JSON stricte validée avant écriture atomique de
  `data/export/brouillons-saisie/{nom-audio}.json`, enveloppe
  `{genere_le, transcript, proposition}`.
- Purge : audios de `audio-saisies/traites/` de plus de 30 jours, à chaque
  passage — pas de purge côté `brouillons-saisie/` (un brouillon disparaît
  quand l'utilisateur le valide ou le rejette depuis `/saisie`, jamais par le
  temps qui passe).
- Côté app : `/saisie` affiche chaque brouillon en carte « À VALIDER »
  (transcript replié, formulaire prérempli éditable, segments
  ajoutables/retirables, sélecteur de rattachement Garmin existant) — VALIDER
  écrit la séance manuelle + ses segments (table `seance_segments`, migration
  additive) et supprime le brouillon ; REJETER supprime le brouillon sans
  rien écrire. Un bandeau discret sur le dashboard signale les brouillons en
  attente. Les segments rattachés à une activité Garmin s'affichent aussi sur
  `/seance/[id]` et sont inclus dans le contexte des deux analystes
  (`collector/extraire_contexte.py`, `collector/extraire_contexte_seance.py`).
- Logs : `~/garmin-monitor/traite-audio.log` — jamais le jeton, jamais
  l'enveloppe brute de la réponse ni le transcript intégral (messages
  d'erreur courts uniquement).
- **Non vérifié en conditions réelles** : ce dépôt de code n'a ni le
  conteneur `whisper` construit, ni de vraie transcription testée. Le
  contrôleur doit construire l'image (`docker compose build whisper`),
  déposer un audio de test dans `data/audio-saisies/entrants/`, jouer
  `./traite-audio.sh auto` à la main, vérifier le brouillon produit puis le
  cycle VALIDER/REJETER depuis `/saisie`, avant d'installer le cron.

Crontab (sauvegarde préalable comme pour `run.sh`/`analyse.sh`) :

```
*/5 * * * * /home/<UTILISATEUR>/garmin-monitor/traite-audio.sh auto >> /home/<UTILISATEUR>/garmin-monitor/garmin-audio.log 2>&1
```

## Photos d'activité (tâche 27, best-effort)

Après chaque sync réussi, dans la chaîne `sync` elle-même (pas un service
séparé) : `build/telecharger_photos.py` tente, pour chaque activité de
`garmin.db`, de lister puis télécharger ses photos via la session Garmin déjà
authentifiée (même `GarminClient` qu'`import_plan.py`). L'endpoint de listage
des images n'est **pas documenté** côté Garmin — c'est une exploration, les
hypothèses d'endpoint testées sont documentées dans l'en-tête du script et
dans `docs/superpowers/sdd/2026-08-06-app-entrainement/task-27-report.md`.

- Best-effort total : une erreur (404, session, réseau, schéma de réponse
  inattendu) ne produit qu'un WARN sur stderr, jamais un code de sortie non
  nul — le sync ne doit jamais échouer à cause des photos.
- Écrit dans `data/export/photos-activites/{activity_id}/{n}.jpg`, écriture
  atomique (fichier temporaire puis rename), idempotent (skip si déjà
  présent) — la très grande majorité des activités n'auront jamais de photo,
  ce qui est l'état normal.
- Lu côté app par `lirePhotosSeance` (lib/photos.ts) et servi via la route
  `/api/photos/[id]/[fichier]` (validation stricte anti-traversal).
- **Non vérifié en conditions réelles** : ce dépôt de code n'a pas
  d'accès à une vraie session Garmin. Le contrôleur doit lancer le script sur
  le NAS (`docker compose run --rm --entrypoint python sync
  /usr/local/bin/telecharger_photos.py`) et ajuster les hypothèses d'endpoint
  si la réponse réelle diffère.

## Base de connaissances (spec 4, tâche 11)

Une base indépendante (`connaissances.db`, hors `garmin.db`/`training.db`) de
fiches sourcées (études, guides officiels, vulgarisation) sur la course à
pied, la boxe et la récupération — alimentée par une boucle de collecte
plafonnée (spec 4 §6 : découverte → téléchargement → crédibilité → fichage
sous contrat LLM → indexation FTS5), **jamais par un simple crawl libre**.
Deux rôles distincts, jamais confondus :

```
PC (atelier)                              NAS (léger)
─────────────                             ───────────
requirements-atelier.txt                  requirements-nas.txt
(trafilatura + docling + yt-dlp)          (trafilatura SEUL)
        │                                         │
python -m connaissances.atelier --vague   cron dominical (6h) :
  (manuel, gros plafonds, PDF/vidéo         connaissances.sh hebdo
   parsés directement — spec §9)             (petits plafonds, PDF/vidéo
        │                                     -> file_ingestion pour
        ▼                                     l'atelier, jamais parsés ici)
data-atelier/connaissances.db                     │
        │                                         ▼
        │ --pousser (scp + ssh)             data/connaissances.db
        └───────────────────────────────────────► (mv -f atomique via
        │ --tirer (scp)                            connaissances-recevoir.sh)
        └◄──────────────────────────────────────────┘
```

- **PC = seul endroit avec les dépendances lourdes** (`docling` pour le PDF,
  `yt-dlp` pour YouTube — `connaissances/requirements-atelier.txt`) : c'est
  là que se jouent les vagues manuelles à gros plafond (spec §9 : pilote
  4/20, grosse vague 40-60 sources après feu vert explicite — **jamais
  automatisé**, aucun cron côté PC). `python -m connaissances.atelier
  --vague --plafond N --budget M --db data-atelier/connaissances.db` — refuse
  de tourner si la base locale est absente (« tirer d'abord »), pour ne
  jamais repartir d'une base vide par oubli de synchro.
- **NAS = passe hebdomadaire légère**, seule chaîne automatisée : venv dédié
  minimal (`venv-connaissances`, trafilatura seul — jamais docling/yt-dlp,
  contrainte NAS léger du plan). Un PDF ou une vidéo rencontrés ici sont mis
  en `file_ingestion` (table de la base) plutôt que parsés, à traiter plus
  tard depuis l'atelier PC.
- **Synchronisation** : `atelier.py --tirer` (scp la base du NAS vers
  `data-atelier/`, écrase la copie locale) et `--pousser` (scp la base
  locale vers `data/connaissances.db.new` sur le NAS, puis exécute
  `connaissances-recevoir.sh` par SSH pour le remplacement atomique
  `mv -f`). Authentification par clé SSH comme le reste du parc — aucun
  secret ne transite jamais en argument de ces commandes.
- **Discipline tirer/pousser (I5, revue finale) : `--tirer` et `--pousser`
  encadrent la MÊME session atelier.** Entre les deux, la base NAS peut
  bouger — l'app (`/connaissances`, tâche 12) permet à l'utilisateur de valider des
  fiches `en_attente` pendant que la vague tourne en local — et un `--pousser`
  aveugle écraserait ces validations. `--tirer` enregistre donc l'empreinte
  de la base NAS du moment (taille+mtime via `ssh stat`) dans
  `data-atelier/.etat-tirer` ; `--pousser` la recompare à l'état ACTUEL du
  NAS et **refuse** si elles diffèrent (« la base NAS a changé depuis ton
  --tirer : re-tire d'abord »), y compris si la vérification elle-même
  échoue (fail-closed). `--forcer` outrepasse — à réserver au cas où le
  changement côté NAS est déjà connu et volontairement écrasé. Une session
  qui ne commence pas par `--tirer` (pas de `.etat-tirer` local) n'est pas
  bloquée : la protection ne s'applique qu'à un cycle tirer→…→pousser
  effectivement entamé.
- Verrou `data/.connaissances.lock` **partagé** entre `connaissances.sh` et
  `connaissances-recevoir.sh` (`flock -n`, non bloquant) : jamais de passe
  de collecte pendant la réception d'une base poussée depuis le PC, ni
  l'inverse.

### Installation du venv NAS

Sur une machine avec `python3-venv`/`ensurepip` déjà installés (le cas
courant), la commande simple suffit :

```bash
python3 -m venv ~/garmin-monitor/venv-connaissances
~/garmin-monitor/venv-connaissances/bin/pip install \
  -r ~/garmin-monitor/connaissances/requirements-nas.txt
```

**Sur le serveur, cette commande échoue** (`ensurepip is not available` —
constaté à la tâche 11, OS minimal sans le paquet `python3.X-venv`
correspondant à la version de Python du système, ici Ubuntu 26.04 /
Python 3.14) et le remède documenté par Debian/Ubuntu est `apt install
python3.X-venv`, qui exige `sudo` — **hors de question sur le serveur, qui n'a
pas de sudo passwordless** (cf. § « Cron et non timer systemd » plus haut).

Procédure ROOTLESS de repli, réellement utilisée pour la tâche 11 et
probablement utile sur d'autres installations minimales (sert aussi de doc
pour la version open source du projet). Elle **n'exécute jamais aucun
script téléchargé** : les wheels viennent de pip lui-même (déjà la chaîne
de confiance du projet) et l'amorçage de pip dans le venv se fait par simple
décompression d'une archive zip (le format d'un wheel) via le module
standard `zipfile`, jamais un script tiers lancé en root ni même en
utilisateur.

```bash
# 1. Squelette du venv SANS pip — ne nécessite pas ensurepip, réussit
#    même sur un Python system fraîchement installé sans python3-venv.
ssh utilisateur@le serveur "python3 -m venv --without-pip ~/garmin-monitor/venv-connaissances"

# 2. Sur une machine AVEC pip (le PC de l'atelier, PAS le NAS) : télécharger
#    les wheels sans les installer, ciblant explicitement la plateforme et
#    la version de Python du NAS (glibc manylinux x86_64, cp314) — sinon
#    pip télécharge pour la machine locale, pas pour la cible.
python -m pip download pip --no-deps -d wheels/
python -m pip download -r connaissances/requirements-nas.txt -d wheels/ \
  --platform manylinux_2_17_x86_64 --python-version 314 --only-binary=:all:

# 3. Transfert (scp), aucun secret dans ces fichiers.
scp -r wheels utilisateur@le serveur:/tmp/wheels

# 4. Sur le NAS : amorcer pip en décompressant SON PROPRE wheel directement
#    dans le site-packages du venv (un wheel est un simple zip — aucune
#    exécution de code, juste une extraction de fichiers).
ssh utilisateur@le serveur '
  cd /tmp/wheels
  python3 -m zipfile -e pip-*.whl ~/garmin-monitor/venv-connaissances/lib/python3.14/site-packages/
  # 5. pip est maintenant importable (python -m pip) : installer le reste
  #    HORS LIGNE, uniquement depuis les wheels déjà transférés.
  ~/garmin-monitor/venv-connaissances/bin/python -m pip install \
    --no-index --find-links=/tmp/wheels \
    -r ~/garmin-monitor/connaissances/requirements-nas.txt
  rm -rf /tmp/wheels
'

# 6. Vérification.
ssh utilisateur@le serveur '~/garmin-monitor/venv-connaissances/bin/python -c \
  "import trafilatura; print(trafilatura.__version__)"'
```

Note : cette méthode ne crée pas de script `bin/pip` dans le venv (pip n'a
été que décompressé, pas « installé » via son propre installeur) — sans
conséquence en usage normal, `connaissances.sh` invoque toujours
`venv-connaissances/bin/python` directement (`python -m connaissances.boucle`),
jamais `pip` au runtime. Pour relancer `pip` plus tard (mise à jour d'une
dépendance), utiliser `venv-connaissances/bin/python -m pip …` plutôt que
`venv-connaissances/bin/pip …`.

Si l'étape 5 échoue sur `lxml` (dépendance de `trafilatura` sans roue
précompilée `--only-binary` disponible pour cette plateforme/version de
Python) : le serveur n'a pas de compilateur (`gcc`/`cc` absents, vérifié à la
tâche 11) et ça ne doit **jamais** être « réparé » en installant
`build-essential` sans consigne explicite — même règle que
`python3.X-venv` : aucune installation de paquet système sans qu'l'utilisateur
l'exécute lui-même ou l'autorise explicitement.

Le paquet `connaissances/` lui-même est copié tel quel depuis le dépôt
(`scp -r connaissances utilisateur@le serveur:garmin-monitor/`), à côté de
`connaissances.sh` — ce script se place dans `$STACK_DIR` avant d'appeler
`python -m connaissances.boucle`, pour que le paquet soit importable.

**Important** : `connaissances.sh` exporte `LLM_ADAPTER_BIN="$STACK_DIR/llm-adapter.sh"`
avant l'appel Python. Le défaut de `connaissances/llm.py` résout un chemin
relatif au DÉPÔT (`deploy/nas/llm-adapter.sh`, deux niveaux au-dessus du
paquet) qui n'existe pas sur le NAS — sans cet export, tout appel LLM de la
boucle échouerait dès le premier fichage. `claude-cli` reste le fournisseur
par défaut de `llm-adapter.sh` (tâche 34) : mêmes secrets, même
`SECRETS_FILE` (défaut `$HOME/cadence-secrets.env`), que les trois
analystes existants — **`connaissances.sh` source lui-même `SECRETS_FILE`
et vérifie `CLAUDE_CODE_OAUTH_TOKEN` avant d'appeler la boucle** (même bloc
que `analyse.sh`), exactement pour la même raison : `llm-adapter.sh`
attend le jeton déjà présent dans l'environnement hérité de l'appelant, et
l'environnement du cron ne source ni `.bashrc` ni `.profile` — sans ce
bloc, seul un test manuel dans une session où le jeton traîne déjà par
ailleurs pourrait sembler fonctionner, et le run dominical échouerait
chaque semaine (bug réel trouvé par la revue de la tâche 11, corrigé avant
la mise en cron).

### Réglages (`config.env`, jamais commité)

- `CONNAISSANCES_PLAFOND` (défaut 5) : sources acceptées avant arrêt de la
  passe hebdomadaire.
- `CONNAISSANCES_BUDGET` (défaut 15) : appels LLM avant arrêt.
- `CONNAISSANCES_MODEL` (défaut `sonnet`) : modèle passé à `llm-adapter.sh`
  pour le fichage (`connaissances/llm.py`, seul point d'appel du
  sous-système). `LLM_MODEL` fait foi s'il est défini, sinon
  `CONNAISSANCES_MODEL`, sinon ce défaut — même cascade que
  `ANALYSE_MODEL`/`TRAITE_AUDIO_MODEL`. Contrairement aux trois analystes
  (qui fixent `LLM_MODEL` en bash avant d'appeler `llm-adapter.sh`),
  `connaissances.sh` ne le fait PAS lui-même : le défaut vit dans
  `connaissances/llm.py` (partagé avec l'atelier PC, seul endroit où cette
  logique existe une fois plutôt que dupliquée dans chaque script
  appelant). **Constaté en conditions réelles à la tâche 11** : sans ce
  défaut, `llm-adapter.sh` refuse tout appel (`ERREUR : LLM_MODEL absent`,
  il n'a lui-même aucun défaut par conception) — le premier run manuel de
  `connaissances.sh hebdo` a échoué exactement comme ça avant correction.
- `CONNAISSANCES_CONTACT` (optionnel, ex. `oliver.greub@gmail.com`) : email
  ajouté au User-Agent de tout le sous-système (`cadence-connaissances/1
  (mailto:<valeur>)`, `credibilite._user_agent()` — partagé par
  `credibilite._requeter`, `decouverte.chercher_openalex`/`chercher_epmc` et
  `boucle._telecharger`) — M6, revue finale. OpenAlex/Crossref réservent
  leur « polite pool » (moins de throttling) aux appelants identifiés ; sans
  cette variable, une vague de 240+ requêtes risque le 429, et le
  fail-closed du sous-système transformerait ces erreurs en simple `None`
  (sources légitimes dégradées en attente, silencieusement). Sans la
  variable : comportement historique inchangé (`cadence-connaissances/1
  (contact via repo)`).

Crontab (sauvegarde préalable comme pour les autres scripts hôte) :

```
0 6 * * 0 $HOME/garmin-monitor/connaissances.sh hebdo >> $HOME/garmin-monitor/connaissances.log 2>&1
```

Dimanche 6h — hors des fenêtres de sync (05h15/21h30) et d'analyse, aucune
compétition de charge.

Tests : `python -m unittest tests.connaissances.test_atelier -v` (parsing
d'arguments + garde-fou « tirer d'abord », aucun réseau réel — scp/ssh et la
boucle de collecte sont injectés) et `python -m unittest discover -s
tests/connaissances` (suite complète du sous-système). Le run réel de
`connaissances.sh hebdo` sur le NAS (dose minimale, plafonds abaissés via
`CONNAISSANCES_PLAFOND=1 CONNAISSANCES_BUDGET=4`) est documenté dans
`.superpowers/sdd/2026-08-12-base-connaissances/task-11-report.md`.

### File de validation

Les sources au statut `en_attente` (crédibilité insuffisante pour une
admission automatique) attendent une validation humaine — interface prévue
côté app (`/connaissances`, spec 4 tâche 12, hors périmètre de ce document).

## Exposition

Aujourd'hui, aucune. Le collector n'écoute rien en dehors du VNC temporaire de
la session de login, lui-même limité à la loopback du NAS + tunnel SSH.

⚠️ Cela changera avec l'app (spec 1) : elle sera exposée via le tunnel
Cloudflare, **derrière Cloudflare Access**, pour permettre la saisie depuis le
téléphone hors du réseau maison. C'est un choix assumé qui élargit la surface
d'exposition au-delà du LAN — à peser selon ton propre modèle de menace avant
de reproduire ce déploiement. Le collector, lui, reste sans exposition — et
l'app n'aura jamais accès au socket Docker.

## Versionnement

Le repo `k3s-homelab` (Gitea, branche `actual-state`) héberge déjà de la config
NAS hors ArgoCD — `monitoring/nas/docker-compose.monitoring.yml`, `healthcheck/`.
Si ce collector doit y entrer, suivre la même logique : committer
`docker-compose.yml`, `run.sh` et `build/`, jamais `.env` ni `data/`.
Rappel : `git push` passe par le LAN ou l'URL interne, Cloudflare Access bloque
le push sur l'URL publique de Gitea.
