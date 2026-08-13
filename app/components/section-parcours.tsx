'use client';

import dynamic from 'next/dynamic';
import type { PointTraceGps } from '@/lib/types';

// `ssr: false` n'est autorisé que depuis un Client Component (Next 16,
// node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md, vérifié avant
// d'écrire ce fichier) — d'où ce fichier séparé de `carte-parcours.tsx` plutôt
// qu'un dynamic() posé directement dans la page serveur `/seance/[id]`.
const CarteParcours = dynamic(
  () => import('./carte-parcours').then((m) => m.CarteParcours),
  { ssr: false },
);

/** Section « Parcours — 3D » de la page de détail de séance (tâche 27) :
 *  pleine largeur entre les courbes FC·allure et les splits, filet 2px haut
 *  (`.section`), hauteur `clamp(320px, 50vh, 480px)`. N'existe pas du tout —
 *  pas même un cadre vide — quand la séance n'a pas au moins 2 points GPS
 *  (boxe, tapis…) : c'est cette fonction qui porte le seuil, pas
 *  `CarteParcours` (qui, lui, gère l'échec d'initialisation MapLibre). */
export function SectionCarteParcours({ trace }: { trace: PointTraceGps[] }) {
  if (trace.length < 2) return null;

  return (
    <section className="section">
      <div className="wrap" style={{ paddingBlock: 'clamp(40px,6vh,72px)' }}>
        <h6 style={{ color: 'var(--color-accent)' }}>Parcours</h6>
        <div className="mt-4" style={{ height: 'clamp(320px,50vh,480px)' }}>
          <CarteParcours trace={trace} />
        </div>
      </div>
    </section>
  );
}
