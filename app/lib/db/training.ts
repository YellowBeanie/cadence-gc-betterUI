import { ouvrirTraining } from './connection';
import { numeroSemaineIso } from '@/lib/formatage';

export type SaisieSeance = {
  date: string;
  sport: string;
  sousType?: string | null;
  dureeMin?: number | null;
  rpe?: number | null;
  notes?: string | null;
  garminActivityId?: number | null;
  source?: string;
};

export type SeanceManuelle = Required<Omit<SaisieSeance, 'source'>> & {
  id: number; source: string;
};

export type SaisiePoint = {
  date: string;
  forme?: number | null;
  motivation?: number | null;
  sommeilPercu?: number | null;
  douleurs?: string | null;
  notes?: string | null;
  source?: string;
};

export function enregistrerSeance(s: SaisieSeance): number {
  const db = ouvrirTraining();
  try {
    const maintenant = new Date().toISOString();
    const r = db.prepare(
      `INSERT INTO manual_sessions
         (date, sport, sub_type, duration_min, rpe, notes,
          garmin_activity_id, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(s.date, s.sport, s.sousType ?? null, s.dureeMin ?? null, s.rpe ?? null,
           s.notes ?? null, s.garminActivityId ?? null, s.source ?? 'manual',
           maintenant, maintenant);
    return Number(r.lastInsertRowid);
  } finally {
    db.close();
  }
}

export function lireSeancesManuelles(limite = 200): SeanceManuelle[] {
  const db = ouvrirTraining();
  try {
    return db.prepare(
      `SELECT * FROM manual_sessions ORDER BY date DESC, id DESC LIMIT ?`)
      .all(limite).map((r: Record<string, unknown>) => ({
        id: r.id as number,
        date: r.date as string,
        sport: r.sport as string,
        sousType: (r.sub_type as string) ?? null,
        dureeMin: (r.duration_min as number) ?? null,
        rpe: (r.rpe as number) ?? null,
        notes: (r.notes as string) ?? null,
        garminActivityId: (r.garmin_activity_id as number) ?? null,
        source: r.source as string,
      }));
  } finally {
    db.close();
  }
}

/** Saisie manuelle rattachée à une activité Garmin donnée (RPE, notes — page
 *  de détail de séance, tâche 20). La plus récente si plusieurs sont
 *  rattachées au même id (ne devrait pas arriver en usage normal, mais évite
 *  une ambiguïté silencieuse plutôt qu'un crash). `null` si aucune saisie
 *  n'est rattachée à cette activité. */
export function lireSeanceManuelleParGarminId(garminActivityId: number): SeanceManuelle | null {
  const db = ouvrirTraining();
  try {
    const r = db.prepare(
      `SELECT * FROM manual_sessions WHERE garmin_activity_id = ? ORDER BY id DESC LIMIT 1`)
      .get(garminActivityId) as Record<string, unknown> | undefined;
    if (!r) return null;
    return {
      id: r.id as number,
      date: r.date as string,
      sport: r.sport as string,
      sousType: (r.sub_type as string) ?? null,
      dureeMin: (r.duration_min as number) ?? null,
      rpe: (r.rpe as number) ?? null,
      notes: (r.notes as string) ?? null,
      garminActivityId: (r.garmin_activity_id as number) ?? null,
      source: r.source as string,
    };
  } finally {
    db.close();
  }
}

/** Un seul point par jour : une nouvelle saisie remplace la précédente. */
export function enregistrerPoint(p: SaisiePoint): void {
  const db = ouvrirTraining();
  try {
    const maintenant = new Date().toISOString();
    db.prepare(
      `INSERT INTO daily_checkin
         (date, form, motivation, sleep_quality, soreness, notes, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         form = excluded.form, motivation = excluded.motivation,
         sleep_quality = excluded.sleep_quality, soreness = excluded.soreness,
         notes = excluded.notes, source = excluded.source, updated_at = excluded.updated_at`)
      .run(p.date, p.forme ?? null, p.motivation ?? null, p.sommeilPercu ?? null,
           p.douleurs ?? null, p.notes ?? null, p.source ?? 'manual',
           maintenant, maintenant);
  } finally {
    db.close();
  }
}

/** `AAAA-MM-JJ` décalée de `delta` jours — copie locale du même utilitaire
 *  que `lib/db/garmin.ts` (arithmétique de date UTC, jamais un glissement
 *  d'un jour sur un changement d'heure). Dupliquée plutôt qu'importée depuis
 *  garmin.ts : garmin.ts importe déjà de training.ts
 *  (`lireSeanceManuelleParGarminId`), un import dans l'autre sens créerait un
 *  cycle entre les deux modules `lib/db`. */
function decalerDate(iso: string, delta: number): string {
  const [an, mois, jour] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(an, mois - 1, jour + delta));
  return d.toISOString().slice(0, 10);
}

/** Lundi (ISO) de la semaine contenant `iso` — même copie locale que
 *  `decalerDate` ci-dessus, même raison (éviter un cycle garmin.ts ↔
 *  training.ts). */
function lundiDeLaSemaine(iso: string): string {
  const [an, mois, jour] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(an, mois - 1, jour));
  const jourIso = d.getUTCDay() || 7; // 1 = lundi … 7 = dimanche
  d.setUTCDate(d.getUTCDate() - (jourIso - 1));
  return d.toISOString().slice(0, 10);
}

export type RegulariteBoxe = {
  isoSemaine: number;
  debut: string;
  nbSeances: number;
  rpeMoyen: number | null; // null si aucune saisie de la semaine ne porte de RPE, jamais 0
};

/** Régularité boxe (tâche 25, écran Historique) : nombre de séances
 *  manuelles de boxe (sport insensible à la casse) par semaine ISO, RPE
 *  moyen de la semaine. Mêmes bornes que `lireChargeParSemaine`/
 *  `lireZonesParSemaine` de garmin.ts : les semaines antérieures à la
 *  première saisie de boxe ne sont pas fabriquées. */
export function lireRegulariteBoxe(nbSemaines: number, dateFin?: string): RegulariteBoxe[] {
  const db = ouvrirTraining();
  try {
    const fin = dateFin ?? new Date().toISOString().slice(0, 10);
    const lundiFin = lundiDeLaSemaine(fin);
    const lundiDebut = decalerDate(lundiFin, -7 * (nbSemaines - 1));

    const premiere = db.prepare(
      `SELECT MIN(date) AS d FROM manual_sessions WHERE LOWER(sport) = 'boxe'`)
      .get() as { d: string | null } | undefined;
    const premiereDate = premiere?.d ?? null;
    if (!premiereDate) return [];

    const lignes = db.prepare(
      `SELECT date, rpe FROM manual_sessions WHERE LOWER(sport) = 'boxe' AND date BETWEEN ? AND ?`)
      .all(lundiDebut, fin) as { date: string; rpe: number | null }[];

    const semaines: RegulariteBoxe[] = [];
    for (let i = 0; i < nbSemaines; i += 1) {
      const lundi = decalerDate(lundiDebut, 7 * i);
      const dimanche = decalerDate(lundi, 6);
      if (dimanche < premiereDate) continue; // semaine entièrement avant la première saisie de boxe

      const lignesSemaine = lignes.filter((l) => l.date >= lundi && l.date <= dimanche);
      const avecRpe = lignesSemaine.filter((l) => l.rpe != null);
      semaines.push({
        isoSemaine: numeroSemaineIso(lundi),
        debut: lundi,
        nbSeances: lignesSemaine.length,
        rpeMoyen: avecRpe.length > 0
          ? Math.round((avecRpe.reduce((s, l) => s + (l.rpe as number), 0) / avecRpe.length) * 10) / 10
          : null,
      });
    }
    return semaines;
  } finally {
    db.close();
  }
}

export type StatsSportManuel = {
  sport: string;
  nombre: number;
  dureeTotaleMin: number | null;
  rpeMoyen: number | null; // null si aucune saisie du sport ne porte de RPE, jamais 0
};

/** Stats agrégées par sport saisi (écran Séances, tâche 26) : nombre,
 *  minutes totales, RPE moyen. Ne compte que les saisies AUTONOMES
 *  (`garmin_activity_id IS NULL`) — une saisie rattachée à une activité
 *  Garmin est déjà représentée par cette activité dans `lireStatsParSport`
 *  (lib/db/garmin.ts) ; la compter ici aussi doublerait la séance, exactement
 *  le principe que `fusionnerSeances` applique déjà à la liste (une saisie
 *  rattachée enrichit une activité, elle ne s'y additionne pas). */
export function lireStatsManuelles(): StatsSportManuel[] {
  const db = ouvrirTraining();
  try {
    const lignes = db.prepare(
      `SELECT sport, COUNT(*) AS nombre, SUM(duration_min) AS duree_totale
       FROM manual_sessions
       WHERE garmin_activity_id IS NULL
       GROUP BY sport
       ORDER BY nombre DESC, sport ASC`)
      .all() as { sport: string; nombre: number; duree_totale: number | null }[];

    const rpeLignes = db.prepare(
      `SELECT sport, rpe FROM manual_sessions WHERE garmin_activity_id IS NULL AND rpe IS NOT NULL`)
      .all() as { sport: string; rpe: number }[];
    const rpeParSport = new Map<string, number[]>();
    for (const r of rpeLignes) {
      const liste = rpeParSport.get(r.sport) ?? [];
      liste.push(r.rpe);
      rpeParSport.set(r.sport, liste);
    }

    return lignes.map((l) => {
      const rpes = rpeParSport.get(l.sport);
      return {
        sport: l.sport,
        nombre: l.nombre,
        dureeTotaleMin: l.duree_totale != null ? Math.round(l.duree_totale) : null,
        rpeMoyen: rpes && rpes.length > 0
          ? Math.round((rpes.reduce((s, r) => s + r, 0) / rpes.length) * 10) / 10
          : null,
      };
    });
  } finally {
    db.close();
  }
}

// --- Segments de séance (tâche 28, saisie vocale) --------------------------

export type Segment = {
  type: string;
  dureeMin?: number | null;
  notes?: string | null;
};

export type SegmentEnregistre = { id: number; ordre: number } & Required<Segment>;

/** Écrit tous les segments d'une séance déjà enregistrée (`seanceId` référence
 *  `manual_sessions.id`), dans l'ordre du récit — transaction dédiée : soit
 *  tous les segments sont écrits, soit aucun (jamais une liste tronquée en
 *  base si un segment échoue à mi-chemin). Ne touche jamais `manual_sessions`
 *  elle-même, c'est `enregistrerSeance` qui l'écrit. */
export function enregistrerSegments(seanceId: number, segments: Segment[]): void {
  if (segments.length === 0) return;
  const db = ouvrirTraining();
  try {
    const insert = db.prepare(
      `INSERT INTO seance_segments (seance_id, ordre, type, duree_min, notes) VALUES (?, ?, ?, ?, ?)`);
    db.exec('BEGIN');
    try {
      segments.forEach((s, i) => {
        insert.run(seanceId, i, s.type, s.dureeMin ?? null, s.notes ?? null);
      });
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  } finally {
    db.close();
  }
}

/** Segments d'une séance, dans l'ordre du récit. `[]` si la séance n'en a
 *  aucun (saisie manuelle classique, sans passage par la voix). */
export function lireSegments(seanceId: number): SegmentEnregistre[] {
  const db = ouvrirTraining();
  try {
    return db.prepare(
      `SELECT id, ordre, type, duree_min, notes FROM seance_segments
       WHERE seance_id = ? ORDER BY ordre`)
      .all(seanceId).map((r: Record<string, unknown>) => ({
        id: r.id as number,
        ordre: r.ordre as number,
        type: r.type as string,
        dureeMin: (r.duree_min as number) ?? null,
        notes: (r.notes as string) ?? null,
      }));
  } finally {
    db.close();
  }
}

export function lirePointDuJour(date: string): SaisiePoint | null {
  const db = ouvrirTraining();
  try {
    const r = db.prepare(`SELECT * FROM daily_checkin WHERE date = ?`)
      .get(date) as Record<string, unknown> | undefined;
    if (!r) return null;
    return {
      date: r.date as string,
      forme: (r.form as number) ?? null,
      motivation: (r.motivation as number) ?? null,
      sommeilPercu: (r.sleep_quality as number) ?? null,
      douleurs: (r.soreness as string) ?? null,
      notes: (r.notes as string) ?? null,
      source: r.source as string,
    };
  } finally {
    db.close();
  }
}
