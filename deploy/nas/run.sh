#!/usr/bin/env bash
# Wrapper du sync Garmin quotidien — appelé par le cron de l'utilisateur du stack.
# Emplacement cible : ~/garmin-monitor/run.sh
#
# PATH explicite (le cron a un PATH
# minimal), logs horodatés, code de sortie propagé.
set -uo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
# Surchargable par l'environnement ; le défaut $HOME/garmin-monitor vaut
# $HOME/garmin-monitor pour l'instance de référence.
STACK_DIR="${STACK_DIR:-$HOME/garmin-monitor}"

# Surcharge optionnelle, jamais commitée (cf. .gitignore) : permet de
# personnaliser SECRETS_FILE, ANALYSE_MODEL, ANALYSE_SEANCE_MAX,
# TRAITE_AUDIO_MAX, GARMIN_SYNC_TIMEOUT sans toucher aux scripts. STACK_DIR
# lui-même ne peut pas être surchargé ici : il faut déjà le connaître pour
# trouver ce fichier — c'est une variable d'environnement ou la valeur par
# défaut ci-dessus.
if [ -f "$STACK_DIR/config.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$STACK_DIR/config.env"
  set +a
fi

cd "$STACK_DIR" || exit 1

echo "=== [$(date -Iseconds)] sync Garmin ==="

rc=0
# -e sans valeur transmet GARMIN_SYNC_TIMEOUT depuis l'environnement de ce
# script (surchargeable via config.env) ; absent, entrypoint.sh garde son
# défaut de 900s.
docker compose run --rm -e GARMIN_SYNC_TIMEOUT sync || rc=$?

if [ "$rc" -eq 75 ]; then
  echo "=== [$(date -Iseconds)] sync déjà en cours, rien à faire ==="
  exit 0
fi

# Instantané lecture seule pour Grafana, uniquement si le sync a réussi :
# en cas d'échec on préfère garder le dernier instantané valide.
if [ "$rc" -eq 0 ]; then
  docker compose run --rm sync snapshot || echo "AVERTISSEMENT : instantané non publié"

  # Analyste Claude (tâche 16) : jamais bloquant — un échec (jeton expiré,
  # quota, JSON invalide) laisse l'ancienne analyse affichée dans l'app,
  # avec son âge, sans dégrader le code de sortie du sync.
  ./analyse.sh auto || echo "AVERTISSEMENT : analyse non produite"

  # Analyste Claude PAR SÉANCE (tâche 24) : même principe non bloquant — un
  # échec ici ne doit jamais faire échouer le sync ni l'analyse quotidienne.
  ./analyse-seance.sh auto || echo "AVERTISSEMENT : analyse de séance non produite"
fi

echo "=== [$(date -Iseconds)] fin (code $rc) ==="

# last_success est désormais écrit par le conteneur lui-même, dans data/,
# uniquement en cas de succès du sync (cf. do_sync() dans entrypoint.sh).
exit $rc
