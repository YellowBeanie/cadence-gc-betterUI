import { lireEtatDuJour, lireJourneeComplete, lireProchainesSeances, lireStatsSemaine } from '@/lib/db/garmin';
import { numeroSemaineIso } from '@/lib/formatage';

/** Construit les segments du ticker (tâche 22, structure commune) — mesures
 *  réelles uniquement, dans l'ordre du brief ; une mesure absente est un
 *  segment absent, jamais un tiret. Enveloppé par l'appelant dans un
 *  try/catch : ce composant vit dans le layout racine (partagé par toutes
 *  les pages), donc AVANT le rendu du contenu propre à chaque page — s'il
 *  lisait l'instantané sans filet et que celui-ci manquait (avant le premier
 *  sync), l'erreur échapperait à app/error.tsx (qui ne protège que le
 *  contenu des pages, pas le layout qui les enveloppe) et casserait l'écran
 *  d'erreur explicite que ce cas est censé afficher. */
function construireSegments(): string[] {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const etat = lireEtatDuJour();
  const journee = lireJourneeComplete();
  const stats = lireStatsSemaine();
  const prochaines = lireProchainesSeances(aujourdhui, 7);
  const prochaine = prochaines.find((p) => !p.repos && p.nom);

  const segments: (string | null)[] = [
    journee.bodyBattery?.actuel != null ? `Body Battery ${journee.bodyBattery.actuel}` : null,
    etat?.fcRepos != null ? `FC repos ${etat.fcRepos} bpm` : null,
    journee.statutEntrainement?.chargeAigue != null
      ? `Charge ${journee.statutEntrainement.chargeAigue}`
        + (journee.statutEntrainement.libelle ? ` · ${journee.statutEntrainement.libelle}` : '')
      : null,
    etat?.scoreSommeil != null ? `Sommeil ${etat.scoreSommeil}/100` : null,
    `Semaine ${numeroSemaineIso(aujourdhui)} · ${stats.volumeKm.toFixed(1)} km`,
    `D+ ${stats.deniveleM} m`,
    prochaine ? `Prochaine : ${prochaine.nom}` : null,
  ];

  return segments.filter((s): s is string => s != null);
}

/** Bande défilante (tâche 22, structure commune, sous le header) — contenu
 *  dupliqué exactement une fois pour le défilement continu
 *  (`translateX(-50%)`, cf. globals.css `@keyframes tick`). Composant Serveur
 *  (pas de `'use client'`, aucune interaction). */
export function Ticker() {
  let segments: string[] = [];
  try {
    segments = construireSegments();
  } catch {
    // Instantané Garmin absent (avant le premier sync) : le ticker disparaît
    // silencieusement, la page elle-même affichera app/error.tsx.
    return null;
  }
  if (segments.length === 0) return null;

  const contenu = [...segments, ...segments];

  return (
    <div className="ticker-wrap" aria-hidden="true">
      <div className="ticker-track">
        {contenu.map((texte, i) => (
          <span key={i} className="ticker-item">{texte}</span>
        ))}
      </div>
    </div>
  );
}
