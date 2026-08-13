# Transcription locale d'un audio (saisie vocale, tâche 28) — conteneur à la
# demande, PAS un service permanent (cf. docker-compose.yml, section whisper :
# aucun port, `docker compose run --rm whisper <chemin_audio>`).
#
# Contrainte verrouillée de la spec 2 : transcription LOCALE sur le NAS,
# jamais une API cloud pour la voix. Le modèle "small" est téléchargé AU
# BUILD (couche d'image cachée) pour qu'aucun accès réseau ne soit nécessaire
# au run — même esprit que le profil Chrome du collector, qui ne doit jamais
# dépendre d'une ressource externe à l'exécution.
FROM python:3.12-slim

# ffmpeg : faster-whisper s'appuie dessus pour décoder les formats audio
# courants (m4a, mp3, ogg, wav, webm, aac) au-delà du WAV brut.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir faster-whisper

# Cache HuggingFace dans un chemin FIXE, identique au build et au run :
# sans HF_HOME, le build (root) écrivait dans /root/.cache et le run
# (uid 1000, sans HOME) cherchait dans /.cache — modèle introuvable,
# re-téléchargement refusé en écriture (PermissionError, constaté au
# premier test réel sur le NAS).
ENV HF_HOME=/opt/hf-cache

# Précharge le modèle "small" (CPU, int8) dans l'image : le premier run ne
# doit jamais tenter de le télécharger — même raisonnement que le patch
# anti-crash reCAPTCHA du collector (rien qui dépende d'un accès réseau
# implicite au moment critique).
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')" \
    && chmod -R a+rX /opt/hf-cache

COPY transcrire.py /usr/local/bin/transcrire.py

# Hors-ligne strict au run (revue A2, tâche 32) : le modèle est dans l'image,
# huggingface_hub n'a AUCUNE raison de contacter le réseau ni d'écrire son
# cache — sans ce drapeau il tentait les deux et polluait les logs de
# warnings « Permission denied » sans conséquence mais trompeurs (le faux
# « bug dormant » de la revue venait de là).
ENV HF_HUB_OFFLINE=1

ENTRYPOINT ["python", "/usr/local/bin/transcrire.py"]
