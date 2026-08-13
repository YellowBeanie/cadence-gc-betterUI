'use client';

import {
  Line, LineChart, Bar, BarChart, ResponsiveContainer,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts';
import type { ReactNode } from 'react';
import type { Tendances } from '@/lib/types';
import { EnteteTuile } from './ligne-mesure';

/** Convertit une valeur potentiellement absente en texte de tooltip. Recharts
 *  affiche sinon "null" en toutes lettres au survol d'un point manquant — et
 *  un 0 serait un mensonge (voir lib/types.ts sur les stades de sommeil). */
function tiretSiAbsent(unite = '') {
  return (v: unknown) => (v == null ? '—' : `${v}${unite}`);
}

// Re-stylage Cadence v2 (tâche 22) : fond bg, grille neutral-300, séries
// HRV/scores en encre, baselines en neutral-400 pointillé — les 4 teintes de
// sommeil par phase restent inchangées (c'est de la donnée). Axes Archivo.
const COULEUR_PRINCIPALE = '#201e1d';
const COULEUR_BASELINE = '#bab6b6';
const COULEUR_GRILLE = '#d7d3d3';
const COULEUR_ATTENUEE = '#7d7979';
const STYLE_AXE = { fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 10, fill: COULEUR_ATTENUEE };
const STYLE_LEGENDE = { fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: COULEUR_ATTENUEE };
const STYLE_TOOLTIP = { background: '#f3f2f2', border: '1px solid #d7d3d3' };

/** Panneau commun à tous les graphiques : séparé par un filet 2px, pas de
 *  tuile flottante — état vide explicite plutôt qu'un graphique aux axes
 *  déserts. */
function Panneau({ titre, vide, enfants }: { titre: string; vide: boolean; enfants: ReactNode }) {
  return (
    <section className="section">
      <div className="wrap" style={{ paddingBlock: 'clamp(40px,6vh,72px)' }}>
        <EnteteTuile>{titre}</EnteteTuile>
        {vide ? (
          <p className="p mt-3">Pas encore de données.</p>
        ) : (
          <div className="mt-4" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">{enfants}</ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}

/** Section promue (tâche 39, personnalisation des visuels) : une mesure de
 *  tendance de la bande de mesures (dashboard) choisie en variante
 *  « courbe-section » (lib/visuels-mesures.ts) est rendue ici plutôt qu'en
 *  tuile — même style de courbe claire que les quatre graphiques ci-dessous
 *  (Panneau, couleurs, axes), un point par jour. `donnees` est déjà tranchée
 *  par l'appelant (components/bande-mesures.tsx, 30 derniers jours) et déjà
 *  connue non vide (`varianteEffective` s'en assure) : `vide` couvre quand
 *  même le cas limite pour ne jamais rendre un graphique aux axes déserts. */
export function CourbeMesure({
  titre, donnees, unite = '',
}: {
  titre: string;
  donnees: { date: string; valeur: number | null }[];
  unite?: string;
}) {
  return (
    <Panneau titre={titre} vide={donnees.length === 0} enfants={
      <LineChart data={donnees}>
        <CartesianGrid stroke={COULEUR_GRILLE} strokeWidth={1} horizontal vertical={false} />
        <XAxis dataKey="date" tick={STYLE_AXE} stroke={COULEUR_GRILLE} />
        <YAxis tick={STYLE_AXE} stroke={COULEUR_GRILLE} tickCount={3} />
        <Tooltip formatter={tiretSiAbsent(unite)} contentStyle={STYLE_TOOLTIP}
                 labelStyle={{ color: COULEUR_ATTENUEE }} itemStyle={{ color: COULEUR_PRINCIPALE }} />
        <Line isAnimationActive={false} dataKey="valeur" name={titre} stroke={COULEUR_PRINCIPALE} strokeWidth={2} dot={false} />
      </LineChart>
    } />
  );
}

/** Quatre graphiques de tendance de l'écran « analyses » (re-stylage
 *  Cadence v2, tâche 22) — chacun sa propre section pleine largeur séparée
 *  par un filet, sous la tendance 8 semaines. */
export function Graphiques({ t }: { t: Tendances }) {
  return (
    <>
      <Panneau titre="HRV nocturne et seuils" vide={t.hrv.length === 0} enfants={
        <LineChart data={t.hrv}>
          <CartesianGrid stroke={COULEUR_GRILLE} strokeWidth={1} horizontal vertical={false} />
          <XAxis dataKey="date" tick={STYLE_AXE} stroke={COULEUR_GRILLE} />
          <YAxis tick={STYLE_AXE} stroke={COULEUR_GRILLE} unit=" ms" tickCount={3} />
          <Tooltip formatter={tiretSiAbsent(' ms')} contentStyle={STYLE_TOOLTIP}
                   labelStyle={{ color: COULEUR_ATTENUEE }} itemStyle={{ color: COULEUR_PRINCIPALE }} />
          <Legend wrapperStyle={STYLE_LEGENDE} />
          <Line isAnimationActive={false} dataKey="nuit" name="HRV nuit" stroke={COULEUR_PRINCIPALE} strokeWidth={2} dot={false} />
          <Line isAnimationActive={false} dataKey="basse" name="Seuil bas" stroke={COULEUR_BASELINE} strokeDasharray="4 4" dot={false} />
          <Line isAnimationActive={false} dataKey="haute" name="Seuil haut" stroke={COULEUR_BASELINE} strokeDasharray="4 4" dot={false} />
        </LineChart>
      } />
      <Panneau titre="Training readiness" vide={t.readiness.length === 0} enfants={
        <LineChart data={t.readiness}>
          <CartesianGrid stroke={COULEUR_GRILLE} strokeWidth={1} horizontal vertical={false} />
          <XAxis dataKey="date" tick={STYLE_AXE} stroke={COULEUR_GRILLE} />
          <YAxis domain={[0, 100]} tick={STYLE_AXE} stroke={COULEUR_GRILLE} tickCount={3} />
          <Tooltip formatter={tiretSiAbsent()} contentStyle={STYLE_TOOLTIP}
                   labelStyle={{ color: COULEUR_ATTENUEE }} itemStyle={{ color: COULEUR_PRINCIPALE }} />
          <Line isAnimationActive={false} dataKey="score" name="Score" stroke={COULEUR_PRINCIPALE} strokeWidth={2} dot={false} />
        </LineChart>
      } />
      <Panneau titre="Sommeil par phase (h)" vide={t.sommeil.length === 0} enfants={
        <BarChart data={t.sommeil}>
          <CartesianGrid stroke={COULEUR_GRILLE} strokeWidth={1} horizontal vertical={false} />
          <XAxis dataKey="date" tick={STYLE_AXE} stroke={COULEUR_GRILLE} />
          <YAxis tick={STYLE_AXE} stroke={COULEUR_GRILLE} tickCount={3} />
          <Tooltip formatter={tiretSiAbsent(' h')} contentStyle={STYLE_TOOLTIP}
                   labelStyle={{ color: COULEUR_ATTENUEE }} itemStyle={{ color: COULEUR_PRINCIPALE }} />
          <Legend wrapperStyle={STYLE_LEGENDE} />
          {/* Teintes de stade inchangées (données), cohérence inter-écrans. */}
          <Bar isAnimationActive={false} dataKey="profond" name="Profond" stackId="s" fill="#5794F2" />
          <Bar isAnimationActive={false} dataKey="rem" name="REM" stackId="s" fill="#B877D9" />
          <Bar isAnimationActive={false} dataKey="leger" name="Léger" stackId="s" fill="#8AB8FF" />
          <Bar isAnimationActive={false} dataKey="eveille" name="Éveillé" stackId="s" fill="#FF9830" />
        </BarChart>
      } />
      <Panneau titre="Charge aiguë et chronique" vide={t.charge.length === 0} enfants={
        <LineChart data={t.charge}>
          <CartesianGrid stroke={COULEUR_GRILLE} strokeWidth={1} horizontal vertical={false} />
          <XAxis dataKey="date" tick={STYLE_AXE} stroke={COULEUR_GRILLE} />
          <YAxis tick={STYLE_AXE} stroke={COULEUR_GRILLE} tickCount={3} />
          <Tooltip formatter={tiretSiAbsent()} contentStyle={STYLE_TOOLTIP}
                   labelStyle={{ color: COULEUR_ATTENUEE }} itemStyle={{ color: COULEUR_PRINCIPALE }} />
          <Legend wrapperStyle={STYLE_LEGENDE} />
          <Line isAnimationActive={false} dataKey="aigue" name="Aiguë (7 j)" stroke={COULEUR_PRINCIPALE} strokeWidth={2} dot={false} />
          <Line isAnimationActive={false} dataKey="chronique" name="Chronique (28 j)" stroke={COULEUR_BASELINE} strokeWidth={2} dot={false} />
        </LineChart>
      } />
    </>
  );
}
