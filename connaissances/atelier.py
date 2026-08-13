"""Point d'entrée atelier PC (tâche 11, spec 4 §9) : le poste de travail est
le SEUL endroit avec les dépendances lourdes d'extraction (docling, yt-dlp —
cf. requirements-atelier.txt), le NAS reste volontairement léger
(trafilatura seul, requirements-nas.txt). Deux responsabilités :

- `--vague` : une passe de collecte plafonnée (`boucle.executer` mode
  'vague', PDF/vidéo traités ici plutôt que mis en file) sur la base LOCALE
  (`data-atelier/connaissances.db` par défaut, jamais versionnée — cf.
  .gitignore) ;
- `--tirer` / `--pousser` : synchronise cette base locale avec
  `~/garmin-monitor/data/connaissances.db` sur le NAS, par `scp`/`ssh`
  (authentification par clé, comme le reste du parc) — AUCUN secret ne
  transite jamais en argument de ces commandes.

Les trois actions sont combinables dans un seul appel et s'exécutent dans
l'ordre tirer -> vague -> pousser (le flux normal : rapatrier l'état du NAS,
enrichir en local, republier).

Protection du cycle tirer/pousser (I5, revue finale) : entre un `--tirer` et
le `--pousser` qui le suit, l'app peut avoir écrit dans la base NAS (l'utilisateur
validant des fiches `en_attente` dans `/connaissances`) — un `--pousser` qui
ignore ce changement écraserait ces validations. `--tirer` enregistre donc
une empreinte (taille+mtime via `ssh stat`) de la base NAS dans
`<dossier de la base locale>/.etat-tirer` ; `--pousser` recompare cette
empreinte à l'état ACTUEL du NAS et refuse si elles diffèrent, sauf
`--forcer`. Pas d'empreinte enregistrée (jamais tiré dans cette session
locale) : aucune vérification, comportement historique inchangé — sinon une
première publication sur une base jamais tirée serait impossible.
"""
import argparse
import subprocess
from pathlib import Path

from . import boucle, db

_HOTE_NAS = "utilisateur@le serveur"
_CHEMIN_DISTANT_DB = "garmin-monitor/data/connaissances.db"
_CHEMIN_DISTANT_DB_NOUVELLE = "garmin-monitor/data/connaissances.db.new"
_SCRIPT_DISTANT_RECEVOIR = "garmin-monitor/connaissances-recevoir.sh"
_NOM_ETAT_TIRER = ".etat-tirer"


def _chemin_etat_tirer(chemin_db_locale):
    return Path(chemin_db_locale).parent / _NOM_ETAT_TIRER


def _empreinte_nas(executer=subprocess.run):
    """Empreinte de `_CHEMIN_DISTANT_DB` sur le NAS : taille+mtime via `ssh
    stat` (I5, revue finale) — pas de sha256 : un `stat` est quasi
    instantané, un hash complet re-téléchargerait ou re-calculerait sur des
    dizaines de Mo à chaque `--tirer`/`--pousser`. `None` si la commande
    échoue (base absente, ssh indisponible) : l'appelant applique alors sa
    propre politique fail-closed (une empreinte introuvable ne correspond à
    aucune empreinte enregistrée -> refus).

    `executer` est injectable (tests : aucun appel réseau réel)."""
    resultat = executer(
        ["ssh", _HOTE_NAS, "stat", "-c", "%s %Y", _CHEMIN_DISTANT_DB],
        capture_output=True, text=True,
    )
    if resultat.returncode != 0:
        return None
    return resultat.stdout.strip()


def tirer(chemin_db_locale, executer=subprocess.run):
    """Rapatrie `~/garmin-monitor/data/connaissances.db` (NAS) vers
    `chemin_db_locale`, écrasant la copie locale existante s'il y en a une.
    Enregistre ensuite l'empreinte NAS du moment (I5) dans `.etat-tirer`,
    à côté de la base locale — silencieusement ignoré si l'empreinte est
    indisponible (`stat` a échoué) : la protection au `--pousser` sera alors
    sautée (pas d'état enregistré), pas bloquante pour le `--tirer` lui-même.

    `executer` est injectable (tests : aucun appel réseau réel)."""
    chemin_db_locale = Path(chemin_db_locale)
    chemin_db_locale.parent.mkdir(parents=True, exist_ok=True)
    resultat = executer(["scp", f"{_HOTE_NAS}:{_CHEMIN_DISTANT_DB}", str(chemin_db_locale)])
    if resultat.returncode != 0:
        raise SystemExit(
            f"ERREUR : tirer la base depuis le NAS a échoué (code {resultat.returncode})."
        )
    print(f"Base tirée depuis le NAS -> {chemin_db_locale}")

    empreinte = _empreinte_nas(executer=executer)
    if empreinte is not None:
        _chemin_etat_tirer(chemin_db_locale).write_text(empreinte, encoding="utf-8")


def pousser(chemin_db_locale, executer=subprocess.run, forcer=False):
    """Publie `chemin_db_locale` vers le NAS en deux temps : `scp` vers un
    nom `.new` (jamais directement sur `connaissances.db` : un lecteur NAS —
    connaissances.sh ou un futur lecteur app — ne doit jamais tomber sur un
    fichier à moitié transféré), puis `connaissances-recevoir.sh` fait le
    remplacement atomique côté NAS (même volume, `mv -f`).

    I5 (revue finale) : si `.etat-tirer` existe à côté de `chemin_db_locale`
    (un `--tirer` a eu lieu dans cette session) et `forcer` est faux,
    recompare l'empreinte NAS actuelle à celle enregistrée — refuse
    (`SystemExit`, avant tout `scp`) si elles diffèrent, y compris si
    l'empreinte actuelle est indisponible (fail-closed : impossible de
    vérifier -> refus).

    `executer` est injectable (tests : aucun appel réseau réel)."""
    chemin_db_locale = Path(chemin_db_locale)
    chemin_etat = _chemin_etat_tirer(chemin_db_locale)
    if chemin_etat.exists() and not forcer:
        empreinte_enregistree = chemin_etat.read_text(encoding="utf-8")
        empreinte_actuelle = _empreinte_nas(executer=executer)
        if empreinte_actuelle != empreinte_enregistree:
            raise SystemExit(
                "ERREUR : la base NAS a changé depuis ton --tirer : re-tire d'abord "
                "(ou relance avec --forcer pour écraser quand même)."
            )

    resultat = executer(
        ["scp", str(chemin_db_locale), f"{_HOTE_NAS}:{_CHEMIN_DISTANT_DB_NOUVELLE}"]
    )
    if resultat.returncode != 0:
        raise SystemExit(
            f"ERREUR : pousser la base vers le NAS a échoué (code {resultat.returncode})."
        )
    resultat = executer(["ssh", _HOTE_NAS, _SCRIPT_DISTANT_RECEVOIR])
    if resultat.returncode != 0:
        raise SystemExit(
            "ERREUR : réception NAS (connaissances-recevoir.sh) a échoué "
            f"(code {resultat.returncode})."
        )
    print("Base publiée sur le NAS (connaissances-recevoir.sh exécuté).")


def _parser():
    ap = argparse.ArgumentParser(
        prog="python -m connaissances.atelier",
        description="Atelier PC de la base de connaissances (spec 4, tâche 11) : "
                     "vagues de collecte avec dépendances lourdes + synchro NAS.",
    )
    ap.add_argument("--vague", action="store_true",
                     help="Lance une passe de collecte (mode 'vague') sur la base locale.")
    ap.add_argument("--plafond", type=int, dest="plafond_sources",
                     help="Sources acceptées avant arrêt (requis avec --vague).")
    ap.add_argument("--budget", type=int, dest="budget_appels",
                     help="Appels LLM avant arrêt (requis avec --vague).")
    ap.add_argument("--db", default="data-atelier/connaissances.db", dest="chemin_db",
                     help="Chemin de la base locale (défaut : data-atelier/connaissances.db).")
    ap.add_argument("--tirer", action="store_true",
                     help="Rapatrie la base du NAS avant toute autre action (scp).")
    ap.add_argument("--pousser", action="store_true",
                     help="Publie la base locale vers le NAS après toute autre action "
                          "(scp + ssh connaissances-recevoir.sh).")
    ap.add_argument("--forcer", action="store_true",
                     help="Avec --pousser : outrepasse la protection I5 (empreinte NAS "
                          "changée depuis le --tirer) et publie quand même.")
    return ap


def _main(argv=None, executer_ssh=subprocess.run, executer_boucle=boucle.executer):
    args = _parser().parse_args(argv)

    if not (args.tirer or args.vague or args.pousser):
        raise SystemExit(
            "ERREUR : rien à faire — utiliser --tirer, --vague et/ou --pousser."
        )
    if args.vague and (args.plafond_sources is None or args.budget_appels is None):
        raise SystemExit("ERREUR : --vague nécessite --plafond et --budget.")

    if args.tirer:
        tirer(args.chemin_db, executer=executer_ssh)

    if args.vague:
        # Garde-fou (spec) : jamais de collecte à l'aveugle sur une base
        # locale inexistante — db.ouvrir() la créerait vide silencieusement,
        # ce qui masquerait un oubli de --tirer plutôt que de le signaler.
        if not Path(args.chemin_db).exists():
            raise SystemExit(
                f"ERREUR : base locale introuvable ({args.chemin_db}) — "
                "tirer d'abord (--tirer)."
            )
        conn = db.ouvrir(args.chemin_db)
        try:
            bilan = executer_boucle(conn, "vague", args.plafond_sources, args.budget_appels)
            print(f"Bilan : {bilan.acceptees} acceptées, {bilan.rejetees} rejetées, "
                  f"{bilan.en_file} en file, {bilan.deja_vues} déjà vues, "
                  f"{bilan.sautees} sautées (adaptateur indisponible), "
                  f"{bilan.appels_llm} appels LLM.")
        finally:
            conn.close()

    if args.pousser:
        pousser(args.chemin_db, executer=executer_ssh, forcer=args.forcer)


if __name__ == "__main__":
    _main()
