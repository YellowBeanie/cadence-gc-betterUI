const TERMES = [
  {
    terme: 'Body Battery',
    definition: "Réserve d'énergie estimée par Garmin (0-100). Monte pendant le repos et le sommeil, "
      + 'descend avec le stress. Le chiffre affiché date du dernier sync.',
  },
  {
    terme: 'HRV (variabilité cardiaque)',
    definition: "Variation de l'intervalle entre deux battements, mesurée la nuit. Une valeur dans ou "
      + 'au-dessus de ta plage habituelle indique une bonne récupération ; sous la plage plusieurs jours '
      + 'de suite, un corps qui encaisse.',
  },
  {
    terme: 'Préparation (readiness)',
    definition: 'Synthèse Garmin de ta capacité à encaisser une séance (sommeil, HRV, charge récente, stress).',
  },
  {
    terme: 'Charge aiguë / chronique / ratio',
    definition: 'Aiguë = effort cumulé des 7 derniers jours ; chronique = ton habitude des ~4 dernières '
      + 'semaines ; le ratio compare les deux — proche de 1, tu maintiens ; nettement au-dessus, tu augmentes vite.',
  },
  {
    terme: 'Zones de fréquence cardiaque (Z1-Z5)',
    definition: 'Plages d\'intensité calées sur ta FC max. Z1-Z2 = endurance fondamentale, l\'allure où tu '
      + "construis ta base — l'objectif principal de ton plan actuel.",
  },
  {
    terme: 'D+ (dénivelé positif)',
    definition: 'Total des mètres grimpés pendant la séance.',
  },
  {
    terme: 'Allure',
    definition: 'Temps par kilomètre (min/km) — plus le chiffre est bas, plus tu vas vite.',
  },
  {
    terme: 'RPE (effort ressenti)',
    definition: "Note de 1 à 10 que TU donnes à l'effort d'une séance saisie à la main — la montre ne la mesure pas.",
  },
  {
    terme: 'Splits',
    definition: 'Ton temps kilomètre par kilomètre dans une séance.',
  },
] as const;

// Les définitions sont statiques, mais le layout partagé (pastille de
// synchro, ticker) lit les bases : prérendue au build, cette page figeait
// un header mensonger (« aucune synchronisation connue ») cuit dans
// l'image Docker. `force-dynamic` comme partout ailleurs.
export const dynamic = 'force-dynamic';
/** Page « lexique » (tâche 23, §5) : vulgarise les termes techniques affichés
 *  ailleurs dans l'app. Même gabarit que les autres routes (header/ticker/
 *  footer hérités de app/layout.tsx). Définitions reformulées en français
 *  courant, purement descriptives — aucun seuil chiffré non-Garmin inventé. */
export default function Lexique() {
  return (
    <main className="flex w-full flex-1 flex-col" style={{ animation: 'rise .6s cubic-bezier(.16,1,.3,1) both' }}>
      <section>
        <div className="wrap" style={{ paddingTop: 'clamp(48px,8vh,96px)', paddingBottom: 'clamp(40px,6vh,72px)' }}>
          <h6 style={{ color: 'var(--color-accent)' }}>Lexique</h6>
          <h1 style={{
            fontSize: 'clamp(2.6rem, 6.5vw, 5rem)', letterSpacing: '-0.035em',
            lineHeight: .98, margin: '12px 0 0', maxWidth: '20ch', textTransform: 'uppercase',
          }}>
            Comprendre tes chiffres.
          </h1>
          <div className="mt-8">
            {TERMES.map((t) => (
              <div key={t.terme} className="guidance-ligne">
                <div style={{
                  fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20,
                  letterSpacing: '-0.01em', textTransform: 'uppercase',
                }}>
                  {t.terme}
                </div>
                <p className="p" style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--color-neutral-700)', maxWidth: '66ch', margin: 0 }}>
                  {t.definition}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
