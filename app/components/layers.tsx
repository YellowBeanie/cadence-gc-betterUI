import Link from 'next/link';

type LigneLayer = {
  nom: string;
  desc: string;
  statut: string;
  statutBg: string;
  statutFg: string;
  href?: string;
};

/** Section « Layers » (dashboard Cadence v2, tâche 22, correspondance §5) :
 *  grille bordée (plus de fond sombre — le DS Modernist réserve l'accent
 *  plein au footer-affiche), lignes réelles uniquement. Food Advisor et
 *  Programme muscu sont la vision produit de l'utilisateur — affichés honnêtement comme
 *  « à venir », jamais comme des outils actifs qu'ils ne sont pas. */
export function Layers({ analyseActive }: { analyseActive: boolean }) {
  const lignes: LigneLayer[] = [
    {
      nom: 'Garmin Connect',
      desc: 'Source de vérité — activités, sommeil, Body Battery',
      statut: 'Synchronisé',
      statutBg: 'var(--color-accent)', statutFg: 'var(--color-bg)',
    },
    {
      nom: 'Analyse Claude',
      desc: 'Synthèse quotidienne après chaque sync',
      statut: analyseActive ? 'Actif' : 'En attente',
      statutBg: analyseActive ? 'var(--color-accent)' : 'var(--color-neutral-200)',
      statutFg: analyseActive ? 'var(--color-bg)' : 'var(--color-text)',
    },
    {
      nom: 'Saisie manuelle',
      desc: 'Boxe, ressenti, RPE — ce que la montre ne voit pas',
      statut: 'Actif',
      statutBg: 'var(--color-accent)', statutFg: 'var(--color-bg)',
      href: '/saisie',
    },
    {
      nom: 'Food Advisor',
      desc: 'Conseils nutrition à partir de la dépense réelle — pas encore construit',
      statut: 'À venir',
      statutBg: 'var(--color-neutral-200)', statutFg: 'var(--color-text)',
    },
    {
      nom: 'Programme muscu',
      desc: 'Blocs de force adaptés au volume de course — pas encore construit',
      statut: 'À venir',
      statutBg: 'var(--color-neutral-200)', statutFg: 'var(--color-text)',
    },
  ];

  return (
    <section className="section">
      <div className="section-inner">
        <h6 style={{ color: 'var(--color-accent)' }}>Layers — outils connectés</h6>
        <div className="layers-grid" style={{ marginTop: 20 }}>
          {lignes.map((l) => {
            const contenu = (
              <>
                <div className="flex items-center justify-between">
                  <span className="nom">{l.nom}</span>
                  <span className="tag-v2" style={{ background: l.statutBg, color: l.statutFg }}>{l.statut}</span>
                </div>
                <p className="desc">{l.desc}</p>
              </>
            );
            return l.href ? (
              <Link key={l.nom} href={l.href} className="layers-cellule cliquable">{contenu}</Link>
            ) : (
              <div key={l.nom} className="layers-cellule">{contenu}</div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
