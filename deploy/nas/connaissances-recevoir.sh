#!/usr/bin/env bash
# Réception de la base de connaissances poussée depuis l'atelier PC (tâche
# 11, spec 4). Emplacement cible : ~/garmin-monitor/connaissances-recevoir.sh
#
# Invoqué par `connaissances.atelier --pousser` via
# `ssh utilisateur@le serveur garmin-monitor/connaissances-recevoir.sh`, juste
# après que ce même appel a déposé data/connaissances.db.new par scp — pas
# un usage manuel normal, mais rejouable sans risque (idempotent : sans
# .new, refus propre plutôt qu'une erreur cryptique).
#
# Remplacement ATOMIQUE (`mv -f`, même volume donc pas de copie
# intermédiaire ni de fenêtre où connaissances.sh ou un futur lecteur app
# tomberaient sur un fichier à moitié transféré) — même principe que
# l'instantané garmin-ro.db et que analyse.json.
set -euo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
# Surchargable par l'environnement ; le défaut $HOME/garmin-monitor vaut
# $HOME/garmin-monitor pour l'instance de référence.
STACK_DIR="${STACK_DIR:-$HOME/garmin-monitor}"

if [ -f "$STACK_DIR/config.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$STACK_DIR/config.env"
  set +a
fi

cd "$STACK_DIR" || exit 1

DATA_DIR="$STACK_DIR/data"
LOCK_FILE="$DATA_DIR/.connaissances.lock"
NOUVELLE="$DATA_DIR/connaissances.db.new"
CIBLE="$DATA_DIR/connaissances.db"

echo "=== [$(date -Iseconds)] connaissances-recevoir ==="

# MÊME verrou que connaissances.sh : jamais de réception pendant une passe
# de collecte en cours, ni l'inverse.
exec 8>"$LOCK_FILE"
if ! flock -n 8; then
  echo "[$(date -Iseconds)] Collecte ou réception déjà en cours, abandon."
  exit 75
fi

if [ ! -f "$NOUVELLE" ]; then
  echo "ERREUR : rien à recevoir ($NOUVELLE absent) — pousser une base depuis l'atelier PC d'abord." >&2
  exit 1
fi

mv -f "$NOUVELLE" "$CIBLE"

echo "[$(date -Iseconds)] Base reçue -> $CIBLE"
echo "=== [$(date -Iseconds)] connaissances-recevoir terminée ==="
