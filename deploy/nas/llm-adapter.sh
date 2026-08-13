#!/usr/bin/env bash
# Adaptateur LLM multi-fournisseurs (tâche 34) — contrat d'interface UNIQUE
# pour les trois chaînes hôtes (analyse.sh, analyse-seance.sh, traite-audio.sh)
# et pour tout script tiers qui voudrait brancher son propre analyste.
# Emplacement cible : ~/garmin-monitor/llm-adapter.sh
#
# Contrat :
#   entrée  : le prompt complet sur STDIN (contrat + données/transcript déjà
#             assemblés par l'appelant — cet adaptateur ne touche jamais à
#             leur construction).
#   sortie  : la réponse TEXTE BRUTE du modèle sur STDOUT — le JSON strict
#             que les chaînes appelantes valident ensuite. Aucune enveloppe
#             provider-spécifique (ex. le `{"type":"result",...}` du CLI
#             Claude) ne fuite au-delà de ce script : l'extraction est faite
#             ICI, une fois pour toutes.
#   erreur  : code de sortie != 0, message COURT sur stderr — jamais un
#             secret, jamais le prompt ni la réponse en entier (même
#             discipline que les scripts appelants).
#
# Fournisseur choisi via LLM_PROVIDER (voir env.example pour la liste
# complète des variables et un exemple par fournisseur) :
#   claude-cli   (défaut) — reproduit l'appel historique `claude -p
#                 --output-format json` À L'IDENTIQUE : sans configuration,
#                 le comportement d'un déploiement existant ne change pas
#                 d'un iota.
#   gemini-cli   — CLI Gemini en mode non-interactif.
#   openai-api   — toute API compatible OpenAI (OpenAI, Mistral, Groq,
#                 DeepSeek…) via LLM_BASE_URL + LLM_API_KEY.
#   ollama       — instance locale, aucune clé.
#   echo         — fournisseur de TEST caché (non documenté dans
#                 env.example) : ne fait aucun appel réseau/CLI, consomme le
#                 prompt sur stdin et renvoie un JSON fixe sur stdout. Sert à
#                 vérifier la plomberie de cet adaptateur (tests/collector/
#                 test_llm_adapter.sh) sans dépendre d'un vrai fournisseur ni
#                 consommer de quota.
set -uo pipefail

LLM_PROVIDER="${LLM_PROVIDER:-claude-cli}"
LLM_MODEL="${LLM_MODEL:-}"
LLM_TIMEOUT="${LLM_TIMEOUT:-150}"
LLM_SYSTEM_PROMPT="${LLM_SYSTEM_PROMPT:-}"

# Nettoyage centralisé : chaque fichier temporaire créé via nouveau_tmp() est
# supprimé en sortie, succès ou échec (même discipline que les chaînes
# appelantes — jamais de prompt/réponse qui traîne sur disque).
TMPFILES=()
nettoyer() { rm -f "${TMPFILES[@]}"; }
trap nettoyer EXIT

nouveau_tmp() {
  local f
  f="$(mktemp)"
  TMPFILES+=("$f")
  printf '%s' "$f"
}

PROMPT_TMP="$(nouveau_tmp)"
cat > "$PROMPT_TMP"

case "$LLM_PROVIDER" in

  claude-cli)
    CLI_BIN="${LLM_CLI_BIN:-$HOME/.local/bin/claude}"
    if [ ! -x "$CLI_BIN" ]; then
      echo "ERREUR : CLI Claude introuvable ($CLI_BIN)" >&2
      exit 1
    fi
    if [ -z "$LLM_MODEL" ]; then
      echo "ERREUR : LLM_MODEL absent" >&2
      exit 1
    fi

    # Force l'auth abonnement (jeton OAuth, déjà présent dans l'environnement
    # hérité de l'appelant) plutôt qu'une éventuelle clé API facturée héritée
    # de l'environnement — même garde-fou que l'ex-llm_claude.py.
    unset ANTHROPIC_API_KEY

    # Le prompt passe par STDIN, jamais en argument positionnel : bug réel
    # trouvé en prod (tâche 13, pilote atelier PC) — un prompt de fichage
    # réel (document + contrat, ~68 Ko) faisait échouer `timeout` avec
    # « Argument list too long » sous Git Bash/Windows (limite de ligne de
    # commande CreateProcess, ~32 Ko, bien en-deçà de l'ARG_MAX Linux du
    # NAS). `claude -p` sans argument lit le prompt sur stdin.
    #
    # Équivalent OCTET-POUR-OCTET à l'historique (correction post-revue,
    # tâche 13) : un `cat "$PROMPT_TMP" | claude -p …` naïf transmettrait
    # les retours à la ligne finaux du fichier, alors que l'ancien
    # `-p "$(cat "$PROMPT_TMP")"` les supprimait TOUJOURS — c'est le
    # comportement de la substitution de commande `$(…)`, indépendant de la
    # plateforme. Un changement silencieux de ce détail affecterait TOUS les
    # appelants, NAS compris, pas seulement l'atelier PC. `printf '%s'
    # "$(cat "$PROMPT_TMP")"` restaure exactement ce dépouillement avant de
    # piper vers stdin ; `printf` est un BUILTIN bash (pas un exécutable
    # lancé via CreateProcess/execve), donc aucune limite ARG_MAX ne
    # s'applique à son argument, aussi volumineux soit-il — le prompt de
    # 68 Ko passe sans réintroduire le bug ARG_MAX corrigé ci-dessus.
    ARGS=(-p --output-format json --model "$LLM_MODEL" \
          --strict-mcp-config --mcp-config '{"mcpServers":{}}')
    [ -n "$LLM_SYSTEM_PROMPT" ] && ARGS+=(--system-prompt "$LLM_SYSTEM_PROMPT")

    ENVELOPPE_TMP="$(nouveau_tmp)"

    # Sans ça, le thinking étendu par défaut peut dépasser le timeout — piège
    # documenté dans l'ex-llm_claude.py, reproduit ici par prudence.
    export MAX_THINKING_TOKENS=0
    if ! printf '%s' "$(cat "$PROMPT_TMP")" | timeout "$LLM_TIMEOUT" "$CLI_BIN" "${ARGS[@]}" > "$ENVELOPPE_TMP"; then
      echo "ERREUR : appel claude-cli échoué" >&2
      exit 1
    fi

    python3 - "$ENVELOPPE_TMP" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as f:
    brut = f.read()

try:
    enveloppe = json.loads(brut)
except json.JSONDecodeError as e:
    print(f"ERREUR : enveloppe claude-cli non-JSON ({e})", file=sys.stderr)
    sys.exit(1)

if enveloppe.get("is_error") or enveloppe.get("subtype") != "success":
    print(f"ERREUR : echec claude-cli (subtype={enveloppe.get('subtype')})", file=sys.stderr)
    sys.exit(1)

# Écriture en octets UTF-8 explicites, jamais sys.stdout.write() : bug réel
# trouvé en prod (tâche 13, pilote atelier PC) — sur Windows, sys.stdout
# encode par défaut dans la page de code de la console (cp1252 constaté),
# et une réponse scientifique ordinaire (signe moins Unicode "−", tirets
# cadratins…) faisait planter cette écriture APRÈS un appel claude-cli
# pourtant réussi, avec un code de sortie non-zéro indiscernable d'un vrai
# échec côté appelant Python (connaissances/llm.py). Le NAS (Linux, stdout
# déjà UTF-8) n'est pas concerné, mais l'atelier PC l'est systématiquement.
sys.stdout.buffer.write((enveloppe.get("result") or "").encode("utf-8"))
PY
    ;;

  gemini-cli)
    CLI_BIN="${LLM_CLI_BIN:-gemini}"
    if ! command -v "$CLI_BIN" >/dev/null 2>&1; then
      echo "ERREUR : CLI Gemini introuvable ($CLI_BIN)" >&2
      exit 1
    fi

    PROMPT_FINAL="$PROMPT_TMP"
    if [ -n "$LLM_SYSTEM_PROMPT" ]; then
      # Le CLI Gemini n'a pas d'option système dédiée documentée en mode
      # non-interactif : la consigne de format est préfixée au prompt,
      # comme le ferait l'appelant pour tout fournisseur sans concept de
      # rôle système explicite.
      PROMPT_FINAL="$(nouveau_tmp)"
      { printf '%s\n\n' "$LLM_SYSTEM_PROMPT"; cat "$PROMPT_TMP"; } > "$PROMPT_FINAL"
    fi

    ARGS=(-p "$(cat "$PROMPT_FINAL")")
    [ -n "$LLM_MODEL" ] && ARGS+=(-m "$LLM_MODEL")

    if ! timeout "$LLM_TIMEOUT" "$CLI_BIN" "${ARGS[@]}" </dev/null; then
      echo "ERREUR : appel gemini-cli échoué" >&2
      exit 1
    fi
    ;;

  openai-api)
    if [ -z "${LLM_API_KEY:-}" ]; then
      echo "ERREUR : LLM_API_KEY absente" >&2
      exit 1
    fi
    if [ -z "$LLM_MODEL" ]; then
      echo "ERREUR : LLM_MODEL absent" >&2
      exit 1
    fi
    BASE_URL="${LLM_BASE_URL:-https://api.openai.com/v1}"

    CORPS_TMP="$(nouveau_tmp)"
    REPONSE_TMP="$(nouveau_tmp)"
    CURL_CFG_TMP="$(nouveau_tmp)"
    chmod 600 "$CURL_CFG_TMP"

    python3 - "$PROMPT_TMP" "$LLM_MODEL" "$LLM_SYSTEM_PROMPT" > "$CORPS_TMP" <<'PY'
import json
import sys

prompt_path, model, system_prompt = sys.argv[1:4]
with open(prompt_path, "r", encoding="utf-8") as f:
    prompt = f.read()

messages = []
if system_prompt:
    messages.append({"role": "system", "content": system_prompt})
messages.append({"role": "user", "content": prompt})

json.dump({"model": model, "messages": messages}, sys.stdout)
PY

    # La clé ne passe JAMAIS par un argument `-H` (visible en clair dans
    # `ps`) : elle passe par un fichier de config curl temporaire, chmod 600,
    # supprimé en sortie (trap nettoyer).
    {
      printf 'header = "Authorization: Bearer %s"\n' "$LLM_API_KEY"
      printf 'header = "Content-Type: application/json"\n'
    } > "$CURL_CFG_TMP"

    if ! HTTP_CODE=$(curl -sS --config "$CURL_CFG_TMP" --max-time "$LLM_TIMEOUT" \
          -o "$REPONSE_TMP" -w '%{http_code}' \
          --data @"$CORPS_TMP" \
          "$BASE_URL/chat/completions"); then
      echo "ERREUR : appel openai-api échoué (réseau)" >&2
      exit 1
    fi
    if [ "$HTTP_CODE" -lt 200 ] || [ "$HTTP_CODE" -ge 300 ]; then
      echo "ERREUR : appel openai-api échoué (HTTP $HTTP_CODE)" >&2
      exit 1
    fi

    python3 - "$REPONSE_TMP" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as f:
    brut = f.read()

try:
    reponse = json.loads(brut)
    texte = reponse["choices"][0]["message"]["content"] or ""
except (json.JSONDecodeError, KeyError, IndexError, TypeError) as e:
    print(f"ERREUR : reponse openai-api inexploitable ({type(e).__name__})", file=sys.stderr)
    sys.exit(1)

sys.stdout.buffer.write(texte.encode("utf-8"))  # cf. bug Windows cp1252, branche claude-cli
PY
    ;;

  ollama)
    if [ -z "$LLM_MODEL" ]; then
      echo "ERREUR : LLM_MODEL absent" >&2
      exit 1
    fi
    BASE_URL="${LLM_BASE_URL:-http://127.0.0.1:11434}"

    CORPS_TMP="$(nouveau_tmp)"
    REPONSE_TMP="$(nouveau_tmp)"

    python3 - "$PROMPT_TMP" "$LLM_MODEL" "$LLM_SYSTEM_PROMPT" > "$CORPS_TMP" <<'PY'
import json
import sys

prompt_path, model, system_prompt = sys.argv[1:4]
with open(prompt_path, "r", encoding="utf-8") as f:
    prompt = f.read()

messages = []
if system_prompt:
    messages.append({"role": "system", "content": system_prompt})
messages.append({"role": "user", "content": prompt})

json.dump({"model": model, "messages": messages, "stream": False}, sys.stdout)
PY

    if ! HTTP_CODE=$(curl -sS --max-time "$LLM_TIMEOUT" \
          -H 'Content-Type: application/json' \
          -o "$REPONSE_TMP" -w '%{http_code}' \
          --data @"$CORPS_TMP" \
          "$BASE_URL/api/chat"); then
      echo "ERREUR : appel ollama échoué (réseau)" >&2
      exit 1
    fi
    if [ "$HTTP_CODE" -lt 200 ] || [ "$HTTP_CODE" -ge 300 ]; then
      echo "ERREUR : appel ollama échoué (HTTP $HTTP_CODE)" >&2
      exit 1
    fi

    python3 - "$REPONSE_TMP" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as f:
    brut = f.read()

try:
    reponse = json.loads(brut)
    texte = reponse["message"]["content"] or ""
except (json.JSONDecodeError, KeyError, TypeError) as e:
    print(f"ERREUR : reponse ollama inexploitable ({type(e).__name__})", file=sys.stderr)
    sys.exit(1)

sys.stdout.buffer.write(texte.encode("utf-8"))  # cf. bug Windows cp1252, branche claude-cli
PY
    ;;

  echo)
    # Fournisseur de test caché — voir l'en-tête de ce fichier. $PROMPT_TMP a
    # déjà consommé stdin ci-dessus ; on ignore délibérément son contenu.
    printf '%s' '{"resume":"test","observations":[],"prudence":null}'
    ;;

  *)
    echo "ERREUR : LLM_PROVIDER inconnu ($LLM_PROVIDER)" >&2
    exit 1
    ;;

esac
