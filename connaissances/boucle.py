"""La boucle de collecte : orchestre découverte, téléchargement, extraction,
crédibilité et fichage sous plafonds durs (spec 4 §6). C'est la tâche
d'assemblage : elle appelle tel quel tout ce que les tâches précédentes
produisent, sans en réimplémenter la logique.

Pattern : plan → chercher → lire → évaluer → extraire → indexer, mode
« planning-only » (aucune interaction) — l'arrêt est TOUJOURS un plafond dur
(sources acceptées, rejets consécutifs, budget d'appels LLM), jamais
« jusqu'à exhaustivité ».
"""
import argparse
import re
import sqlite3
import tempfile
import unicodedata
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import credibilite, db, decouverte, extraction, fichage, llm, registre

_HOTES_VIDEO = {"youtube.com", "youtu.be"}

# Longueur minimale (caractères, texte normalisé) du texte extrait pour
# tenter un fichage (M5, revue finale) : en dessous, `trafilatura.extract`
# n'a probablement pas su traiter la page (page dynamique, paywall, format
# inhabituel) plutôt qu'elle ne contienne vraiment que ça — le candidat part
# en file_ingestion pour être retraité autrement, sans dépenser d'appel LLM.
_LONGUEUR_MIN_TEXTE = 400

# Fenêtre de nouveauté (I3, revue finale) : en mode hebdo, ne redemande que
# les publications des 180 derniers jours — sans quoi une requête de veille
# constante renvoie les 10 mêmes résultats à chaque passage et l'hebdo
# s'épuise en 2-3 semaines (no-op silencieux).
_FENETRE_NOUVEAUTE_JOURS = 180

# Porte de PERTINENCE (I4, revue finale) : MÉCANIQUE, avant toute dépense
# réseau/LLM. Incident réel motivant cette porte : un article de physique des
# particules a été admis `auto_admise` sur un chevauchement lexical fortuit
# (« polarized distribution ») avec une requête course — la grille de
# crédibilité (credibilite.py) juge le SÉRIEUX d'une source, jamais son
# SUJET. Le titre du candidat (métadonnée de découverte, déjà disponible
# sans téléchargement) doit contenir au moins un terme du domaine ciblé,
# comparaison insensible à la casse et aux accents. Domaine 'general' : tout
# passe (vulgarisation transverse, aucun terme n'est requis ni pertinent).
#
# Correction de revue (Important, post pré-vague) : la comparaison se fait
# par FRONTIÈRES DE MOTS (`_pertinent`), jamais en sous-chaîne libre — un
# `terme in titre` non borné produisait des faux positifs fréquents dans des
# titres académiques : 'run' matchait 'prune'/'shrunk'/'trunk', 'ring'
# matchait 'during'/'monitoring'/'measuring', 'mma' matchait
# 'grammar'/'programmatic', 'repos' matchait 'repository'. Un faux positif
# ici devient une source AUTO-ADMISE sans revue humaine (un candidat
# OpenAlex/EPMC a quasi toujours DOI + fiche) : exactement le trou que la
# porte devait fermer. Les frontières de mots seules ne suffisent pas
# toujours : « course » reste piégé même borné (« disease course », « course
# of treatment » sont des mots anglais entiers hors sujet) — ce terme est
# donc remplacé par le groupe « course à pied », pas seulement borné. Règle
# du corpus : jamais un terme qui soit aussi un mot anglais courant hors
# sujet (« ring », « mma », « repos » ont été retirés pour cette raison —
# et « boxe » l'a été à son tour : pluralisé, il donne « boxes », qui
# percute l'anglais « boxes » — cartons, « bounding boxes » en vision par
# ordinateur, « sandboxes »… — boxing/boxeur/boxeuse/combat/… suffisent).
#
# Correctif (vague, tranche 3) : bug réel révélé par relecture des titres
# rejetés — « …experienced runners: a systematic review » était rejeté sur
# le domaine course, car `\brunner\b` ne matche PAS « runners » (le `\b`
# final échoue devant le « s ») : les frontières de mots avaient tué les
# pluriels. `_pertinent` accepte donc un « s » final optionnel après chaque
# terme — pluriel simple anglais/français, suffisant pour les listes
# ci-dessous. LIMITE DOCUMENTÉE : ne couvre pas les pluriels irréguliers
# (« injury » -> « injuries », « punch » -> « punches ») ; un faux négatif
# occasionnel (candidat légitime raté) est préférable à la complexité d'un
# lemmatiseur pour ce filtre gratuit.
PERTINENCE = {
    "course": [
        "run", "running", "runner", "course a pied", "coureur", "coureuse",
        "marathon", "semi-marathon", "trail", "endurance", "injury",
        "blessure", "cadence", "gait", "foulee", "footstrike",
        # Termes multi-mots de la science de l'entraînement, sans mot-sport
        # isolé (précis par construction) — récupèrent des titres légitimes
        # du type « High-intensity or high-volume training? ».
        "interval training", "high-intensity", "endurance training",
        "aerobic", "high-volume training",
    ],
    "boxe": [
        "boxing", "boxeur", "boxeuse", "combat", "striking",
        "fight", "fighter", "punch", "sparring", "mixed martial arts",
    ],
    "recuperation": [
        "sleep", "sommeil", "recovery", "recuperation", "hrv",
        "heart rate variability", "fatigue", "charge", "training load",
        "surentrainement", "overtraining",
    ],
    "general": [],  # aucun terme requis : tout passe (spec §5, pages liste blanche)
}


def _normaliser_pour_pertinence(t):
    """Casse + accents neutralisés (NFKD, diacritiques retirés) pour une
    comparaison robuste aux variantes orthographiques (foulée/foulee)."""
    nfkd = unicodedata.normalize("NFKD", t)
    sans_accents = "".join(c for c in nfkd if not unicodedata.combining(c))
    return sans_accents.lower()


def _pertinent(titre, domaine):
    """True si le candidat mérite une dépense (réseau/LLM) pour ce domaine.

    Domaine 'general' (ou inconnu) : toujours pertinent. Autre domaine sans
    titre exploitable : rejeté (fail-closed — aucune métadonnée ne permet de
    juger, comme le reste du sous-système). Comparaison par FRONTIÈRES DE
    MOTS (`\\bterme s?\\b`, jamais une sous-chaîne libre — cf. commentaire
    de PERTINENCE) ; les termes multi-mots (espace interne, ex. 'heart rate
    variability') restent bornés : `\\b` s'applique aussi à leurs deux
    extrémités. Le « s » final optionnel couvre le pluriel simple
    (anglais/français) — pas les pluriels irréguliers (limite documentée
    au-dessus de PERTINENCE)."""
    termes = PERTINENCE.get(domaine, [])
    if not termes:
        return True
    if not titre:
        return False
    titre_norm = _normaliser_pour_pertinence(titre)
    return any(
        re.search(r"\b" + re.escape(_normaliser_pour_pertinence(t)) + r"s?\b", titre_norm)
        for t in termes
    )


@dataclass
class Bilan:
    acceptees: int = 0
    rejetees: int = 0
    en_file: int = 0
    deja_vues: int = 0
    sautees: int = 0  # adaptateur LLM indisponible (échec transitoire) — cf. LlmIndisponible
    appels_llm: int = 0


def _telecharger(url):
    """GET brut : bytes du corps, None sur toute erreur (fail-closed).
    User-Agent partagé avec credibilite._requeter (credibilite._user_agent,
    M6 — mailto: quand CONNAISSANCES_CONTACT est défini), timeout 30 s."""
    try:
        with urllib.request.urlopen(
            urllib.request.Request(url, headers={"User-Agent": credibilite._user_agent()}),
            timeout=30,
        ) as r:
            return r.read()
    except Exception:
        return None


def _est_pdf(url, contenu):
    """PDF si l'URL se termine en .pdf OU si le contenu porte la signature
    magique %PDF en tête. L'interface bytes|None de _telecharger ne permet
    pas d'exposer un Content-Type HTTP ; la signature magique en tient lieu
    (et sniffe le contenu réel plutôt qu'un en-tête potentiellement erroné)."""
    return url.lower().endswith(".pdf") or contenu[:4] == b"%PDF"


def _est_video(url):
    """Vidéo si l'hôte est youtube.com ou youtu.be (spec §6)."""
    hote = (urllib.parse.urlparse(url).hostname or "").lower().removeprefix("www.")
    return hote in _HOTES_VIDEO


def _rassembler_candidats(mode, requeteur):
    """Candidats de la passe : requêtes de veille packagées (`veille.json`,
    tâche 8) réparties openalex/epmc + pages racines de la liste blanche en
    mode 'hebdo' seulement (la vague initiale part des 15 cibles vérifiées de
    l'annexe C, hors périmètre de cette boucle — spec §6).

    Retourne des paires (candidat, requete_source) : la provenance sert de
    trace lisible dans le registre de couverture.

    I3 (revue finale) : en mode 'hebdo', restreint aux publications des
    `_FENETRE_NOUVEAUTE_JOURS` derniers jours (sans quoi une requête
    constante renvoie les mêmes résultats à chaque passage) ; en mode
    'vague', aucune fenêtre — la vague initiale part large."""
    depuis = None
    if mode == "hebdo":
        depuis = (datetime.now(timezone.utc) - timedelta(days=_FENETRE_NOUVEAUTE_JOURS)).strftime("%Y-%m-%d")
    paires = []
    for entree in decouverte.charger_veille():
        chercher = (decouverte.chercher_openalex if entree["api"] == "openalex"
                    else decouverte.chercher_epmc)
        requete_source = f"{entree['api']}:{entree['domaine']}"
        for c in chercher(entree["requete"], entree["domaine"], requeteur=requeteur, depuis=depuis):
            paires.append((c, requete_source))
    if mode == "hebdo":
        for c in decouverte.pages_liste_blanche():
            paires.append((c, "liste_blanche"))
    return paires


def _mettre_en_file(conn, candidat, type_):
    """INSERT file_ingestion, idempotent (URL déjà présente -> no-op) : le
    registre est la garde réelle contre le retraitement, ceci n'est qu'un
    filet défensif."""
    conn.execute(
        "INSERT INTO file_ingestion(url,type,domaine,decouvert_le) VALUES(?,?,?,?) "
        "ON CONFLICT(url) DO NOTHING",
        (candidat.url, type_, candidat.domaine, datetime.now(timezone.utc).isoformat()))
    conn.commit()


def _log(url, verdict, n_fiches=None):
    """Une ligne par candidat : URL + verdict (+ nombre de fiches le cas
    échéant). JAMAIS le contenu des documents ni des fiches."""
    if n_fiches is not None:
        print(f"{url} {verdict} ({n_fiches} fiche(s))")
    else:
        print(f"{url} {verdict}")


def executer(conn, mode, plafond_sources, budget_appels, rejets_consecutifs_max=3,
             telecharger=_telecharger, appeler=llm.appeler, requeteur=None):
    """Exécute une passe de collecte plafonnée (spec §6).

    Arrêt : `plafond_sources` sources acceptées OU `rejets_consecutifs_max`
    rejets d'affilée OU `budget_appels` épuisé. Le budget est vérifié AVANT
    chaque fichage (pas avant téléchargement/extraction/crédibilité) : s'il
    reste au moins 1 appel, on tente encore, même si le fichage peut en
    consommer 2 (relance corrective) — un léger dépassement possible du
    budget est le choix documenté plutôt qu'un arrêt à mi-fichage.

    `requeteur=None` retombe sur le requêteur par défaut partagé par
    `credibilite` et `decouverte` (`credibilite._requeter`).
    """
    requeteur = requeteur or credibilite._requeter
    bilan = Bilan()
    rejets_consecutifs = 0

    def appeler_compte(prompt, timeout=300):
        bilan.appels_llm += 1
        return appeler(prompt, timeout=timeout)

    for candidat, requete_source in _rassembler_candidats(mode, requeteur):
        if bilan.acceptees >= plafond_sources or rejets_consecutifs >= rejets_consecutifs_max:
            break

        url = candidat.url
        if registre.deja_traite(conn, url):
            bilan.deja_vues += 1
            _log(url, "deja_vu")
            continue

        if not _pertinent(candidat.titre, candidat.domaine):
            # I4 : tri gratuit (aucun réseau, aucun LLM) — PAS un rejet de
            # qualité du pipeline. Ne pas incrémenter rejets_consecutifs ici
            # est un choix documenté : un domaine bruyant peut légitimement
            # enchaîner plusieurs candidats hors sujet sans que ça signale un
            # problème de fichage (ce que rejets_consecutifs_max surveille).
            registre.enregistrer(conn, url, None, requete_source, "rejete")
            bilan.rejetees += 1
            _log(url, "rejete (pertinence)")
            continue

        contenu = telecharger(url)
        if contenu is None:
            registre.enregistrer(conn, url, None, requete_source, "rejete")
            rejets_consecutifs += 1
            bilan.rejetees += 1
            _log(url, "rejete (telechargement)")
            continue

        pdf = _est_pdf(url, contenu)
        video = _est_video(url)

        if (pdf or video) and mode == "hebdo":
            _mettre_en_file(conn, candidat, "pdf" if pdf else "video")
            registre.enregistrer(conn, url, None, requete_source, "file_ingestion")
            bilan.en_file += 1
            _log(url, "file_ingestion")
            continue

        if pdf or video:
            # Mode 'vague' : tenter l'extraction lourde (atelier PC).
            try:
                if pdf:
                    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
                        f.write(contenu)
                        chemin_tmp = Path(f.name)
                    try:
                        document = extraction.extraire_pdf(chemin_tmp)
                    finally:
                        chemin_tmp.unlink(missing_ok=True)
                else:
                    document = extraction.extraire_youtube(url)
            except extraction.ExtractionIndisponible:
                # Dépendances lourdes absentes (cas NAS) : même traitement
                # que hebdo -> file_ingestion pour l'atelier PC.
                _mettre_en_file(conn, candidat, "pdf" if pdf else "video")
                registre.enregistrer(conn, url, None, requete_source, "file_ingestion")
                bilan.en_file += 1
                _log(url, "file_ingestion (extraction indisponible)")
                continue
        else:
            # I2 (revue finale) : octets bruts, jamais décodés en dur ici —
            # trafilatura détecte l'encodage réel (cp1252/ISO-8859-1 compris)
            # lui-même. Un decode("utf-8","replace") prématuré gravait des
            # U+FFFD dans le texte AVANT extraction, et le validateur
            # comparait ensuite l'extrait à ce texte déjà corrompu.
            document = extraction.extraire_html(contenu, url)

        if len(extraction.normaliser_espaces(document.texte)) < _LONGUEUR_MIN_TEXTE:
            # M5 (revue finale) : `trafilatura.extract` renvoie parfois ""
            # (ou quasi) sur une page qu'il ne sait pas traiter — sans cette
            # garde, le candidat partait en fichage (2 appels LLM perdus,
            # rejet quasi certain), et 3 pages pauvres d'affilée déclenchent
            # l'arrêt par rejets_consecutifs. Comme la pertinence (I4), c'est
            # un tri gratuit, pas un échec de qualité : file_ingestion plutôt
            # que rejet, aucun appel LLM, rejets_consecutifs inchangé — la
            # page pourra être re-traitée autrement (atelier PC, extracteur
            # différent).
            _mettre_en_file(conn, candidat, "pdf" if pdf else ("video" if video else "html"))
            registre.enregistrer(conn, url, None, requete_source, "file_ingestion")
            bilan.en_file += 1
            _log(url, "file_ingestion (texte extrait trop court)")
            continue

        hash_ = extraction.hash_contenu(document.texte)
        if registre.deja_vu_hash(conn, hash_):
            # Doublon de contenu (même texte via une autre URL) : documenté
            # dans le registre comme 'rejete' (motif doublon) mais compté
            # côté bilan comme déjà-vu, pas comme rejet qualité.
            registre.enregistrer(conn, url, hash_, requete_source, "rejete")
            bilan.deja_vues += 1
            _log(url, "deja_vu (doublon de contenu)")
            continue

        titre = candidat.titre or document.titre or url
        meta = {
            "titre": titre, "url": url, "doi": candidat.doi,
            "type": candidat.type_suggere, "domaine": candidat.domaine,
            "annee": candidat.annee,
        }
        signaux = credibilite.evaluer(meta, requeteur=requeteur)
        statut = credibilite.statut_pour(signaux)

        if bilan.appels_llm >= budget_appels:
            _log(url, "arret (budget d'appels epuise)")
            break

        try:
            fiches = fichage.ficher(document, meta, appeler=appeler_compte)
        except llm.LlmIndisponible:
            # Incident réel (vague, tranche 1) : un échec TRANSITOIRE de
            # l'adaptateur (code retour non-zéro ou timeout, le CLI restant
            # sain par ailleurs) tuait tout le run par exception non
            # rattrapée — traceback, pas de --pousser, journal perdu. Sur
            # une vague de 100+ appels, ça se reproduira à coup sûr.
            # DISTINCT d'un FichageInvalide : ici le contenu n'a jamais pu
            # être évalué, donc PAS d'entrée registre — le candidat doit
            # rester retentable au passage suivant, pas définitivement
            # écarté. rejets_consecutifs compte quand même : trois échecs
            # d'adaptateur d'affilée signifient que le CLI est réellement en
            # panne (pas un accident isolé) -> le disjoncteur existant
            # arrête PROPREMENT la passe (Bilan retourné, pas d'exception),
            # et en mode combiné l'atelier peut enchaîner sur --pousser.
            rejets_consecutifs += 1
            bilan.sautees += 1
            _log(url, "saute (adaptateur indisponible)")
            continue
        except fichage.FichageInvalide:
            registre.enregistrer(conn, url, hash_, requete_source, "rejete")
            rejets_consecutifs += 1
            bilan.rejetees += 1
            _log(url, "rejete (fichage invalide)")
            continue

        maintenant = datetime.now(timezone.utc).isoformat()
        type_source = "video" if video else candidat.type_suggere
        try:
            curseur = conn.execute(
                "INSERT INTO sources(type,titre,auteurs,annee,url,doi,domaine,licence,"
                "signaux_credibilite,statut,hash_contenu,ajoute_le) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                (type_source, titre, ", ".join(candidat.auteurs) if candidat.auteurs else None,
                 candidat.annee, url, candidat.doi, candidat.domaine, None,
                 signaux.json(), statut, hash_, maintenant))
        except sqlite3.IntegrityError:
            # Ceinture-et-bretelles (revue finale C1) : couvre une base déjà
            # dans l'état incohérent d'un run pré-correctif (source insérée,
            # registre jamais écrit car le process est mort entre les deux
            # commits). Plutôt que de laisser l'IntegrityError remonter et
            # arrêter toute la boucle, on rattrape le registre (motif :
            # doublon sur sources.url) et on passe au candidat suivant.
            registre.enregistrer(conn, url, hash_, requete_source, "accepte")
            bilan.acceptees += 1
            rejets_consecutifs = 0
            _log(url, "accepte (doublon sources, registre rattrape)")
            continue
        source_id = curseur.lastrowid
        for f in fiches:
            conn.execute(
                "INSERT INTO fiches(source_id,affirmation,extrait_verbatim,localisation,"
                "incertitude,maj_le) VALUES(?,?,?,?,?,?)",
                (source_id, f["affirmation"], f["extrait_verbatim"], f["localisation"],
                 f["incertitude"], maintenant))

        # Revue finale C1 : registre.enregistrer committe lui-même. En
        # l'appelant AVANT le commit ci-dessous, les trois écritures (source,
        # fiches, registre) tombent dans la MÊME transaction — plus de fenêtre
        # où la source existe sans que le registre le sache. Le conn.commit()
        # qui suit devient un no-op volontaire (rien à committer), conservé
        # pour la lisibilité du flux plutôt que retiré.
        registre.enregistrer(conn, url, hash_, requete_source, "accepte")
        conn.commit()
        bilan.acceptees += 1
        rejets_consecutifs = 0
        _log(url, "accepte", len(fiches))

    return bilan


def _main():
    ap = argparse.ArgumentParser(description="Boucle de collecte de connaissances (spec 4 §6).")
    ap.add_argument("--mode", choices=["hebdo", "vague"], required=True)
    ap.add_argument("--plafond", type=int, required=True, dest="plafond_sources")
    ap.add_argument("--budget", type=int, required=True, dest="budget_appels")
    ap.add_argument("--db", required=True, dest="chemin_db")
    args = ap.parse_args()
    conn = db.ouvrir(args.chemin_db)
    try:
        bilan = executer(conn, args.mode, args.plafond_sources, args.budget_appels)
        print(f"Bilan : {bilan.acceptees} acceptées, {bilan.rejetees} rejetées, "
              f"{bilan.en_file} en file, {bilan.deja_vues} déjà vues, "
              f"{bilan.sautees} sautées (adaptateur indisponible), "
              f"{bilan.appels_llm} appels LLM.")
    finally:
        conn.close()


if __name__ == "__main__":
    _main()
