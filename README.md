# Cadence

Application **auto-hébergée** de suivi d'entraînement (course à pied, boxe,
préparation physique...) construite sur tes propres données Garmin Connect.
Ton compte Garmin, ta machine, ta base de données, ton fournisseur d'IA — rien
ne transite par un service tiers que tu n'as pas choisi toi-même.

L'interface (`app/`) est **entièrement en français**.

## Philosophie

- **Jamais de zéro fabriqué.** Une donnée absente ne s'affiche jamais comme
  un zéro, une moyenne à 0 % ou une valeur par défaut qui se lirait comme une
  vraie mesure. Elle disparaît de l'écran à la place — section masquée, trou
  dans un tracé — plutôt qu'une fausse certitude qui fausserait la lecture de
  tes tendances (endurance, récupération, charge d'entraînement).
- **L'analyste IA décrit, il ne prescrit jamais.** Les synthèses générées à
  partir de tes données (quotidiennes, par séance, ou à partir d'une saisie
  vocale) restent descriptives et orientées prudence. Elles ne proposent
  jamais de séance, de durée ou d'intensité à suivre — ce n'est ni un coach,
  ni un avis médical.
- **Tout reste chez toi.** Le collector, la base de données, l'app et
  l'instantané de lecture tournent sur ta propre machine. Le seul service
  externe que tu peux choisir d'impliquer est le fournisseur LLM que tu
  configures toi-même pour les synthèses (voir les avertissements ci-dessous).

## Architecture

```
Compte Garmin Connect
        │  extraction navigateur (Chrome piloté, session persistée)
        ▼
   garmin.db  (SQLite, écriture exclusive du collector)
        │  instantané lecture seule, republié après chaque sync réussi
        ▼
   data/export/garmin-ro.db
        │
        ▼
   App Next.js (app/) ────────────────────────────┐
   dashboard, séances, saisie manuelle et vocale   │
   training.db (propriété exclusive de l'app)      │
        │                                          │
        ▼                                          ▼
   Extraction de contexte (lecture seule)   Saisie vocale (/saisie)
        │                                          │
        ▼                                          ▼
   Adaptateur LLM (llm-adapter.sh)          Whisper local (conteneur dédié,
   claude-cli · gemini-cli ·                 modèle embarqué au build —
   openai-api · ollama                       jamais d'API cloud pour la voix)
        │                                          │
        ▼                                          ▼
   Analyses affichées dans l'app             Transcript + proposition de
   (résumé, jamais de prescription)          séance, à valider dans l'app
```

Le collector n'a **aucun accès réseau entrant** et l'app n'a **aucun accès au
socket Docker** : une demande de synchronisation passe par un fichier-drapeau,
consommé par un service dédié.

## Prérequis

- Une machine **Linux x86_64** avec Docker et Docker Compose — pas de build
  Chrome disponible en ARM (Raspberry Pi, etc. exclus).
- Un compte Garmin Connect.
- Idéalement, un **agent CLI IA** (Claude Code, Gemini CLI, ou équivalent) :
  l'installation est conçue pour être menée par un agent qui suit
  [`INSTALL.md`](INSTALL.md) pas à pas, plutôt que par une lecture manuelle
  de la documentation.
- Un **fournisseur LLM** au choix pour les synthèses d'entraînement (CLI en
  abonnement, API compatible OpenAI, ou instance Ollama locale — voir
  [`INSTALL.md`](INSTALL.md), étape 6).

## Installation

Toute la procédure — prérequis, clonage, identifiants, premier login Garmin
(MFA/captcha compris), choix du fournisseur LLM, planification des tâches
récurrentes et exposition sécurisée — est décrite pas à pas dans
[`INSTALL.md`](INSTALL.md), écrit pour être exécuté par un agent CLI IA.

## Avertissements — à lire avant d'installer

- **Zone grise vis-à-vis des conditions d'utilisation de Garmin.** Cadence
  extrait les données via un navigateur automatisé (pas d'API officielle
  disponible pour les particuliers) : c'est en dehors de l'usage prévu par
  Garmin, et l'utilisation d'un tel outil reste à tes risques — jusqu'à la
  suspension du compte dans le pire des cas. **Ce projet n'a aucun lien avec
  Garmin Ltd.**, ni affiliation, ni partenariat, ni approbation.
- **Ce sont des données de santé.** Fréquence cardiaque, sommeil, VO2max,
  parcours GPS... Ne déploie **jamais** l'app avec son port exposé nu sur
  Internet. Mets-la derrière une authentification (Cloudflare Access ou
  équivalent — voir `INSTALL.md`, étape 8) avant toute exposition au-delà de
  ton réseau local.
- **Tes données de santé partent vers le fournisseur LLM que tu choisis.**
  Les synthèses d'entraînement envoient un extrait de tes données récentes
  (mesures physiologiques, séances, notes) au fournisseur configuré dans
  `LLM_PROVIDER` — un CLI en abonnement, une API tierce, ou une instance
  locale (Ollama) qui ne fait rien sortir de ta machine. Lis la politique de
  confidentialité du fournisseur choisi avant de l'activer : c'est un
  consentement éclairé qui t'appartient.
- **Licence AGPL-3.0, aucune garantie.** Voir [`LICENSE`](LICENSE). Le
  logiciel est fourni « tel quel », sans garantie d'aucune sorte — y compris
  d'exactitude des données ou d'adéquation à un usage médical ou sportif
  particulier.

## Licence

[AGPL-3.0](LICENSE).
