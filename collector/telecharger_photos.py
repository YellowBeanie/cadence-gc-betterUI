#!/usr/bin/env python3
"""Tentative de téléchargement des photos d'activité Garmin Connect
(tâche 27) — best-effort, sur le modèle de import_plan.py (même client
GarminClient, même session restaurée depuis browser_profile/).

Schéma RÉEL, vérifié le 2026-08-09 par sonde contre une vraie activité
photographiée (Creux du Van, 23901069071) — cf. task-27-report.md :

  GET /gc-api/activity-service/activity/{id}
    → metadataDTO.activityImages : liste de dicts
      {imageId, url, mediumUrl, smallUrl, photoDate, latitude, longitude,
       expirationTimestamp}
    `url` est la grande taille (`…-larg.jpg`), mediumUrl/smallUrl les
    déclinaisons. Ce sont des URL S3 **signées** (X-Amz-Signature dans la
    query, expiration ~24 h) : elles se téléchargent en HTTP pur, sans
    cookie ni session — urllib suffit, et évite le CORS d'un fetch()
    depuis le navigateur. L'endpoint pluriel `/images` (première
    hypothèse) renvoie None, tout passe par le détail d'activité.

Best-effort total, garanti par construction :
  - AUCUNE exception ne doit remonter jusqu'à main() sans être absorbée par
    un `except` local (endpoint 404, session expirée, réseau, schéma
    inattendu) — seulement un WARN sur stderr, JAMAIS d'identifiants ni de
    cookies.
  - Code de sortie toujours 0.
  - Écriture atomique (fichier temporaire puis rename), idempotent (une image
    déjà présente sur disque n'est jamais re-téléchargée).

Sortie : /work/export/photos-activites/{activity_id}/{n}.jpg
"""
import os
import sqlite3
import sys
import urllib.request
from pathlib import Path

from garmin_client.client import GarminClient

DATA_DIR = Path(os.environ.get("GARMIN_DATA_DIR", "/work"))

# Ordre de préférence vérifié sur une vraie réponse : `url` est la grande
# taille (…-larg.jpg), les deux autres des déclinaisons réduites.
CLES_URL_IMAGE = ("url", "mediumUrl", "smallUrl")


def _avertir(msg: str) -> None:
    print(f"AVERTISSEMENT (photos) : {msg}", file=sys.stderr)


def _lister_activites() -> list[int]:
    """Tous les activity_id de garmin.db (base vive, pas l'instantané : ce
    script tourne dans le même conteneur `sync` juste après le sync)."""
    db_path = DATA_DIR / "garmin.db"
    if not db_path.exists():
        _avertir(f"garmin.db introuvable à {db_path}")
        return []
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        try:
            return [r[0] for r in conn.execute("SELECT activity_id FROM activity")]
        finally:
            conn.close()
    except sqlite3.Error as e:
        _avertir(f"lecture de garmin.db impossible ({type(e).__name__})")
        return []


def _url_image(img) -> str | None:
    """Élément de `activityImages` : dict dont l'une des CLES_URL_IMAGE
    porte l'URL S3 signée (grande taille d'abord)."""
    if not isinstance(img, dict):
        return None
    for cle in CLES_URL_IMAGE:
        v = img.get(cle)
        if isinstance(v, str) and v.startswith("https://"):
            return v
    return None


def _telecharger_url(url: str) -> bytes | None:
    """Télécharge une URL S3 signée en HTTP pur — la signature est dans la
    query, aucune session ni cookie requis. Hors navigateur exprès : un
    fetch() depuis le contexte connect.garmin.com serait soumis au CORS du
    bucket. L'URL (signée, à durée de vie limitée) n'est jamais loggée."""
    req = urllib.request.Request(url, headers={"User-Agent": "garmin-monitor/1.0"})
    with urllib.request.urlopen(req, timeout=30) as reponse:
        contenu = reponse.read()
    # Garde JPEG minimale : ne jamais écrire une page d'erreur en .jpg.
    if not contenu or not contenu.startswith(b"\xff\xd8"):
        return None
    return contenu


def _telecharger_activite(client: GarminClient, activity_id: int) -> int:
    """Tente de télécharger les photos d'une activité. Renvoie le nombre de
    fichiers effectivement écrits (0 si aucune photo, endpoint absent, ou
    déjà toutes présentes sur disque) — ne lève jamais."""
    dossier = DATA_DIR / "export" / "photos-activites" / str(activity_id)

    try:
        details = client.api_fetch(f"/gc-api/activity-service/activity/{activity_id}")
    except Exception as e:
        _avertir(f"activité {activity_id} : détail inaccessible ({type(e).__name__})")
        return 0

    if not isinstance(details, dict):
        return 0
    images = (details.get("metadataDTO") or {}).get("activityImages")
    if not isinstance(images, list) or not images:
        return 0  # aucune photo sur cette activité

    ecrites = 0
    for n, img in enumerate(images, start=1):
        cible = dossier / f"{n}.jpg"
        if cible.exists():
            continue  # idempotent : jamais re-téléchargée

        url = _url_image(img)
        if not url:
            _avertir(f"activité {activity_id}, image {n} : URL introuvable dans la réponse")
            continue

        try:
            contenu = _telecharger_url(url)
        except Exception as e:
            _avertir(f"activité {activity_id}, image {n} : téléchargement échoué ({type(e).__name__})")
            continue

        if not contenu:
            continue

        try:
            dossier.mkdir(parents=True, exist_ok=True)
            tmp = dossier / f".{n}.jpg.tmp"
            tmp.write_bytes(contenu)
            tmp.replace(cible)  # rename atomique : jamais un .jpg à moitié écrit
            ecrites += 1
        except OSError as e:
            _avertir(f"activité {activity_id}, image {n} : écriture échouée ({type(e).__name__})")

    return ecrites


def main() -> int:
    email = os.environ.get("GARMIN_EMAIL", "")
    password = os.environ.get("GARMIN_PASSWORD", "")
    if not email or not password:
        _avertir("identifiants Garmin absents — photos non tentées")
        return 0  # best effort : jamais un échec de la chaîne de sync pour ça

    activites = _lister_activites()
    if not activites:
        print("Aucune activité à examiner pour des photos.")
        return 0

    client = GarminClient(
        email=email,
        password=password,
        profile_dir=DATA_DIR / "browser_profile",
        headless=True,
    )
    total = 0
    try:
        # login() DOIT rester dans le try (même garde qu'import_plan.py) : un
        # échec après ouverture de Chrome laisserait sinon le navigateur
        # orphelin, verrouillant browser_profile pour les prochains syncs.
        if not client.login():
            _avertir("login Garmin échoué — photos non tentées")
            return 0

        for activity_id in activites:
            try:
                total += _telecharger_activite(client, activity_id)
            except Exception as e:
                # Filet ultime : une activité qui casse ne doit jamais
                # empêcher les suivantes d'être tentées.
                _avertir(f"activité {activity_id} : erreur inattendue ({type(e).__name__})")
    except Exception as e:
        _avertir(f"session Garmin interrompue ({type(e).__name__})")
    finally:
        client.close()

    print(f"{total} photo(s) téléchargée(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
