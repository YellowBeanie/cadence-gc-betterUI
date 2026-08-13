# Corpus de principes — suggestions génériques sourcées (niveau N2)

Ce fichier est la **SEULE source autorisée** de suggestion dans toute la
chaîne d'analyse (tâche 50, rapport qualité B2 §B.2, niveau N2 arbitré par
l'utilisateur le 2026-08-11). L'analyste quotidien (`analyse.sh` + `prompt-analyse.md`)
ne peut JAMAIS suggérer quoi que ce soit qui ne soit pas une citation
attribuée d'un principe listé ici, sous les trois conditions verrouillées du
rapport : pré-requis qualité faits, garde-fou santé MÉCANIQUE actif (calculé
en Python, `collector/extraire_contexte.py`), et attribution systématique.

## Règle d'attribution

Toute suggestion produite par l'analyste doit nommer explicitement l'id du
principe cité (ex. « les principes de répartition d'intensité (P1)
suggèrent… ») et rester générique — jamais un plan daté, jamais une
prescription à la 2e personne (« réduis », « fais »), jamais un avis médical.
Le modèle CITE ces principes et les chiffres précalculés du contexte ; il ne
recalcule ni n'invente jamais rien (même loi que le reste du contrat,
rapport B2 §A.8).

## Honnêteté

Chaque principe ci-dessous est énoncé comme un principe **consensuel** de la
littérature d'entraînement amateur/endurance, en français courant, sans
référence académique précise inventée (aucun DOI, aucun auteur, aucune étude
citée nommément). Un cadre largement connu peut être mentionné de façon
générique (ex. « l'approche dite 80/20 ») sans lui attribuer une source
exacte que ce projet n'a pas vérifiée.

## Les principes

### P1 — Répartition d'intensité

L'essentiel du volume d'entraînement en endurance gagne à rester à faible
intensité, la part à haute intensité restant minoritaire (approche parfois
appelée « 80/20 »). Champ d'application : lecture des zones de fréquence
cardiaque d'une séance ou d'une période, en particulier pour un objectif
d'endurance fondamentale.

### P2 — Progression graduelle de la charge

La charge d'entraînement (volume, intensité) progresse plus sûrement par
paliers modérés que par des hausses brusques, pour laisser le corps le temps
de s'adapter. Champ d'application : évolution de la charge aiguë par rapport
à la charge chronique, semaine après semaine.

### P3 — Récupération après signaux de fatigue

Quand plusieurs signaux de fatigue convergent (récupération perçue basse,
indicateurs de préparation dégradés, ressenti bas), une récupération adaptée
précède généralement la reprise d'une progression. Champ d'application :
lecture croisée de signaux de fatigue qui convergent sur une même période.

### P4 — Régularité avant volume

Une pratique régulière, répétée dans la durée, construit plus solidement la
forme physique qu'un volume ponctuel élevé suivi d'interruptions. Champ
d'application : constance de la pratique sur plusieurs semaines, plutôt que
le volume d'une seule séance ou d'une seule semaine.

### P5 — Spécificité de l'entraînement

Les adaptations apportées par l'entraînement se rapprochent le plus des
gestes, allures et efforts réellement pratiqués. Champ d'application :
cohérence entre les séances effectivement réalisées et l'objectif visé.

### P6 — Place du sommeil

Le sommeil fait partie intégrante du processus d'adaptation à
l'entraînement, au même titre que les séances elles-mêmes. Champ
d'application : lecture conjointe du sommeil et de la charge d'entraînement
récente.
