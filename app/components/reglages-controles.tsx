// Contrôles de réglage réordonnable/masquable, factorisés hors de
// app/reglages/page.tsx (tâche 37) : le bloc « Page de séance — par sport »
// (tâche 38) en a besoin exactement de la même façon que les blocs
// sections/tuiles de l'accueil — mêmes flèches, même interrupteur, même
// bouton « Réinitialiser » — pour un layout différent (LayoutSeance plutôt
// que LayoutAccueil). Plutôt que dupliquer ce JSX, les actions de layout
// (déjà spécifiques à chaque moteur, `deplacerElementLayout` vs
// `deplacerElementLayoutSeance`) sont passées en props, déjà liées
// (`.bind(null, ...)`) par l'appelant — ces composants ignorent tout du
// layout qu'ils pilotent.

/** Une ligne réordonnable/masquable — sections, tuiles de l'accueil ou
 *  sections de la page séance partagent le même mécanisme. `.guidance-ligne`
 *  (déjà utilisé par /lexique) s'empile tout seul sous 640px : pas de CSS
 *  nouvelle à écrire pour rester utilisable en 375px. Chaque contrôle est sa
 *  propre micro-form (même convention que `rejeterBrouillon`/`demanderSync`,
 *  app/actions.ts) : aucun JavaScript client requis. */
export function LigneOrdre({
  libelle, visible, index, total, actionMonter, actionDescendre, actionBasculer,
}: {
  libelle: string; visible: boolean; index: number; total: number;
  actionMonter: () => Promise<void>; actionDescendre: () => Promise<void>; actionBasculer: () => Promise<void>;
}) {
  return (
    <div className="guidance-ligne">
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 14 }}>{libelle}</div>
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <form action={actionMonter}>
          <button type="submit" className="btn btn-ghost" disabled={index === 0}
                  aria-label={`Monter ${libelle}`} style={{ padding: '4px 10px' }}>
            ↑
          </button>
        </form>
        <form action={actionDescendre}>
          <button type="submit" className="btn btn-ghost" disabled={index === total - 1}
                  aria-label={`Descendre ${libelle}`} style={{ padding: '4px 10px' }}>
            ↓
          </button>
        </form>
        <form action={actionBasculer}>
          <button type="submit" className="btn btn-secondary" style={{ fontSize: 11, padding: '5px 10px' }}
                  aria-label={`${visible ? 'Masquer' : 'Afficher'} ${libelle}`}>
            {visible ? 'Visible' : 'Masquée'}
          </button>
        </form>
      </div>
    </div>
  );
}

export function EnteteBloc({ titre, actionReinitialiser }: { titre: string; actionReinitialiser: () => Promise<void> }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <h6 style={{ margin: 0 }}>{titre}</h6>
      <form action={actionReinitialiser}>
        <button type="submit" className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }}>
          Réinitialiser
        </button>
      </form>
    </div>
  );
}
