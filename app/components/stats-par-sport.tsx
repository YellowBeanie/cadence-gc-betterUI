import type { StatsSportGarmin } from '@/lib/db/garmin';
import type { StatsSportManuel } from '@/lib/db/training';
import { traduireSport, formaterAllure, formaterDureeHeuresMinutes } from '@/lib/formatage';
import { classeBandeMesures, DENSITE_PAR_DEFAUT, type Densite } from '@/lib/densite';

type TuileStats = { cle: string; sport: string | null; nombre: number; details: string };

function Tuile({ t }: { t: TuileStats }) {
  return (
    <div className="mesure-tuile">
      <h6 style={{ margin: 0, fontSize: 11 }}>{traduireSport(t.sport) ?? t.sport}</h6>
      <div style={{
        marginTop: 14, fontFamily: 'var(--font-heading)', fontWeight: 800,
        fontSize: 'clamp(2.4rem, 4vw, 3.4rem)', letterSpacing: '-0.04em', lineHeight: 1,
      }}>
        {t.nombre}
      </div>
      {t.details && (
        <p style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--color-neutral-600)', marginTop: 10, marginBottom: 0 }}>
          {t.details}
        </p>
      )}
    </div>
  );
}

/** Stats par sport (écran « toutes les séances », tâche 26) : une rangée de
 *  tuiles combinant les sports issus de Garmin (`lireStatsParSport`,
 *  activity_type — km/durée/D+/allure) et les sports saisis à la main
 *  (`lireStatsManuelles`, sport saisi — durée/RPE). Chaque valeur absente est
 *  omise de la ligne de détail, jamais un « 0 km » fabriqué. */
export function StatsParSport({
  statsGarmin, statsManuelles, densite = DENSITE_PAR_DEFAUT,
}: {
  statsGarmin: StatsSportGarmin[];
  statsManuelles: StatsSportManuel[];
  // Densité d'affichage (/reglages, tâche 45) : cette bande n'était pas déjà
  // fixée à `.bande-170`, contrairement à celles de /historique.
  densite?: Densite;
}) {
  const tuiles: TuileStats[] = [
    ...statsGarmin.map((s) => ({
      cle: `g-${s.sport}`,
      sport: s.sport,
      nombre: s.nombre,
      details: [
        s.kmTotal != null ? `${s.kmTotal.toFixed(1)} km` : null,
        s.dureeTotaleMin != null ? formaterDureeHeuresMinutes(s.dureeTotaleMin * 60) : null,
        s.deniveleM != null ? `${s.deniveleM} m` : null,
        s.allureSecKm != null ? `allure ${formaterAllure(s.allureSecKm)}` : null,
      ].filter((v): v is string => v != null).join(' · '),
    })),
    ...statsManuelles.map((s) => ({
      cle: `m-${s.sport}`,
      sport: s.sport,
      nombre: s.nombre,
      details: [
        s.dureeTotaleMin != null ? formaterDureeHeuresMinutes(s.dureeTotaleMin * 60) : null,
        s.rpeMoyen != null ? `RPE ${s.rpeMoyen}/10` : null,
      ].filter((v): v is string => v != null).join(' · '),
    })),
  ];

  if (tuiles.length === 0) return null;

  return (
    <div className={classeBandeMesures(densite)}>
      {tuiles.map((t) => <Tuile key={t.cle} t={t} />)}
    </div>
  );
}
