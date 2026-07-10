import type { Metadata, Viewport } from "next";

// Layout del route group (gestore): nessun header/impaginazione della vetrina.
// L'intera area /gestore e esclusa dall'indicizzazione (in aggiunta all'header
// X-Robots-Tag impostato dal proxy). Non e un root layout: niente <html>/<body>.
//
// Qui l'area diventa una PWA A PARTE ("Anna Gestore"): il manifest dedicato
// sostituisce quello della vetrina su tutte le pagine /gestore (login incluso),
// cosi Chrome propone l'installazione dell'app gestore solo a chi naviga
// l'area. Vedi gestore/manifest.webmanifest/route.ts.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  manifest: "/gestore/manifest.webmanifest",
  // iOS: nome proprio in home screen (l'icona scura e' gestore/apple-icon.tsx).
  appleWebApp: {
    title: "Anna Gestore",
    statusBarStyle: "default",
    capable: true,
  },
};

// Viewport COMPLETO, non solo themeColor: la copia esplicita evita di dipendere
// dal merge col root layout — viewportFit "cover" e' vitale qui (le save-bar
// sticky del gestore usano pb-safe, vedi il commento nel root layout).
// themeColor blu notte: e' il colore della topbar del gestionale.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a1f33",
  colorScheme: "light",
};

export default function GestoreLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
