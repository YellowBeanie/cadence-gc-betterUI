import type { MinutesZones, ZonesFcBornes } from '@/lib/types';
import { ZONES } from '@/lib/zones';
import { EnteteTuile } from './ligne-mesure';

/** Borne BPM d'une zone (tâche 31, revue A1 : « les barres de zones Z1-Z5
 *  sont affichées sans jamais montrer les bornes ») : plancher de la zone
 *  suivante moins 1 pour la borne haute, sauf Z5 dont la borne haute est
 *  `fcMax` (ou rien de connu au-delà). */
function bornesParZone(b: ZonesFcBornes): Record<(typeof ZONES)[number]['cle'], string> {
  const planchers = [b.z1Plancher, b.z2Plancher, b.z3Plancher, b.z4Plancher, b.z5Plancher];
  return {
    z1: `${planchers[0]}–${planchers[1] - 1}`,
    z2: `${planchers[1]}–${planchers[2] - 1}`,
    z3: `${planchers[2]}–${planchers[3] - 1}`,
    z4: `${planchers[3]}–${planchers[4] - 1}`,
    z5: b.fcMax != null ? `${planchers[4]}–${b.fcMax}` : `${planchers[4]}+`,
  };
}

/** Barre empilée seule (sans légende ni minutes chiffrées) — brique
 *  réutilisée en miniature dans chaque ligne de l'Historique
 *  (liste-seances.tsx) et en grand sur la page de détail de séance
 *  (`PanneauZonesFcSeance` ci-dessous). `hauteur` en px. `null` si aucune
 *  zone n'a de minutes enregistrées : pas de barre vide à afficher. Couleurs
 *  Z1-Z5 conservées telles quelles (`lib/zones.ts`) : c'est de la donnée
 *  réelle (temps mesuré par zone), le DS Modernist ne la touche pas. */
export function BarreZones({ zones, hauteur = 6 }: { zones: MinutesZones; hauteur?: number }) {
  const total = zones.z1 + zones.z2 + zones.z3 + zones.z4 + zones.z5;
  if (total <= 0) return null;
  return (
    <div className="flex overflow-hidden" style={{ height: hauteur, background: 'var(--color-neutral-200)' }}>
      {ZONES.map((zone) => {
        const valeur = zones[zone.cle];
        return valeur > 0 ? (
          <div key={zone.cle} title={`${zone.label} : ${Math.round(valeur)} min`}
               style={{ background: zone.couleur, flexGrow: valeur }} />
        ) : null;
      })}
    </div>
  );
}

/** Légende compacte (pastille + libellé par zone) — au-dessus de la barre en
 *  grand de la page de détail, libellés uppercase (DS Modernist). `bornes`
 *  optionnel (tâche 31, revue A1) : bornes BPM sous chaque libellé quand
 *  `hr_zones` est connue — jamais un tiret aligné si absente. */
export function LegendeZones({ bornes }: { bornes?: ZonesFcBornes | null }) {
  const parZone = bornes ? bornesParZone(bornes) : null;
  return (
    <div className="flex flex-wrap gap-4">
      {ZONES.map((z) => (
        <span key={z.cle} className="flex items-center gap-1.5" style={{
          fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 11,
          letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--color-neutral-600)',
        }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, background: z.couleur }} />
          {z.label}
          {parZone && <span style={{ color: 'var(--color-neutral-500)' }}>{parZone[z.cle]}</span>}
        </span>
      ))}
    </div>
  );
}

/** Détail chiffré « Z1 18 · Z2 95 … min » sous la barre. */
function DetailZones({ zones }: { zones: MinutesZones }) {
  return (
    <p className="mt-2" style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 11, color: 'var(--color-neutral-600)' }}>
      {ZONES.map((zone) => `${zone.label} ${Math.round(zones[zone.cle])}`).join(' · ')} min
    </p>
  );
}

/** Panneau « zones de FC en grand » de la page de détail de séance
 *  (re-stylage Cadence v2, tâche 22) : légende + barre haute + minutes
 *  chiffrées, pour la seule activité déjà connue du contexte de la page.
 *  `bornes` optionnel (tâche 31) : bornes BPM de la légende. */
export function PanneauZonesFcSeance({
  zones, bornes = null,
}: {
  zones: MinutesZones | null;
  bornes?: ZonesFcBornes | null;
}) {
  return (
    <section className="section">
      <div className="wrap" style={{ paddingBlock: 'clamp(40px,6vh,72px)' }}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <EnteteTuile>Zones de FC</EnteteTuile>
          <LegendeZones bornes={bornes} />
        </div>
        {zones ? (
          <>
            <BarreZones zones={zones} hauteur={12} />
            <DetailZones zones={zones} />
          </>
        ) : (
          <p className="p">Zones non mesurées pour cette activité.</p>
        )}
      </div>
    </section>
  );
}
