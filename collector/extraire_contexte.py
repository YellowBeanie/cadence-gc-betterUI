#!/usr/bin/env python3
"""Extrait un contexte JSON compact pour l'analyste Claude (tâche 16).

Lit UNIQUEMENT en lecture seule (`mode=ro`) :
  - l'instantané Garmin  : ${GARMIN_DATA_DIR}/export/garmin-ro.db
  - la base de l'app     : ${GARMIN_DATA_DIR}/training.db

N'écrit jamais rien : ce script imprime son JSON sur stdout, c'est
`analyse.sh` qui le redirige vers un fichier temporaire avant de le passer
en entrée à `claude -p`. Aucune table n'est possédée par ce script — même
règle que le reste du collector (« un propriétaire par fichier »).

Fenêtre : 14 derniers jours pour l'historique (readiness, HRV, sommeil,
charge, activités, saisies), 7 jours à venir pour le plan prescrit
(`workout_schedule`). Pas de trackpoints ni de splits : le contexte doit
rester compact pour un modèle `haiku` en usage quotidien.

Tâche 41 (rapport qualité B2, §A.9) : la loi mesurée est que tout calcul
laissé au modèle (comparer une valeur à une plage, comparer deux jours,
compter des activités) échoue ~50 % du temps, alors qu'une valeur ou un
verdict précalculé en Python est cité correctement 100 % du temps. Les
champs `position`, `position_vs_chronique`, `changements_depuis_la_veille`,
`activites_de_la_fenetre_count` et `glossaire` ci-dessous déplacent ces
calculs ici — le contrat (`prompt-analyse.md`) interdit désormais au modèle
de les refaire lui-même.

Tâche 42 (rapport qualité B2, §A.6/§B.2 N1a) : l'analyste est amnésique par
construction — il ne relit jamais `data/analyses/` (~70 % de recouvrement
mesuré entre deux analyses consécutives). Le champ `analyses_precedentes`
ci-dessous lui donne une mémoire bornée aux 3 dernières analyses archivées,
et précalcule pour chaque point de suivi (`a_surveiller`) son âge en jours —
même loi que ci-dessus : compter des jours est un calcul, pas une lecture.

Tâche 43 (rapport qualité B2, §B.2 N1b) : le système savait ce qu'l'utilisateur avait
FAIT, jamais ce qu'il VEUT. Le champ `objectifs` ci-dessous liste ses
objectifs personnels ACTIFS (table `objectifs` de training.db, gérée par
l'app) avec un avancement RÉEL calculé ici — nombre de séances/km/minutes de
la semaine ISO en cours et de la précédente, fusion Garmin + saisies
manuelles (même règle de non-double-comptage que l'app, cf.
app/lib/objectifs.ts et app/lib/fusion.ts : une saisie manuelle rattachée à
une activité Garmin l'enrichit, elle ne s'y ajoute pas). Même loi que
ci-dessus : aucun verdict de réussite/échec n'est calculé — seulement des
comptes bruts que l'analyste cite (prompt-analyse.md, section « Objectifs
déclarés »).

Tâche 50 (rapport qualité B2, §B.2 N2 — arbitré par l'utilisateur le 2026-08-11) : les
suggestions génériques sourcées franchissent la ligne verrouillée
d'interdiction de prescrire, sous trois conditions strictes. Le garde-fou
santé est ici MÉCANIQUE, jamais laissé à la consigne du contrat (même loi
que le reste de ce fichier) : le bloc `corpus_principes` n'entre dans le
contexte QUE si aucun signal de douleur/blessure n'a été signalé récemment
(saisies de ressenti des 7 derniers jours, et `a_surveiller` de la dernière
analyse archivée) ET que la readiness du jour n'est pas basse — et il ne
rentre PAS au moindre doute (donnée absente, libellé inconnu ; fail-closed).
`CORPUS_PRINCIPES` ci-dessous est la traduction Python de
`deploy/nas/corpus-principes.md` (SEULE source de vérité éditoriale du
corpus, versionnée, lisible par un humain) — dupliquée ici pour la même
raison que `GLOSSAIRE_STATIQUE` : ce script tourne côté conteneur Python,
sans accès au fichier hôte `deploy/nas/corpus-principes.md` (synchronisation
manuelle ; `tests/collector/test_extraire_contexte.py` vérifie que les ids
ici correspondent mécaniquement à ceux du fichier réel).
"""
import json
import os
import re
import sqlite3
import sys
import unicodedata
from datetime import date, timedelta
from pathlib import Path

JOURS_HISTORIQUE = int(os.environ.get("ANALYSE_JOURS_HISTORIQUE", "14"))
JOURS_PLAN = int(os.environ.get("ANALYSE_JOURS_PLAN", "7"))

# Seuil de comparaison charge aiguë/chronique (10 %) — choisi pour rester
# cohérent avec la définition de « stable » du contrat (prompt-analyse.md :
# écart max/min ≤ 10 % ⇒ stable), même tolérance appliquée ici à l'écart
# relatif entre charge aiguë et chronique.
SEUIL_CHARGE_RELATIF = 0.10

# Dictionnaire de gloses figé (correctif n°5, rapport B2 §A.9) : traductions
# françaises EXACTES des libellés Garmin que ce script peut rencontrer dans
# readiness.niveau/commentaire, hrv.statut et charge.statut (suffixe
# numérique retiré, ex. STRAINED_1 -> STRAINED). Repris mot pour mot de
# app/lib/statuts-entrainement.ts (traduireNiveauReadiness,
# traduireFeedbackReadiness, traduireStatutEntrainement) pour que l'app et
# l'analyste parlent le même français — sauf `hrv.statut`, jamais affiché
# côté app : traduction littérale du mot anglais, jamais une définition
# médicale (le rapport B2 a mesuré des gloses inventées fausses pour
# UNBALANCED et STRAINED — pire pédagogiquement que pas de glose du tout).
GLOSSAIRE_STATIQUE = {
    # readiness.niveau (training_readiness.level)
    "POOR": "faible",
    "LOW": "bas",
    "MODERATE": "modéré",
    "GOOD": "bon",
    "HIGH": "élevé",
    "EXCELLENT": "excellent",
    # readiness.commentaire (training_readiness.feedback_short)
    "TAKE_IT_EASY": "vas-y doucement aujourd'hui",
    "FOCUS_ON_RECOVERY": "concentre-toi sur la récupération",
    "LISTEN_TO_YOUR_BODY": "écoute ton corps",
    "RECOVERED_AND_READY": "récupéré et prêt",
    "FIND_TIME_TO_RELAX": "prends le temps de te détendre",
    "FOCUS_ON_SLEEP_QUALITY": "priorité à la qualité du sommeil",
    "TIME_TO_RECHARGE": "temps de recharger les batteries",
    "WELL_RECOVERED": "bien récupéré",
    "BALANCE_STRESS_AND_RECOVERY": "équilibre stress et récupération",
    # charge.statut (training_status.status, suffixe numérique retiré)
    "STRAINED": "sollicité",
    "PRODUCTIVE": "productif",
    "RECOVERY": "récupération",
    "MAINTAINING": "maintien",
    "DETRAINING": "désentraînement",
    "UNPRODUCTIVE": "improductif",
    "PEAKING": "affûtage",
    "NO_STATUS": "pas de statut",
    # hrv.statut
    "UNBALANCED": "déséquilibré",
    "BALANCED": "équilibré",
}

# Corpus de principes (tâche 50, N2) — traduction Python de
# deploy/nas/corpus-principes.md, seule source de vérité éditoriale (voir
# l'en-tête de ce fichier). {id: énoncé}, mêmes ids et mêmes énoncés que le
# markdown, synchronisation manuelle vérifiée par un test dédié.
CORPUS_PRINCIPES = {
    "P1": (
        "L'essentiel du volume d'entraînement en endurance gagne à rester à "
        "faible intensité, la part à haute intensité restant minoritaire "
        "(approche parfois appelée « 80/20 »)."
    ),
    "P2": (
        "La charge d'entraînement (volume, intensité) progresse plus sûrement "
        "par paliers modérés que par des hausses brusques, pour laisser le "
        "corps le temps de s'adapter."
    ),
    "P3": (
        "Quand plusieurs signaux de fatigue convergent (récupération perçue "
        "basse, indicateurs de préparation dégradés, ressenti bas), une "
        "récupération adaptée précède généralement la reprise d'une "
        "progression."
    ),
    "P4": (
        "Une pratique régulière, répétée dans la durée, construit plus "
        "solidement la forme physique qu'un volume ponctuel élevé suivi "
        "d'interruptions."
    ),
    "P5": (
        "Les adaptations apportées par l'entraînement se rapprochent le plus "
        "des gestes, allures et efforts réellement pratiqués."
    ),
    "P6": (
        "Le sommeil fait partie intégrante du processus d'adaptation à "
        "l'entraînement, au même titre que les séances elles-mêmes."
    ),
}

# Garde-fou santé MÉCANIQUE (tâche 50) : fenêtre de recherche des signaux de
# douleur/blessure dans les saisies de ressenti (indépendante de
# JOURS_HISTORIQUE — volontairement plus courte, un signal de douleur vieux
# de deux semaines n'a pas la même pertinence qu'un readiness du jour même).
JOURS_GARDE_FOU_DOULEUR = 7

# Liste conservatrice et documentée de radicaux de douleur/blessure (tâche
# 50), normalisés (minuscules, sans accent — comparés via
# `_normaliser_pour_recherche` ci-dessous, insensible casse/accents).
# Volontairement large plutôt que stricte : le garde-fou DOIT déclencher au
# moindre doute (fail-closed) — un faux positif ne coûte qu'un jour sans
# suggestions, jamais l'inverse. Radicaux (pas des mots entiers) pour capter
# les variantes courantes (douleur/douleurs/douloureux/douloureuse,
# blessure/blessures/blessé(e)(s)…) sans lister chaque flexion.
MOTS_CLES_DOULEUR = [
    "doul",       # douleur, douleurs, douloureux, douloureuse
    "bless",      # blessure, blessures, blessé, blessée, blessés
    "mal au", "mal a la", "mal aux", "mal a l'",
    "ai mal", "fait mal",
    "tendinite", "entorse", "dechir",  # déchirure, déchiré(e)
    "claquage", "foulure", "fracture", "luxation",
    "inflamm",    # inflammation, inflammatoire
]

# Taxonomie RÉELLE des niveaux de `training_readiness.level` (mêmes six
# valeurs que GLOSSAIRE_STATIQUE ci-dessus et TRADUCTIONS_READINESS de
# app/lib/statuts-entrainement.ts — seule définition faisant foi, redéclarées
# ici pour l'ordre bas → haut dont le garde-fou a besoin). « Basse » pour ce
# garde-fou (tâche 50) : les deux échelons les plus bas de l'échelle.
NIVEAUX_READINESS_CONNUS = {"POOR", "LOW", "MODERATE", "GOOD", "HIGH", "EXCELLENT"}
NIVEAUX_READINESS_BAS = {"POOR", "LOW"}


def _normaliser_pour_recherche(texte: str) -> str:
    """Minuscule, accents retirés — même normalisation que
    `_normaliser_pour_recherche` de deploy/nas/analyse.sh (garde-fou tâche
    50), dupliquée ici pour la même raison que le reste de ce fichier : ce
    script tourne côté conteneur Python, l'autre côté hôte/bash."""
    sans_accents = "".join(
        c for c in unicodedata.normalize("NFKD", texte) if not unicodedata.combining(c)
    )
    return sans_accents.lower()


def _contient_signal_douleur(texte) -> bool:
    if not texte or not isinstance(texte, str):
        return False
    normalise = _normaliser_pour_recherche(texte)
    return any(mot in normalise for mot in MOTS_CLES_DOULEUR)


def _douleur_signalee_recemment(points_du_jour, seances_manuelles, analyses_precedentes, aujourdhui: date) -> bool:
    """Balaie les saisies de ressenti des `JOURS_GARDE_FOU_DOULEUR` derniers
    jours (`points_du_jour.douleurs`/`.notes`, `seances_manuelles.notes` et
    leurs segments) ET les items `a_surveiller` de la DERNIÈRE analyse
    archivée (`analyses_precedentes[0]`, la plus récente) — jamais le texte
    de la saisie ne remonte plus loin que cette fonction (l'appelant ne
    reçoit qu'un booléen)."""
    seuil = (aujourdhui - timedelta(days=JOURS_GARDE_FOU_DOULEUR)).isoformat()

    for p in points_du_jour:
        if p["date"] and p["date"][:10] < seuil:
            continue
        if _contient_signal_douleur(p.get("douleurs")) or _contient_signal_douleur(p.get("notes")):
            return True

    for s in seances_manuelles:
        if s["date"] and s["date"][:10] < seuil:
            continue
        if _contient_signal_douleur(s.get("notes")):
            return True
        for segment in s.get("segments") or []:
            if _contient_signal_douleur(segment.get("notes")):
                return True

    if analyses_precedentes:
        derniere = analyses_precedentes[0]
        for item in derniere.get("a_surveiller") or []:
            if _contient_signal_douleur(item.get("texte")):
                return True

    return False


def _motif_garde_fou_suggestions(points_du_jour, seances_manuelles, analyses_precedentes, readiness, aujourdhui: date):
    """Garde-fou santé MÉCANIQUE (tâche 50) : `None` si les suggestions sont
    autorisées, sinon une des trois catégories mécaniques
    ('douleur_signalee' | 'readiness_basse' | 'donnees_incompletes') —
    JAMAIS le texte de la saisie qui a déclenché. Fail-closed : en cas de
    doute (readiness du jour absente, libellé inconnu), le garde-fou
    déclenche ('donnees_incompletes')."""
    if _douleur_signalee_recemment(points_du_jour, seances_manuelles, analyses_precedentes, aujourdhui):
        return "douleur_signalee"

    niveau_du_jour = next(
        (r["niveau"] for r in readiness if r["date"] == aujourdhui.isoformat()), None
    )
    if not niveau_du_jour or niveau_du_jour not in NIVEAUX_READINESS_CONNUS:
        return "donnees_incompletes"
    if niveau_du_jour in NIVEAUX_READINESS_BAS:
        return "readiness_basse"

    return None


# Mémoire de l'analyste (tâche 42, rapport B2 §A.6/§B.2 N1a).
LIMITE_ANALYSES_PRECEDENTES = 3
# Nom des archives écrites par analyse.sh : "2026-08-11-1347.json" (horodatage
# UTC — le NAS tourne en UTC, cf. `datetime.now(timezone.utc)` côté analyse.sh).
NOM_ARCHIVE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})-\d{4}\.json$")
# Date d'origine JJ.MM à l'intérieur d'un texte `a_surveiller` archivé (ex.
# « douleur au genou signalée le 09.08 »).
DATE_JJ_MM_RE = re.compile(r"\b(\d{2})\.(\d{2})\b")


def _position_hrv(nuit, baseline_bas, baseline_haut):
    """Verdict précalculé HRV vs baseline (correctif n°1) : le contrat
    interdit désormais au modèle de comparer `nuit` aux bornes lui-même —
    7 des 21 erreurs mesurées par le rapport B2 venaient de ce calcul fait
    à la main (« sous la baseline » pour une valeur DANS la baseline)."""
    if nuit is None or baseline_bas is None or baseline_haut is None:
        return None
    if nuit < baseline_bas:
        return "sous_la_baseline"
    if nuit > baseline_haut:
        return "au_dessus_de_la_baseline"
    return "dans_la_baseline"


def _position_vs_chronique(charge_aigue, charge_chronique):
    """Verdict précalculé charge aiguë vs chronique (correctif n°1)."""
    if charge_aigue is None or charge_chronique is None or charge_chronique == 0:
        return None
    diff_relatif = (charge_aigue - charge_chronique) / charge_chronique
    if diff_relatif > SEUIL_CHARGE_RELATIF:
        return "au_dessus"
    if diff_relatif < -SEUIL_CHARGE_RELATIF:
        return "en_dessous"
    return "comparable"


def _strip_suffixe_numerique(code):
    """`STRAINED_1` -> `STRAINED` — même convention que le contrat
    (prompt-analyse.md) et que traduireStatutEntrainement côté app."""
    return re.sub(r"_\d+$", "", code) if code else code


def _changements_depuis_la_veille(readiness, hrv, charge, date_aujourdhui, date_veille):
    """Libellés d'état qui ont changé entre la veille et aujourd'hui
    (correctif n°2) : le modèle n'a plus à comparer les jours lui-même.
    Liste vide si rien n'a changé (ou si l'un des deux jours manque) —
    jamais un changement inventé."""
    par_date_readiness = {r["date"]: r["niveau"] for r in readiness}
    par_date_hrv = {h["date"]: h["statut"] for h in hrv}
    par_date_charge = {c["date"]: _strip_suffixe_numerique(c["statut"]) for c in charge}

    changements = []
    for mesure, par_date in (
        ("readiness_niveau", par_date_readiness),
        ("hrv_statut", par_date_hrv),
        ("charge_statut", par_date_charge),
    ):
        avant = par_date.get(date_veille)
        apres = par_date.get(date_aujourdhui)
        if avant is not None and apres is not None and avant != apres:
            changements.append({"mesure": mesure, "hier": avant, "aujourdhui": apres})
    return changements


def _glossaire_rencontres(readiness, hrv, charge):
    """Filtre GLOSSAIRE_STATIQUE aux seuls libellés réellement présents dans
    CE contexte (correctif n°5) — un dictionnaire compact et directement
    pertinent plutôt que la liste complète à chaque génération."""
    bruts = set()
    for r in readiness:
        if r["niveau"]:
            bruts.add(r["niveau"])
        if r["commentaire"]:
            bruts.add(r["commentaire"])
    for h in hrv:
        if h["statut"]:
            bruts.add(h["statut"])
    for c in charge:
        if c["statut"]:
            bruts.add(_strip_suffixe_numerique(c["statut"]))
    return {label: GLOSSAIRE_STATIQUE[label] for label in sorted(bruts) if label in GLOSSAIRE_STATIQUE}


def _date_origine_et_age(texte: str, aujourdhui: date):
    """Extrait la date JJ.MM d'un item `a_surveiller` archivé et calcule son
    âge en jours (correctif tâche 42, loi du rapport B2 §A.8 : ne jamais
    demander au modèle de compter des jours — c'est Python qui date, le
    contrat qui cite `age_jours`). Aucune année dans JJ.MM : on suppose
    l'année en cours, et on recule d'un an si la date obtenue tombe dans le
    futur (chevauchement de fin d'année). Retourne (None, None) si aucune
    date n'est trouvée ou si elle est invalide (ex. « 31.02 »)."""
    m = DATE_JJ_MM_RE.search(texte)
    if not m:
        return None, None
    jour, mois = int(m.group(1)), int(m.group(2))
    try:
        origine = date(aujourdhui.year, mois, jour)
    except ValueError:
        return None, None
    if origine > aujourdhui:
        try:
            origine = date(aujourdhui.year - 1, mois, jour)
        except ValueError:
            return None, None
    return m.group(0), (aujourdhui - origine).days


def _extraire_a_surveiller(brut, aujourdhui: date):
    """Enrichit chaque item `a_surveiller` d'une archive avec sa date
    d'origine et son âge en jours. `brut` doit être une liste de chaînes
    (forme validée par analyse.sh à l'écriture) ; toute autre forme est
    traitée comme une absence de champ, jamais comme une erreur fatale."""
    if not isinstance(brut, list):
        return None
    items = []
    for texte in brut:
        if not isinstance(texte, str):
            continue
        date_origine, age_jours = _date_origine_et_age(texte, aujourdhui)
        items.append({"texte": texte, "date_origine": date_origine, "age_jours": age_jours})
    return items or None


def _lire_une_analyse(chemin: Path, aujourdhui: date):
    """Charge une archive d'analyse pour la mémoire de l'analyste (tâche 42).
    Retourne None si le fichier est illisible, non-JSON, ou ne respecte pas
    la forme minimale attendue (`resume` str + `observations` liste de str) —
    jamais d'exception qui remonte, jamais de mémoire fabriquée à partir d'un
    fichier absent ou corrompu."""
    try:
        brut = json.loads(chemin.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(brut, dict):
        return None
    resume = brut.get("resume")
    observations = brut.get("observations")
    if not isinstance(resume, str) or not isinstance(observations, list) or not all(
        isinstance(o, str) for o in observations
    ):
        return None

    m = NOM_ARCHIVE_RE.match(chemin.name)
    entree = {
        "date": m.group(1) if m else None,
        "resume": resume,
        "observations": observations,
    }
    prudence = brut.get("prudence")
    if isinstance(prudence, str) and prudence.strip():
        entree["prudence"] = prudence
    a_surveiller = _extraire_a_surveiller(brut.get("a_surveiller"), aujourdhui)
    if a_surveiller:
        entree["a_surveiller"] = a_surveiller
    return entree


def _analyses_precedentes(archive_dir: Path, aujourdhui: date, limite: int = LIMITE_ANALYSES_PRECEDENTES):
    """Les `limite` dernières analyses archivées, la plus récente en premier
    (mémoire de l'analyste, tâche 42 — rapport B2 §A.6). Balaie les archives
    du plus récent au plus ancien et saute silencieusement tout fichier
    absent/corrompu/mal formé, en continuant jusqu'à réunir `limite` entrées
    exploitables ou épuiser les archives disponibles. Liste vide si le
    répertoire n'existe pas ou ne contient aucune archive exploitable —
    jamais de mémoire fabriquée."""
    if not archive_dir.is_dir():
        return []
    noms = sorted(
        (p.name for p in archive_dir.iterdir() if p.is_file() and NOM_ARCHIVE_RE.match(p.name)),
        reverse=True,
    )
    entrees = []
    for nom in noms:
        entree = _lire_une_analyse(archive_dir / nom, aujourdhui)
        if entree is not None:
            entrees.append(entree)
        if len(entrees) >= limite:
            break
    return entrees


# Objectifs déclarés (tâche 43, rapport B2 §B.2 N1b) — mêmes clés que
# app/lib/objectifs.ts (seule définition faisant foi, dupliquée ici pour
# la même raison que GLOSSAIRE_STATIQUE : ce script tourne côté conteneur
# Python, hors du monde TypeScript de l'app).
TYPES_GARMIN_COURSE = {"running", "trail_running", "treadmill_running"}
TYPES_GARMIN_RANDONNEE = {"hiking", "walking"}


def _sport_correspond(categorie, sport_brut):
    """Un `sport` (activity_type Garmin brut, ou sport de saisie manuelle)
    appartient-il à la catégorie d'objectif `categorie` ? Même règle que
    `sportCorrespond` de app/lib/objectifs.ts."""
    if categorie == "tous":
        return True
    if not sport_brut:
        return False
    s = sport_brut.lower()
    if categorie == "boxe":
        return s in ("boxe", "boxing")
    if categorie == "course":
        return s in TYPES_GARMIN_COURSE
    if categorie == "randonnee":
        return s in TYPES_GARMIN_RANDONNEE
    return False


def _lundi_de_la_semaine(jour: date) -> date:
    return jour - timedelta(days=jour.isoweekday() - 1)


def _seances_unifiees(garmin, training, debut: str, fin: str):
    """Fusion Garmin + saisies manuelles sur `[debut, fin]` (AAAA-MM-JJ,
    bornes incluses) — même règle que `fusionnerSeances` (app/lib/fusion.ts) :
    une saisie manuelle rattachée à une activité Garmin (`garmin_activity_id`)
    l'enrichit (le sport déclaré à la main prime), elle ne s'y ajoute jamais en
    double. Renvoie une liste de `{jour, sport, distance_km, duree_min}`."""
    activites = _lignes(garmin, """
        SELECT activity_id, date(start_time_local) AS jour, activity_type AS sport,
               distance_meters, duration_seconds
        FROM activity WHERE date(start_time_local) BETWEEN ? AND ?
    """, (debut, fin))
    manuelles = _lignes(training, """
        SELECT date, sport, duration_min, garmin_activity_id
        FROM manual_sessions WHERE date BETWEEN ? AND ?
    """, (debut, fin))

    rattachees_par_activite = {
        m["garmin_activity_id"]: m for m in manuelles if m["garmin_activity_id"] is not None
    }
    autonomes = [m for m in manuelles if m["garmin_activity_id"] is None]

    unifiees = []
    for a in activites:
        rattachee = rattachees_par_activite.get(a["activity_id"])
        unifiees.append({
            "jour": a["jour"],
            "sport": rattachee["sport"] if rattachee else a["sport"],
            "distance_km": (a["distance_meters"] / 1000.0) if a["distance_meters"] else 0.0,
            "duree_min": (a["duration_seconds"] / 60.0) if a["duration_seconds"] else 0.0,
        })
    for m in autonomes:
        unifiees.append({
            "jour": m["date"][:10],
            "sport": m["sport"],
            "distance_km": 0.0,
            "duree_min": m["duration_min"] or 0.0,
        })
    return unifiees


def _compter_semaine(unifiees, objectif, lundi_iso: str, dimanche_iso: str):
    """Décompte réel (jamais un verdict) sur `[lundi_iso, dimanche_iso]` —
    même arithmétique que `calculerAvancementSemaine` de
    app/lib/objectifs.ts. `0` est un résultat légitime (un vrai compte, pas
    un zéro fabriqué : voir la règle du projet sur les mesures de santé, qui
    ne s'applique pas ici)."""
    dans_semaine = [
        u for u in unifiees
        if lundi_iso <= u["jour"] <= dimanche_iso and _sport_correspond(objectif["sport"], u["sport"])
    ]
    if objectif["type"] == "seances_par_semaine":
        return len(dans_semaine)
    if objectif["type"] == "km_par_semaine":
        return round(sum(u["distance_km"] for u in dans_semaine), 1)
    if objectif["type"] == "minutes_par_semaine":
        return round(sum(u["duree_min"] for u in dans_semaine))
    return 0


def _objectifs_avancement(garmin, training, aujourdhui: date):
    """Avancement des objectifs ACTIFS (tâche 43) : `[]` si aucun objectif
    actif n'existe (table absente sur une base neuve, ou aucune ligne) — à
    l'appelant de ne pas publier le champ `objectifs` dans ce cas (jamais une
    mémoire/liste fabriquée)."""
    objectifs_actifs = _lignes(training, """
        SELECT sport, type, cible, libelle FROM objectifs WHERE actif = 1 ORDER BY id
    """)
    if not objectifs_actifs:
        return []

    lundi_actuel = _lundi_de_la_semaine(aujourdhui)
    dimanche_actuel = lundi_actuel + timedelta(days=6)
    lundi_precedent = lundi_actuel - timedelta(days=7)
    dimanche_precedent = lundi_actuel - timedelta(days=1)

    unifiees = _seances_unifiees(
        garmin, training, lundi_precedent.isoformat(), aujourdhui.isoformat()
    )

    resultat = []
    for o in objectifs_actifs:
        resultat.append({
            "libelle": o["libelle"],
            "sport": o["sport"],
            "type": o["type"],
            "cible": o["cible"],
            "realise_semaine_en_cours": _compter_semaine(
                unifiees, o, lundi_actuel.isoformat(), dimanche_actuel.isoformat()
            ),
            "realise_semaine_precedente": _compter_semaine(
                unifiees, o, lundi_precedent.isoformat(), dimanche_precedent.isoformat()
            ),
        })
    return resultat


def _connecter_ro(chemin: Path) -> sqlite3.Connection | None:
    """Ouvre en lecture seule ; None si le fichier n'existe pas (pas une
    erreur fatale — le contexte sera juste plus pauvre sur cette source)."""
    if not chemin.exists():
        return None
    conn = sqlite3.connect(f"file:{chemin}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def _lignes(conn: sqlite3.Connection | None, sql: str, params: tuple = ()) -> list[dict]:
    if conn is None:
        return []
    try:
        return [dict(r) for r in conn.execute(sql, params)]
    except sqlite3.OperationalError as e:
        # Table absente (base neuve, montre neuve) : signal, pas un plantage.
        print(f"AVERTISSEMENT : {e}", file=sys.stderr)
        return []


def _secs_vers_min(v):
    return round(v / 60.0, 1) if v is not None else None


def main() -> int:
    data_dir = Path(os.environ.get("GARMIN_DATA_DIR", "/work"))
    garmin = _connecter_ro(data_dir / "export" / "garmin-ro.db")
    training = _connecter_ro(data_dir / "training.db")
    archive_dir = data_dir / "analyses"

    aujourdhui = date.today()
    debut_historique = (aujourdhui - timedelta(days=JOURS_HISTORIQUE)).isoformat()
    fin_plan = (aujourdhui + timedelta(days=JOURS_PLAN)).isoformat()

    readiness = _lignes(garmin, """
        SELECT calendar_date AS date, score, level AS niveau,
               feedback_short AS commentaire,
               hrv_factor_percent AS contribution_hrv_au_score_pct,
               sleep_history_factor_percent AS contribution_sommeil_au_score_pct,
               stress_history_factor_percent AS contribution_stress_au_score_pct,
               acwr_factor_percent AS contribution_charge_au_score_pct,
               recovery_time AS temps_recuperation_min
        FROM training_readiness WHERE calendar_date >= ?
        ORDER BY calendar_date
    """, (debut_historique,))

    hrv = _lignes(garmin, """
        SELECT calendar_date AS date, last_night_avg AS nuit,
               weekly_avg AS moyenne_semaine, status AS statut,
               baseline_low AS baseline_bas, baseline_upper AS baseline_haut
        FROM hrv WHERE calendar_date >= ?
        ORDER BY calendar_date
    """, (debut_historique,))
    for h in hrv:
        h["position"] = _position_hrv(h["nuit"], h["baseline_bas"], h["baseline_haut"])

    sommeil_brut = _lignes(garmin, """
        SELECT calendar_date AS date, sleep_time_seconds, deep_sleep_seconds,
               rem_sleep_seconds, light_sleep_seconds, awake_sleep_seconds,
               sleep_score_overall AS score, resting_heart_rate AS fc_repos,
               avg_sleep_stress AS stress_moyen
        FROM sleep WHERE calendar_date >= ?
        ORDER BY calendar_date
    """, (debut_historique,))
    sommeil = [{
        "date": r["date"],
        "duree_min": _secs_vers_min(r["sleep_time_seconds"]),
        "profond_min": _secs_vers_min(r["deep_sleep_seconds"]),
        "rem_min": _secs_vers_min(r["rem_sleep_seconds"]),
        "leger_min": _secs_vers_min(r["light_sleep_seconds"]),
        "eveil_min": _secs_vers_min(r["awake_sleep_seconds"]),
        "score": r["score"],
        "fc_repos": r["fc_repos"],
        "stress_moyen": r["stress_moyen"],
    } for r in sommeil_brut]

    charge = _lignes(garmin, """
        SELECT calendar_date AS date, status AS statut,
               acute_load AS charge_aigue, chronic_load AS charge_chronique
        FROM training_status WHERE calendar_date >= ?
        ORDER BY calendar_date
    """, (debut_historique,))
    for c in charge:
        c["position_vs_chronique"] = _position_vs_chronique(c["charge_aigue"], c["charge_chronique"])

    activites_brutes = _lignes(garmin, """
        SELECT a.activity_id AS id, a.start_time_local AS date,
               a.activity_name AS nom, a.activity_type AS type,
               a.distance_meters, a.duration_seconds,
               a.average_hr AS fc_moy, a.max_hr,
               a.aerobic_training_effect AS effet_aerobie,
               a.training_load AS charge,
               z.zone1_seconds, z.zone2_seconds, z.zone3_seconds,
               z.zone4_seconds, z.zone5_seconds
        FROM activity a
        LEFT JOIN activity_hr_zones z ON z.activity_id = a.activity_id
        WHERE a.start_time_local >= ?
        ORDER BY a.start_time_local
    """, (debut_historique,))
    activites = [{
        "date": r["date"],
        "nom": r["nom"],
        "type": r["type"],
        "distance_km": round(r["distance_meters"] / 1000.0, 2) if r["distance_meters"] else None,
        "duree_min": _secs_vers_min(r["duration_seconds"]),
        "fc_moy": r["fc_moy"],
        "fc_max": r["max_hr"],
        "effet_aerobie": r["effet_aerobie"],
        "charge": r["charge"],
        "zones_min": {
            "z1": _secs_vers_min(r["zone1_seconds"]),
            "z2": _secs_vers_min(r["zone2_seconds"]),
            "z3": _secs_vers_min(r["zone3_seconds"]),
            "z4": _secs_vers_min(r["zone4_seconds"]),
            "z5": _secs_vers_min(r["zone5_seconds"]),
        },
    } for r in activites_brutes]

    seances_manuelles_brutes = _lignes(training, """
        SELECT id, date, sport, sub_type AS sous_type, duration_min AS duree_min,
               rpe, notes
        FROM manual_sessions WHERE date >= ?
        ORDER BY date
    """, (debut_historique,))
    # Segments de saisie vocale (tâche 28) : liste par séance, [] si aucune —
    # ajout de clé seulement, ne casse pas la forme existante du contexte.
    seances_manuelles = []
    for r in seances_manuelles_brutes:
        segments = _lignes(training, """
            SELECT type, duree_min, notes FROM seance_segments
            WHERE seance_id = ? ORDER BY ordre
        """, (r["id"],))
        seances_manuelles.append({
            "date": r["date"], "sport": r["sport"], "sous_type": r["sous_type"],
            "duree_min": r["duree_min"], "rpe": r["rpe"], "notes": r["notes"],
            "segments": segments,
        })

    points_du_jour = _lignes(training, """
        SELECT date, form AS forme, motivation,
               sleep_quality AS sommeil_percu, soreness AS douleurs, notes
        FROM daily_checkin WHERE date >= ?
        ORDER BY date
    """, (debut_historique,))

    plan_brut = _lignes(garmin, """
        SELECT calendar_date AS date, raw_json
        FROM workout_schedule WHERE calendar_date >= ? AND calendar_date <= ?
        ORDER BY calendar_date
    """, (aujourdhui.isoformat(), fin_plan))
    plan_7_jours = []
    for r in plan_brut:
        try:
            d = json.loads(r["raw_json"]) if r["raw_json"] else {}
        except json.JSONDecodeError:
            d = {}
        plan_7_jours.append({
            "date": r["date"],
            "repos": d.get("isRestDay"),
            "nom": d.get("workoutName"),
            "type": d.get("workoutType"),
            "phrase": d.get("workoutPhrase"),
            "plan": d.get("tpPlanName"),
            "distance_m": d.get("estimatedDistanceInMeters"),
            "duree_s": d.get("estimatedDurationInSecs"),
        })

    veille = (aujourdhui - timedelta(days=1)).isoformat()

    # Mémoire de l'analyste (tâche 42) : calculée ici, AVANT le garde-fou
    # santé (tâche 50) qui a besoin de son dernier `a_surveiller` pour
    # détecter une douleur déjà signalée.
    analyses_precedentes = _analyses_precedentes(archive_dir, aujourdhui)

    contexte = {
        "genere_le": aujourdhui.isoformat(),
        "fenetre_historique_jours": JOURS_HISTORIQUE,
        "readiness": readiness,
        "hrv": hrv,
        "sommeil": sommeil,
        "charge": charge,
        "activites": activites,
        # Correctif n°3 (rapport B2 §A.9) : compté ici, jamais par le modèle —
        # « sans activité enregistrée » a déjà été publié alors que deux
        # activités existaient dans la fenêtre.
        "activites_de_la_fenetre_count": len(activites),
        "seances_manuelles": seances_manuelles,
        "points_du_jour": points_du_jour,
        "plan_7_jours": plan_7_jours,
        "changements_depuis_la_veille": _changements_depuis_la_veille(
            readiness, hrv, charge, aujourdhui.isoformat(), veille
        ),
        "glossaire": _glossaire_rencontres(readiness, hrv, charge),
    }

    # Mémoire de l'analyste (tâche 42) : champ absent si aucune archive
    # exploitable — jamais un "analyses_precedentes": [] qui suggérerait une
    # mémoire vérifiée mais vide.
    if analyses_precedentes:
        contexte["analyses_precedentes"] = analyses_precedentes

    # Objectifs déclarés (tâche 43) : champ absent si aucun objectif actif —
    # même principe que analyses_precedentes ci-dessus (jamais un
    # "objectifs": [] qui suggérerait une liste vérifiée mais vide).
    objectifs = _objectifs_avancement(garmin, training, aujourdhui)
    if objectifs:
        contexte["objectifs"] = objectifs

    # Suggestions génériques sourcées (tâche 50, N2) : garde-fou santé
    # MÉCANIQUE — `suggestions_autorisees` fait foi pour tout le reste de la
    # chaîne (analyse.sh, prompt-analyse.md). `corpus_principes` n'entre dans
    # le contexte QUE si le garde-fou ne déclenche pas ; sinon un motif
    # MÉCANIQUE (jamais le texte de la saisie) explique pourquoi.
    motif = _motif_garde_fou_suggestions(points_du_jour, seances_manuelles, analyses_precedentes, readiness, aujourdhui)
    if motif is None:
        contexte["suggestions_autorisees"] = True
        contexte["corpus_principes"] = CORPUS_PRINCIPES
    else:
        contexte["suggestions_autorisees"] = False
        contexte["motif_garde_fou"] = motif

    print(json.dumps(contexte, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
