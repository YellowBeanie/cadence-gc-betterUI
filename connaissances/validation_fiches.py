"""Garantie centrale de la spec : une citation hallucinée est mécaniquement impossible."""
from .extraction import normaliser_espaces

MAX_MOTS_AFFIRMATION = 30
MAX_CARACTERES_EXTRAIT = 600
INCERTITUDES = {"consensus", "debattu", "preuve_faible"}

def valider(fiches, texte_source):
    src = normaliser_espaces(texte_source)
    motifs = []
    for i, f in enumerate(fiches, 1):
        # Vérifier champs obligatoires (indépendant)
        for champ in ("affirmation", "extrait_verbatim", "localisation", "incertitude"):
            if not (f.get(champ) or "").strip():
                motifs.append(f"fiche {i} : {champ} manquante")

        # Chaque autre contrôle s'exécute dès que SON champ requis est présent et non vide
        if (f.get("affirmation") or "").strip():
            n_mots = len(f["affirmation"].split())
            if n_mots > MAX_MOTS_AFFIRMATION:
                motifs.append(f"fiche {i} : affirmation de {n_mots} mots (max {MAX_MOTS_AFFIRMATION})")

        if (f.get("extrait_verbatim") or "").strip():
            if len(f["extrait_verbatim"]) > MAX_CARACTERES_EXTRAIT:
                motifs.append(f"fiche {i} : extrait de {len(f['extrait_verbatim'])} caractères (max {MAX_CARACTERES_EXTRAIT})")
            if normaliser_espaces(f["extrait_verbatim"]) not in src:
                motifs.append(f"fiche {i} : extrait absent de la source")

        if (f.get("incertitude") or "").strip():
            if f["incertitude"] not in INCERTITUDES:
                motifs.append(f"fiche {i} : incertitude invalide")

    return motifs
