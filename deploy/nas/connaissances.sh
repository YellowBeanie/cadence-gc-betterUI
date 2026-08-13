#!/usr/bin/env bash
# Base de connaissances — passe de collecte hebdomadaire côté NAS (tâche 11,
# spec 4). Emplacement cible : ~/garmin-monitor/connaissances.sh
#
# Contrepartie LÉGÈRE de l'atelier PC (connaissances/atelier.py) : le venv du
# NAS n'installe QUE trafilatura (connaissances/requirements-nas.txt) — les
# PDF et vidéos rencontrés ici vont en `file_ingestion`, jamais parsés sur le
# NAS (docling/yt-dlp restent réservés à l'atelier PC). Le paquet
# `connaissances/` est copié TEL QUEL depuis le dépôt (scp -r) à côté de ce
# script, dans $STACK_DIR : ce script s'y place (`cd`) avant l'appel pour
# que `python -m connaissances.boucle` le trouve comme paquet importable.
#
# Mode :
#   hebdo   (seul mode pour l'instant) : une passe plafonnée
#            (CONNAISSANCES_PLAFOND sources acceptées, CONNAISSANCES_BUDGET
#            appels LLM) sur data/connaissances.db. Appelée par le cron
#            dominical (voir README.md, section « Base de connaissances »).
#
# Verrou `data/.connaissances.lock` — PARTAGÉ avec connaissances-recevoir.sh
# (même fichier, même intention : jamais de collecte pendant qu'une base
# venant de l'atelier PC est en train d'être reçue, ni l'inverse). NON
# bloquant : une collision (cron + réception manuelle) abandonne proprement
# plutôt que d'attendre, même logique que les autres scripts hôte.
set -euo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
# Surchargable par l'environnement ; le défaut $HOME/garmin-monitor vaut
# $HOME/garmin-monitor pour l'instance de référence.
STACK_DIR="${STACK_DIR:-$HOME/garmin-monitor}"

# Surcharge optionnelle, jamais commitée (cf. .gitignore) : permet de
# personnaliser SECRETS_FILE, CONNAISSANCES_PLAFOND, CONNAISSANCES_BUDGET,
# CONNAISSANCES_MODEL, LLM_PROVIDER/LLM_MODEL/LLM_CLI_BIN/LLM_BASE_URL/
# LLM_API_KEY/LLM_TIMEOUT (tâche 34, voir env.example) sans toucher à ce
# script. STACK_DIR lui-même ne peut pas être surchargé ici : il faut déjà
# le connaître pour trouver ce fichier — c'est une variable d'environnement
# ou la valeur par défaut ci-dessus.
if [ -f "$STACK_DIR/config.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$STACK_DIR/config.env"
  set +a
fi

cd "$STACK_DIR" || exit 1

MODE="${1:-hebdo}"
DATA_DIR="$STACK_DIR/data"
LOCK_FILE="$DATA_DIR/.connaissances.lock"
VENV_PYTHON="$STACK_DIR/venv-connaissances/bin/python"

if [ "$MODE" != "hebdo" ]; then
  echo "ERREUR : mode inconnu '$MODE' (attendu : hebdo)" >&2
  exit 1
fi

mkdir -p "$DATA_DIR"

echo "=== [$(date -Iseconds)] connaissances ($MODE) ==="

# Verrou NON bloquant, partagé avec connaissances-recevoir.sh.
exec 8>"$LOCK_FILE"
if ! flock -n 8; then
  echo "[$(date -Iseconds)] Collecte ou réception déjà en cours, abandon."
  exit 75
fi

if [ ! -x "$VENV_PYTHON" ]; then
  echo "ERREUR : venv-connaissances introuvable ($VENV_PYTHON) — voir README.md," \
       "section « Base de connaissances » (installation du venv)." >&2
  exit 1
fi

# Fournisseur LLM (tâche 34) : claude-cli par défaut, comportement historique
# inchangé sans configuration. Voir env.example pour les autres fournisseurs.
LLM_PROVIDER="${LLM_PROVIDER:-claude-cli}"
SECRETS_FILE="${SECRETS_FILE:-$HOME/cadence-secrets.env}"

# Parité avec analyse.sh/analyse-seance.sh/traite-audio.sh (correction,
# revue tâche 11) : llm-adapter.sh attend le jeton DÉJÀ présent dans
# l'environnement hérité de l'appelant, il ne le source jamais lui-même.
# Une session SSH interactive peut porter le jeton par un autre chemin —
# c'est précisément ce qui avait fait passer un premier run manuel malgré
# l'absence de ce bloc — mais l'environnement du cron (0 6 * * 0) ne source
# ni .bashrc ni .profile : sans ce bloc, le run dominical aurait échoué
# CHAQUE semaine. Uniquement nécessaire pour claude-cli (défaut) : les
# autres fournisseurs (LLM_API_KEY, ollama sans clé…) n'en ont pas besoin —
# le binaire lui-même reste vérifié par llm-adapter.sh, pas ici.
if [ "$LLM_PROVIDER" = "claude-cli" ]; then
  if [ ! -f "$SECRETS_FILE" ]; then
    echo "ERREUR : fichier de secrets introuvable" >&2
    exit 1
  fi
  # Sourcé, jamais copié : le jeton ne vit que dans ce fichier hors dépôt.
  # On ne loggue jamais l'environnement (pas de `env`/`set` dans ce script).
  # shellcheck disable=SC1090
  set -a; . "$SECRETS_FILE"; set +a

  if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
    echo "ERREUR : auth absente (jeton non défini dans les secrets)" >&2
    exit 1
  fi
fi

# CRUCIAL : le défaut de connaissances/llm.py (fonction _bin_defaut) résout
# un chemin RELATIF AU DÉPÔT (deploy/nas/llm-adapter.sh, deux niveaux
# au-dessus du paquet Python) — ce chemin n'existe PAS sur le NAS, où seul
# llm-adapter.sh À LA RACINE DU STACK est déployé (même emplacement que pour
# les trois analystes existants). Sans cet export, tout appel LLM de la
# boucle échouerait avec LlmIndisponible dès le premier fichage.
export LLM_ADAPTER_BIN="$STACK_DIR/llm-adapter.sh"

PLAFOND="${CONNAISSANCES_PLAFOND:-5}"
BUDGET="${CONNAISSANCES_BUDGET:-15}"

echo "[$(date -Iseconds)] Lancement (plafond=$PLAFOND, budget=$BUDGET)…"

"$VENV_PYTHON" -m connaissances.boucle --mode hebdo --plafond "$PLAFOND" --budget "$BUDGET" \
  --db data/connaissances.db

echo "=== [$(date -Iseconds)] connaissances terminée ==="
