/** Surtitre de section — `h6` accent uppercase (design Cadence v2, tâche 22) :
 *  ne s'affiche jamais si l'appelant ne rend pas le bloc entier faute de
 *  donnée. */
export function Surtitre({ children }: { children: React.ReactNode }) {
  return <h6 style={{ color: 'var(--color-accent)' }}>{children}</h6>;
}

/** En-tête de section — alias de `Surtitre` (même composant que la tâche 21,
 *  conservé pour ne pas devoir renommer tous les appelants). */
export function EnteteTuile({ children }: { children: React.ReactNode }) {
  return <Surtitre>{children}</Surtitre>;
}

/** Paire libellé/valeur — petites paires clé/valeur discrètes (puissance,
 *  cadence, météo… sous la bande de stats de la page de détail de séance). */
export function LigneMesure({ libelle, valeurAffichee }: { libelle: string; valeurAffichee: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{
        fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 10,
        letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-neutral-600)',
      }}>
        {libelle}
      </span>
      <span style={{ fontSize: 14, color: 'var(--color-text)' }}>{valeurAffichee}</span>
    </div>
  );
}
