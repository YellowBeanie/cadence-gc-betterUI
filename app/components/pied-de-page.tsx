import Link from 'next/link';

/** Footer-affiche commun (design Cadence v2, tâche 22, `--color-accent`
 *  plein) — traduit de docs/design-cadence/cadence-v2.dc.html (« Train.
 *  Recover. Repeat. » / « a layer over Garmin Connect » / « Data © you,
 *  always »), wordmark excepté (convention projet : français partout sauf
 *  le wordmark `CADENCE`). Lien `Lexique` ajouté à la rangée basse (tâche 23,
 *  §5) — même style 11px uppercase que les deux mentions existantes, hérité
 *  de `.footer-affiche .ligne-basse`. */
export function PiedDePage() {
  return (
    <footer className="footer-affiche">
      <div className="titre">
        S&apos;ENTRAÎNER.<br />RÉCUPÉRER.<br />RECOMMENCER.
      </div>
      <div className="ligne-basse">
        <span>Cadence — une couche au-dessus de Garmin Connect</span>
        <span>Tes données © toi, toujours</span>
        <Link href="/lexique">Lexique</Link>
      </div>
    </footer>
  );
}
