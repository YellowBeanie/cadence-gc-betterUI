# Installation de Cadence

## Note à l'agent d'installation

Tu es un agent CLI IA (Claude Code, Gemini CLI, ou équivalent) en train
d'installer Cadence pour le compte d'un humain, sur sa propre machine.

- **Procède étape par étape**, dans l'ordre. Chaque étape a un
  **« Point de contrôle »** : vérifie-le avant de passer à la suite. Si un
  point de contrôle échoue, diagnostique et corrige avant de continuer —
  n'avance jamais « en espérant que ça passera plus tard ».
- Les étapes marquées **🧑 exigent l'humain** : identifiants, résolution de
  MFA/captcha, choix d'un secret ou d'une clé d'API. **Ne tente jamais de les
  automatiser ni de t'y substituer** — pas de simulation de frappe dans un
  formulaire Garmin, pas d'invention de mot de passe, pas de lecture d'un
  secret que l'humain ne t'a pas explicitement transmis. Demande-lui de faire
  ce pas lui-même, dans son propre terminal ou navigateur, puis attends sa
  confirmation avant de continuer.
- Ce document ne se substitue pas au code : en cas de doute sur le
  comportement réel d'un script, lis-le (`deploy/nas/`, `collector/`) plutôt
  que de deviner.

---

## Répertoire de travail

Les scripts hôte (`run.sh`, `snapshot.sh`, `analyse.sh`, `analyse-seance.sh`,
`traite-audio.sh`) travaillent dans **`$HOME/garmin-monitor`** de
l'utilisateur qui les lance (surchargeable par la variable d'environnement
`STACK_DIR`). N'importe quel compte non-root avec les droits Docker
convient — un compte dédié est recommandé mais son nom est libre.

**Point de contrôle** : `id -nG` liste `docker` (ou l'accès au démon est
prouvé par `docker ps`), et `echo $HOME` pointe vers le foyer prévu, avant
de passer à l'étape 1. Le stack vivra dans `$HOME/garmin-monitor`.

---

## 0. Prérequis

```bash
uname -m                                                          # attendu : x86_64
docker --version                                                  # Docker installé
docker compose version                                            # plugin Compose v2
nproc                                                              # cœurs CPU
awk '/MemTotal/ {printf "%.1f Go\n", $2/1024/1024}' /proc/meminfo  # RAM totale
```

**Point de contrôle** :
- `uname -m` = `x86_64` — aucune image de ce projet n'existe en arm64 (Chrome
  pour le collector, notamment).
- `docker --version` et `docker compose version` répondent sans erreur.
- Au moins **4 cœurs** et **8 Go de RAM** recommandés : le stack fait tourner
  deux conteneurs en permanence (`watcher` 2,5 CPU/3 Go, `app` 1,5 CPU/768 Mo)
  et ponctuellement un troisième (`sync`/`login` jusqu'à 3 Go, ou `whisper`
  jusqu'à 2 Go) — limites fixées dans `docker-compose.yml`.

---

## 1. Cloner le dépôt et construire l'arborescence cible

```bash
git clone <URL-DU-DEPOT> ~/cadence-src
cd ~/cadence-src

mkdir -p ~/garmin-monitor/build/patches ~/garmin-monitor/whisper \
         ~/garmin-monitor/app ~/garmin-monitor/data

cp collector/Dockerfile collector/entrypoint.sh collector/import_plan.py \
   collector/telecharger_photos.py collector/extraire_contexte.py \
   collector/extraire_contexte_seance.py ~/garmin-monitor/build/
cp collector/patches/*.patch ~/garmin-monitor/build/patches/

cp deploy/nas/docker-compose.yml deploy/nas/run.sh deploy/nas/snapshot.sh \
   deploy/nas/doctor.sh deploy/nas/llm-adapter.sh \
   deploy/nas/analyse.sh deploy/nas/prompt-analyse.md \
   deploy/nas/analyse-seance.sh deploy/nas/prompt-analyse-seance.md \
   deploy/nas/traite-audio.sh deploy/nas/prompt-saisie-boxe.md \
   ~/garmin-monitor/

cp deploy/nas/whisper/Dockerfile deploy/nas/whisper/transcrire.py \
   ~/garmin-monitor/whisper/

cp -r app/. ~/garmin-monitor/app/
rm -rf ~/garmin-monitor/app/node_modules ~/garmin-monitor/app/.next

chmod +x ~/garmin-monitor/run.sh ~/garmin-monitor/snapshot.sh \
  ~/garmin-monitor/doctor.sh ~/garmin-monitor/llm-adapter.sh \
  ~/garmin-monitor/analyse.sh ~/garmin-monitor/analyse-seance.sh \
  ~/garmin-monitor/traite-audio.sh ~/garmin-monitor/build/entrypoint.sh
```

Cette suite de commandes reproduit exactement les cibles `nas-push` et
`app-push` du `Makefile` — utile si tu préfères piloter l'installation depuis
un poste de dev séparé (`make nas-push NAS=<UTILISATEUR>@<ta-machine>`) plutôt
que de cloner directement sur la machine cible.

**Point de contrôle** :
```bash
test -f ~/garmin-monitor/docker-compose.yml \
  && test -x ~/garmin-monitor/run.sh \
  && test -x ~/garmin-monitor/doctor.sh \
  && test -d ~/garmin-monitor/app/lib \
  && echo OK
```

---

## 2. Identifiants (`.env`) et configuration optionnelle (`config.env`)

```bash
cd ~/garmin-monitor
install -m 600 /dev/null .env
```

**🧑 Cette étape est pour l'humain.** Ouvre `.env` toi-même (pas l'agent) et
renseigne, à partir du modèle `~/cadence-src/deploy/nas/env.example` :

```
GARMIN_EMAIL=...
GARMIN_PASSWORD=...
```

L'agent ne doit jamais taper ces identifiants à ta place, même si tu les lui
dictes dans la conversation.

`config.env` (optionnel, mêmes protections que `.env`) surcharge des
variables lues par les scripts hôte — `SECRETS_FILE`, `ANALYSE_MODEL`,
`ANALYSE_SEANCE_MAX`, `TRAITE_AUDIO_MAX`, `GARMIN_SYNC_TIMEOUT`, et toutes les
variables `LLM_*` de l'étape 6 :

```bash
install -m 600 /dev/null config.env
```

**Point de contrôle** :
```bash
stat -c '%a' .env          # attendu : 600
grep -q CHANGE_ME .env && echo "ÉCHEC : identifiants non renseignés" || echo OK
```
(Ne jamais `cat .env` dans une sortie qui pourrait être loguée.)

---

## 3. Construire les images

```bash
cd ~/garmin-monitor
docker compose build
```

**Point de contrôle** :
```bash
docker image inspect garmin-collector:local garmin-app:local garmin-whisper:local \
  --format '{{.RepoTags}}'
```
Les trois images existent, sans erreur.

---

## 4. Premier login Garmin — 🧑 MFA / captcha

Le profil Chrome **doit être créé sur la machine cible**, pas copié depuis un
poste tiers : le user-agent changerait et invaliderait le cookie de session.

**🧑 Terminal 1** (sur la machine cible) :
```bash
cd ~/garmin-monitor && docker compose run --rm --service-ports login
```

**🧑 Terminal 2** (depuis ton propre poste, tunnel SSH vers la loopback de la
machine cible — le port VNC n'écoute nulle part ailleurs) :
```bash
ssh -L 5900:localhost:5900 <UTILISATEUR>@<TON-SERVEUR>
```

Puis connecte un client VNC (TightVNC, RealVNC, Remmina…) sur
`localhost:5900`, sans mot de passe. Dans la fenêtre Chrome : résous le
captcha s'il apparaît, puis saisis le code MFA. L'outil récupère ensuite
`GARMIN_LOGIN_DAYS` jours d'historique (7 par défaut).

**L'agent ne doit à aucun moment tenter de piloter cette fenêtre Chrome** —
ni cliquer, ni saisir de code, ni deviner un captcha.

**Point de contrôle** (une fois la session terminée) :
```bash
test -d ~/garmin-monitor/data/browser_profile && echo OK
```

---

## 5. Premier sync manuel

```bash
cd ~/garmin-monitor
./run.sh
```

Attendu : `Already logged in (session restored)` ou l'équivalent, suivi d'un
récapitulatif des tables importées. Les avertissements « analyse non
produite » sont normaux à ce stade — le fournisseur LLM n'est configuré qu'à
l'étape 6, et l'échec de l'analyste ne dégrade jamais le code de sortie du
sync.

**Point de contrôle** :
```bash
test -f ~/garmin-monitor/data/last_success \
  && date -d "@$(cat ~/garmin-monitor/data/last_success)" -Iseconds
test -f ~/garmin-monitor/data/garmin.db
test -f ~/garmin-monitor/data/export/garmin-ro.db
```
Le premier horodatage doit correspondre à « il y a quelques instants ».

---

## 6. Choisir un fournisseur LLM

Les analystes (`analyse.sh`, `analyse-seance.sh`, `traite-audio.sh`) passent
tous par `llm-adapter.sh`, qui route vers le fournisseur choisi dans
`config.env` via `LLM_PROVIDER`. Sans configuration, le défaut `claude-cli`
s'applique.

**🧑 Choisis un fournisseur et procure-toi sa clé/son accès toi-même** — c'est
un choix qui engage l'envoi de tes données d'entraînement vers ce
fournisseur (voir les avertissements du `README.md`).

Ajoute le bloc correspondant à `config.env` :

**`claude-cli`** (défaut, CLI en abonnement) :
```
LLM_PROVIDER=claude-cli
LLM_CLI_BIN=$HOME/.local/bin/claude
LLM_MODEL=sonnet
SECRETS_FILE=$HOME/mes-secrets.env
```
`SECRETS_FILE` (défaut `$HOME/cadence-secrets.env` si non défini — une
convention historique de ce projet, à remplacer par ton propre chemin) doit
contenir une ligne `CLAUDE_CODE_OAUTH_TOKEN=...`, dans un fichier
`chmod 600`, hors du dépôt.

**`gemini-cli`** :
```
LLM_PROVIDER=gemini-cli
LLM_CLI_BIN=gemini
LLM_MODEL=gemini-2.5-flash
```

**`openai-api`** (ou toute API compatible : Mistral, Groq, DeepSeek…) :
```
LLM_PROVIDER=openai-api
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=...
LLM_MODEL=gpt-4o-mini
```

**`ollama`** (instance locale, aucune clé) :
```
LLM_PROVIDER=ollama
LLM_BASE_URL=http://127.0.0.1:11434
LLM_MODEL=llama3.1
```

Teste d'abord la plomberie, sans appel réseau ni consommation de quota :
```bash
cd ~/garmin-monitor
printf 'un prompt de test' | LLM_PROVIDER=echo ./llm-adapter.sh
```
**Point de contrôle** : sortie `{"resume":"test","observations":[],"prudence":null}`,
code de sortie 0.

Puis un appel réel, avec ta configuration :
```bash
set -a; . ./config.env; set +a
printf 'Réponds uniquement par le mot OK.' | ./llm-adapter.sh
```
**Point de contrôle** : code de sortie 0, sortie non vide.

---

## 7. Tâches planifiées (cron)

**Convention du projet : toute commande destinée au cron se joue d'abord à la
main.**

```bash
cd ~/garmin-monitor
./run.sh                    # déjà validé à l'étape 5
./analyse.sh drapeau        # attendu : silencieux, code 0 (aucun drapeau posé)
./traite-audio.sh auto      # attendu : silencieux, code 0 (entrants/ vide)
```

Puis installe les quatre lignes suivantes (sauvegarde d'abord le crontab
existant) :

```bash
crontab -l > ~/crontab.backup.$(date +%Y%m%d-%H%M%S) 2>/dev/null

(crontab -l 2>/dev/null; cat <<'CRON'
15 5 * * * $HOME/garmin-monitor/run.sh >> $HOME/garmin-monitor/garmin.log 2>&1
30 21 * * * $HOME/garmin-monitor/run.sh >> $HOME/garmin-monitor/garmin.log 2>&1
* * * * * $HOME/garmin-monitor/analyse.sh drapeau >> $HOME/garmin-monitor/analyse.log 2>&1
*/5 * * * * $HOME/garmin-monitor/traite-audio.sh auto >> $HOME/garmin-monitor/garmin-audio.log 2>&1
CRON
) | crontab -
```

Deux passages de `run.sh` par jour (05h15 et 21h30) couvrent un sync matinal
et un sync après une séance du soir — ajuste les horaires à ton rythme.
`analyse.sh drapeau` (chaque minute) sert le bouton « Analyser » de l'app ;
`traite-audio.sh auto` (toutes les 5 minutes) traite les saisies vocales
déposées depuis `/saisie`.

**Point de contrôle** :
```bash
crontab -l | grep -c '/garmin-monitor/\(run\|analyse\|traite-audio\)\.sh'
```
Doit répondre `4`.

---

## 8. Exposition sécurisée

Le fichier `docker-compose.yml` livré lie le port de l'app à une adresse LAN
d'exemple — **adapte `ports:` du service `app` à l'IP de ta propre machine**
avant `docker compose up -d app`, ou laisse-la en écoute LAN uniquement (pas
sur `0.0.0.0`).

**Ce sont des données de santé. Ne mets jamais ce port directement sur
Internet.** Devant toute exposition au-delà de ton réseau local :

- un tunnel avec authentification en amont — Cloudflare Tunnel + **Cloudflare
  Access** (recommandé, gratuit pour un usage personnel), un reverse proxy
  avec Basic Auth/OAuth, ou un VPN/mesh privé (Tailscale, WireGuard) ;
- **jamais** un simple port-forward de ta box vers le port de l'app, même
  « juste pour tester ».

L'app elle-même n'a **aucun accès au socket Docker** : une synchronisation
demandée depuis l'interface dépose un fichier-drapeau, consommé par le
service `watcher` — aucune dépendance supplémentaire à sécuriser côté app.

```bash
cd ~/garmin-monitor
docker compose up -d watcher app
```

**Point de contrôle** : l'app répond en local (voir doctor.sh, étape 9) —
**et n'est PAS joignable depuis l'extérieur de ton réseau tant que
l'authentification en amont n'est pas en place.**

---

## 9. Vérification finale

```bash
cd ~/garmin-monitor
./doctor.sh
```

Chaque ligne rapporte `OK` ou `ÉCHEC` en français ; le code de sortie du
script est le nombre d'échecs.

**Point de contrôle** : code de sortie `0`. Un `ÉCHEC` sur l'image whisper ou
sur `garmin-ro.db < 26 h` peut être normal juste après l'installation
(whisper pas encore exercé, premier sync très récent mais pas encore
republié une seconde fois) — relis le message associé avant de le considérer
bloquant.

Installation terminée. Le `README.md` reste la référence pour la philosophie
du projet et ses avertissements — à relire avant d'inviter qui que ce soit
d'autre à utiliser cette instance.
