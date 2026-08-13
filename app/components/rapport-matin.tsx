import Link from 'next/link';
import type { Analyse, BodyBattery, EtatDuJour, Fraicheur } from '@/lib/types';
import type { IdHeros } from '@/lib/layout-accueil';
import { formaterDateLongueFr, formaterHeureCourte } from '@/lib/formatage';

/** Méta de fraîcheur sous le gros chiffre (tâche 23, §1) : rend honnête
 *  l'heure du chiffre affiché — c'est l'heure du SYNC (la donnée peut être
 *  légèrement antérieure), jamais « mesuré à ». Au-delà du seuil de 26 h
 *  (`Fraicheur.perime`, cf. lib/db/freshness.ts), le libellé bascule en
 *  péremption visible en accent-700, près du chiffre et pas seulement dans
 *  la pastille du header. `null` si aucun sync connu — rien à afficher. */
function texteFraicheurHero(f: Fraicheur): { texte: string; perime: boolean } | null {
  if (!f.dernierSucces) return null;
  if (f.perime) {
    const h = Math.floor(f.ageHeures ?? 0);
    return { texte: `Sync il y a ${h} h`, perime: true };
  }
  return { texte: `Au sync de ${formaterHeureCourte(f.dernierSucces)}`, perime: false };
}

type SourceHeros = 'body-battery' | 'readiness' | 'sommeil' | 'stress' | 'pas';

const LIBELLE_SOURCE: Record<SourceHeros, string> = {
  'body-battery': 'Body Battery',
  readiness: 'Readiness',
  sommeil: 'Score sommeil',
  stress: 'Stress',
  pas: 'Pas',
};

/** Détermine la valeur/source du gros chiffre selon la mesure de héros
 *  choisie dans /reglages (tâche 37). Seul le choix `body_battery` garde le
 *  repli documenté vers la readiness quand le Body Battery du jour manque
 *  (comportement historique, tâche 22) — un choix direct d'une autre mesure
 *  n'a pas de repli en cascade : une donnée absente reste absente quel que
 *  soit le réglage (règle du projet, jamais de zéro fabriqué). */
function determinerHeros(
  heroChoisi: IdHeros, bodyBattery: BodyBattery | null, etat: EtatDuJour | null,
  stressMoyen: number | null, pas: number | null,
): { source: SourceHeros; valeur: number } | null {
  switch (heroChoisi) {
    case 'body_battery':
      if (bodyBattery?.actuel != null) return { source: 'body-battery', valeur: bodyBattery.actuel };
      if (etat?.readiness != null) return { source: 'readiness', valeur: etat.readiness };
      return null;
    case 'readiness':
      return etat?.readiness != null ? { source: 'readiness', valeur: etat.readiness } : null;
    case 'sommeil':
      return etat?.scoreSommeil != null ? { source: 'sommeil', valeur: etat.scoreSommeil } : null;
    case 'stress':
      return stressMoyen != null ? { source: 'stress', valeur: stressMoyen } : null;
    case 'pas':
      return pas != null ? { source: 'pas', valeur: pas } : null;
    default:
      return null;
  }
}

/** Héro du dashboard (design Cadence v2, tâche 22, correspondance §1 ;
 *  personnalisable depuis la tâche 37) : gros chiffre = la mesure choisie
 *  dans /reglages (`heroChoisi`, Body Battery par défaut). Si les deux
 *  manquent (choix body_battery sans Body Battery ni readiness, ou choix
 *  direct sans donnée), la section se réduit au label et au paragraphe (pas
 *  de gros chiffre vide). */
export function RapportMatin({
  date, bodyBattery, etat, analyse, derniereSeanceId, fraicheur, heroChoisi, stressMoyen, pas,
}: {
  date: string;
  bodyBattery: BodyBattery | null;
  etat: EtatDuJour | null;
  analyse: Analyse | null;
  derniereSeanceId: number | null;
  fraicheur: Fraicheur;
  heroChoisi: IdHeros;
  stressMoyen: number | null;
  pas: number | null;
}) {
  const hero = determinerHeros(heroChoisi, bodyBattery, etat, stressMoyen, pas);
  const meta = texteFraicheurHero(fraicheur);

  const paragraphe = analyse
    ? [analyse.resume, analyse.prudence].filter((p): p is string => p != null).join(' ')
    : null;

  return (
    <section style={{ padding: 'clamp(48px,8vh,96px) var(--gutter) clamp(36px,6vh,64px)' }}>
      <div className="grid-2-end">
        <div style={{ animation: 'rise .7s cubic-bezier(.16,1,.3,1) both' }}>
          <h6 style={{ color: 'var(--color-accent)' }}>{formaterDateLongueFr(date)} — Rapport du matin</h6>
          {hero != null && (
            <>
              <div style={{
                fontFamily: 'var(--font-heading)', fontWeight: 800,
                fontSize: 'clamp(7rem, 17vw, 14rem)', letterSpacing: '-0.05em', lineHeight: .84,
                marginTop: 12,
              }}>
                {hero.valeur}
              </div>
              <div className="flex items-center gap-3.5" style={{ marginTop: 18 }}>
                <span style={{
                  fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15,
                  letterSpacing: '.06em', textTransform: 'uppercase',
                }}>
                  {LIBELLE_SOURCE[hero.source]}
                </span>
                {hero.source === 'body-battery' && bodyBattery?.reveil != null && (
                  <span className="tag-v2" style={{ background: 'var(--color-accent)', color: 'var(--color-bg)' }}>
                    Réveil {bodyBattery.reveil}
                  </span>
                )}
              </div>
              {meta && (
                <div style={{
                  fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 11,
                  letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 10,
                  color: meta.perime ? 'var(--color-accent-700)' : 'var(--color-neutral-600)',
                }}>
                  {meta.texte}
                </div>
              )}
            </>
          )}
        </div>
        <div style={{ animation: 'rise .7s cubic-bezier(.16,1,.3,1) .12s both' }}>
          <div style={{
            height: 2, background: 'var(--color-divider)', marginBottom: 18,
            transformOrigin: 'left', animation: 'growX .9s cubic-bezier(.16,1,.3,1) .3s both',
          }} />
          {paragraphe && (
            <p style={{ fontSize: 17, lineHeight: 1.55, maxWidth: '44ch', margin: 0 }}>{paragraphe}</p>
          )}
          <div className="flex gap-2.5" style={{ marginTop: paragraphe ? 20 : 0 }}>
            <Link href="/historique" className="btn btn-primary">Voir l&apos;analyse →</Link>
            {derniereSeanceId != null && (
              <Link href={`/seance/${derniereSeanceId}`} className="btn btn-secondary">Dernière séance</Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
