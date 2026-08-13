import { lireSourcesEnAttente } from '@/lib/db/connaissances';
import { validerSourceConnaissance, rejeterSourceConnaissance } from '@/app/actions';

// Comme /lexique, /saisie... : le layout partagé (pastille de synchro,
// ticker) lit les bases à chaque requête — une page prérendue au build
// figerait un header mensonger dans l'image Docker (cf. app/lexique/page.tsx).
export const dynamic = 'force-dynamic';

const LIBELLE_TYPE: Record<string, string> = {
  etude: 'Étude', guide_officiel: 'Guide officiel', vulgarisation: 'Vulgarisation',
  video: 'Vidéo', fabricant: 'Fabricant',
};
const LIBELLE_DOMAINE: Record<string, string> = {
  course: 'Course', boxe: 'Boxe', recuperation: 'Récupération', general: 'Général',
};
const LIBELLE_INCERTITUDE: Record<string, string> = {
  consensus: 'Consensus', debattu: 'Débattu', preuve_faible: 'Preuve faible',
};
// Signaux binaires vérifiables (connaissances/credibilite.py, §6 annexe B) —
// affichés en clair (« DOI résolu : oui »), jamais un score opaque. Un
// libellé de repli (la clé brute) couvre un signal futur non encore connu
// ici plutôt que de le faire disparaître silencieusement.
const LIBELLE_SIGNAL: Record<string, string> = {
  doi_resolu: 'DOI résolu', dans_pmc: 'Dans PMC', dans_doaj: 'Dans DOAJ',
  fiche_openalex: 'Fiche OpenAlex', liste_blanche: 'Liste blanche',
};

/** File de validation des sources non académiques (spec 4) : le pendant UI du
 *  choix de l'utilisateur « autonome pour la littérature, validation pour le reste ». La
 *  base de prod ne contient aujourd'hui aucune source `en_attente` (les 3
 *  sources existantes sont `auto_admise`) — l'état vide sobre est donc l'état
 *  nominal actuel, pas un cas d'erreur. */
export default function Connaissances() {
  const sources = lireSourcesEnAttente();

  return (
    <main className="flex w-full flex-1 flex-col" style={{ animation: 'rise .6s cubic-bezier(.16,1,.3,1) both' }}>
      <section>
        <div className="wrap" style={{ paddingTop: 'clamp(48px,8vh,96px)', paddingBottom: 'clamp(40px,6vh,72px)' }}>
          <h6 style={{ color: 'var(--color-accent)' }}>Bibliothèque</h6>
          <h1 style={{
            fontSize: 'clamp(2.6rem, 6.5vw, 5rem)', letterSpacing: '-0.035em',
            lineHeight: .98, margin: '12px 0 0', maxWidth: '24ch', textTransform: 'uppercase',
          }}>
            File de validation.
          </h1>

          {sources.length === 0 ? (
            <p className="p mt-6" style={{ color: 'var(--color-neutral-700)' }}>
              Aucune source en attente de validation.
            </p>
          ) : (
            <div className="mt-9">
              {sources.map((source) => (
                <div key={source.id} style={{
                  border: '2px solid var(--color-divider)', padding: 'clamp(24px, 3.5vw, 40px)', marginBottom: 28,
                }}>
                  <div style={{
                    fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.2rem, 2.2vw, 1.6rem)',
                    letterSpacing: '-0.015em', textTransform: 'uppercase',
                  }}>
                    {source.titre}
                  </div>
                  <div className="mt-2 flex gap-3" style={{ flexWrap: 'wrap', fontSize: 13, color: 'var(--color-neutral-700)' }}>
                    {source.auteurs && <span>{source.auteurs}</span>}
                    {source.annee !== null && <span>{source.annee}</span>}
                    <span>{LIBELLE_TYPE[source.type] ?? source.type}</span>
                    <span>{LIBELLE_DOMAINE[source.domaine] ?? source.domaine}</span>
                  </div>
                  <a href={source.url} target="_blank" rel="noreferrer noopener" className="mt-3"
                     style={{
                       display: 'inline-block', fontSize: 13, color: 'var(--color-accent)',
                       textDecoration: 'underline', textUnderlineOffset: '3px',
                     }}>
                    Voir la source
                  </a>

                  {Object.keys(source.signaux).length > 0 && (
                    <div className="mt-5 flex gap-4" style={{ flexWrap: 'wrap' }}>
                      {Object.entries(source.signaux).map(([cle, valeur]) => (
                        <span key={cle} className="tag-v2" style={{
                          background: valeur ? 'var(--color-accent-100)' : 'var(--color-neutral-200)',
                          color: valeur ? 'var(--color-accent-700)' : 'var(--color-text)',
                        }}>
                          {(LIBELLE_SIGNAL[cle] ?? cle)} : {valeur ? 'oui' : 'non'}
                        </span>
                      ))}
                    </div>
                  )}

                  {source.fiches.length > 0 && (
                    <div className="mt-6">
                      <p style={{
                        fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 10,
                        letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-neutral-600)',
                      }}>
                        Fiches proposées ({source.fiches.length})
                      </p>
                      {source.fiches.map((fiche, i) => (
                        // Pas d'id de fiche exposé par lireSourcesEnAttente (liste
                        // purement affichée, jamais réordonnée côté client) —
                        // même justification d'index-clé que CarteBrouillon.
                        // eslint-disable-next-line react/no-array-index-key
                        <div key={i} className="mt-4" style={i > 0 ? { borderTop: '1px solid var(--color-divider)', paddingTop: 16 } : undefined}>
                          <p className="p" style={{ margin: 0 }}>{fiche.affirmation}</p>
                          <blockquote style={{
                            margin: '8px 0 0', paddingLeft: 14, borderLeft: '2px solid var(--color-divider)',
                            fontStyle: 'italic', color: 'var(--color-neutral-700)', fontSize: 14,
                          }}>
                            «&nbsp;{fiche.extrait}&nbsp;»
                          </blockquote>
                          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-neutral-600)' }}>
                            {fiche.localisation} — {LIBELLE_INCERTITUDE[fiche.incertitude] ?? fiche.incertitude}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 mt-6">
                    <form action={validerSourceConnaissance.bind(null, source.id)}>
                      <button type="submit" className="btn btn-primary">Valider</button>
                    </form>
                    <form action={rejeterSourceConnaissance.bind(null, source.id)}>
                      <button type="submit" className="btn btn-secondary">Rejeter</button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
