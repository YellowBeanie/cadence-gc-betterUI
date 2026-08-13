'use server';

import { writeFileSync } from 'node:fs';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { enregistrerSeance, enregistrerPoint, enregistrerSegments, type Segment } from '@/lib/db/training';
import { supprimerBrouillon } from '@/lib/brouillons';
import { SPORTS } from '@/lib/types';
import { lirePreference, ecrirePreference, supprimerPreference } from '@/lib/db/preferences';
import {
  LAYOUT_PAR_DEFAUT, appliquerLayout, SECTIONS_ACCUEIL, TUILES_MESURES, HEROS_OPTIONS, estObjet,
  type LayoutAccueil, type ElementLayout, type IdTuile,
} from '@/lib/layout-accueil';
import {
  appliquerLayoutSeance, defautPourSport, sportValide, SECTIONS_SEANCE, type LayoutSeance,
} from '@/lib/layout-seance';
import { variantesCompatibles, type VarianteVisuel } from '@/lib/visuels-mesures';
import {
  SECTIONS_HISTORIQUE, LAYOUT_HISTORIQUE_PAR_DEFAUT, appliquerLayoutHistorique,
} from '@/lib/layout-historique';
import {
  SECTIONS_SEANCES, LAYOUT_SEANCES_PAR_DEFAUT, appliquerLayoutSeances,
} from '@/lib/layout-seances';
import { DENSITES, type Densite } from '@/lib/densite';
import { FENETRES, type FenetreJours } from '@/lib/fenetre-temporelle';
import { appliquerSeriesCourbe } from '@/lib/series-courbe';
import { normaliseurPour } from '@/lib/preferences-registre';
import { initialiserSchema } from '@/lib/db/schema';
import { SPORTS_OBJECTIF, TYPES_OBJECTIF, type SportObjectif, type TypeObjectif } from '@/lib/objectifs';
import {
  creerObjectif, basculerActifObjectif, supprimerObjectif as supprimerObjectifDb,
} from '@/lib/db/objectifs';
import { changerStatutSource } from '@/lib/db/connaissances';

/** L'app n'a aucun privilège Docker : elle exprime une intention, le veilleur
 *  l'exécute. Voir le service `watcher` du compose. */
export async function demanderSync(): Promise<void> {
  const racine = process.env.GARMIN_DATA_DIR ?? '/work';
  writeFileSync(`${racine}/.sync-requested`, '');
  revalidatePath('/');
}

/** Même pattern que `demanderSync` : le drapeau est consommé par le cron hôte
 *  `analyse.sh` (tâche 16), pas par un conteneur avec accès Docker — l'app
 *  reste sans privilège. */
export async function demanderAnalyse(): Promise<void> {
  const racine = process.env.GARMIN_DATA_DIR ?? '/work';
  writeFileSync(`${racine}/.analyse-requested`, '');
  revalidatePath('/');
}

// --- Saisie : validation avant écriture -------------------------------------
//
// Une server action reçoit une FormData arbitraire : n'importe qui capable de
// POSTer sur cette route contourne les attributs HTML `min`/`max`/`required`
// du formulaire. Rien ne garantit donc qu'un RPE tienne entre 1 et 10 ou
// qu'une date soit réelle. Comportement retenu : toute valeur invalide est
// REJETÉE — jamais tronquée, arrondie, ni convertie silencieusement en `null`
// ou en 0 — et l'écran affiche le message d'erreur renvoyé par l'action à la
// place d'écrire quoi que ce soit en base. Un champ absent (vide/non fourni)
// reste, lui, légitimement `null` : c'est la seule valeur « rien à signaler »
// autorisée (voir lib/db/training.ts et la règle « jamais de faux zéro »).

/** État renvoyé par les actions de saisie, consommé par `useActionState` côté
 *  client : `erreur` porte le message à afficher, ou `null` en cas de succès
 *  (auquel cas l'action redirige et ce retour n'est jamais lu). */
export type EtatSoumission = { erreur: string | null };

function texteOuNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
}

/** Format AAAA-MM-JJ strict, et date calendaire réelle : `new Date(...)`
 *  « corrige » silencieusement un 2026-02-31 en 2026-03-03, donc on revérifie
 *  que les composantes recomposées correspondent bien à celles fournies. */
function dateValide(v: FormDataEntryValue | null): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [an, mois, jour] = v.split('-').map(Number);
  const d = new Date(Date.UTC(an, mois - 1, jour));
  return d.getUTCFullYear() === an && d.getUTCMonth() === mois - 1 && d.getUTCDate() === jour;
}

/** Entier dans [min, max], ou absent (`null`/chaîne vide) → `null`. Toute
 *  autre valeur (texte, décimal, hors bornes, mauvais type) est rejetée. */
function entierBorne(
  v: FormDataEntryValue | null, min: number, max: number,
): { ok: true; valeur: number | null } | { ok: false } {
  if (v === null || (typeof v === 'string' && v.trim() === '')) return { ok: true, valeur: null };
  if (typeof v !== 'string') return { ok: false };
  const s = v.trim();
  if (!/^-?\d+$/.test(s)) return { ok: false };
  const n = Number(s);
  if (n < min || n > max) return { ok: false };
  return { ok: true, valeur: n };
}

export async function soumettreSeance(
  _etat: EtatSoumission, f: FormData,
): Promise<EtatSoumission> {
  const date = f.get('date');
  if (!dateValide(date)) return { erreur: 'Date invalide (format attendu AAAA-MM-JJ).' };

  const sport = String(f.get('sport') ?? '');
  if (!(SPORTS as readonly string[]).includes(sport)) {
    return { erreur: 'Sport non reconnu.' };
  }

  const duree = entierBorne(f.get('dureeMin'), 1, 600);
  if (!duree.ok) return { erreur: 'Durée invalide (1 à 600 minutes).' };

  const rpe = entierBorne(f.get('rpe'), 1, 10);
  if (!rpe.ok) return { erreur: 'RPE invalide (1 à 10).' };

  const garminActivityId = entierBorne(f.get('garminActivityId'), 1, Number.MAX_SAFE_INTEGER);
  if (!garminActivityId.ok) return { erreur: 'Activité Garmin rattachée invalide.' };

  enregistrerSeance({
    date,
    sport,
    sousType: texteOuNull(f.get('sousType')),
    dureeMin: duree.valeur,
    rpe: rpe.valeur,
    notes: texteOuNull(f.get('notes')),
    garminActivityId: garminActivityId.valeur,
  });
  redirect('/historique');
}

export async function soumettrePoint(
  _etat: EtatSoumission, f: FormData,
): Promise<EtatSoumission> {
  const date = f.get('date');
  if (!dateValide(date)) return { erreur: 'Date invalide (format attendu AAAA-MM-JJ).' };

  const forme = entierBorne(f.get('forme'), 1, 5);
  if (!forme.ok) return { erreur: 'Forme invalide (1 à 5).' };

  const motivation = entierBorne(f.get('motivation'), 1, 5);
  if (!motivation.ok) return { erreur: 'Motivation invalide (1 à 5).' };

  const sommeilPercu = entierBorne(f.get('sommeilPercu'), 1, 5);
  if (!sommeilPercu.ok) return { erreur: 'Sommeil ressenti invalide (1 à 5).' };

  enregistrerPoint({
    date,
    forme: forme.valeur,
    motivation: motivation.valeur,
    sommeilPercu: sommeilPercu.valeur,
    douleurs: texteOuNull(f.get('douleurs')),
    notes: texteOuNull(f.get('notes')),
  });
  redirect('/');
}

// --- Saisie vocale : validation du brouillon avant écriture (tâche 28) -----
//
// Le brouillon affiché sur /saisie est une PROPOSITION de Claude, jamais
// écrite en base telle quelle : valider revient à soumettre le même
// formulaire que soumettreSeance (mêmes règles dateValide/entierBorne — un
// champ invalide est REJETÉ, jamais tronqué ou converti en null/0), avec en
// plus des lignes de segments répétées (`segmentType`/`segmentDureeMin`/
// `segmentNotes`, un triplet par ligne, alignées par index — FormData ne
// porte pas de structure imbriquée).

/** Motif du nom de fichier généré par `/api/audio-saisie` (sans extension),
 *  même motif que `lib/brouillons.ts` — revalidé ici pour ne jamais passer un
 *  `id` non conforme à `supprimerBrouillon`/`enregistrerSeance` en aval. */
const MOTIF_ID_BROUILLON = /^\d{8}-\d{6}-[0-9a-f]{6,16}$/;

export async function validerBrouillon(
  _etat: EtatSoumission, f: FormData,
): Promise<EtatSoumission> {
  const id = String(f.get('id') ?? '');
  if (!MOTIF_ID_BROUILLON.test(id)) return { erreur: 'Brouillon invalide ou déjà traité.' };

  const date = f.get('date');
  if (!dateValide(date)) return { erreur: 'Date invalide (format attendu AAAA-MM-JJ).' };

  const sport = String(f.get('sport') ?? '');
  if (!(SPORTS as readonly string[]).includes(sport)) {
    return { erreur: 'Sport non reconnu.' };
  }

  const duree = entierBorne(f.get('dureeMin'), 1, 600);
  if (!duree.ok) return { erreur: 'Durée invalide (1 à 600 minutes).' };

  const rpe = entierBorne(f.get('rpe'), 1, 10);
  if (!rpe.ok) return { erreur: 'RPE invalide (1 à 10).' };

  const garminActivityId = entierBorne(f.get('garminActivityId'), 1, Number.MAX_SAFE_INTEGER);
  if (!garminActivityId.ok) return { erreur: 'Activité Garmin rattachée invalide.' };

  const types = f.getAll('segmentType');
  const durees = f.getAll('segmentDureeMin');
  const notesSegments = f.getAll('segmentNotes');
  const segments: Segment[] = [];
  for (let i = 0; i < types.length; i += 1) {
    const type = texteOuNull(types[i] ?? null);
    if (type === null) continue; // ligne vidée par l'utilisateur : ignorée, pas rejetée
    const dureeSegment = entierBorne(durees[i] ?? null, 1, 600);
    if (!dureeSegment.ok) return { erreur: `Durée de segment invalide (${type}).` };
    segments.push({ type, dureeMin: dureeSegment.valeur, notes: texteOuNull(notesSegments[i] ?? null) });
  }

  const seanceId = enregistrerSeance({
    date,
    sport,
    dureeMin: duree.valeur,
    rpe: rpe.valeur,
    notes: texteOuNull(f.get('notes')),
    garminActivityId: garminActivityId.valeur,
    source: 'saisie-vocale',
  });
  if (segments.length > 0) enregistrerSegments(seanceId, segments);
  supprimerBrouillon(id);

  redirect('/historique');
}

/** Rejet d'un brouillon : suppression seule, rien n'est jamais écrit en base
 *  (contrairement à `validerBrouillon`). Utilisée directement comme action de
 *  formulaire (`<form action={rejeterBrouillon}>`), même convention que
 *  `demanderSync`/`demanderAnalyse`. Pas de `revalidatePath` : `/saisie` est
 *  `force-dynamic` (lecture disque à chaque requête), donc le prochain rendu
 *  de la route relit déjà le disque sans avoir besoin d'invalider un cache —
 *  et `soumettreSeance`/`soumettrePoint` ne l'appellent pas non plus. */
export async function rejeterBrouillon(f: FormData): Promise<void> {
  const id = String(f.get('id') ?? '');
  supprimerBrouillon(id);
}

// --- Réglages : layout de l'accueil (tâche 37) ------------------------------
//
// Toute la personnalisation de l'accueil vit sous UNE seule clé de préférence
// ('accueil', cf. docs/superpowers/specs/2026-08-11-personnalisation.md) : les
// sections, les tuiles et le héros sont fusionnés en un seul objet
// LayoutAccueil (lib/layout-accueil.ts). Chaque action ci-dessous relit ce
// layout déjà fusionné (tolérant), applique une modification ciblée, réécrit
// l'ensemble — jamais seulement le fragment modifié, pour ne pas perdre le
// reste de la personnalisation stockée sous la même clé.
//
// Contrairement à soumettreSeance/soumettrePoint (texte libre, erreurs
// affichées à l'écran via useActionState), ces actions ne sont déclenchées
// que par de vrais boutons générés depuis les ids connus de /reglages : un id
// inconnu ne peut arriver que par une requête POST forgée à la main. Il est
// alors REJETÉ (aucune écriture) plutôt qu'inséré tel quel dans le layout —
// pas de message d'erreur affiché, aucun champ de saisie libre ne motive
// d'useActionState ici.

function layoutActuel(): LayoutAccueil {
  const sauvegarde = lirePreference<LayoutAccueil | null>('accueil', null);
  return appliquerLayout(LAYOUT_PAR_DEFAUT, sauvegarde);
}

function listeCible(layout: LayoutAccueil, liste: 'sections' | 'tuiles'): ElementLayout<string>[] {
  return liste === 'sections' ? layout.sections : layout.tuiles;
}

export async function deplacerElementLayout(
  liste: 'sections' | 'tuiles', id: string, direction: 'haut' | 'bas',
): Promise<void> {
  const idsConnus: readonly string[] = liste === 'sections' ? SECTIONS_ACCUEIL : TUILES_MESURES;
  if (!idsConnus.includes(id)) return; // id inconnu : rejeté, cf. note ci-dessus

  const layout = layoutActuel();
  const cible = listeCible(layout, liste);
  const index = cible.findIndex((e) => e.id === id);
  if (index === -1) return;
  const voisin = direction === 'haut' ? index - 1 : index + 1;
  if (voisin < 0 || voisin >= cible.length) return; // déjà en haut/bas de liste

  [cible[index], cible[voisin]] = [cible[voisin], cible[index]];
  ecrirePreference('accueil', layout);
  revalidatePath('/reglages');
  revalidatePath('/');
}

export async function basculerVisibiliteLayout(liste: 'sections' | 'tuiles', id: string): Promise<void> {
  const idsConnus: readonly string[] = liste === 'sections' ? SECTIONS_ACCUEIL : TUILES_MESURES;
  if (!idsConnus.includes(id)) return; // id inconnu : rejeté

  const layout = layoutActuel();
  const entree = listeCible(layout, liste).find((e) => e.id === id);
  if (!entree) return;
  entree.visible = !entree.visible;

  ecrirePreference('accueil', layout);
  revalidatePath('/reglages');
  revalidatePath('/');
}

export async function definirHerosLayout(f: FormData): Promise<void> {
  const heros = String(f.get('heros') ?? '');
  if (!(HEROS_OPTIONS as readonly string[]).includes(heros)) return; // id inconnu : rejeté

  const layout = layoutActuel();
  layout.heros = heros as LayoutAccueil['heros'];
  ecrirePreference('accueil', layout);
  revalidatePath('/reglages');
  revalidatePath('/');
}

/** Réinitialise UN SEUL bloc (sections, tuiles ou héros) au défaut — jamais
 *  les deux autres, bien que les trois partagent la même clé de préférence.
 *  Si les trois blocs sont redevenus identiques au défaut après ce
 *  changement, la ligne est supprimée plutôt que réécrite avec un JSON qui
 *  vaut de toute façon le défaut : `supprimerPreference` EST le mécanisme de
 *  retour au défaut (lib/db/preferences.ts), pas seulement une écriture. */
export async function reinitialiserBlocLayout(bloc: 'sections' | 'tuiles' | 'heros'): Promise<void> {
  const layout = layoutActuel();
  if (bloc === 'sections') layout.sections = LAYOUT_PAR_DEFAUT.sections.map((s) => ({ ...s }));
  else if (bloc === 'tuiles') layout.tuiles = LAYOUT_PAR_DEFAUT.tuiles.map((t) => ({ ...t }));
  else layout.heros = LAYOUT_PAR_DEFAUT.heros;

  if (JSON.stringify(layout) === JSON.stringify(LAYOUT_PAR_DEFAUT)) {
    supprimerPreference('accueil');
  } else {
    ecrirePreference('accueil', layout);
  }
  revalidatePath('/reglages');
  revalidatePath('/');
}

// --- Réglages : layout de la page de séance, par sport (tâche 38) ----------
//
// Même schéma que le layout de l'accueil ci-dessus, mais UNE préférence par
// sport plutôt qu'une seule clé partagée (cf. lib/layout-seance.ts) : chaque
// bouton de /reglages porte donc le sport en cours d'édition en plus de l'id
// de section.

// `sportValide` vit désormais dans lib/layout-seance.ts (tâche 46) : le
// registre des préférences (lib/preferences-registre.ts) en a besoin pour
// reconnaître la famille de clés dynamiques `seance:<sport>` à l'export/import
// — une seule définition, réutilisée ici comme là-bas.

function cleSeance(sport: string): string {
  return `seance:${sport}`;
}

function layoutSeanceActuel(sport: string): LayoutSeance {
  const sauvegarde = lirePreference<LayoutSeance | null>(cleSeance(sport), null);
  return appliquerLayoutSeance(defautPourSport(sport), sauvegarde);
}

export async function deplacerElementLayoutSeance(
  sport: string, id: string, direction: 'haut' | 'bas',
): Promise<void> {
  if (!sportValide(sport)) return;
  if (!(SECTIONS_SEANCE as readonly string[]).includes(id)) return; // id inconnu : rejeté

  const layout = layoutSeanceActuel(sport);
  const index = layout.sections.findIndex((e) => e.id === id);
  if (index === -1) return;
  const voisin = direction === 'haut' ? index - 1 : index + 1;
  if (voisin < 0 || voisin >= layout.sections.length) return; // déjà en haut/bas de liste

  [layout.sections[index], layout.sections[voisin]] = [layout.sections[voisin], layout.sections[index]];
  ecrirePreference(cleSeance(sport), layout);
  revalidatePath('/reglages');
  revalidatePath('/seance/[id]', 'page');
}

export async function basculerVisibiliteLayoutSeance(sport: string, id: string): Promise<void> {
  if (!sportValide(sport)) return;
  if (!(SECTIONS_SEANCE as readonly string[]).includes(id)) return; // id inconnu : rejeté

  const layout = layoutSeanceActuel(sport);
  const entree = layout.sections.find((e) => e.id === id);
  if (!entree) return;
  entree.visible = !entree.visible;

  ecrirePreference(cleSeance(sport), layout);
  revalidatePath('/reglages');
  revalidatePath('/seance/[id]', 'page');
}

/** Réinitialise le template d'UN sport au défaut de ce sport — jamais les
 *  autres, chacun vivant sous sa propre clé de préférence. `supprimerPreference`
 *  EST le mécanisme de retour au défaut (lib/db/preferences.ts), pas
 *  seulement une écriture — même logique que `reinitialiserBlocLayout`. */
export async function reinitialiserLayoutSeance(sport: string): Promise<void> {
  if (!sportValide(sport)) return;
  supprimerPreference(cleSeance(sport));
  revalidatePath('/reglages');
  revalidatePath('/seance/[id]', 'page');
}

// --- Réglages : variante de visuel par tuile de mesure (tâche 39) ----------
//
// Une seule clé de préférence ('visuels') porte un objet plat { [tuile]:
// variante } — pas de fusion structurelle à faire (contrairement au layout de
// l'accueil/de la séance, listes ordonnées) : chaque tuile ne porte qu'une
// seule valeur, indépendante des autres. Validation stricte contre la table
// de compatibilité (lib/visuels-mesures.ts) avant écriture — jamais une
// variante qui n'a pas de sens pour cette mesure stockée telle quelle ;
// `varianteEffective` revalide de toute façon à la lecture (donnée
// manquante), mais autant ne jamais écrire un choix déjà connu invalide.

export async function definirVarianteVisuel(mesure: string, f: FormData): Promise<void> {
  if (!(TUILES_MESURES as readonly string[]).includes(mesure)) return; // id inconnu : rejeté
  const idMesure = mesure as IdTuile;

  const choix = String(f.get('variante') ?? '');
  if (!variantesCompatibles(idMesure).includes(choix as VarianteVisuel)) return; // validation stricte

  const sauvegarde = lirePreference<unknown>('visuels', null);
  const visuels: Record<string, VarianteVisuel> = estObjet(sauvegarde)
    ? { ...(sauvegarde as Record<string, VarianteVisuel>) } : {};
  visuels[idMesure] = choix as VarianteVisuel;

  ecrirePreference('visuels', visuels);
  revalidatePath('/reglages');
  revalidatePath('/');
}

/** Réinitialise les variantes de visuel de TOUTES les tuiles (clé 'visuels')
 *  — garde-fou relevé par l'audit B1 : `reinitialiserBlocLayout('tuiles')`
 *  ne touche que l'ordre/la visibilité (clé 'accueil'), jamais les variantes
 *  choisies tuile par tuile, qui n'avaient encore aucun bouton de retour au
 *  défaut. Simple suppression de la clé, comme les autres réinitialisations
 *  (`reinitialiserBlocLayout`, `reinitialiserLayoutSeance`) — `varianteEnregistree`
 *  retombe alors sur `VARIANTE_PAR_DEFAUT` pour chaque tuile.
 */
export async function reinitialiserVisuels(): Promise<void> {
  supprimerPreference('visuels');
  revalidatePath('/reglages');
  revalidatePath('/');
}

// --- Réglages : layout à liste unique sous clé FIXE (historique, seances,
// tâche 45) -------------------------------------------------------------
//
// /historique et /seances partagent la même forme que la page de séance —
// UNE liste de sections (lib/layout-seance.ts, lib/layout-historique.ts,
// lib/layout-seances.ts) — mais sous une clé de préférence FIXE plutôt que
// par sport. Un petit cœur générique (l'audit B1 suggérait explicitement de
// généraliser plutôt que de tripler deplacerElementLayout/
// basculerVisibiliteLayout) ; chaque domaine garde sa propre fonction
// exportée — noms explicites côté /reglages, et chacun son propre
// `revalidatePath` (pas le même écran à invalider).

type ListeSections<Id extends string> = { sections: ElementLayout<Id>[] };

function layoutListeActuel<Id extends string>(
  cle: string, defaut: ListeSections<Id>,
  appliquer: (defaut: ListeSections<Id>, sauvegarde: unknown) => ListeSections<Id>,
): ListeSections<Id> {
  const sauvegarde = lirePreference<unknown>(cle, null);
  return appliquer(defaut, sauvegarde);
}

function deplacerDansListe<Id extends string>(
  cle: string, idsConnus: readonly Id[], defaut: ListeSections<Id>,
  appliquer: (defaut: ListeSections<Id>, sauvegarde: unknown) => ListeSections<Id>,
  id: string, direction: 'haut' | 'bas',
): void {
  if (!(idsConnus as readonly string[]).includes(id)) return; // id inconnu : rejeté
  const layout = layoutListeActuel(cle, defaut, appliquer);
  const index = layout.sections.findIndex((e) => e.id === id);
  if (index === -1) return;
  const voisin = direction === 'haut' ? index - 1 : index + 1;
  if (voisin < 0 || voisin >= layout.sections.length) return; // déjà en haut/bas de liste

  [layout.sections[index], layout.sections[voisin]] = [layout.sections[voisin], layout.sections[index]];
  ecrirePreference(cle, layout);
}

function basculerDansListe<Id extends string>(
  cle: string, idsConnus: readonly Id[], defaut: ListeSections<Id>,
  appliquer: (defaut: ListeSections<Id>, sauvegarde: unknown) => ListeSections<Id>,
  id: string,
): void {
  if (!(idsConnus as readonly string[]).includes(id)) return; // id inconnu : rejeté
  const layout = layoutListeActuel(cle, defaut, appliquer);
  const entree = layout.sections.find((e) => e.id === id);
  if (!entree) return;
  entree.visible = !entree.visible;
  ecrirePreference(cle, layout);
}

export async function deplacerElementLayoutHistorique(id: string, direction: 'haut' | 'bas'): Promise<void> {
  deplacerDansListe('historique', SECTIONS_HISTORIQUE, LAYOUT_HISTORIQUE_PAR_DEFAUT, appliquerLayoutHistorique, id, direction);
  revalidatePath('/reglages');
  revalidatePath('/historique');
}

export async function basculerVisibiliteLayoutHistorique(id: string): Promise<void> {
  basculerDansListe('historique', SECTIONS_HISTORIQUE, LAYOUT_HISTORIQUE_PAR_DEFAUT, appliquerLayoutHistorique, id);
  revalidatePath('/reglages');
  revalidatePath('/historique');
}

/** `supprimerPreference` EST le mécanisme de retour au défaut (lib/db/preferences.ts),
 *  même logique que `reinitialiserBlocLayout`/`reinitialiserLayoutSeance`. */
export async function reinitialiserLayoutHistorique(): Promise<void> {
  supprimerPreference('historique');
  revalidatePath('/reglages');
  revalidatePath('/historique');
}

export async function deplacerElementLayoutSeances(id: string, direction: 'haut' | 'bas'): Promise<void> {
  deplacerDansListe('seances', SECTIONS_SEANCES, LAYOUT_SEANCES_PAR_DEFAUT, appliquerLayoutSeances, id, direction);
  revalidatePath('/reglages');
  revalidatePath('/seances');
}

export async function basculerVisibiliteLayoutSeances(id: string): Promise<void> {
  basculerDansListe('seances', SECTIONS_SEANCES, LAYOUT_SEANCES_PAR_DEFAUT, appliquerLayoutSeances, id);
  revalidatePath('/reglages');
  revalidatePath('/seances');
}

export async function reinitialiserLayoutSeances(): Promise<void> {
  supprimerPreference('seances');
  revalidatePath('/reglages');
  revalidatePath('/seances');
}

// --- Réglages : densité d'affichage (tâche 45) --------------------------
//
// Une seule clé de préférence ('densite') portant une simple chaîne — pas de
// fusion structurelle (contrairement aux layouts ci-dessus) : même
// convention que `definirHerosLayout` (id inconnu rejeté silencieusement,
// pas de message d'erreur affiché — aucun champ de saisie libre ici, le
// sélecteur de /reglages ne propose que les deux valeurs connues).

export async function definirDensite(f: FormData): Promise<void> {
  const valeur = String(f.get('densite') ?? '');
  if (!(DENSITES as readonly string[]).includes(valeur)) return; // valeur inconnue : rejetée

  ecrirePreference('densite', valeur as Densite);
  revalidatePath('/reglages');
  revalidatePath('/');
  revalidatePath('/historique');
  revalidatePath('/seances');
}

// --- Réglages : fenêtre temporelle (tâche 47) ---------------------------
//
// Une seule clé de préférence ('fenetre_jours') portant un entier parmi
// {7, 14, 30} — même convention que `definirDensite` ci-dessus (valeur
// inconnue rejetée silencieusement, le sélecteur de /reglages ne propose que
// les trois valeurs connues). Pilote la bande de stats « N derniers jours »
// de /historique et les sparklines des tuiles de mesures du dashboard —
// jamais les vues à période propre par nature (charge par semaine ISO,
// records, liste des séances...), cf. lib/fenetre-temporelle.ts.

export async function definirFenetre(f: FormData): Promise<void> {
  const valeur = Number(f.get('fenetre_jours'));
  if (!(FENETRES as readonly number[]).includes(valeur)) return; // valeur inconnue : rejetée

  ecrirePreference('fenetre_jours', valeur as FenetreJours);
  revalidatePath('/reglages');
  revalidatePath('/');
  revalidatePath('/historique');
}

// --- Réglages : séries optionnelles de la courbe de séance (tâche 48,
// gisement G7 du rapport d'audit B1) ---------------------------------------
//
// Contrairement aux couples déplacer/basculer d'un id ci-dessus, l'appelant
// (components/courbe-seance.tsx) envoie ici directement la LISTE RÉSULTANTE
// après le clic — calculée côté serveur au rendu (app/seance/[id]/page.tsx),
// à partir de l'état honnêtement filtré affiché à l'écran (séries réellement
// disponibles POUR CETTE séance, cf. lib/trackpoints.ts `seriesDisponibles`)
// plutôt que de la préférence brute en base : la préférence stockée peut
// porter une série absente de l'activité affichée (ex. puissance, absente
// en randonnée) — recalculer à partir de ce que l'utilisateur voit évite un
// clic qui semble actif mais que l'action rejetterait silencieusement faute
// de correspondre à l'écran. `appliquerSeriesCourbe` revalide quand même la
// liste reçue (ids connus, sans doublon, au plus deux) avant écriture —
// jamais un POST forgé écrit tel quel.

function cleCourbes(sport: string): string {
  return `courbes:${sport}`;
}

export async function definirSeriesCourbe(sport: string, series: string[]): Promise<void> {
  if (!sportValide(sport)) return;
  ecrirePreference(cleCourbes(sport), appliquerSeriesCourbe(series));
  revalidatePath('/seance/[id]', 'page');
}

// --- Réglages : import JSON des préférences (tâche 46, gisement G5 du
// rapport d'audit B1) ---------------------------------------------------
//
// C'est la surface d'entrée d'un fichier TIERS (sauvegarde personnelle
// rejouée, ou partage communautaire) : validation stricte AVANT toute
// écriture, même esprit que soumettreSeance/validerBrouillon (rien n'est
// écrit tant que le fichier n'a pas passé chaque garde). Contrairement à
// ces derniers, une valeur de préférence invalide n'est jamais un motif de
// rejet total — chaque clé CONNUE du registre (lib/preferences-registre.ts)
// passe par son normaliseur, qui est la même fusion tolérante que l'écran
// utilise déjà (JSON partiel/mal formé → défaut, jamais une exception) ;
// seule une clé HORS registre est ignorée. Jamais de JSON arbitraire écrit
// tel quel en base.

const TAILLE_MAX_IMPORT_OCTETS = 100 * 1024; // 100 Ko, cf. mission tâche 46
const VERSIONS_CONFIG_CONNUES = new Set([1]);

export type EtatImportConfig = { erreur: string | null; importees: number; ignorees: number };

export async function importerConfiguration(
  _etat: EtatImportConfig, f: FormData,
): Promise<EtatImportConfig> {
  const fichier = f.get('fichier');
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: 'Aucun fichier sélectionné.', importees: 0, ignorees: 0 };
  }
  if (fichier.size > TAILLE_MAX_IMPORT_OCTETS) {
    return { erreur: 'Fichier trop volumineux (100 Ko maximum).', importees: 0, ignorees: 0 };
  }

  let contenu: unknown;
  try {
    contenu = JSON.parse(await fichier.text());
  } catch {
    return { erreur: 'Fichier JSON invalide.', importees: 0, ignorees: 0 };
  }

  if (!estObjet(contenu) || contenu.format !== 'cadence-config') {
    return { erreur: 'Format non reconnu (attendu : export de configuration Cadence).', importees: 0, ignorees: 0 };
  }
  if (typeof contenu.version !== 'number' || !VERSIONS_CONFIG_CONNUES.has(contenu.version)) {
    return { erreur: 'Version de configuration non prise en charge.', importees: 0, ignorees: 0 };
  }
  const { preferences } = contenu;
  if (!estObjet(preferences)) {
    return { erreur: 'Fichier sans préférences exploitables.', importees: 0, ignorees: 0 };
  }

  initialiserSchema();
  let importees = 0;
  let ignorees = 0;
  for (const [cle, valeur] of Object.entries(preferences)) {
    const normaliser = normaliseurPour(cle);
    if (!normaliser) { ignorees += 1; continue; } // clé hors registre : ignorée silencieusement
    ecrirePreference(cle, normaliser(valeur));
    importees += 1;
  }

  revalidatePath('/reglages');
  revalidatePath('/');
  revalidatePath('/historique');
  revalidatePath('/seances');
  revalidatePath('/seance/[id]', 'page');

  return { erreur: null, importees, ignorees };
}

// --- Objectifs déclarés (tâche 43, rapport B2 §B.2 N1b) ---------------------
//
// Écran de gestion sous /saisie : formulaire d'ajout (sport/type/cible,
// jamais un libellé en texte libre — cf. lib/objectifs.ts) + une liste avec
// activer/désactiver/supprimer. Même prudence de validation que
// soumettreSeance/soumettrePoint plus haut : une FormData arbitraire
// contourne les attributs HTML du formulaire, donc chaque champ est revérifié
// ici avant toute écriture — une valeur invalide est REJETÉE, jamais
// tronquée/arrondie.

/** Nombre réel dans `]0, max]`, avec décimales tolérées (une cible en km
 *  peut être fractionnaire, contrairement au RPE/à la durée en minutes des
 *  actions ci-dessus qui sont des entiers). `max` généreux mais fini : un
 *  objectif de 100 000 séances/semaine ne peut venir que d'une requête
 *  forgée à la main. */
function cibleValide(v: FormDataEntryValue | null): { ok: true; valeur: number } | { ok: false } {
  if (typeof v !== 'string') return { ok: false };
  const s = v.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false };
  const n = Number(s);
  if (!(n > 0) || n > 1000) return { ok: false };
  return { ok: true, valeur: n };
}

export async function ajouterObjectif(
  _etat: EtatSoumission, f: FormData,
): Promise<EtatSoumission> {
  const sport = String(f.get('sport') ?? '');
  if (!(SPORTS_OBJECTIF as readonly string[]).includes(sport)) {
    return { erreur: 'Sport non reconnu.' };
  }
  const type = String(f.get('type') ?? '');
  if (!(TYPES_OBJECTIF as readonly string[]).includes(type)) {
    return { erreur: 'Type d’objectif non reconnu.' };
  }
  const cible = cibleValide(f.get('cible'));
  if (!cible.ok) return { erreur: 'Cible invalide (nombre positif requis).' };

  initialiserSchema();
  creerObjectif({ sport: sport as SportObjectif, type: type as TypeObjectif, cible: cible.valeur });
  redirect('/saisie');
}

/** Un `id` absent/mal formé ne peut venir que d'une requête forgée à la main
 *  (les boutons de l'écran ne postent jamais que l'id réel d'un objectif déjà
 *  affiché) — rejeté silencieusement, même convention que les actions de
 *  layout (`basculerVisibiliteLayout`, etc.) plus haut dans ce fichier. */
function idObjectifValide(v: FormDataEntryValue | null): number | null {
  if (typeof v !== 'string' || !/^\d+$/.test(v)) return null;
  return Number(v);
}

export async function basculerObjectif(f: FormData): Promise<void> {
  const id = idObjectifValide(f.get('id'));
  if (id === null) return;
  basculerActifObjectif(id);
  revalidatePath('/saisie');
}

export async function retirerObjectif(f: FormData): Promise<void> {
  const id = idObjectifValide(f.get('id'));
  if (id === null) return;
  supprimerObjectifDb(id);
  revalidatePath('/saisie');
}

// --- Connaissances : file de validation (tâche 12, spec 4) ------------------
//
// Pendant UI du choix de l'utilisateur « autonome pour la littérature, validation pour
// le reste » : une source `en_attente` (liste blanche ou inconnue) n'est
// jamais utilisable par l'analyste tant qu'un humain ne l'a pas fait passer
// à `validee` ou `rejetee` — jamais un troisième verdict atteignable depuis
// cet écran. Signature à argument direct (pas de FormData), même convention
// que `deplacerElementLayoutHistorique` plus haut : liée via `.bind(null, id)`
// côté page (`app/connaissances/page.tsx`), l'id étant déjà connu au rendu
// serveur — jamais saisi par l'utilisateur. `changerStatutSource` est
// elle-même idempotente (id inconnu ou base absente : aucune écriture,
// jamais une erreur), donc aucune revalidation d'id n'est nécessaire ici.
export async function validerSourceConnaissance(id: number): Promise<void> {
  changerStatutSource(id, 'validee');
  revalidatePath('/connaissances');
}

export async function rejeterSourceConnaissance(id: number): Promise<void> {
  changerStatutSource(id, 'rejetee');
  revalidatePath('/connaissances');
}
