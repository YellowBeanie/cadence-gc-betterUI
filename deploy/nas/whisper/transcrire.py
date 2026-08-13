#!/usr/bin/env python3
"""Transcription locale d'un audio en français (tâche 28, saisie vocale).

faster-whisper, CPU, `compute_type=int8` (raisonnable sur le CPU du NAS),
langue FORCÉE `fr` (jamais de détection automatique — l'app est en français,
et un détecteur peut se tromper sur un audio bruité de salle de sport).

Usage : transcrire.py <chemin_audio_monté>

Le modèle "small" est déjà présent dans l'image (téléchargé AU BUILD, cf.
Dockerfile) : aucun accès réseau ici, contrainte verrouillée de la spec 2
(transcription locale, jamais une API cloud pour la voix).

Sortie : texte brut sur stdout, rien d'autre — c'est `traite-audio.sh` qui le
redirige vers un fichier temporaire avant de le transmettre à `claude -p`
comme DONNÉE (jamais interpolé dans une commande shell). Aucun log ne doit
jamais contenir le contenu de l'audio ou sa transcription intégrale (même
discipline que les analystes Claude : `ERREUR : ...` court sur stderr en cas
d'échec, jamais le texte transcrit).
"""
import sys

from faster_whisper import WhisperModel


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage : transcrire.py <chemin_audio>", file=sys.stderr)
        return 1

    chemin = sys.argv[1]

    try:
        modele = WhisperModel("small", device="cpu", compute_type="int8")
        segments, _info = modele.transcribe(chemin, language="fr")
        texte = " ".join(s.text.strip() for s in segments).strip()
    except Exception as e:  # noqa: BLE001 — best-effort, jamais de trace complète en log
        print(f"ERREUR : transcription échouée ({type(e).__name__})", file=sys.stderr)
        return 1

    print(texte)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
