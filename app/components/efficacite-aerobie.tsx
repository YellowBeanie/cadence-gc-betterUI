'use client';

import {
  Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import type { EfficaciteAerobie as EfficaciteAerobieDonnee } from '@/lib/types';
import { formaterDateCourte, formaterAllure } from '@/lib/formatage';
import { EnteteTuile } from './ligne-mesure';

// Même style clair que components/graphiques.tsx (tâche 22) : grille et axes
// identiques, pour que ce graphique s'intègre visuellement aux quatre autres.
const COULEUR_PRINCIPALE = '#201e1d';
const COULEUR_GRILLE = '#d7d3d3';
const COULEUR_ATTENUEE = '#7d7979';
const STYLE_AXE = { fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 10, fill: COULEUR_ATTENUEE };

/** Tooltip sur mesure (date + allure + FC) — le formatter standard de
 *  Recharts ne peut afficher qu'une seule série ; ici l'index seul est
 *  tracé, allure et FC viennent du point de données complet. */
function TooltipEfficacite({
  active, payload,
}: {
  active?: boolean;
  payload?: { payload: EfficaciteAerobieDonnee }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ background: '#f3f2f2', border: '1px solid #d7d3d3', padding: '8px 10px', fontSize: 12 }}>
      <div style={{ color: COULEUR_ATTENUEE }}>{formaterDateCourte(p.debut.slice(0, 10))}</div>
      <div style={{ color: COULEUR_PRINCIPALE }}>{formaterAllure(p.allureSecKm)}</div>
      <div style={{ color: COULEUR_PRINCIPALE }}>FC {p.fcMoy ?? '—'}</div>
    </div>
  );
}

/** Efficacité aérobie — « allure à FC égale » (écran « analyses », tâche 25) :
 *  LA mesure de progrès en endurance fondamentale, `lireEfficaciteAerobie`.
 *  Moins de 2 points d'index disponibles → pas de graphique (illisible à un
 *  seul point) : la valeur unique s'affiche en grand chiffre avec sa date,
 *  « premier point de référence » plutôt qu'une tendance qui n'existe pas
 *  encore. */
export function EfficaciteAerobie({ seances }: { seances: EfficaciteAerobieDonnee[] }) {
  const points = seances.filter((s) => s.indice != null);
  if (points.length === 0) return null;

  return (
    <section className="section">
      <div className="wrap" style={{ paddingTop: 'clamp(32px,5vh,56px)', paddingBottom: 'clamp(40px,6vh,72px)' }}>
        <EnteteTuile>Efficacité aérobie — allure à FC égale</EnteteTuile>
        <p style={{ fontSize: 13, color: 'var(--color-neutral-600)', lineHeight: 1.45, maxWidth: '60ch', marginTop: 8 }}>
          Mètres parcourus par battement de cœur — monte quand tu vas plus vite pour le même effort cardiaque.
          C&apos;est le chiffre qui prouve que l&apos;endurance fondamentale paie.
        </p>
        {points.length < 2 ? (
          <div style={{ marginTop: 24 }}>
            <span style={{
              fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(2.8rem, 5vw, 4.4rem)',
              letterSpacing: '-0.04em', lineHeight: 1,
            }}>
              {points[0].indice?.toFixed(2)}
            </span>
            <span style={{ fontSize: 14, color: 'var(--color-neutral-600)', marginLeft: 10 }}>m / battement</span>
            <div style={{
              fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 11, letterSpacing: '.05em',
              textTransform: 'uppercase', color: 'var(--color-neutral-600)', marginTop: 10,
            }}>
              {formaterDateCourte(points[0].debut.slice(0, 10))} · premier point de référence
            </div>
          </div>
        ) : (
          <div className="mt-4" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points}>
                <CartesianGrid stroke={COULEUR_GRILLE} strokeWidth={1} horizontal vertical={false} />
                <XAxis dataKey="debut" tick={STYLE_AXE} stroke={COULEUR_GRILLE}
                       tickFormatter={(v: string) => formaterDateCourte(v.slice(0, 10))} />
                <YAxis tick={STYLE_AXE} stroke={COULEUR_GRILLE} tickCount={3} unit=" m/batt." />
                <Tooltip content={<TooltipEfficacite />} />
                <Line isAnimationActive={false} dataKey="indice" name="Index" stroke={COULEUR_PRINCIPALE} strokeWidth={2} dot={{ r: 4, fill: COULEUR_PRINCIPALE }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}
