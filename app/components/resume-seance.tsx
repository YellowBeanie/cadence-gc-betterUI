import type { SeanceDetail } from '@/lib/types';
import { allureSecParKm, formaterAllure, formaterDureeCourse } from '@/lib/formatage';
import { LigneMesure } from './ligne-mesure';

type StatPrincipale = { k: string; v: string; u?: string };

/** Bande de stats de la page de détail de séance (design Cadence v2, tâche
 *  22) : les 5 stats principales (Distance/Temps/Allure/D+/FC moy) en grands
 *  chiffres Archivo 800, grille auto-fit 170px avec filets droits 1px.
 *  Cadence, puissance, effets d'entraînement et météo passent dessous en
 *  petites paires clé/valeur discrètes — même discipline que le composant
 *  précédent : chaque ligne n'apparaît que si sa donnée existe pour cette
 *  activité.
 *
 *  `variante="colonne"` (tâche 27, retour l'utilisateur « jamais d'espace vide ») :
 *  rend le contenu NU, sans section/wrap — la page le place alors à côté de
 *  la photo dans une grille, et l'auto-fit replie les stats dans la largeur
 *  restante quel que soit le format de l'image. */
export function ResumeSeance({ d, variante = 'pleine' }: {
  d: SeanceDetail; variante?: 'pleine' | 'colonne';
}) {
  const km = d.distanceM != null ? (d.distanceM / 1000).toFixed(2) : null;
  const allureSec = allureSecParKm(d.dureeSec, d.distanceM);
  const allureTexte = allureSec != null ? formaterAllure(allureSec).replace(' /km', '') : null;

  const principales: StatPrincipale[] = ([
    km != null && { k: 'Distance', v: km, u: 'km' },
    d.dureeSec != null && { k: 'Temps', v: formaterDureeCourse(d.dureeSec) },
    allureTexte != null && { k: 'Allure moy.', v: allureTexte, u: '/km' },
    d.deniveleMonte != null && { k: 'D+', v: `${Math.round(d.deniveleMonte)}`, u: 'm' },
    d.fcMoy != null && { k: 'FC moy.', v: `${d.fcMoy}`, u: 'bpm' },
  ] as (StatPrincipale | false)[]).filter((s): s is StatPrincipale => s !== false);

  const meteo = d.meteo;

  const contenu = (
    <>
      {principales.length > 0 && (
          <div className="bande-mesures bande-170">
            {principales.map((s) => (
              <div key={s.k} className="mesure-tuile" style={{ padding: '24px 20px 24px 0' }}>
                <h6 style={{ margin: 0, fontSize: 11 }}>{s.k}</h6>
                <div className="flex items-baseline gap-1.5" style={{ marginTop: 10 }}>
                  <span style={{
                    fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(2.4rem, 4.4vw, 3.8rem)',
                    letterSpacing: '-0.04em', lineHeight: 1,
                  }}>
                    {s.v}
                  </span>
                  {s.u && <span style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>{s.u}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      <div className="flex flex-wrap gap-5.5" style={{
        marginTop: 22, paddingTop: 20, borderTop: '1px solid var(--color-divider)',
        paddingBottom: variante === 'colonne' ? 0 : 'clamp(40px, 6vh, 64px)',
      }}>
          {d.fcMax != null && <LigneMesure libelle="FC max" valeurAffichee={`${d.fcMax} bpm`} />}
          {d.fcMin != null && <LigneMesure libelle="FC min" valeurAffichee={`${d.fcMin} bpm`} />}
          {d.cadenceMoy != null && <LigneMesure libelle="Cadence moy." valeurAffichee={`${Math.round(d.cadenceMoy)} spm`} />}
          {d.cadenceMax != null && <LigneMesure libelle="Cadence max" valeurAffichee={`${Math.round(d.cadenceMax)} spm`} />}
          {d.deniveleDescente != null && <LigneMesure libelle="D-" valeurAffichee={`${Math.round(d.deniveleDescente)} m`} />}
          {d.puissanceMoy != null && <LigneMesure libelle="Puissance moy." valeurAffichee={`${Math.round(d.puissanceMoy)} W`} />}
          {d.puissanceMax != null && <LigneMesure libelle="Puissance max" valeurAffichee={`${Math.round(d.puissanceMax)} W`} />}
          {d.puissanceNorm != null && <LigneMesure libelle="Puissance norm." valeurAffichee={`${Math.round(d.puissanceNorm)} W`} />}
          {d.effetAerobie != null && <LigneMesure libelle="Effet aérobie" valeurAffichee={d.effetAerobie.toFixed(1)} />}
          {d.effetAnaerobie != null && <LigneMesure libelle="Effet anaérobie" valeurAffichee={d.effetAnaerobie.toFixed(1)} />}
          {d.calories != null && <LigneMesure libelle="Calories" valeurAffichee={`${Math.round(d.calories)}`} />}
          {/* Tâche 31 (revue A1, priorité Haute) : VO2max de la séance, impact
              Body Battery, ressenti saisi par l'utilisateur directement dans Garmin
              Connect (distinct du RPE saisi dans cette app, cf. SaisieRattacheeTuile). */}
          {d.vo2max != null && <LigneMesure libelle="VO2max" valeurAffichee={`${d.vo2max.toFixed(1)} ml/kg/min`} />}
          {d.bodyBatteryChange != null && (
            <LigneMesure libelle="Body Battery" valeurAffichee={`${d.bodyBatteryChange > 0 ? '+' : ''}${d.bodyBatteryChange}`} />
          )}
          {d.ressentiGarmin?.rpe != null && (
            <LigneMesure libelle="RPE Garmin" valeurAffichee={`${(d.ressentiGarmin.rpe / 10).toFixed(0)}/10`} />
          )}
          {/* Échelle du ressenti Garmin (« comment te sentais-tu ? ») non
              documentée publiquement — valeur brute affichée telle quelle,
              jamais un mot deviné (même prudence que traduireStatutEntrainement). */}
          {d.ressentiGarmin?.feel != null && (
            <LigneMesure libelle="Ressenti Garmin" valeurAffichee={`${d.ressentiGarmin.feel}/100`} />
          )}
          {meteo?.type != null && <LigneMesure libelle="Météo" valeurAffichee={meteo.type} />}
          {meteo?.temperatureC != null && <LigneMesure libelle="Température" valeurAffichee={`${meteo.temperatureC.toFixed(1)} °C`} />}
          {meteo?.temperatureRessentieC != null && <LigneMesure libelle="Ressentie" valeurAffichee={`${meteo.temperatureRessentieC.toFixed(1)} °C`} />}
          {meteo?.humidite != null && <LigneMesure libelle="Humidité" valeurAffichee={`${meteo.humidite}%`} />}
          {meteo?.ventKmh != null && (
            <LigneMesure libelle="Vent" valeurAffichee={
              meteo.ventDirectionDeg != null
                ? `${meteo.ventKmh.toFixed(1)} km/h (${meteo.ventDirectionDeg}°)`
                : `${meteo.ventKmh.toFixed(1)} km/h`
            } />
          )}
      </div>
    </>
  );

  if (variante === 'colonne') return contenu;

  return (
    <section className="section">
      <div className="wrap" style={{ paddingBottom: 0, marginTop: 'clamp(30px,5vh,48px)' }}>
        {contenu}
      </div>
    </section>
  );
}
