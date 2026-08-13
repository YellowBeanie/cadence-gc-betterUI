'use client';

import {
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Legend, Tooltip,
} from 'recharts';
import type { TooltipContentProps } from 'recharts';
import type { AxeRadar, RadarComparatif } from '@/lib/radar-seances';

// Style Modernist (tâche 40, personnalisation) : mêmes jetons que
// components/graphiques.tsx (grille neutral-300, Archivo pour les axes/la
// légende), mais palette propre à ce composant — accent pour la séance
// affichée (SEULE sortie du mono-accent habituel du DS, comme JaugeAnneau
// pour l'objectif atteint), encre + neutre clair pour la séance comparée.
const COULEUR_GRILLE = '#d7d3d3';
const COULEUR_ACCENT = '#ec3013';
const COULEUR_ENCRE = '#201e1d';
const COULEUR_NEUTRE_CLAIR = '#eae7e7';
const COULEUR_ATTENUEE = '#7d7979';
const STYLE_AXE = { fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 10, fill: COULEUR_ATTENUEE, textTransform: 'uppercase' as const };
const STYLE_LEGENDE = { fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: COULEUR_ATTENUEE };
const STYLE_TOOLTIP = { background: '#f3f2f2', border: '1px solid #d7d3d3', padding: '10px 12px', fontSize: 12 };

/** Retire l'unité d'une valeur déjà formatée par lib/radar-seances.ts (ex.
 *  « 4.00 km » → « 4.00 ») : l'étiquette d'axe du radar reste compacte
 *  (mobile 375px), l'unité et le libellé de l'axe suffisent à la
 *  contextualiser — la valeur complète avec unité reste, elle, dans le
 *  tooltip (au survol). Purement un raccourci d'affichage, jamais une
 *  ré-écriture de la valeur réelle elle-même. */
function sansUnite(axe: AxeRadar, cote: 'A' | 'B'): string {
  const brut = cote === 'A' ? axe.reelA : axe.reelB;
  switch (axe.cle) {
    case 'distance': return brut.replace(' km', '');
    case 'allure': return brut.replace(' /km', '');
    case 'denivele': return brut.replace(' m', '');
    case 'fc': return brut.replace(' bpm', '');
    case 'z1z2': return brut.replace('%', '');
    default: return brut; // temps, charge : déjà compacts, pas d'unité à retirer
  }
}

function ContenuTooltip({ active, payload, nomA, nomB }: TooltipContentProps & { nomA: string; nomB: string }) {
  if (!active || !payload || payload.length === 0) return null;
  const axe = payload[0].payload as AxeRadar;
  return (
    <div style={STYLE_TOOLTIP}>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', marginBottom: 6 }}>
        {axe.libelle}
      </div>
      <div style={{ color: COULEUR_ACCENT }}>{nomA} : {axe.reelA}</div>
      <div style={{ color: COULEUR_ENCRE }}>{nomB} : {axe.reelB}</div>
    </div>
  );
}

/** RadarChart comparatif (tâche 40, personnalisation) : superpose la séance
 *  affichée (accent, remplissage ~12 %) à la séance comparée (encre, trait
 *  plein, remplissage neutre léger) sur les axes construits par
 *  `construireRadar` (lib/radar-seances.ts) — jamais de pourcentage seul,
 *  toujours la valeur réelle en étiquette et en tooltip. `PolarRadiusAxis`
 *  garde ses graduations invisibles à dessein : l'échelle radiale n'a de
 *  sens QUE relativement à chaque axe (normalisée sur le max des deux
 *  séances), afficher un nombre dessus laisserait croire à une échelle
 *  absolue commune à tous les axes, ce qui serait faux. Pas d'animation
 *  (`isAnimationActive={false}`) — même règle que le reste du DS. */
export function RadarSeances({
  radar, nomA, dateA, nomB, dateB,
}: {
  radar: RadarComparatif;
  nomA: string;
  dateA: string;
  nomB: string;
  dateB: string;
}) {
  const data = radar.axes.map((axe) => ({
    ...axe,
    etiquette: `${axe.libelle.toUpperCase()} ${sansUnite(axe, 'A')} / ${sansUnite(axe, 'B')}`,
  }));

  return (
    <div style={{ height: 340 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="65%">
          <PolarGrid stroke={COULEUR_GRILLE} />
          <PolarAngleAxis dataKey="etiquette" tick={STYLE_AXE} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} tickCount={5} />
          <Tooltip content={(props) => <ContenuTooltip {...props} nomA={nomA} nomB={nomB} />} />
          <Legend wrapperStyle={STYLE_LEGENDE} />
          <Radar isAnimationActive={false} name={`${nomA} — ${dateA}`} dataKey="normA"
                 stroke={COULEUR_ACCENT} fill={COULEUR_ACCENT} fillOpacity={0.12} strokeWidth={2} />
          <Radar isAnimationActive={false} name={`${nomB} — ${dateB}`} dataKey="normB"
                 stroke={COULEUR_ENCRE} fill={COULEUR_NEUTRE_CLAIR} fillOpacity={0.55} strokeWidth={2} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
