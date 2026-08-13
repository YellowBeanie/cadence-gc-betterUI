"""Recherche dans la base de connaissances : FTS5 + expansion/reclassement
optionnels via le CLI LLM (spec 4 §7). C'est le point de sortie du socle :
la fonction que les futurs projets (suggestions N2, page /recherche)
brancheront.

Pipeline : expansion (le CLI ajoute des termes FR/EN) -> requête FTS5 `OR`
sur la requête + ces termes (20 candidats, classés BM25 via `ORDER BY rank`)
-> reclassement (le CLI réordonne les candidats). Chaque étape LLM est
indépendante et dégrade en SILENCE vers l'ordre BM25 en cas d'erreur
(LlmIndisponible, JSON illisible, format inattendu) : jamais d'exception qui
remonte à l'appelant. `appeler=None` fait tourner la recherche en mode
dégradé hors ligne, FTS5 seul, sans aucun appel LLM.

Seules les sources `auto_admise`/`validee` sont interrogées : une fiche
`en_attente` ou `rejetee` ne sort jamais de `rechercher`, même si son texte
correspond à la requête.
"""
import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

from . import db, llm

_CONTRAT = (Path(__file__).parent / "prompt-recherche.md").read_text(encoding="utf-8")
_MAX_TERMES_EXPANSION = 8
_N_CANDIDATS = 20


@dataclass
class Resultat:
    fiche_id: int
    affirmation: str
    extrait_verbatim: str
    localisation: str
    incertitude: str
    titre_source: str
    auteurs: str
    annee: int
    url: str
    doi: str
    type_source: str
    statut_source: str


def _extraire_json(texte):
    """Extrait le premier objet JSON valide d'une réponse LLM, ignore tout
    texte parasite avant/après (même stratégie que fichage._extraire_json)."""
    idx = texte.find("{")
    if idx == -1:
        return None
    try:
        obj, _ = json.JSONDecoder().raw_decode(texte, idx=idx)
        return obj
    except json.JSONDecodeError:
        return None


def _echapper_fts5(terme):
    """Neutralise les opérateurs FTS5 (AND, OR, NOT, -, *, colonnes…) en
    citant le terme comme une phrase entre guillemets ; double les guillemets
    internes (échappement standard FTS5)."""
    return '"' + terme.replace('"', '""') + '"'


def _expansion(requete, appeler):
    """Termes d'expansion FR/EN renvoyés par le CLI (≤ 8, cf. contrat).
    `appeler=None` ou toute erreur (exception, JSON illisible, format
    inattendu) dégrade en silence vers une liste vide (pas d'expansion)."""
    if appeler is None:
        return []
    prompt = _CONTRAT + "\n\n## Requête (action : EXPANSION)\n" + requete
    try:
        brut = appeler(prompt)
    except Exception:
        return []
    data = _extraire_json(brut)
    if not isinstance(data, dict):
        return []
    termes = data.get("termes")
    if not isinstance(termes, list):
        return []
    termes = [t for t in termes if isinstance(t, str) and t.strip()]
    return termes[:_MAX_TERMES_EXPANSION]


def _chercher_fts(conn, requete, termes):
    """Requête FTS5 `OR` sur la requête + les termes d'expansion (chacun
    échappé), restreinte aux sources `auto_admise`/`validee`, top 20
    candidats classés BM25 (`ORDER BY rank`).

    Revue finale I1 : la requête complète est UNE clause parmi d'autres,
    pas la seule. Sans les jetons individuels (`mots`), toute requête de
    plus d'un mot était traitée comme une phrase FTS5 exacte — en mode
    dégradé (`appeler=None`, pas de termes d'expansion), une question en
    langage naturel ne remontait alors jamais aucun résultat."""
    mots = [m for m in requete.split() if m]
    match = " OR ".join(_echapper_fts5(t) for t in [requete, *mots, *termes])
    lignes = conn.execute(
        "SELECT f.id, f.affirmation, f.extrait_verbatim, f.localisation, f.incertitude, "
        "s.titre, s.auteurs, s.annee, s.url, s.doi, s.type, s.statut "
        "FROM fiches_fts "
        "JOIN fiches f ON f.id = fiches_fts.rowid "
        "JOIN sources s ON s.id = f.source_id "
        "WHERE fiches_fts MATCH ? AND s.statut IN ('auto_admise','validee') "
        "ORDER BY rank LIMIT ?",
        (match, _N_CANDIDATS)).fetchall()
    return [Resultat(*ligne) for ligne in lignes]


def _reclassement(requete, candidats, appeler):
    """Ordre de fiche_id renvoyé par le CLI, ou None si dégradé (pas
    d'appeler, aucun candidat, exception, JSON illisible, format inattendu)."""
    if appeler is None or not candidats:
        return None
    serialises = [
        {"fiche_id": c.fiche_id, "affirmation": c.affirmation,
         "extrait_verbatim": c.extrait_verbatim, "titre_source": c.titre_source}
        for c in candidats
    ]
    prompt = (_CONTRAT + "\n\n## Requête (action : RECLASSEMENT)\n" + requete +
              "\n\n## Candidats\n" + json.dumps(serialises, ensure_ascii=False))
    try:
        brut = appeler(prompt)
    except Exception:
        return None
    data = _extraire_json(brut)
    if not isinstance(data, dict):
        return None
    ordre = data.get("ordre")
    if not isinstance(ordre, list):
        return None
    return ordre


def _trier_selon_ordre(candidats, ordre):
    """Trie les candidats selon `ordre` : les fiche_id inventés (absents des
    candidats) sont ignorés ; les candidats absents de `ordre` sont ajoutés à
    la suite, dans leur ordre BM25 d'origine."""
    par_id = {c.fiche_id: c for c in candidats}
    vus = set()
    resultat = []
    for fid in ordre:
        if fid in par_id and fid not in vus:
            resultat.append(par_id[fid])
            vus.add(fid)
    for c in candidats:
        if c.fiche_id not in vus:
            resultat.append(c)
    return resultat


def rechercher(conn, requete, n=10, appeler=llm.appeler):
    """Recherche dans la base de connaissances (spec 4 §7).

    `appeler=None` : mode dégradé hors ligne, FTS5 seul (pas d'expansion ni
    de reclassement, pas d'appel LLM). Sinon, expansion puis reclassement
    sont tentés indépendamment ; toute erreur LLM sur l'une ou l'autre étape
    dégrade silencieusement cette étape vers son comportement de repli,
    jamais d'exception qui remonte à l'appelant."""
    termes = _expansion(requete, appeler)
    candidats = _chercher_fts(conn, requete, termes)
    ordre = _reclassement(requete, candidats, appeler)
    resultats = _trier_selon_ordre(candidats, ordre) if ordre is not None else candidats
    return resultats[:n]


def _afficher(resultats):
    if not resultats:
        print("Aucun résultat.")
        return
    for i, r in enumerate(resultats, 1):
        auteurs = r.auteurs or "auteur inconnu"
        annee = r.annee if r.annee is not None else "année inconnue"
        print(f"{i}. {r.affirmation}")
        print(f"   « {r.extrait_verbatim} »")
        print(f"   — {r.titre_source} — {auteurs}, {annee} — {r.url}")
        print(f"   Incertitude : {r.incertitude} (source {r.statut_source})")
        print()


def _main():
    # Bug réel trouvé en prod (tâche 13, pilote atelier PC) : sur Windows,
    # sys.stdout hérite par défaut de la page de code de la console (cp1252
    # constaté) — un extrait scientifique ordinaire (signe "≤", minus
    # Unicode…) fait planter l'affichage APRÈS une recherche pourtant
    # réussie. Reconfiguration en UTF-8, sans effet sur le NAS/Linux où
    # stdout est déjà UTF-8.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    ap = argparse.ArgumentParser(
        description="Recherche dans la base de connaissances (spec 4 §7).")
    ap.add_argument("--db", required=True, dest="chemin_db")
    ap.add_argument("requete")
    ap.add_argument("--n", type=int, default=10)
    args = ap.parse_args()
    conn = db.ouvrir(args.chemin_db)
    try:
        _afficher(rechercher(conn, args.requete, n=args.n))
    finally:
        conn.close()


if __name__ == "__main__":
    _main()
