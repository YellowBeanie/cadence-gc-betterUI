import { ouvrirTraining } from './connection';
import { genererLibelle, type Objectif, type SportObjectif, type TypeObjectif } from '@/lib/objectifs';

export type NouvelObjectif = { sport: SportObjectif; type: TypeObjectif; cible: number };

function objectifDepuisLigne(r: Record<string, unknown>): Objectif {
  return {
    id: r.id as number,
    sport: r.sport as SportObjectif,
    type: r.type as TypeObjectif,
    cible: r.cible as number,
    libelle: r.libelle as string,
    actif: (r.actif as number) === 1,
    creeLe: r.cree_le as string,
  };
}

/** Le libellé n'est jamais saisi en texte libre (voir lib/objectifs.ts) :
 *  il est généré ici, à l'écriture, une fois pour toutes. */
export function creerObjectif(o: NouvelObjectif): number {
  const db = ouvrirTraining();
  try {
    const maintenant = new Date().toISOString();
    const libelle = genererLibelle(o.sport, o.type, o.cible);
    const r = db.prepare(
      `INSERT INTO objectifs (sport, type, cible, libelle, actif, cree_le)
       VALUES (?, ?, ?, ?, 1, ?)`)
      .run(o.sport, o.type, o.cible, libelle, maintenant);
    return Number(r.lastInsertRowid);
  } finally {
    db.close();
  }
}

/** Tous les objectifs, actifs ou non — l'écran /saisie affiche l'ensemble
 *  (avec un bouton activer/désactiver), pas seulement les actifs. */
export function lireObjectifs(): Objectif[] {
  const db = ouvrirTraining();
  try {
    return db.prepare(`SELECT * FROM objectifs ORDER BY cree_le ASC, id ASC`)
      .all().map((r: Record<string, unknown>) => objectifDepuisLigne(r));
  } finally {
    db.close();
  }
}

/** Seuls les objectifs actifs — c'est cette liste que le contexte de
 *  l'analyste (collector/extraire_contexte.py) reproduit côté Python. */
export function lireObjectifsActifs(): Objectif[] {
  const db = ouvrirTraining();
  try {
    return db.prepare(`SELECT * FROM objectifs WHERE actif = 1 ORDER BY cree_le ASC, id ASC`)
      .all().map((r: Record<string, unknown>) => objectifDepuisLigne(r));
  } finally {
    db.close();
  }
}

/** Bascule actif <-> inactif. Idempotent côté appelant : un `id` inconnu ne
 *  touche aucune ligne, jamais une erreur (même tolérance que
 *  `supprimerPreference`). */
export function basculerActifObjectif(id: number): void {
  const db = ouvrirTraining();
  try {
    db.prepare(`UPDATE objectifs SET actif = 1 - actif WHERE id = ?`).run(id);
  } finally {
    db.close();
  }
}

/** Suppression définitive. Idempotent : un `id` déjà absent n'est jamais une
 *  erreur (même convention que `supprimerPreference`). */
export function supprimerObjectif(id: number): void {
  const db = ouvrirTraining();
  try {
    db.prepare(`DELETE FROM objectifs WHERE id = ?`).run(id);
  } finally {
    db.close();
  }
}
