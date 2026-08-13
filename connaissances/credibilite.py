"""Grille de crédibilité par signaux d'indexation (spec §6, annexe B §2).
Jamais un score opaque : des signaux binaires vérifiables, fail-closed."""
import json, os, urllib.request, urllib.parse
from dataclasses import dataclass, asdict
from pathlib import Path

_AGENT_UTILISATEUR_DEFAUT = "cadence-connaissances/1 (contact via repo)"


def _user_agent():
    """User-Agent partagé par tout le sous-système (credibilite, decouverte
    via credibilite._requeter, boucle) : quand `CONNAISSANCES_CONTACT` est
    défini dans l'environnement, identifie l'appelant via `mailto:` — le
    « polite pool » d'OpenAlex/Crossref (moins de throttling) est réservé aux
    appelants identifiés (M6, revue finale). Une vague de 240+ requêtes sans
    identification risque le 429, et le fail-closed de `_requeter` transforme
    alors un throttling en simple `None` (source légitime dégradée en
    silence). Sans la variable : comportement historique inchangé."""
    contact = os.environ.get("CONNAISSANCES_CONTACT")
    if contact:
        return f"cadence-connaissances/1 (mailto:{contact})"
    return _AGENT_UTILISATEUR_DEFAUT

@dataclass
class Signaux:
    doi_resolu: bool = False
    dans_pmc: bool = False
    dans_doaj: bool = False
    fiche_openalex: bool = False
    liste_blanche: bool = False
    def json(self):
        return json.dumps(asdict(self), ensure_ascii=False)

def _requeter(url):
    """GET JSON ; None sur toute erreur (fail-closed)."""
    try:
        with urllib.request.urlopen(urllib.request.Request(
                url, headers={"User-Agent": _user_agent()}), timeout=20) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except Exception:
        return None

def charger_liste_blanche(chemin=Path(__file__).parent / "liste-blanche.md"):
    domaines = set()
    try:
        texte = Path(chemin).read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return domaines  # fail-closed : liste blanche vide plutôt qu'exception
    for ligne in texte.splitlines():
        ligne = ligne.split("#", 1)[0].strip()
        if ligne:
            domaines.add(ligne.lower())
    return domaines

def evaluer(meta, requeteur=_requeter):
    s = Signaux()
    hote = urllib.parse.urlparse(meta.get("url") or "").hostname or ""
    hote = hote.lower().removeprefix("www.")
    s.liste_blanche = hote in charger_liste_blanche()
    s.dans_pmc = "pmc.ncbi.nlm.nih.gov" in hote  # URL PMC = présence PMC directe
    doi = meta.get("doi")
    if doi:
        s.doi_resolu = requeteur("https://api.crossref.org/works/" + urllib.parse.quote(doi, safe="")) is not None
        oa = requeteur("https://api.openalex.org/works/doi:" + urllib.parse.quote(doi, safe=""))
        s.fiche_openalex = bool(oa and oa.get("id"))
        if not s.dans_pmc:
            ep = requeteur("https://www.ebi.ac.uk/europepmc/webservices/rest/search?"
                           + urllib.parse.urlencode({"query": f'DOI:"{doi}"', "format": "json"}))
            s.dans_pmc = bool(ep and (ep.get("hitCount") or 0) > 0)
        dj = requeteur("https://doaj.org/api/search/articles/" + urllib.parse.quote(f'doi:"{doi}"'))
        s.dans_doaj = bool(dj and (dj.get("total") or 0) > 0)
    return s

def statut_pour(s):
    if s.doi_resolu and (s.dans_pmc or s.dans_doaj or s.fiche_openalex):
        return "auto_admise"
    return "en_attente"   # liste blanche comme inconnu : l'humain tranche
