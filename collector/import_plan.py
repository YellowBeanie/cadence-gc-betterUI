#!/usr/bin/env python3
"""Importe les séances planifiées Garmin sur une fenêtre future.

Le sync standard borne ses requêtes à la plage demandée, or les séances d'un
plan sont datées dans le futur. On rejoue donc la requête GraphQL du tool sur
une fenêtre glissante, et on laisse le tool lui-même écrire en base : il reste
seul propriétaire de garmin.db.
"""
import os
import sys
from datetime import date, timedelta
from pathlib import Path

from garmin_client.client import GarminClient
from garmin_mcp.db import get_connection, save_to_db

FENETRE_JOURS = int(os.environ.get("GARMIN_PLAN_WINDOW_DAYS", "28"))
# Fenêtre rétrospective : couvre l'horizon « plan vs réalisé » de l'app
# (14 jours). Elle permet à la réconciliation d'effacer aussi les séances
# passées d'un plan ANNULÉ — Garmin ne les renvoie plus, elles ne doivent
# plus s'afficher (retour l'utilisateur du 2026-08-09 : plan annulé côté Garmin mais
# séances fantômes à l'écran).
FENETRE_PASSE_JOURS = int(os.environ.get("GARMIN_PLAN_PAST_DAYS", "14"))
DATA_DIR = Path(os.environ.get("GARMIN_DATA_DIR", "/work"))


def main() -> int:
    email = os.environ.get("GARMIN_EMAIL", "")
    password = os.environ.get("GARMIN_PASSWORD", "")
    if not email or not password:
        print("ERREUR : identifiants Garmin absents", file=sys.stderr)
        return 1

    debut = (date.today() - timedelta(days=FENETRE_PASSE_JOURS)).isoformat()
    fin = (date.today() + timedelta(days=FENETRE_JOURS)).isoformat()
    print(f"Import du plan sur {debut} -> {fin}")

    client = GarminClient(
        email=email,
        password=password,
        profile_dir=DATA_DIR / "browser_profile",
        headless=True,
    )
    try:
        # login() DOIT rester dans le try : un échec après ouverture de Chrome
        # (MFA, captcha, timeout) laisserait sinon le navigateur orphelin,
        # verrouillant browser_profile et cassant les syncs suivants.
        if not client.login():
            print("ERREUR : login Garmin échoué", file=sys.stderr)
            return 1

        gql = {
            "workout_schedule": (
                'query{workoutScheduleSummariesScalar'
                f'(startDate:"{debut}", endDate:"{fin}")}}'
            )
        }
        resultat = client._fetch_batch({}, gql)
    finally:
        client.close()

    entree = resultat.get("gql_workout_schedule") or {}
    charge = (entree.get("data") or {}).get("data", {})
    seances = charge.get("workoutScheduleSummariesScalar") or []

    if seances:
        print(f"{len(seances)} séance(s) reçue(s) de Garmin.")
    else:
        print("Aucune séance planifiée sur la fenêtre (plan absent, terminé ou annulé).")

    # Garmin est la SEULE source de vérité sur la fenêtre interrogée : une
    # séance qu'il ne renvoie plus (plan annulé, plan adaptatif recalculé) doit
    # disparaître d'ici aussi — sans réconciliation, un plan annulé restait
    # affiché indéfiniment (séances fantômes, retour l'utilisateur du 2026-08-09). La
    # purge est bornée à la fenêtre : l'historique antérieur n'est pas touché.
    dates_recues = sorted({
        s.get("scheduleDate") for s in seances
        if isinstance(s, dict) and isinstance(s.get("scheduleDate"), str)
    })

    # Signature réelle vérifiée dans le paquet installé :
    #   save_to_db(conn, endpoint_name: str, data, cal_date=None) -> int
    # On passe le nom SANS préfixe `gql_` et la liste déjà extraite : le préfixe
    # déclencherait un désencapsulage supplémentaire dont on n'a pas besoin.
    conn = get_connection(str(DATA_DIR / "garmin.db"))
    try:
        nb = save_to_db(conn, "workout_schedule", seances) if seances else 0
        marqueurs = ",".join("?" for _ in dates_recues)
        requete = (
            "DELETE FROM workout_schedule WHERE calendar_date >= ? AND calendar_date <= ?"
            + (f" AND calendar_date NOT IN ({marqueurs})" if dates_recues else "")
        )
        purge = conn.execute(requete, [debut, fin, *dates_recues]).rowcount
        conn.commit()
    finally:
        conn.close()

    print(f"{nb} séance(s) enregistrée(s), {purge} séance(s) obsolète(s) purgée(s).")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
