#!/usr/bin/env bash
# Fige l'état complet du stack Garmin avant une modification risquée.
# Emplacement cible : ~/garmin-monitor/snapshot.sh
#
#   ./snapshot.sh                 → étiquette « manuel »
#   ./snapshot.sh avant-app-web   → étiquette explicite
#
# Ce que ça capture :
#   - la configuration (compose, scripts, build/, provisioning Grafana)
#   - les données, dont browser_profile/ qui coûte un MFA à recréer
#   - l'image Docker, ré-étiquetée (pas de `docker save` : 1,7 Go inutiles)
#   - le crontab et l'état courant, dans un manifeste lisible
#
# Ce que ça NE capture PAS, volontairement :
#   - .env : dupliquer des identifiants multiplie les endroits où ils fuient.
#     Il est déjà protégé par le restic chiffré et ne change quasiment jamais.
set -euo pipefail

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

LABEL="${1:-manuel}"
TS="$(date +%Y%m%d-%H%M%S)"
DEST="$STACK_DIR/.snapshots/${TS}-${LABEL}"
KEEP=3   # nombre de snapshots de données conservés

cd "$STACK_DIR"
mkdir -p "$DEST"

echo "Snapshot → $DEST"

# 1. Configuration — petite, on compresse.
#    Liste construite dynamiquement : un chemin absent (ex. `app/` pas encore
#    déployé) ne doit pas faire échouer le snapshot sous `set -e`.
CONFIG_PATHS=()
for p in docker-compose.yml run.sh snapshot.sh build app; do
  [ -e "$p" ] && CONFIG_PATHS+=("$p")
done
tar czf "$DEST/config.tar.gz" "${CONFIG_PATHS[@]}"
echo "  config.tar.gz    $(du -h "$DEST/config.tar.gz" | cut -f1)"

# 2. Données — tar NON compressé : restic déduplique bien mieux un flux brut
#    qu'un flux gzip, dont chaque octet change à la moindre modification.
tar cf "$DEST/data.tar" data
echo "  data.tar         $(du -h "$DEST/data.tar" | cut -f1)"

# 3. Image Docker : une étiquette suffit à revenir en arrière, tant que
#    personne ne fait `docker image prune -a`.
IMG_ID="$(docker images garmin-collector:local --format '{{.ID}}' | head -1)"
if [ -n "$IMG_ID" ]; then
  docker tag garmin-collector:local "garmin-collector:${TS}-${LABEL}"
  echo "  image étiquetée  garmin-collector:${TS}-${LABEL} ($IMG_ID)"
fi

# 4. Manifeste — de quoi comprendre ce qu'on restaure, six mois plus tard.
{
  echo "# Snapshot $TS ($LABEL)"
  echo
  echo "## Image"
  echo "garmin-collector:local = ${IMG_ID:-absente}"
  echo "restaurable via : docker tag garmin-collector:${TS}-${LABEL} garmin-collector:local"
  echo
  echo "## Crontab au moment du snapshot"
  crontab -l 2>/dev/null | grep -F garmin || echo "(aucune ligne garmin)"
  echo
  echo "## Base"
  if [ -f data/garmin.db ]; then
    echo "garmin.db : $(du -h data/garmin.db | cut -f1)"
  fi
  if [ -f last_success ]; then
    echo "dernier sync réussi : $(date -d "@$(cat last_success)" -Iseconds)"
  fi
  echo
  echo "## Conteneurs"
  docker compose ps --format '{{.Service}} {{.Image}} {{.Status}}' 2>/dev/null || true
} > "$DEST/MANIFESTE.md"

# 5. Purge : on garde les `data.tar` des N derniers snapshots, mais on conserve
#    config + manifeste de tous (quelques Ko, et c'est l'historique utile).
mapfile -t OLD < <(ls -1d "$STACK_DIR"/.snapshots/*/ 2>/dev/null | sort -r | tail -n +$((KEEP + 1)))
for d in "${OLD[@]:-}"; do
  [ -n "$d" ] || continue
  if [ -f "$d/data.tar" ]; then
    rm -f "$d/data.tar"
    echo "  purge données     $(basename "$d")"
  fi
done

echo "Snapshot terminé."
