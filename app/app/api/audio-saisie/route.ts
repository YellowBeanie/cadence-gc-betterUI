import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

/** Réception de l'audio de saisie vocale (tâche 28, spec 2) : le fichier est
 *  déposé tel quel dans `${GARMIN_DATA_DIR}/audio-saisies/entrants/`, où le
 *  cron hôte `deploy/nas/traite-audio.sh` viendra le chercher (même
 *  mécanique de fichiers-drapeau que `demanderSync`/`demanderAnalyse` :
 *  l'app n'a jamais accès au socket Docker, elle ne fait qu'écrire).
 *
 *  Validations STRICTES avant toute écriture disque : taille ≤ 25 Mo,
 *  extension parmi une liste fermée déduite du nom client ET non vide, nom de
 *  fichier généré par LE SERVEUR (`{AAAAMMJJ-HHMMSS}-{aléatoire hex}.{ext}`) —
 *  jamais le nom fourni par le client, qui pourrait contenir un `..` ou tout
 *  autre caractère de traversée de chemin. */
const EXTENSIONS_AUTORISEES = new Set(['m4a', 'mp3', 'ogg', 'wav', 'webm', 'aac']);
const TAILLE_MAX_OCTETS = 25 * 1024 * 1024;

function extensionDe(nomClient: string): string | null {
  const m = /\.([a-zA-Z0-9]+)$/.exec(nomClient);
  if (!m) return null;
  const ext = m[1].toLowerCase();
  return ext === '' ? null : ext;
}

/** `AAAAMMJJ-HHMMSS` local, jamais dérivé d'une valeur transmise par le
 *  client. */
function horodatageServeur(): string {
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`
    + `-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
}

export async function POST(request: Request): Promise<Response> {
  let donnees: FormData;
  try {
    donnees = await request.formData();
  } catch {
    return Response.json({ erreur: 'Requête invalide (multipart attendu).' }, { status: 400 });
  }

  const fichier = donnees.get('audio');
  if (!(fichier instanceof File) || fichier.size === 0) {
    return Response.json({ erreur: 'Aucun fichier audio reçu.' }, { status: 400 });
  }
  if (fichier.size > TAILLE_MAX_OCTETS) {
    return Response.json({ erreur: 'Fichier trop volumineux (25 Mo maximum).' }, { status: 400 });
  }

  const extension = extensionDe(fichier.name);
  if (!extension || !EXTENSIONS_AUTORISEES.has(extension)) {
    return Response.json(
      { erreur: 'Format non reconnu (m4a, mp3, ogg, wav, webm, aac).' },
      { status: 400 },
    );
  }

  const racine = process.env.GARMIN_DATA_DIR ?? '/work';
  const dossier = `${racine}/audio-saisies/entrants`;
  mkdirSync(dossier, { recursive: true });

  const nom = `${horodatageServeur()}-${randomBytes(4).toString('hex')}.${extension}`;
  const octets = Buffer.from(await fichier.arrayBuffer());
  writeFileSync(`${dossier}/${nom}`, octets);

  return Response.json({ ok: true }, { status: 200 });
}
