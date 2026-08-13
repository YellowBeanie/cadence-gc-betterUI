#!/usr/bin/env bash
# Exporte une copie PUBLIQUE du projet (repo « cadence-gc-betterUI ») dans le
# répertoire cible, par LISTE BLANCHE de chemins suivis par git — tout ce qui
# n'est pas listé n'existe pas dans l'export, et l'historique n'est jamais
# emporté (le repo public démarre sur un commit initial frais : l'historique
# privé contient CLAUDE.md et les specs personnelles dans ses versions
# passées).
#
# Usage : ./outils/exporter-public.sh <repertoire-cible-vide>
set -euo pipefail

CIBLE="${1:?usage : exporter-public.sh <repertoire-cible-vide>}"
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -e "$CIBLE" ] && [ -n "$(ls -A "$CIBLE" 2>/dev/null)" ]; then
  echo "ERREUR : $CIBLE existe et n'est pas vide" >&2
  exit 1
fi
mkdir -p "$CIBLE"

# Liste blanche : préfixes de chemins DESTINÉS AU PUBLIC. CLAUDE.md,
# docs/superpowers/, .superpowers/, .claude/ et .omc/ n'y figurent pas — par
# construction, ils ne partent jamais.
PREFIXES=(
  "app/"
  "collector/"
  "deploy/nas/"
  # ROLLBACK.md exclu : runbook de l'exploitation d'origine, non générique.
  "docs/design-cadence/"
  "docs/requetes-garmin.md"
  "connaissances/"
  "outils/exporter-public.sh"
  "AGENTS.md"
  "README.md"
  "INSTALL.md"
  "LICENSE"
  "Makefile"
  ".gitattributes"
  ".gitignore"
)

# Exclusions expresses à l'intérieur des préfixes ci-dessus.
EXCLUSIONS=(
  "deploy/nas/ROLLBACK.md"
)

cd "$RACINE"
NB=0
while IFS= read -r fichier; do
  for x in "${EXCLUSIONS[@]}"; do
    [ "$fichier" = "$x" ] && continue 2
  done
  for p in "${PREFIXES[@]}"; do
    case "$fichier" in
      "$p"|"$p"*)
        mkdir -p "$CIBLE/$(dirname "$fichier")"
        cp "$fichier" "$CIBLE/$fichier"
        NB=$((NB + 1))
        break
        ;;
    esac
  done
done < <(git ls-files)

echo "$NB fichier(s) exporté(s) vers $CIBLE"

# Anonymisation légère de la copie publique (le dépôt privé reste intact) :
# les commentaires de code portent l'histoire du projet à la première
# personne — neutralisée pour la publication.
while IFS= read -r -d '' f; do
  case "$f" in
    *.png|*.jpg|*.ico|*.woff*) continue ;;
  esac
  sed -i \
    -e "s/de l'utilisateur\b/de l'utilisateur/g" \
    -e "s/\bOli\b/l'utilisateur/g" \
    -e "s/serveur cible/serveur cible/g" \
    -e "s/\bgbnas\b/le serveur/g" \
    -e "s/\borchestrator@/utilisateur@/g" \
    -e "s|$HOME/garmin-monitor|\$HOME/garmin-monitor|g" \
    -e "s/cron de l'utilisateur du stack/cron de l'utilisateur du stack/g" \
    -e "s|uid/gid de l'utilisateur du stack|uid/gid de l'utilisateur du stack|g" \
    -e "s/Aligné sur l'utilisateur du stack (uid 1000)/Aligné sur l'utilisateur du stack (uid 1000)/g" \
    -e "s|sous le foyer de l'utilisateur du stack|sous le foyer de l'utilisateur du stack|g" \
    -e "s/pour l'instance de référence./pour l'instance de référence./g" \
    "$f"
done < <(find "$CIBLE" -type f -print0)

echo "Anonymisation appliquée."
echo "Prochaines étapes : balayage sécurité, puis git init + commit initial."
