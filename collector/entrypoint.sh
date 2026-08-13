#!/usr/bin/env bash
# Collector Garmin — point d'entrée multi-modes.
#
#   sync    (défaut) : sync quotidien headless, la commande du cron NAS
#   login            : première session — Xvfb + VNC pour le MFA/captcha
#   status           : état de la base, sans login Garmin
#   <autre>          : exécuté tel quel (debug)
set -euo pipefail

MODE="${1:-sync}"
DATA_DIR="${GARMIN_DATA_DIR:-/work}"

# Identifiants injectés par ~/garmin-monitor/.env (env_file du compose).
# On vérifie leur présence sans jamais logger leur valeur.
require_credentials() {
  : "${GARMIN_EMAIL:?GARMIN_EMAIL manquant — vérifier ~/garmin-monitor/.env}"
  : "${GARMIN_PASSWORD:?GARMIN_PASSWORD manquant — vérifier ~/garmin-monitor/.env}"
}

LOCK_FILE="${DATA_DIR}/.sync.lock"

# Séquence complète d'un sync, sous verrou exclusif.
# Code 75 (EX_TEMPFAIL) si un autre sync tourne déjà.
do_sync() {
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "[$(date -Iseconds)] Sync déjà en cours, abandon."
    exec 9>&-
    return 75
  fi

  echo "[$(date -Iseconds)] Démarrage du sync Garmin (--latest)"
  local rc=0
  # `timeout` obligatoire : un Chrome qui reste bloqué (challenge Cloudflare
  # non résolu, page qui ne charge jamais) figerait le veilleur, qui resterait
  # « Up » sans plus jamais consommer de demande. Le conteneur ne crashant pas,
  # `restart: unless-stopped` ne le relèverait pas. 15 min pour un sync qui en
  # prend normalement 1.
  timeout "${GARMIN_SYNC_TIMEOUT:-900}" garmin-givemydata --latest || rc=$?

  if [ "$rc" -eq 0 ]; then
    # L'absence de plan n'est pas une erreur de sync.
    python /usr/local/bin/import_plan.py || echo "AVERTISSEMENT : import du plan échoué"
    # Tentative best-effort (tâche 27) : endpoint Garmin non documenté, ne
    # doit jamais dégrader le sync — même garde qu'import_plan.py ci-dessus.
    python /usr/local/bin/telecharger_photos.py || echo "AVERTISSEMENT : téléchargement des photos échoué"
    date +%s > "${DATA_DIR}/last_success"
  fi

  echo "[$(date -Iseconds)] Sync terminé (code $rc)"
  # Fermer le fd 9 libère le verrou aussitôt. Indispensable en mode `watch` :
  # do_sync y est rappelée à répétition dans le même processus (la boucle ne
  # sort jamais) — sans cette fermeture explicite, le verrou resterait tenu
  # indéfiniment entre deux demandes, et le cron ne pourrait plus jamais
  # syncer (`sync)` et `plan)`, eux, terminent avec le conteneur : le fd s'y
  # referme de toute façon, mais fermer explicitement ne change rien pour eux).
  exec 9>&-
  return $rc
}

case "$MODE" in
  sync)
    require_credentials
    if [ ! -d "${DATA_DIR}/browser_profile" ]; then
      echo "ERREUR : ${DATA_DIR}/browser_profile/ absent." >&2
      echo "  Lancer d'abord : docker compose run --rm --service-ports login" >&2
      exit 1
    fi
    rc=0
    do_sync || rc=$?
    [ "$rc" -eq 75 ] && exit 75
    garmin-givemydata --status || true
    exit $rc
    ;;

  login)
    require_credentials
    echo "[$(date -Iseconds)] Session de login interactive"

    export DISPLAY=:99
    Xvfb "$DISPLAY" -screen 0 1600x1000x24 -ac -nolisten tcp \
      +extension RANDR +extension GLX +extension RENDER +extension COMPOSITE &
    # Socket classique OU verrou : selon les permissions de /tmp/.X11-unix,
    # Xvfb peut se rabattre sur une socket abstraite et ne créer que le lock.
    for _ in $(seq 1 50); do
      { [ -e "/tmp/.X11-unix/X99" ] || [ -e "/tmp/.X99-lock" ]; } && break
      sleep 0.1
    done

    # Gestionnaire de fenêtres minimal : sans lui, les popups Garmin (MFA,
    # captcha) peuvent s'ouvrir sans décoration et devenir inutilisables.
    fluxbox >/dev/null 2>&1 &

    # x11vnc écoute sur toutes les interfaces DU CONTENEUR ; c'est le mapping
    # Docker (127.0.0.1:5900) qui restreint l'accès à la loopback du NAS.
    # On s'y connecte par tunnel SSH — jamais via le tunnel Cloudflare.
    x11vnc -display "$DISPLAY" -forever -shared -nopw -quiet -bg \
      -rfbport 5900 >/dev/null 2>&1

    cat <<'EOF'

  ─────────────────────────────────────────────────────────────────
  Session VNC prête. Depuis ton PC, ouvre un tunnel SSH :

      ssh -L 5900:localhost:5900 <UTILISATEUR>@<IP-DU-SERVEUR>

  puis connecte un client VNC sur  localhost:5900  (sans mot de passe,
  l'accès est déjà restreint à la loopback du NAS + au tunnel SSH).

  Dans la fenêtre Chrome : résoudre le captcha s'il apparaît, puis
  saisir le code MFA. Le profil sera écrit dans browser_profile/.
  ─────────────────────────────────────────────────────────────────

EOF

    rc=0
    garmin-givemydata --visible --days "${GARMIN_LOGIN_DAYS:-7}" || rc=$?
    echo "[$(date -Iseconds)] Login terminé (code $rc)"
    exit $rc
    ;;

  status)
    garmin-givemydata --status
    ;;

  plan)
    require_credentials
    # Même verrou que do_sync : ce mode ouvre un Chrome sur le même
    # browser_profile. Sans lui, un lancement manuel ou un test qui croise
    # la fenêtre du cron ferait tourner deux Chrome sur le même profil.
    exec 9>"$LOCK_FILE"
    if ! flock -n 9; then
      echo "[$(date -Iseconds)] Sync déjà en cours, import du plan reporté."
      exit 75
    fi
    python /usr/local/bin/import_plan.py
    ;;

  watch)
    require_credentials
    FLAG="${DATA_DIR}/.sync-requested"
    echo "[$(date -Iseconds)] Veilleur démarré (scrutation 10 s)"
    while true; do
      if [ -f "$FLAG" ]; then
        # Supprimé AVANT le sync : une demande arrivée pendant l'exécution
        # provoquera un nouveau passage, plutôt que d'être perdue.
        rm -f "$FLAG"
        echo "[$(date -Iseconds)] Demande de sync reçue"

        # Même garde-fou que le mode `sync` : sans profil, inutile de lancer
        # Chrome pour obtenir une trace Selenium illisible.
        if [ ! -d "${DATA_DIR}/browser_profile" ]; then
          echo "ERREUR : ${DATA_DIR}/browser_profile/ absent — demande ignorée." >&2
        else
          # do_sync enchaîne déjà sync + import du plan (Tâches 1 et 2) ;
          # il ne reste qu'à republier l'instantané que lira l'app.
          rc=0
          do_sync || rc=$?
          if [ "$rc" -eq 0 ]; then
            "$0" snapshot || echo "AVERTISSEMENT : instantané non publié"
            # Relais de l'analyste PAR SÉANCE (tâche 49) : ce conteneur n'a
            # pas la chaîne LLM (claude CLI/llm-adapter), donc pas d'appel
            # direct à analyse-seance.sh comme le fait run.sh côté cron hôte.
            # On dépose un drapeau à la place, consommé chaque minute par le
            # cron hôte `analyse-seance.sh drapeau` — même mécanique que
            # `.sync-requested` déposé par l'app pour déclencher CE sync.
            touch "${DATA_DIR}/.analyse-seance-requested"
          elif [ "$rc" -eq 75 ]; then
            # Le cron détient le verrou. La demande n'a PAS été servie : on
            # ré-arme le drapeau pour retenter au tour suivant, sans quoi
            # l'utilisateur croirait avoir déclenché un sync qui n'a pas eu lieu.
            echo "[$(date -Iseconds)] Sync déjà en cours, demande reportée"
            touch "$FLAG"
          else
            echo "[$(date -Iseconds)] Sync non abouti (code $rc), instantané inchangé"
          fi
        fi
      fi
      sleep 10
    done
    ;;

  snapshot)
    # Publie une copie lecture seule de la base pour Grafana.
    #
    # garmin.db est en mode WAL : impossible à ouvrir depuis un montage :ro
    # (SQLite doit pouvoir créer les fichiers -wal/-shm). On produit donc un
    # instantané cohérent en mode rollback classique, que Grafana monte en
    # lecture seule — la base de production n'est jamais exposée en écriture.
    python - <<'PY'
import os
import sqlite3
import tempfile

src = "/work/garmin.db"
dst_dir = "/work/export"
dst = os.path.join(dst_dir, "garmin-ro.db")

os.makedirs(dst_dir, exist_ok=True)

# Écriture dans un fichier temporaire puis renommage atomique : Grafana ne
# peut jamais lire un instantané à moitié écrit.
fd, tmp = tempfile.mkstemp(dir=dst_dir, suffix=".tmp")
os.close(fd)
os.unlink(tmp)

con = sqlite3.connect(src)
con.execute("VACUUM INTO ?", (tmp,))
con.close()

# Le fichier issu de VACUUM INTO doit rester en mode rollback pour être
# lisible depuis un montage :ro. On le force explicitement.
snap = sqlite3.connect(tmp)
mode = snap.execute("PRAGMA journal_mode=DELETE").fetchone()[0]
tables = snap.execute(
    "SELECT count(*) FROM sqlite_master WHERE type='table'").fetchone()[0]
snap.close()

os.replace(tmp, dst)
print(f"Instantané publié : {dst} ({os.path.getsize(dst) // 1024} Ko, "
      f"{tables} tables, journal_mode={mode})")
PY
    ;;

  *)
    exec "$@"
    ;;
esac
