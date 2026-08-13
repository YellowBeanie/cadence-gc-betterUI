import Link from 'next/link';
import type { PersonalRecord, PoidsMesure } from '@/lib/types';
import { formaterDureeCourse, formaterDateCourteAvecAnnee } from '@/lib/formatage';
import { EnteteTuile } from './ligne-mesure';
import { Sparkline } from './sparkline';

/** Panneau « Records personnels » (tâche 31, revue A1, priorité Haute — nommé
 *  explicitement par l'utilisateur) : `personal_record`, table entière jamais lue avant
 *  cette tâche. `lirePersonalRecords` ne renvoie que les records dont le sens
 *  est établi avec certitude (distances de course standard) — `[]` (composant
 *  absent) si aucun n'est encore connu, jamais un tiret. Chaque ligne pointe
 *  vers l'activité correspondante quand elle existe encore dans l'instantané. */
export function RecordsPersonnels({ records }: { records: PersonalRecord[] }) {
  if (records.length === 0) return null;

  return (
    <section className="section">
      <div className="wrap" style={{ paddingBlock: 'clamp(40px,6vh,72px)' }}>
        <EnteteTuile>Records personnels</EnteteTuile>
        <div className="mt-4">
          {records.map((r) => {
            const valeur = r.nature === 'temps' ? formaterDureeCourse(r.valeur) : `${(r.valeur / 1000).toFixed(2)} km`;
            const contenu = (
              <div className="flex items-baseline justify-between gap-4" style={{
                padding: '16px 0', borderTop: '1px solid var(--color-divider)',
              }}>
                <span style={{ fontSize: 15 }}>{r.libelle}</span>
                <span style={{
                  fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18,
                  letterSpacing: '-0.02em', marginLeft: 'auto', marginRight: 16,
                }}>
                  {valeur}
                </span>
                <span style={{ fontSize: 12, color: 'var(--color-neutral-600)', whiteSpace: 'nowrap' }}>
                  {formaterDateCourteAvecAnnee(r.date)}
                </span>
              </div>
            );
            return r.activiteId != null
              ? <Link key={`${r.libelle}-${r.date}`} href={`/seance/${r.activiteId}`} style={{ display: 'block', color: 'inherit' }}>{contenu}</Link>
              : <div key={`${r.libelle}-${r.date}`}>{contenu}</div>;
          })}
        </div>
      </div>
    </section>
  );
}

/** Tuile « Poids » (tâche 31, revue A1, priorité Haute — nommé explicitement
 *  par l'utilisateur) : `weight`, table entière jamais lue avant cette tâche. `[]`
 *  (composant absent) si aucune mesure n'existe encore. Sparkline seulement à
 *  partir de 2 dates distinctes (même règle que les autres séries, cf.
 *  lib/sparkline.ts) — peu probable avec 2 entrées le même jour comme sur
 *  l'instantané actuel, mais la fonction gère déjà ce cas sans planter. */
export function PoidsTuile({ mesures }: { mesures: PoidsMesure[] }) {
  if (mesures.length === 0) return null;
  const derniere = mesures[mesures.length - 1];

  return (
    <div className="bande-mesures bande-170" style={{ marginTop: 'clamp(30px,5vh,48px)' }}>
      <div className="mesure-tuile" style={{ padding: '24px 20px 24px 0' }}>
        <h6 style={{ margin: 0, fontSize: 11 }}>Poids</h6>
        <div className="flex items-baseline gap-1.5" style={{ marginTop: 10 }}>
          <span style={{
            fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(2.4rem, 4.4vw, 3.8rem)',
            letterSpacing: '-0.04em', lineHeight: 1,
          }}>
            {derniere.kg}
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>kg</span>
        </div>
        <div className="flex items-center justify-between gap-3" style={{ marginTop: 10 }}>
          <span style={{
            fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 11, letterSpacing: '.05em',
            textTransform: 'uppercase', color: 'var(--color-neutral-600)',
          }}>
            {formaterDateCourteAvecAnnee(derniere.date)}
          </span>
          {mesures.length > 1 && <Sparkline valeurs={mesures.map((m) => m.kg)} />}
        </div>
      </div>
    </div>
  );
}
