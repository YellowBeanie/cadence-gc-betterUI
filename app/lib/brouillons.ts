import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';

/** Un brouillon de saisie vocale (tâche 28) : produit hors du contrôle de
 *  l'app par `deploy/nas/traite-audio.sh`, un fichier JSON par audio traité
 *  dans `${GARMIN_DATA_DIR}/export/brouillons-saisie/{id}.json`. `id` est le
 *  nom de l'audio d'origine, sans extension (même format que le nom généré
 *  côté serveur par la route `/api/audio-saisie` :
 *  `{AAAAMMJJ-HHMMSS}-{aléatoire hex}`). */
export type SegmentPropose = {
  type: string;
  dureeMin: number | null;
  notes: string | null;
};

export type Proposition = {
  date: string | null;
  sport: string;
  dureeMin: number | null;
  rpe: number | null;
  segments: SegmentPropose[];
  notes: string | null;
};

export type Brouillon = {
  id: string;
  genereLe: Date;
  transcript: string;
  proposition: Proposition;
};

/** Motif du nom de fichier généré par `/api/audio-saisie` (sans extension) —
 *  même rigueur anti-traversal que la validation `id`/`fichier` de
 *  `/api/photos/[id]/[fichier]` : purement ce motif, jamais un `..`, un slash,
 *  ou un caractère qui sortirait du dossier `brouillons-saisie/`. */
const MOTIF_ID = /^\d{8}-\d{6}-[0-9a-f]{6,16}$/;

function estSegmentPropose(v: unknown): v is SegmentPropose {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.type === 'string' && o.type.trim() !== '' &&
    (o.dureeMin === null || typeof o.dureeMin === 'number') &&
    (o.notes === null || typeof o.notes === 'string')
  );
}

type PropositionBrute = {
  date: string | null;
  sport: string;
  duree_min: number | null;
  rpe: number | null;
  segments: { type: string; duree_min: number | null; notes: string | null }[];
  notes: string | null;
};

type BrouillonBrut = {
  genere_le: number;
  transcript: string;
  proposition: PropositionBrute;
};

function estBrouillonBrut(v: unknown): v is BrouillonBrut {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (typeof o.genere_le !== 'number' || !Number.isFinite(o.genere_le)) return false;
  if (typeof o.transcript !== 'string') return false;
  const p = o.proposition;
  if (p === null || typeof p !== 'object') return false;
  const po = p as Record<string, unknown>;
  if (po.date !== null && typeof po.date !== 'string') return false;
  if (typeof po.sport !== 'string' || po.sport.trim() === '') return false;
  if (po.duree_min !== null && typeof po.duree_min !== 'number') return false;
  if (po.rpe !== null && typeof po.rpe !== 'number') return false;
  if (po.notes !== null && typeof po.notes !== 'string') return false;
  if (!Array.isArray(po.segments)) return false;
  if (!po.segments.every((s) => {
    if (s === null || typeof s !== 'object') return false;
    const so = s as Record<string, unknown>;
    return (
      typeof so.type === 'string' && so.type.trim() !== '' &&
      (so.duree_min === null || typeof so.duree_min === 'number') &&
      (so.notes === null || typeof so.notes === 'string')
    );
  })) return false;
  return true;
}

function versBrouillon(id: string, brut: BrouillonBrut): Brouillon {
  return {
    id,
    genereLe: new Date(brut.genere_le * 1000),
    transcript: brut.transcript,
    proposition: {
      date: brut.proposition.date,
      sport: brut.proposition.sport,
      dureeMin: brut.proposition.duree_min,
      rpe: brut.proposition.rpe,
      notes: brut.proposition.notes,
      segments: brut.proposition.segments.map((s) => ({
        type: s.type, dureeMin: s.duree_min, notes: s.notes,
      })),
    },
  };
}

/** Liste les brouillons de saisie vocale À VALIDER, les plus récents d'abord.
 *  Lecture tolérante — même discipline que `lireAnalyseSeance`/
 *  `lirePhotosSeance` pour un produit écrit hors du contrôle de l'app :
 *  dossier absent → liste vide, fichier corrompu ou aux clés inattendues →
 *  ignoré (jamais une exception qui ferait planter `/saisie` ou le dashboard). */
export function lireBrouillons(): Brouillon[] {
  const racine = process.env.GARMIN_DATA_DIR ?? '/work';
  const dossier = `${racine}/export/brouillons-saisie`;
  if (!existsSync(dossier)) return [];

  let fichiers: string[];
  try {
    fichiers = readdirSync(dossier).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }

  const brouillons: Brouillon[] = [];
  for (const fichier of fichiers) {
    const id = fichier.slice(0, -'.json'.length);
    if (!MOTIF_ID.test(id)) continue;
    try {
      const brut: unknown = JSON.parse(readFileSync(`${dossier}/${fichier}`, 'utf8'));
      if (!estBrouillonBrut(brut)) continue;
      brouillons.push(versBrouillon(id, brut));
    } catch {
      // Fichier illisible ou JSON invalide : ignoré, pas de crash.
    }
  }

  return brouillons.sort((a, b) => b.genereLe.getTime() - a.genereLe.getTime());
}

/** Supprime le brouillon `id` (rejet, ou nettoyage après validation).
 *  Validation stricte de `id` AVANT toute construction de chemin — même
 *  rigueur anti-traversal que `/api/photos/[id]/[fichier]`. Un id invalide ou
 *  un fichier déjà absent est un no-op silencieux, jamais une exception. */
export function supprimerBrouillon(id: string): void {
  if (!MOTIF_ID.test(id)) return;
  const racine = process.env.GARMIN_DATA_DIR ?? '/work';
  try {
    unlinkSync(`${racine}/export/brouillons-saisie/${id}.json`);
  } catch {
    // Déjà absent (double clic, brouillon déjà consommé) : rien à faire.
  }
}
