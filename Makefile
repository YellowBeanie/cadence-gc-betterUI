# Surchargeables : `make nas-push NAS=utilisateur@hote NAS_DIR=mon-dossier`
# ou en variables d'environnement. Défauts = instance de référence de ce dépôt.
# Valeurs locales dans config.mk (git-ignoré) — ex. : NAS = moi@mon-serveur
-include config.mk
NAS ?= <UTILISATEUR>@<HOTE-SERVEUR>
NAS_DIR ?= garmin-monitor

.PHONY: install login sync status export nas-push nas-build nas-login nas-sync nas-status \
	app-push app-build app-up app-logs

## ── Local (PC Windows / dev) ────────────────────────────────────────────
install:
	pipx install garmin-givemydata || pip install --user garmin-givemydata

login:   ## Login local — fenêtre Chrome visible (MFA), réseau maison, sans VPN
	garmin-givemydata --visible --days 7

sync:    ## Sync headless local
	garmin-givemydata --latest

status:
	garmin-givemydata --status

export:
	garmin-givemydata --export ./exports

## ── serveur cible (cible de production) ─────────────────────────────────────
nas-push:   ## Copie collector + scripts NAS (layout : deploy/nas/README.md)
	ssh $(NAS) "mkdir -p ~/$(NAS_DIR)/build/patches ~/$(NAS_DIR)/data ~/$(NAS_DIR)/whisper"
	# build/ : tout ce que le Dockerfile COPY — un fichier oublié ici resterait
	# silencieusement périmé sur le NAS au prochain build (import_plan.py et
	# extraire_contexte.py avaient été poussés à la main pendant le dev).
	scp collector/Dockerfile collector/entrypoint.sh collector/import_plan.py \
		collector/telecharger_photos.py \
		collector/extraire_contexte.py collector/extraire_contexte_seance.py $(NAS):~/$(NAS_DIR)/build/
	scp collector/patches/*.patch $(NAS):~/$(NAS_DIR)/build/patches/
	# Racine du stack : wrappers cron + analystes (contrats de prompt compris)
	# + adaptateur LLM multi-fournisseurs (tâche 34) + diagnostic (tâche 35).
	scp deploy/nas/docker-compose.yml deploy/nas/run.sh deploy/nas/snapshot.sh \
		deploy/nas/doctor.sh deploy/nas/llm-adapter.sh \
		deploy/nas/analyse.sh deploy/nas/prompt-analyse.md \
		deploy/nas/analyse-seance.sh deploy/nas/prompt-analyse-seance.md \
		deploy/nas/traite-audio.sh deploy/nas/prompt-saisie-boxe.md $(NAS):~/$(NAS_DIR)/
	# Transcription locale (saisie vocale, tâche 28) : Dockerfile + script dédiés.
	scp deploy/nas/whisper/Dockerfile deploy/nas/whisper/transcrire.py $(NAS):~/$(NAS_DIR)/whisper/
	ssh $(NAS) "chmod +x ~/$(NAS_DIR)/run.sh ~/$(NAS_DIR)/snapshot.sh ~/$(NAS_DIR)/doctor.sh \
		~/$(NAS_DIR)/llm-adapter.sh \
		~/$(NAS_DIR)/analyse.sh ~/$(NAS_DIR)/analyse-seance.sh ~/$(NAS_DIR)/traite-audio.sh \
		~/$(NAS_DIR)/build/entrypoint.sh"

nas-build:
	ssh $(NAS) "cd ~/$(NAS_DIR) && docker compose build"

nas-login:  ## Session interactive (MFA/captcha) — ouvrir un tunnel VNC en parallèle :
            ## ssh -L 5900:localhost:5900 $(NAS)  puis client VNC sur localhost:5900
	ssh -t $(NAS) "cd ~/$(NAS_DIR) && docker compose run --rm --service-ports login"

nas-sync:
	ssh $(NAS) "cd ~/$(NAS_DIR) && docker compose run --rm sync"

nas-status:
	ssh $(NAS) "cd ~/$(NAS_DIR) && docker compose run --rm sync status"

## ── App d'entraînement (déploiement NAS) ────────────────────────────────
## `make` et `rsync` sont absents du poste Windows de dev : on empaquette
## les sources en tar et on les envoie par pipe SSH plutôt que par rsync.
## Le dossier distant est purgé avant extraction pour retrouver le même
## effet que le --delete de rsync. node_modules/ et .next/ ne sont jamais
## transférés : l'image les reconstruit.
app-push:   ## Copie les sources de l'app vers le NAS
	ssh $(NAS) "rm -rf ~/$(NAS_DIR)/app && mkdir -p ~/$(NAS_DIR)/app"
	cd app && tar czf - --exclude=node_modules --exclude=.next --exclude='.env*' . | \
		ssh $(NAS) "tar xzf - -C ~/$(NAS_DIR)/app"

app-build:
	ssh $(NAS) "cd ~/$(NAS_DIR) && docker compose build app"

app-up:
	ssh $(NAS) "cd ~/$(NAS_DIR) && docker compose up -d app"

app-logs:
	ssh $(NAS) "cd ~/$(NAS_DIR) && docker compose logs -f --tail 50 app"
