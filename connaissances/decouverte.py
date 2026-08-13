"""Découverte de candidats à ficher (spec §5) : deux APIs académiques en
accès ouvert (OpenAlex, Europe PMC) + la liste blanche de vulgarisateurs
(tâche 3). Même pattern de requêteur injectable que `credibilite._requeter` :
`requeteur(url) -> dict | None`, `None` = erreur réseau, fail-closed —
un échec produit une liste de candidats VIDE, jamais une exception qui
remonte."""
import json
import urllib.parse
from dataclasses import dataclass
from pathlib import Path

from .credibilite import _requeter, charger_liste_blanche


@dataclass
class Candidat:
    url: str
    titre: str | None
    doi: str | None
    annee: int | None
    auteurs: list[str]
    type_suggere: str
    domaine: str


def _nettoyer_doi(doi):
    """Retire le préfixe https://doi.org/ pour ne garder que l'identifiant nu.
    None si le champ est absent de la réponse d'API (jamais d'exception)."""
    if not doi:
        return None
    return doi.removeprefix("https://doi.org/")


def chercher_openalex(requete, domaine, requeteur=_requeter, depuis=None):
    """Interroge OpenAlex (works, filtre is_oa:true) -> list[Candidat].

    `depuis` (AAAA-MM-JJ, optionnel) ajoute un tri par date de publication
    décroissante et restreint aux publications depuis cette date (I3, revue
    finale) : sans fenêtre, une requête constante renvoie les 10 mêmes
    résultats à chaque passage et la veille hebdomadaire s'épuise en 2-3
    semaines (no-op silencieux). `None` (défaut, mode 'vague') : comportement
    historique inchangé.

    Échec réseau (requeteur -> None) ou réponse sans clé 'results' exploitable
    -> liste vide (fail-closed, jamais d'exception)."""
    filtre = "is_oa:true"
    tri = ""
    if depuis:
        filtre += f",from_publication_date:{depuis}"
        tri = "&sort=publication_date:desc"
    url = ("https://api.openalex.org/works?search=" + urllib.parse.quote(requete)
           + "&filter=" + filtre + tri + "&per-page=10")
    rep = requeteur(url)
    if not rep:
        return []
    candidats = []
    for r in rep.get("results") or []:
        doi = _nettoyer_doi(r.get("doi"))
        loc = r.get("primary_location") or {}
        # repli : pas de landing page directe -> l'URL du DOI fait office de page
        url_candidat = loc.get("landing_page_url") or (
            "https://doi.org/" + doi if doi else None)
        if not url_candidat:
            continue  # ni landing page ni DOI : rien d'exploitable pour ce résultat
        auteurs = [
            nom for a in (r.get("authorships") or [])
            if (nom := (a.get("author") or {}).get("display_name"))
        ]
        candidats.append(Candidat(
            url=url_candidat,
            titre=r.get("title"),
            doi=doi,
            annee=r.get("publication_year"),
            auteurs=auteurs,
            type_suggere="etude",
            domaine=domaine,
        ))
    return candidats


def chercher_epmc(requete, domaine, requeteur=_requeter, depuis=None):
    """Interroge Europe PMC (search, filtre OPEN_ACCESS:Y) -> list[Candidat].

    `depuis` (AAAA-MM-JJ, optionnel, mode 'hebdo') restreint aux publications
    depuis cette date ET trie par date décroissante — c'est le besoin de
    NOUVEAUTÉ de la veille hebdomadaire (I3, revue finale). `None` (défaut,
    mode 'vague') : tri par PERTINENCE d'Europe PMC — constaté en vague
    réelle (2026-08-13) : le tri par récence inconditionnel faisait remonter
    la médecine clinique fraîche hors sujet au lieu des références du
    domaine, affamant la récupération. Chaque mode a son tri.

    Échec réseau (requeteur -> None) ou réponse sans resultList.result
    exploitable -> liste vide (fail-closed, jamais d'exception)."""
    q = requete
    tri = ""
    if depuis:
        q += f" AND (FIRST_PDATE:[{depuis} TO *])"
        tri = "&sort=P_PDATE_D%20desc"
    url = ("https://www.ebi.ac.uk/europepmc/webservices/rest/search?query="
           + urllib.parse.quote(q) + "%20AND%20OPEN_ACCESS:Y&format=json&pageSize=10"
           + tri)
    rep = requeteur(url)
    if not rep:
        return []
    resultats = (rep.get("resultList") or {}).get("result") or []
    candidats = []
    for r in resultats:
        doi = _nettoyer_doi(r.get("doi"))
        pmcid = r.get("pmcid")
        if pmcid:
            url_candidat = f"https://pmc.ncbi.nlm.nih.gov/articles/{pmcid}/"
        elif doi:
            url_candidat = "https://doi.org/" + doi
        else:
            continue  # ni pmcid ni doi : rien d'exploitable pour ce résultat
        annee = r.get("pubYear")
        auteurs = [a.strip() for a in (r.get("authorString") or "").split(",") if a.strip()]
        candidats.append(Candidat(
            url=url_candidat,
            titre=r.get("title"),
            doi=doi,
            annee=int(annee) if annee else None,
            auteurs=auteurs,
            type_suggere="etude",
            domaine=domaine,
        ))
    return candidats


def pages_liste_blanche():
    """Une page racine par domaine de la liste blanche (tâche 3) -> Candidat
    de type 'vulgarisation', domaine 'general' (pas un domaine d'entraînement,
    ce sont des sites entiers plutôt que des résultats de recherche ciblés)."""
    return [
        Candidat(
            url=f"https://{domaine}/",
            titre=None,
            doi=None,
            annee=None,
            auteurs=[],
            type_suggere="vulgarisation",
            domaine="general",
        )
        for domaine in sorted(charger_liste_blanche())
    ]


def charger_veille(chemin=Path(__file__).parent / "veille.json"):
    """Lit `connaissances/veille.json` : les requêtes de veille packagées
    (course/boxe/récupération, réparties openalex/epmc)."""
    return json.loads(Path(chemin).read_text(encoding="utf-8"))
