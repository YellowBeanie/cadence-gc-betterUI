import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";
import { Entete } from "@/components/entete";
import { Ticker } from "@/components/ticker";
import { PiedDePage } from "@/components/pied-de-page";
import { lireFraicheur, syncEnAttente } from "@/lib/db/freshness";
import { analyseEnAttente } from "@/lib/analyse";

// Pivot visuel « Cadence v2 » (tâche 22, DS Modernist) : Archivo seul
// (400/600/800) — Space Mono disparaît avec MANA, aucun libellé technique de
// la maquette v2 n'en porte. Auto-hébergée par next/font, aucune requête
// vers Google au chargement (node_modules/next/dist/docs/01-app/
// 01-getting-started/13-fonts.md).
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "600", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "cadence",
  description: "Suivi quotidien de l'entraînement à partir des données Garmin.",
};

// Garantit un rendu mobile correct (PWA installable, cf. app/manifest.ts).
export const viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Lus ici (racine partagée par les 4 routes, toutes déjà force-dynamic) :
  // la pastille de synchro et les liens sync/analyse discrets du header
  // vivent sur chaque écran, pas seulement sur le dashboard (brief tâche 21,
  // « ne perds aucune fonctionnalité existante »).
  const fraicheur = lireFraicheur();
  const attente = syncEnAttente();
  const attenteAnalyse = analyseEnAttente();

  return (
    <html lang="fr" className={`${archivo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Entete fraicheur={fraicheur} attente={attente} attenteAnalyse={attenteAnalyse} />
        <Ticker />
        <div className="flex flex-1 flex-col">{children}</div>
        <PiedDePage />
      </body>
    </html>
  );
}
