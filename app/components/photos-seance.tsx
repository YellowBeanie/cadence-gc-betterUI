/** Photo(s) d'activité (tâche 27), affichées sous le h1 de la page de détail
 *  de séance. `[]` la très grande majorité du temps (extension best-effort du
 *  collector, `lib/photos.ts`) : le composant s'efface alors entièrement,
 *  jamais un cadre vide.
 *
 *  `class="grayscale"` (utilitaire Tailwind) : règle absolue du DS Modernist,
 *  la photographie s'imprime en noir et blanc.
 *
 *  Jamais recadrée (retour l'utilisateur : « je ne souhaite pas que l'image soit
 *  coupée ») : ratio naturel conservé (`height: auto`), plafonnée en hauteur
 *  pour ne pas engloutir la page, fer à gauche comme tout le DS — une photo
 *  moins large que la colonne laisse simplement le fond à sa droite. */
export function PhotosSeance({ photos, activiteId, nom }: {
  photos: string[]; activiteId: number; nom: string | null;
}) {
  if (photos.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {photos.map((fichier) => (
        <figure key={fichier} className="grayscale" style={{ margin: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- fichier
              local servi par la route /api/photos, sans dimensions connues à
              l'avance ni bénéfice de next/image (jamais distant, jamais optimisé). */}
          <img
            src={`/api/photos/${activiteId}/${fichier}`}
            alt={nom ?? 'Séance'}
            style={{
              display: 'block', maxWidth: '100%', width: 'auto',
              height: 'auto', maxHeight: 'min(62vh, 600px)',
            }}
          />
        </figure>
      ))}
    </div>
  );
}
