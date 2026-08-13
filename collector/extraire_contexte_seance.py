#!/usr/bin/env python3
"""Extrait un contexte JSON compact pour l'analyste Claude PAR SÉANCE
(tâche 24) — script séparé d'`extraire_contexte.py` (chaîne quotidienne) :
un bug ici ne doit jamais mettre en danger l'analyse quotidienne.

Lit UNIQUEMENT en lecture seule (`mode=ro`) :
  - l'instantané Garmin  : ${GARMIN_DATA_DIR}/export/garmin-ro.db
  - la base de l'app     : ${GARMIN_DATA_DIR}/training.db

N'écrit jamais rien : ce script imprime son JSON sur stdout, c'est
`analyse-seance.sh` qui le redirige vers un fichier temporaire avant de le
passer en entrée à `claude -p`.

Usage : --seance <activity_id> (obligatoire).

Contenu :
  - `seance`     : la séance ciblée (mesures, splits, zones FC, météo).
  - `ressenti`   : RPE + notes de la saisie manuelle rattachée, SI elle
                   existe — clé absente sinon (jamais None visible dans le
                   JSON, pour que le contrat n'ait pas à distinguer absent/
                   null). Les notes restent des DONNÉES (anti-injection du
                   contrat prompt-analyse-seance.md), ce script ne fait que
                   les transporter telles quelles.
  - `historique` : jusqu'à 10 activités précédentes du même `activity_type`
                   (strictement antérieures, plus récentes d'abord). `[]` si
                   aucune — jamais inventée.

Valeurs absentes = null (ou champ absent pour `ressenti`), jamais un zéro
fabriqué.

Tâche 41 (rapport qualité B2, §A.9, correctif n°7) : `comparaison_intensite`
précalcule le verdict d'intensité entre cette séance et la référence la plus
récente d'`historique` — le rapport a mesuré une inversion de ce sens alors
que `pct_z1_z2` disait le contraire ; le contrat interdit désormais au modèle
de comparer ces pourcentages lui-même.
"""
import argparse
import json
import os
import sqlite3
import sys
from pathlib import Path

# Écart (en points de pourcentage de temps passé en Z1-Z2) en-deçà duquel
# deux séances sont jugées d'intensité comparable — même logique que le
# seuil de 10 % choisi pour la charge aiguë/chronique dans
# extraire_contexte.py (SEUIL_CHARGE_RELATIF) : une tolérance qui absorbe le
# bruit normal de mesure plutôt qu'un verdict qui bascule pour 1 point.
SEUIL_INTENSITE_PTS = 5


def _connecter_ro(chemin: Path) -> sqlite3.Connection | None:
    """Ouvre en lecture seule ; None si le fichier n'existe pas."""
    if not chemin.exists():
        return None
    conn = sqlite3.connect(f"file:{chemin}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def _ligne(conn: sqlite3.Connection | None, sql: str, params: tuple = ()) -> dict | None:
    if conn is None:
        return None
    try:
        r = conn.execute(sql, params).fetchone()
        return dict(r) if r is not None else None
    except sqlite3.OperationalError as e:
        print(f"AVERTISSEMENT : {e}", file=sys.stderr)
        return None


def _lignes(conn: sqlite3.Connection | None, sql: str, params: tuple = ()) -> list[dict]:
    if conn is None:
        return []
    try:
        return [dict(r) for r in conn.execute(sql, params)]
    except sqlite3.OperationalError as e:
        print(f"AVERTISSEMENT : {e}", file=sys.stderr)
        return []


def _secs_vers_min(v):
    return round(v / 60.0, 1) if v is not None else None


def _f_vers_c(f):
    return round((f - 32) * 5 / 9, 1) if f is not None else None


def _mph_vers_kmh(mph):
    return round(mph * 1.60934, 1) if mph is not None else None


def _allure_sec_km(duree_s, distance_m):
    """Secondes par kilomètre — même formule que allureSecParKm (app,
    lib/formatage.ts) : None si l'une des deux composantes manque ou si la
    distance est nulle (jamais une division par zéro déguisée)."""
    if duree_s is None or distance_m is None or distance_m <= 0:
        return None
    return round(duree_s / (distance_m / 1000.0), 1)


def _verdict_intensite(pct_z1_z2_seance, pct_z1_z2_reference):
    """Plus de temps en Z1-Z2 (zones basses) = séance MOINS intense ; moins
    de temps en Z1-Z2 = séance PLUS intense (plus de temps en zones hautes).
    Écart sous SEUIL_INTENSITE_PTS -> comparable."""
    diff = pct_z1_z2_seance - pct_z1_z2_reference
    if diff > SEUIL_INTENSITE_PTS:
        return "moins_intense_que_la_reference"
    if diff < -SEUIL_INTENSITE_PTS:
        return "plus_intense_que_la_reference"
    return "intensite_comparable"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seance", type=int, required=True, help="activity_id Garmin ciblé")
    args = parser.parse_args()

    data_dir = Path(os.environ.get("GARMIN_DATA_DIR", "/work"))
    garmin = _connecter_ro(data_dir / "export" / "garmin-ro.db")
    training = _connecter_ro(data_dir / "training.db")

    if garmin is None:
        print("ERREUR : instantané Garmin introuvable", file=sys.stderr)
        return 1

    a = _ligne(garmin, """
        SELECT activity_id, activity_name, activity_type, start_time_local,
               distance_meters, duration_seconds, moving_duration_seconds,
               average_hr, max_hr,
               elevation_gain, training_load, avg_cadence
        FROM activity WHERE activity_id = ?
    """, (args.seance,))
    if a is None:
        print(f"ERREUR : séance {args.seance} introuvable dans l'instantané", file=sys.stderr)
        return 1

    splits_bruts = _lignes(garmin, """
        SELECT split_number, duration_seconds, average_hr, distance_meters
        FROM activity_splits WHERE activity_id = ? ORDER BY split_number
    """, (args.seance,))
    splits = [{
        "numero": s["split_number"],
        "distance_m": s["distance_meters"],
        "temps_s": s["duration_seconds"],
        "allure_sec_km": _allure_sec_km(s["duration_seconds"], s["distance_meters"]),
        "fc": s["average_hr"],
    } for s in splits_bruts]

    z = _ligne(garmin, """
        SELECT zone1_seconds, zone2_seconds, zone3_seconds, zone4_seconds, zone5_seconds
        FROM activity_hr_zones WHERE activity_id = ?
    """, (args.seance,))
    zones_min = None
    zones_pct = None
    if z is not None:
        zones_min = {
            "z1": _secs_vers_min(z["zone1_seconds"]),
            "z2": _secs_vers_min(z["zone2_seconds"]),
            "z3": _secs_vers_min(z["zone3_seconds"]),
            "z4": _secs_vers_min(z["zone4_seconds"]),
            "z5": _secs_vers_min(z["zone5_seconds"]),
        }
        # Parts précalculées ICI, jamais par le modèle (contre-vérif T30 : une
        # génération a écrit 61 %/39 % pour un vrai 76 %/24 % — la division
        # LLM n'est pas fiable, on lui donne les nombres finis à citer).
        total_s = sum((z[f"zone{i}_seconds"] or 0) for i in range(1, 6))
        if total_s > 0:
            pct = {f"z{i}": round(100 * (z[f"zone{i}_seconds"] or 0) / total_s)
                   for i in range(1, 6)}
            pct["z1_z2"] = round(100 * ((z["zone1_seconds"] or 0) + (z["zone2_seconds"] or 0)) / total_s)
            zones_pct = pct

    w = _ligne(garmin, """
        SELECT temperature, apparent_temperature, humidity, wind_speed, weather_type
        FROM activity_weather WHERE activity_id = ?
    """, (args.seance,))
    meteo = None
    if w is not None:
        # Météo Garmin toujours en unités impériales, même piège que côté app
        # (lib/db/garmin.ts, fahrenheitVersCelsius/mphVersKmh) — converties ici
        # pour rester lisibles par l'analyste sans qu'il ait à deviner l'unité.
        meteo = {
            "temperature_c": _f_vers_c(w["temperature"]),
            "temperature_ressentie_c": _f_vers_c(w["apparent_temperature"]),
            "humidite_pct": w["humidity"],
            "vent_kmh": _mph_vers_kmh(w["wind_speed"]),
            "type": w["weather_type"],
        }

    seance = {
        "id": a["activity_id"],
        "nom": a["activity_name"],
        "type": a["activity_type"],
        "date": a["start_time_local"],
        "distance_m": a["distance_meters"],
        # Deux horloges Garmin, nommées sans ambiguïté (contre-vérif T30 : une
        # analyse avait affiché « 12,6 km en 3h09 » — le temps du split, en
        # mouvement — pour une sortie de 5h16 pauses comprises) :
        "duree_totale_s": a["duration_seconds"],
        "duree_en_mouvement_s": a["moving_duration_seconds"],
        "allure_moy_sec_km": _allure_sec_km(a["duration_seconds"], a["distance_meters"]),
        "fc_moy": a["average_hr"],
        "fc_max": a["max_hr"],
        "denivele_m": a["elevation_gain"],
        "charge": a["training_load"],
        "cadence_moy": a["avg_cadence"],
        "splits": splits,
        "zones_min": zones_min,
        "zones_pct": zones_pct,
        "meteo": meteo,
    }

    ressenti = None
    r = _ligne(training, """
        SELECT id, rpe, notes FROM manual_sessions
        WHERE garmin_activity_id = ? ORDER BY id DESC LIMIT 1
    """, (args.seance,))
    if r is not None:
        # Segments de saisie vocale (tâche 28) rattachés à cette séance —
        # inclus dans le ressenti existant plutôt qu'une nouvelle clé de
        # premier niveau : le couplage Garmin ↔ infos d'après-cours passe déjà
        # par ce rattachement.
        segments = _lignes(training, """
            SELECT type, duree_min, notes FROM seance_segments
            WHERE seance_id = ? ORDER BY ordre
        """, (r["id"],))
        if r["rpe"] is not None or r["notes"] is not None or len(segments) > 0:
            ressenti = {"rpe": r["rpe"], "notes": r["notes"], "segments": segments}

    historique_bruts = []
    if a["activity_type"] is not None:
        historique_bruts = _lignes(garmin, """
            SELECT a.start_time_local AS date, a.activity_name AS nom,
                   a.distance_meters, a.duration_seconds, a.average_hr AS fc_moy,
                   a.elevation_gain AS denivele_m, a.training_load AS charge,
                   z.zone1_seconds, z.zone2_seconds
            FROM activity a
            LEFT JOIN activity_hr_zones z ON z.activity_id = a.activity_id
            WHERE a.activity_type = ? AND a.start_time_local < ?
            ORDER BY a.start_time_local DESC LIMIT 10
        """, (a["activity_type"], a["start_time_local"]))

    historique = []
    for h in historique_bruts:
        duree = h["duration_seconds"]
        pct_z1_z2 = None
        if duree is not None and duree > 0 and h["zone1_seconds"] is not None and h["zone2_seconds"] is not None:
            pct_z1_z2 = round((h["zone1_seconds"] + h["zone2_seconds"]) / duree * 100, 1)
        historique.append({
            "date": h["date"],
            "nom": h["nom"],
            "distance_m": h["distance_meters"],
            "duree_s": duree,
            "allure_moy_sec_km": _allure_sec_km(duree, h["distance_meters"]),
            "fc_moy": h["fc_moy"],
            "denivele_m": h["denivele_m"],
            "charge": h["charge"],
            "pct_z1_z2": pct_z1_z2,
        })

    # Correctif n°7 : verdict d'intensité précalculé contre la référence la
    # plus récente d'`historique` qui porte un `pct_z1_z2` connu — le modèle
    # cite ce verdict, il ne compare plus deux `pct_z1_z2` lui-même.
    comparaison_intensite = {
        "disponible": False,
        "verdict": None,
        "pct_z1_z2_seance": None,
        "pct_z1_z2_reference": None,
        "date_reference": None,
    }
    if zones_pct is not None:
        reference = next((h for h in historique if h["pct_z1_z2"] is not None), None)
        if reference is not None:
            pct_seance = zones_pct["z1_z2"]
            pct_reference = reference["pct_z1_z2"]
            comparaison_intensite = {
                "disponible": True,
                "verdict": _verdict_intensite(pct_seance, pct_reference),
                "pct_z1_z2_seance": pct_seance,
                "pct_z1_z2_reference": pct_reference,
                "date_reference": reference["date"],
            }

    contexte = {
        "seance": seance,
        "historique": historique,
        "comparaison_intensite": comparaison_intensite,
    }
    if ressenti is not None:
        contexte["ressenti"] = ressenti

    print(json.dumps(contexte, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
