# Collector Garmin — Chrome + garmin-givemydata
#
# CIBLE : le serveur cible (<IP-DU-SERVEUR>, Intel N100, x86_64).
# PAS le cluster k3s : Google ne publie aucun build Linux arm64 de Chrome,
# et les 6 nœuds du cluster sont des Raspberry Pi. Voir deploy/k3s/README.md.
#
# L'extraction repose sur SeleniumBase UC mode, qui pilote un vrai Chrome :
#   - mode sync   : pas de $DISPLAY → l'outil lance lui-même un Xvfb (plus
#                   furtif que le mode headless natif de Chrome).
#   - mode login  : Xvfb + fluxbox + x11vnc → session VNC pour saisir le MFA
#                   et résoudre un éventuel captcha à la main.
FROM python:3.12-slim

# Chrome + Xvfb (les deux modes) + x11vnc/fluxbox (mode login seulement).
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget gnupg ca-certificates fonts-liberation patch procps \
    xvfb x11vnc fluxbox \
    && wget -q -O- https://dl.google.com/linux/linux_signing_key.pub \
       | gpg --dearmor > /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] \
       http://dl.google.com/linux/chrome/deb/ stable main" \
       > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Version épinglée : le patch ci-dessous cible exactement la 0.1.13.
RUN pip install --no-cache-dir garmin-givemydata==0.1.13

# Patch : si un overlay reCAPTCHA bloque le formulaire de login, attendre qu'un
# humain le résolve (session VNC) au lieu de planter sur le clic.
COPY patches/0001-wait-for-human-on-captcha-overlay.patch /tmp/captcha.patch
RUN cd /usr/local/lib/python3.12/site-packages \
    && patch -p1 < /tmp/captcha.patch \
    && rm /tmp/captcha.patch

# Pré-télécharge les drivers correspondant au Chrome installé, sinon SeleniumBase
# les récupère à chaque run — et échouerait ici, le conteneur tournant non-root.
# Le chmod rend le dossier inscriptible si un jour un re-download est nécessaire.
RUN sbase get chromedriver && sbase get uc_driver \
    && chmod -R a+rwX /usr/local/lib/python3.12/site-packages/seleniumbase/drivers

# Xvfb tourne en non-root et ne peut pas créer /tmp/.X11-unix lui-même
# (« _XSERVTransmkdir: ERROR: euid != 0 »). Sans ce dossier il se rabat sur les
# sockets abstraites — ça fonctionne, mais on ne veut pas dépendre de ce repli.
RUN mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix

# Conteneur non-root, aligné sur l'uid/gid de l'utilisateur du stack (1000:1000) sur le NAS.
# Indispensable : les fichiers root-owned sont exclus de la sauvegarde restic.
# Chrome refuse par ailleurs de démarrer en root sans --no-sandbox (option qu'on
# ne peut pas passer, l'outil construisant le Driver lui-même).
RUN useradd --uid 1000 --create-home --shell /bin/bash collector

# HOME hors du volume : le cache Chrome reste éphémère et ne pollue pas les
# sauvegardes. Seul /work (db + browser_profile + fit) est persisté.
ENV HOME=/home/collector \
    GARMIN_DATA_DIR=/work \
    PYTHONUNBUFFERED=1

# /work : garmin.db + browser_profile/ + fit/ — monté depuis ~/garmin-monitor/data.
# Créé et chown ici pour que l'image reste utilisable sans volume (smoke tests).
RUN mkdir -p /work && chown 1000:1000 /work

# WORKDIR délibérément HORS de /work : SeleniumBase crée `downloaded_files/` et
# `latest_logs/` dans le répertoire courant. Les garder éphémères évite de
# polluer le volume de données — et donc la sauvegarde restic.
# L'emplacement des données ne dépend pas du cwd, il vient de GARMIN_DATA_DIR.
WORKDIR /home/collector

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

COPY import_plan.py /usr/local/bin/import_plan.py

# Tentative best-effort de téléchargement des photos d'activité (tâche 27) —
# ne fait jamais échouer la chaîne de sync, cf. son en-tête.
COPY telecharger_photos.py /usr/local/bin/telecharger_photos.py

# Contexte pour l'analyste Claude (tâche 16) — lit garmin-ro.db et
# training.db en lecture seule, n'écrit rien. Invoqué directement via
# `docker compose run --rm --entrypoint python sync /usr/local/bin/extraire_contexte.py`
# depuis analyse.sh sur l'hôte, hors du flux sync habituel.
COPY extraire_contexte.py /usr/local/bin/extraire_contexte.py

# Même principe, PAR SÉANCE (tâche 24) — script séparé, invoqué avec
# `--seance <activity_id>` depuis analyse-seance.sh.
COPY extraire_contexte_seance.py /usr/local/bin/extraire_contexte_seance.py

USER 1000:1000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["sync"]
