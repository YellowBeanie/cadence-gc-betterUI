'use client';

// Next 16.3 a stabilisé la prop `retry` (re-fetch + re-render du segment) en
// remplacement de l'ancienne `reset` (qui ne fait que réafficher sans
// relire les données) — voir node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/error.md. Ici l'erreur vient d'une lecture de fichier
// absente, donc on veut explicitement retenter la lecture, pas juste effacer
// l'état d'erreur.
export default function Erreur({ error, retry }: {
  error: Error & { digest?: string }; retry: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-8">
      <h1 style={{ fontSize: 'clamp(1.8rem, 3.4vw, 2.4rem)', textTransform: 'uppercase' }}>Données indisponibles</h1>
      <p className="p">
        L&apos;instantané Garmin n&apos;a pas pu être lu. Il est publié après chaque
        synchronisation réussie — s&apos;il manque, c&apos;est qu&apos;aucune n&apos;a encore abouti.
      </p>
      <pre className="overflow-x-auto p-3" style={{
        background: 'var(--color-surface)', fontFamily: 'var(--font-heading)', fontWeight: 600,
        fontSize: 12, color: 'var(--color-neutral-700)',
      }}>
        {error.message}
      </pre>
      <button onClick={() => retry()} className="btn btn-secondary">
        Réessayer
      </button>
    </main>
  );
}
