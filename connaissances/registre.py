"""Mémoire de la boucle : ne jamais re-payer une lecture déjà faite (spec §5/§6)."""
from datetime import datetime, timezone

def deja_traite(conn, url):
    return conn.execute("SELECT 1 FROM registre_couverture WHERE url=?", (url,)).fetchone() is not None

def deja_vu_hash(conn, hash_):
    return conn.execute("SELECT 1 FROM registre_couverture WHERE hash=?", (hash_,)).fetchone() is not None

def enregistrer(conn, url, hash_, requete_source, verdict):
    conn.execute(
        "INSERT INTO registre_couverture(url, hash, requete_source, date, verdict) "
        "VALUES(?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET hash=excluded.hash, "
        "requete_source=excluded.requete_source, date=excluded.date, verdict=excluded.verdict",
        (url, hash_, requete_source, datetime.now(timezone.utc).isoformat(), verdict))
    conn.commit()
