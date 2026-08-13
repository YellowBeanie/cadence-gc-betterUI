'use client';

import {
  Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import type { TrackpointSeance } from '@/lib/types';
import { preparerCourbeSeance, type PointCourbe } from '@/lib/trackpoints';
import { formaterAllure } from '@/lib/formatage';
import { MAX_SERIES_ACTIVES, type SerieCourbe } from '@/lib/series-courbe';
import { definirSeriesCourbe } from '@/app/actions';
import { EnteteTuile } from './ligne-mesure';

// Couleurs design Cadence v2 (tâche 22) : FC en accent (couleur de la donnée
// « effort »), allure en encre — grille neutral-300, axes Archivo. Recharts
// reste `isAnimationActive={false}` (inchangé).
//
// Écart documenté au brief : la maquette v2 décrit un unique tracé SVG avec
// repères bas fixes (« 0 KM / mi-distance / distance »). L'app garde
// l'architecture à deux graphes empilés de la tâche 20 (axe Y de l'allure
// inversé, cf. commentaire plus bas) avec l'axe X natif Recharts (ticks de
// distance réels, plus précis que 3 repères fixes) — re-stylée aux couleurs
// v2, mais pas reconstruite en un seul tracé combiné.
const COULEUR_FC = '#ec3013';
const COULEUR_ALLURE = '#201e1d';
const COULEUR_GRILLE = '#d7d3d3';
const COULEUR_ATTENUEE = '#7d7979';
const STYLE_AXE = { fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 10, fill: COULEUR_ATTENUEE };
const STYLE_TOOLTIP = { background: '#f3f2f2', border: '1px solid #d7d3d3' };

// Séries optionnelles (tâche 48, courbes enrichies — gisement G7) : deux
// teintes neutres du DS (encre atténuée, neutre moyen), distinctes de FC
// (accent) et Allure (encre pleine) — jamais de nouvelle palette (brief).
// Index 0 = axe droit visible (premier choix de l'utilisateur), index 1 =
// axe masqué, valeurs réelles au tooltip seulement (disposition documentée
// au brief : jamais plus de deux axes secondaires).
const COULEURS_SERIE: readonly string[] = ['#605d5d', '#9b9797'];
const UNITE_SERIE: Record<SerieCourbe, string> = { cadence: ' spm', altitude: ' m', puissance: ' W' };
const LIBELLE_SERIE: Record<SerieCourbe, string> = { cadence: 'Cadence', altitude: 'Altitude', puissance: 'Puissance' };
const CLE_POINT_SERIE: Record<SerieCourbe, keyof PointCourbe> = {
  cadence: 'cadenceSpm', altitude: 'altitudeM', puissance: 'puissanceW',
};

function formaterTickAllure(v: unknown): string {
  return typeof v === 'number' ? formaterAllure(v * 60).replace(' /km', '') : '—';
}

/** `labelFormatter` de Recharts type son paramètre en `ReactNode` (le label
 *  peut être n'importe quel contenu affichable), plus large que le `number`
 *  que produit réellement `distanceKm` ici — même contournement que
 *  `tiretSiAbsent` ci-dessus pour `formatter`. */
function formaterLabelDistance(v: unknown): string {
  return typeof v === 'number' ? `${v.toFixed(2)} km` : '—';
}

/** Tooltip du graphe FC (+ séries optionnelles actives, tâche 48) : `name`
 *  distingue FC des séries ajoutées, chacune avec sa propre unité — jamais un
 *  formateur unique qui afficherait un « bpm » sur une valeur de cadence. Pas
 *  d'`itemStyle` forcé : Recharts colore chaque ligne du tooltip avec la
 *  couleur réelle de son tracé (`entry.color`, dérivée du `stroke` de chaque
 *  `<Line>`), qui reste donc correcte même à trois séries superposées. */
function creerFormatterTooltipFc(actives: SerieCourbe[]) {
  return (v: unknown, name: unknown): string => {
    if (v == null) return '—';
    if (name === 'FC') return `${v} bpm`;
    const serie = actives.find((s) => LIBELLE_SERIE[s] === name);
    return serie ? `${Math.round(v as number)}${UNITE_SERIE[serie]}` : String(v);
  };
}

/** Style d'un interrupteur de série (tâche 48) : sobre, DS Modernist —
 *  rayon 0, filet 2px. Composant hors-catalogue `.btn` (pas un bouton
 *  d'action classique) : styles posés directement, même esprit que les
 *  constantes `STYLE_*` ci-dessus pour ce fichier. */
function styleInterrupteur(active: boolean, bloque: boolean) {
  return {
    fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 11, letterSpacing: '.05em',
    textTransform: 'uppercase' as const, padding: '6px 12px', borderRadius: 0,
    border: `2px solid ${active ? 'var(--color-text)' : 'var(--color-neutral-300)'}`,
    background: active ? 'var(--color-text)' : 'transparent',
    color: active ? 'var(--color-bg)' : 'var(--color-neutral-600)',
    cursor: bloque ? 'not-allowed' : 'pointer',
    opacity: bloque ? 0.5 : 1,
  };
}

/** Courbe FC + allure sur la distance (page de détail de séance, re-stylage
 *  Cadence v2 tâche 22 ; overlay de séries optionnelles tâche 48) : deux
 *  graphes empilés partageant le même axe X (distance en km) plutôt qu'un
 *  double axe Y. L'axe Y de l'allure est inversé (`reversed`) : une allure
 *  plus rapide est une valeur plus basse en min/km, mais doit se lire plus
 *  haut sur le graphe, comme une meilleure performance. `connectNulls={false}` :
 *  un trou de FC (perte de capteur) ou une allure indéfinie (vitesse nulle à
 *  l'arrêt) casse la ligne plutôt que de relier deux points distants comme si
 *  la mesure était continue.
 *
 *  Tâche 48 (courbes enrichies, gisement G7 du rapport d'audit B1) :
 *  cadence/altitude/puissance, lues dans activity_trackpoints mais jamais
 *  affichées avant cette tâche (manque documenté par la revue A1), overlay
 *  strictement opt-in du graphe FC — jamais plus de deux séries actives à la
 *  fois (interrupteurs sous la légende, un par série DISPONIBLE POUR CETTE
 *  séance uniquement, honnêteté absolue). Défaut : aucune série ajoutée,
 *  écran actuel inchangé (règle du projet). Troisième clic bloqué (bouton
 *  désactivé + indication) plutôt qu'éteindre automatiquement la plus
 *  ancienne — le plus simple des deux comportements possibles, documenté ici
 *  comme demandé par le brief. */
export function CourbeSeance({
  trackpoints, seriesDisponibles, seriesActives, sport,
}: {
  trackpoints: TrackpointSeance[];
  seriesDisponibles: SerieCourbe[];
  seriesActives: SerieCourbe[];
  sport: string;
}) {
  const points = preparerCourbeSeance(trackpoints);

  if (points.length === 0) {
    return (
      <section className="section">
        <div className="wrap" style={{ paddingTop: 'clamp(32px,5vh,56px)' }}>
          <EnteteTuile>FC · allure — sur la distance</EnteteTuile>
          <p className="p mt-3">Pas de trace seconde par seconde pour cette activité.</p>
        </div>
      </section>
    );
  }

  const serieAxe = seriesActives[0]; // axe droit visible
  const serieMasquee = seriesActives[1]; // axe masqué, tooltip seulement

  return (
    <section className="section">
      <div className="wrap" style={{ paddingTop: 'clamp(32px,5vh,56px)' }}>
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <EnteteTuile>FC · allure — sur la distance</EnteteTuile>
          <span style={{
            fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 11, letterSpacing: '.06em',
            textTransform: 'uppercase', color: COULEUR_ATTENUEE,
          }}>
            <span style={{ color: COULEUR_FC }}>▬</span> FC&nbsp;&nbsp;<span style={{ color: COULEUR_ALLURE }}>▬</span> Allure
            {seriesActives.map((serie, i) => (
              <span key={serie}>
                &nbsp;&nbsp;<span style={{ color: COULEURS_SERIE[i] }}>▬</span> {LIBELLE_SERIE[serie]}
              </span>
            ))}
          </span>
        </div>

        {/* Interrupteurs de séries optionnelles (tâche 48) : un par série
            DISPONIBLE pour cette séance — jamais un choix proposé sur une
            série que la séance ne porte pas. Chacun est sa propre micro-form
            (même convention que reglages-controles.tsx) : la liste envoyée à
            `definirSeriesCourbe` est déjà calculée ici, à partir de l'état
            RENDU (seriesActives), pas relue depuis la préférence brute côté
            action — voir le commentaire de `definirSeriesCourbe`
            (app/actions.ts) pour pourquoi. */}
        {seriesDisponibles.length > 0 && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {seriesDisponibles.map((serie) => {
              const active = seriesActives.includes(serie);
              const bloque = !active && seriesActives.length >= MAX_SERIES_ACTIVES;
              const nouvelleListe = active
                ? seriesActives.filter((s) => s !== serie)
                : [...seriesActives, serie];
              return (
                <form key={serie} action={definirSeriesCourbe.bind(null, sport, nouvelleListe)}>
                  <button type="submit" disabled={bloque} aria-pressed={active}
                          title={bloque ? `Maximum ${MAX_SERIES_ACTIVES} séries actives — désactive-en une d’abord.` : undefined}
                          style={styleInterrupteur(active, bloque)}>
                    {LIBELLE_SERIE[serie]}
                  </button>
                </form>
              );
            })}
          </div>
        )}
        {seriesActives.length >= MAX_SERIES_ACTIVES && (
          <p className="mt-2" style={{ fontSize: 11, color: COULEUR_ATTENUEE }}>
            Maximum {MAX_SERIES_ACTIVES} séries actives — désactive-en une pour en choisir une autre.
          </p>
        )}

        <p className="mt-4" style={{ fontSize: 12, color: COULEUR_ATTENUEE, textTransform: 'uppercase', letterSpacing: '.06em' }}>FC (bpm)</p>
        <div className="mt-1" style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points}>
              <CartesianGrid stroke={COULEUR_GRILLE} strokeWidth={1} horizontal vertical={false} />
              <XAxis dataKey="distanceKm" type="number" domain={['dataMin', 'dataMax']}
                     tick={STYLE_AXE} stroke={COULEUR_GRILLE}
                     tickFormatter={(v: number) => v.toFixed(1)} unit=" km" />
              <YAxis yAxisId="fc" dataKey="fcBpm" tick={STYLE_AXE} stroke={COULEUR_GRILLE}
                     domain={['auto', 'auto']} width={40} tickCount={3} />
              {serieAxe && (
                <YAxis yAxisId="serie0" dataKey={CLE_POINT_SERIE[serieAxe]} orientation="right"
                       tick={STYLE_AXE} stroke={COULEUR_GRILLE} domain={['auto', 'auto']}
                       width={48} unit={UNITE_SERIE[serieAxe]} tickCount={3} />
              )}
              {serieMasquee && (
                <YAxis yAxisId="serie1" dataKey={CLE_POINT_SERIE[serieMasquee]} hide domain={['auto', 'auto']} />
              )}
              <Tooltip formatter={creerFormatterTooltipFc(seriesActives)}
                       labelFormatter={formaterLabelDistance}
                       contentStyle={STYLE_TOOLTIP}
                       labelStyle={{ color: COULEUR_ATTENUEE }} />
              <Line yAxisId="fc" dataKey="fcBpm" name="FC" stroke={COULEUR_FC} strokeWidth={2}
                    dot={false} connectNulls={false} isAnimationActive={false} />
              {serieAxe && (
                <Line yAxisId="serie0" dataKey={CLE_POINT_SERIE[serieAxe]} name={LIBELLE_SERIE[serieAxe]}
                      stroke={COULEURS_SERIE[0]} strokeWidth={1.5}
                      dot={false} connectNulls={false} isAnimationActive={false} />
              )}
              {serieMasquee && (
                <Line yAxisId="serie1" dataKey={CLE_POINT_SERIE[serieMasquee]} name={LIBELLE_SERIE[serieMasquee]}
                      stroke={COULEURS_SERIE[1]} strokeWidth={1.5}
                      dot={false} connectNulls={false} isAnimationActive={false} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-5" style={{ fontSize: 12, color: COULEUR_ATTENUEE, textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Allure (min/km, axe inversé — plus rapide = plus haut)
        </p>
        <div className="mt-1" style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points}>
              <CartesianGrid stroke={COULEUR_GRILLE} strokeWidth={1} horizontal vertical={false} />
              <XAxis dataKey="distanceKm" type="number" domain={['dataMin', 'dataMax']}
                     tick={STYLE_AXE} stroke={COULEUR_GRILLE}
                     tickFormatter={(v: number) => v.toFixed(1)} unit=" km" />
              <YAxis dataKey="allureMinKm" reversed tick={STYLE_AXE} stroke={COULEUR_GRILLE}
                     domain={['auto', 'auto']} width={56} tickFormatter={formaterTickAllure} tickCount={3} />
              <Tooltip formatter={(v: unknown) => (v == null ? '—' : formaterAllure((v as number) * 60))}
                       labelFormatter={formaterLabelDistance}
                       contentStyle={STYLE_TOOLTIP}
                       labelStyle={{ color: COULEUR_ATTENUEE }} itemStyle={{ color: COULEUR_ALLURE }} />
              <Line dataKey="allureMinKm" name="Allure" stroke={COULEUR_ALLURE} strokeWidth={2}
                    dot={false} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
