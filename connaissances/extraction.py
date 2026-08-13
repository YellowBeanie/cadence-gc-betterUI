"""Extraction de contenu : HTML partout, PDF/YouTube sur l'atelier PC seulement.

Le NAS n'a que `trafilatura` d'installé (voir requirements-nas.txt) : les
fonctions PDF/YouTube importent leurs dépendances lourdes (docling, yt-dlp)
PARESSEUSEMENT, au premier appel, et lèvent `ExtractionIndisponible` avec un
message clair quand elles manquent — le document part alors en
file_ingestion pour être traité depuis l'atelier PC
(requirements-atelier.txt : trafilatura + docling + yt-dlp).
"""
import hashlib
import re
import tempfile
import unicodedata
from dataclasses import dataclass
from pathlib import Path


class ExtractionIndisponible(RuntimeError):
    """docling/yt-dlp absents (cas NAS) : le document part en file_ingestion."""


@dataclass
class Document:
    texte: str
    titre: str | None = None
    date: str | None = None


def normaliser_espaces(t):
    """NFC + espaces (dont sauts de ligne/tabulations) réduits à un seul + strip.

    LA normalisation de référence, aussi utilisée par le validateur (tâche 6) :
    signature et comportement doivent rester stables.
    """
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", t)).strip()


def hash_contenu(texte):
    """sha256 hex du texte normalisé — stable aux variations d'espacement."""
    return hashlib.sha256(normaliser_espaces(texte).encode("utf-8")).hexdigest()


def extraire_html(html: str | bytes, url):
    """Extraction du contenu principal (trafilatura élimine nav/menu/pub).

    Accepte `str` (déjà décodé, ex. fixtures de test) ou `bytes` (corps HTTP
    brut) : sur `bytes`, trafilatura détecte lui-même l'encodage réel de la
    page (meta charset / heuristique) plutôt que de supposer l'UTF-8 (revue
    finale I2 — un decode("utf-8","replace") en amont gravait des U+FFFD
    dans le texte pour toute page cp1252/ISO-8859-1, avant même d'atteindre
    trafilatura)."""
    import trafilatura

    texte = trafilatura.extract(html, url=url, include_comments=False) or ""
    meta = trafilatura.extract_metadata(html, default_url=url)
    return Document(
        texte=texte,
        titre=getattr(meta, "title", None),
        date=getattr(meta, "date", None),
    )


def extraire_pdf(chemin):
    """Extraction PDF via docling (atelier PC seulement, import paresseux)."""
    try:
        from docling.document_converter import DocumentConverter
    except Exception as e:
        raise ExtractionIndisponible(
            "docling indisponible ici — document à mettre en file_ingestion "
            "pour l'atelier PC"
        ) from e
    res = DocumentConverter().convert(str(chemin))
    return Document(texte=res.document.export_to_markdown())


# Ligne d'horodatage WebVTT : ancrée en tête de ligne pour ne pas confondre
# une flèche "-->" littérale dans un texte de sous-titre avec un horodatage
# (finding de revue #2). Accepte la forme complète HH:MM:SS.mmm et la forme
# courte MM:SS.mmm (les deux existent dans des pistes WebVTT réelles) ainsi
# que le séparateur décimal ',' des pistes .srt converties.
_RE_HORODATAGE = re.compile(r"^(\d{2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->")


def _vtt_vers_texte(vtt: str) -> str:
    """Parse un fichier WebVTT (sous-titres YouTube) en texte brut.

    Ignore l'en-tête (WEBVTT, Kind:, Language:), les lignes vides, les
    lignes d'horodatage (détectées par motif ancré, pas par simple
    présence de « --> » — un texte de sous-titre peut légitimement
    contenir cette séquence) et les identifiants de cue, détectés par
    lookahead : une ligne immédiatement suivie d'une ligne d'horodatage
    est un identifiant, qu'il soit numérique (« 1 ») ou textuel
    (« intro ») — c'est la position dans le bloc de cue qui fait foi, pas
    le contenu de la ligne. Nettoie les balises inline (`<c>`,
    `<00:00:00.000>`, etc.) via une regex, et déduplique les répétitions
    consécutives — les sous-titres auto YouTube répètent souvent la même
    ligne d'une cue à l'autre pour simuler un défilement.
    """
    lignes = [l.strip() for l in vtt.splitlines()]
    lignes_texte = []
    for i, ligne in enumerate(lignes):
        if not ligne or ligne == "WEBVTT" or ligne.startswith(("Kind:", "Language:")):
            continue
        if _RE_HORODATAGE.match(ligne):
            continue
        if i + 1 < len(lignes) and _RE_HORODATAGE.match(lignes[i + 1]):
            continue  # identifiant de cue : juste avant une ligne d'horodatage
        nettoyee = re.sub(r"<[^>]+>", "", ligne).strip()
        if not nettoyee:
            continue
        if lignes_texte and lignes_texte[-1] == nettoyee:
            continue  # répétition consécutive (défilement des sous-titres auto)
        lignes_texte.append(nettoyee)
    return " ".join(lignes_texte)


def extraire_youtube(url):
    """Sous-titres (manuels ou auto) → texte, via yt-dlp (atelier PC seulement)."""
    try:
        import yt_dlp
    except Exception as e:
        raise ExtractionIndisponible(
            "yt-dlp indisponible ici — vidéo à mettre en file_ingestion "
            "pour l'atelier PC"
        ) from e

    with tempfile.TemporaryDirectory() as tmp:
        options = {
            "writesubtitles": True,
            "writeautomaticsub": True,
            "skip_download": True,
            "subtitleslangs": ["fr", "en"],
            "outtmpl": str(Path(tmp) / "%(id)s.%(ext)s"),
            "quiet": True,
            "no_warnings": True,
        }
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=True)

        fichiers_vtt = sorted(Path(tmp).glob("*.vtt"))
        titre = info.get("title") if info else None
        if not fichiers_vtt:
            return Document(texte="", titre=titre)
        vtt = fichiers_vtt[0].read_text(encoding="utf-8")
        return Document(texte=_vtt_vers_texte(vtt), titre=titre)
