#!/usr/bin/env bash
# Diagnostic du stack Cadence — SANS EFFET DE BORD : ne modifie jamais rien,
# se contente de lire et de rapporter. Emplacement cible : ~/garmin-monitor/doctor.sh
#
# Vérifie, dans l'ordre : docker présent, images construites, .env présent et
# chmod 600, data/ et droits uid, garmin.db présente, instantané export/
# récent (< 26 h), app répond 200 en local, crontab contient les entrées,
# llm-adapter en mode echo fonctionne, image whisper présente.
#
# Chaque ligne rapporte OK ou ÉCHEC en français. Code de sortie = nombre
# d'échecs (0 = tout est vert).
set -uo pipefail

# Résolu depuis l'emplacement du script lui-même, jamais codé en dur : ce
# script doit pouvoir tourner quel que soit le compte système ou le chemin
# choisis à l'installation (contrairement à run.sh/snapshot.sh/analyse*.sh,
# dont le défaut est $HOME/garmin-monitor — voir INSTALL.md).
STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$STACK_DIR/data"

FAIL=0

ok() { echo "OK : $1"; }
echec() { echo "ÉCHEC : $1" >&2; FAIL=$((FAIL + 1)); }

echo "=== Diagnostic Cadence — $STACK_DIR ==="

# ── 1. Docker présent ────────────────────────────────────────────────────
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  ok "docker et le plugin compose sont présents"
else
  echec "docker et/ou le plugin compose sont introuvables"
fi

# ── 2. Images construites (collector, app) ──────────────────────────────
if command -v docker >/dev/null 2>&1 \
   && docker image inspect garmin-collector:local >/dev/null 2>&1 \
   && docker image inspect garmin-app:local >/dev/null 2>&1; then
  ok "images garmin-collector:local et garmin-app:local construites"
else
  echec "image garmin-collector:local ou garmin-app:local manquante (docker compose build)"
fi

# ── 3. .env présent et chmod 600 ─────────────────────────────────────────
if [ -f "$STACK_DIR/.env" ]; then
  PERMS="$(stat -c '%a' "$STACK_DIR/.env" 2>/dev/null || echo '?')"
  if [ "$PERMS" = "600" ]; then
    ok ".env présent, permissions 600"
  else
    echec ".env présent mais permissions $PERMS (attendu 600)"
  fi
else
  echec ".env absent (voir env.example)"
fi

# ── 4. data/ et droits uid ───────────────────────────────────────────────
if [ -d "$DATA_DIR" ]; then
  UID_DATA="$(stat -c '%u' "$DATA_DIR" 2>/dev/null || echo '?')"
  if [ "$UID_DATA" = "1000" ]; then
    ok "data/ présent, appartient à l'uid 1000 (aligné sur les conteneurs)"
  else
    echec "data/ appartient à l'uid $UID_DATA, pas 1000 — les conteneurs tournent en user: \"1000:1000\""
  fi
else
  echec "data/ absent"
fi

# ── 5. garmin.db présente ────────────────────────────────────────────────
if [ -f "$DATA_DIR/garmin.db" ]; then
  ok "data/garmin.db présente"
else
  echec "data/garmin.db absente (aucun sync réussi pour l'instant ?)"
fi

# ── 6. Instantané export/ récent (< 26 h) ────────────────────────────────
SNAPSHOT="$DATA_DIR/export/garmin-ro.db"
if [ -f "$SNAPSHOT" ]; then
  MTIME="$(stat -c '%Y' "$SNAPSHOT" 2>/dev/null || echo 0)"
  NOW="$(date +%s)"
  AGE_H=$(( (NOW - MTIME) / 3600 ))
  if [ "$AGE_H" -lt 26 ]; then
    ok "instantané garmin-ro.db à jour (${AGE_H} h)"
  else
    echec "instantané garmin-ro.db vieux de ${AGE_H} h (> 26 h) — dernier sync en échec ?"
  fi
else
  echec "data/export/garmin-ro.db absent (aucun sync réussi pour l'instant ?)"
fi

# ── 7. App répond 200 en local ───────────────────────────────────────────
# Résolu via `docker compose port`, jamais une IP codée en dur : le port
# publié dépend du docker-compose.yml de chacun (voir INSTALL.md, étape 8).
if command -v docker >/dev/null 2>&1 && command -v curl >/dev/null 2>&1; then
  APP_ADDR="$(cd "$STACK_DIR" && docker compose port app 3000 2>/dev/null || true)"
  if [ -n "$APP_ADDR" ]; then
    CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://$APP_ADDR/" 2>/dev/null || echo '000')"
    if [ "$CODE" = "200" ]; then
      ok "l'app répond 200 sur $APP_ADDR"
    else
      echec "l'app répond $CODE sur $APP_ADDR (attendu 200 — docker compose up -d app ?)"
    fi
  else
    echec "impossible de résoudre le port publié du service app (démarré ?)"
  fi
else
  echec "docker ou curl indisponible pour tester l'app"
fi

# ── 8. Crontab contient les entrées ──────────────────────────────────────
CRONTAB="$(crontab -l 2>/dev/null || true)"
CRON_MANQUANTS=""
for SCRIPT in run.sh analyse.sh traite-audio.sh; do
  if ! printf '%s\n' "$CRONTAB" | grep -q "garmin-monitor/${SCRIPT}"; then
    CRON_MANQUANTS="${CRON_MANQUANTS} ${SCRIPT}"
  fi
done
if [ -z "$CRON_MANQUANTS" ]; then
  ok "crontab contient run.sh, analyse.sh et traite-audio.sh"
else
  echec "crontab : entrée(s) manquante(s) pour :${CRON_MANQUANTS}"
fi

# ── 9. llm-adapter en mode echo fonctionne ───────────────────────────────
if [ -x "$STACK_DIR/llm-adapter.sh" ]; then
  SORTIE="$(printf 'diagnostic' | LLM_PROVIDER=echo "$STACK_DIR/llm-adapter.sh" 2>/dev/null || true)"
  if [ "$SORTIE" = '{"resume":"test","observations":[],"prudence":null}' ]; then
    ok "llm-adapter.sh (mode echo) répond correctement"
  else
    echec "llm-adapter.sh (mode echo) ne répond pas comme attendu"
  fi
else
  echec "llm-adapter.sh absent ou non exécutable"
fi

# ── 10. Image whisper présente ───────────────────────────────────────────
if command -v docker >/dev/null 2>&1 && docker image inspect garmin-whisper:local >/dev/null 2>&1; then
  ok "image garmin-whisper:local construite"
else
  echec "image garmin-whisper:local manquante (docker compose build whisper)"
fi

echo "=== ${FAIL} échec(s) ==="
exit "$FAIL"
