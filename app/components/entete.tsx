'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Fraicheur } from '@/lib/types';
import { demanderSync, demanderAnalyse } from '@/app/actions';
import { formaterHeureCourte } from '@/lib/formatage';

const LIENS = [
  { href: '/', libelle: "Aujourd'hui" },
  { href: '/historique', libelle: 'Analyses' },
  { href: '/seances', libelle: 'Séances' },
  { href: '/saisie', libelle: 'Saisir' },
] as const;

/** Texte + péremption de la pastille de synchro (header Cadence v2, tâche 22)
 *  — même logique que la tâche 21 : point accent + « GARMIN · SYNCHRO HH:MM »
 *  au repos, pastille neutre et « SYNCHRO IL Y A XH » au-delà du seuil de
 *  26 h (libellé de péremption conservé). */
function texteSync(f: Fraicheur): { texte: string; perime: boolean } {
  if (!f.dernierSucces) {
    return { texte: 'Aucune synchronisation connue', perime: true };
  }
  if (f.perime) {
    const h = Math.floor(f.ageHeures ?? 0);
    const age = h < 1 ? "Synchro il y a moins d'une heure" : `Synchro il y a ${h}h`;
    return { texte: age, perime: true };
  }
  return { texte: `Garmin · Synchro ${formaterHeureCourte(f.dernierSucces)}`, perime: false };
}

export function Entete({
  fraicheur, attente, attenteAnalyse,
}: {
  fraicheur: Fraicheur;
  attente: boolean;
  attenteAnalyse: boolean;
}) {
  const pathname = usePathname();
  const sync = texteSync(fraicheur);

  return (
    <header className="hdr">
      <Link href="/" className="mark">CADENCE</Link>
      <nav>
        {LIENS.map((l) => (
          <Link key={l.href} href={l.href}
                className={`navlink${pathname === l.href ? ' active' : ''}`}>
            {l.libelle}
          </Link>
        ))}
        <span className={`sync-pastille${sync.perime ? ' perime' : ''}`}>
          <span className={`sync-point${sync.perime ? ' perime' : ''}`} aria-hidden="true" />
          {sync.texte}
        </span>
        <form action={demanderSync}>
          <button type="submit" disabled={attente} className="btn btn-secondary"
                  style={{ fontSize: 12, padding: '6px 12px' }}>
            {attente ? 'Sync demandée' : 'Synchroniser'}
          </button>
        </form>
        <form action={demanderAnalyse}>
          <button type="submit" disabled={attenteAnalyse} className="entete-action">
            {attenteAnalyse ? 'Analyse demandée' : 'Analyse'}
          </button>
        </form>
        {/* Entrée discrète (tâche 12, file de validation des connaissances) —
            même style neutre que Réglages ci-dessous (.entete-action), pas le
            style .navlink en gras des onglets principaux : la validation de
            sources reste un geste occasionnel, pas un onglet du quotidien. */}
        <Link href="/connaissances" className="entete-action">Bibliothèque</Link>
        {/* Entrée discrète (tâche 37, spec personnalisation : « icône/lien
            Réglages en fin de nav ») — même style neutre que les boutons
            sync/analyse ci-dessus (.entete-action), pas le style .navlink
            en gras des onglets principaux. */}
        <Link href="/reglages" className="entete-action">Réglages</Link>
      </nav>
    </header>
  );
}
