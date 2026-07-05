import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";

// Inter: testo e UI. Variable font, nessun peso da dichiarare.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Poppins: titoli e wordmark — rotondo, amichevole, "da spiaggia".
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
});

const TITOLO = "Anna Shop — abbigliamento mare a Rimini";
const DESCRIZIONE =
  "Anna Shop: abbigliamento fresco e leggero, scelto uno a uno. Vieni a trovarci sul lungomare di Rimini o ricevi i capi comodamente a casa.";

export const metadata: Metadata = {
  // metadataBase risolve gli URL relativi di OpenGraph/canonical. In assenza di
  // NEXT_PUBLIC_SITE_URL si degrada a localhost (build/anteprima).
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  // Le pagine figlie con titolo proprio diventano "Titolo · Anna Shop".
  title: { default: TITOLO, template: "%s · Anna Shop" },
  description: DESCRIZIONE,
  openGraph: {
    title: TITOLO,
    description: DESCRIZIONE,
    type: "website",
    locale: "it_IT",
    siteName: "Anna Shop",
  },
  twitter: {
    card: "summary_large_image",
    title: TITOLO,
    description: DESCRIZIONE,
  },
  // iOS: nome breve in home screen + web app "capace" con status bar chiara.
  // L'icona apple-touch (180x180) e' fornita da src/app/apple-icon.tsx.
  appleWebApp: { title: "Anna Shop", statusBarStyle: "default", capable: true },
};

// Viewport globale. `viewportFit: "cover"` e' l'opt-in che rende reali le
// env(safe-area-inset-*) su iPhone con notch/home-indicator: senza di esso
// valgono 0 e le barre azioni sticky del gestore (pb-safe) finiscono sotto la
// home bar. `themeColor` tinta il chrome del browser col blu mare del brand.
// `colorScheme: "light"` dichiara il tema unico chiaro: cosi i controlli nativi
// (scrollbar, popup dei <select>, autofill) non si rendono scuri quando l'OS e'
// in dark mode. Niente maximum-scale/user-scalable: il pinch-zoom resta attivo.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0077c8",
  colorScheme: "light",
};

// Root layout MINIMALE: emette solo <html>/<body> + font + metadata globale.
// Header e impaginazione della vetrina vivono in (vetrina)/layout.tsx; l'area
// gestore ha la propria shell in (gestore)/. Cosi c'e un solo <html>/<body>
// nell'albero (un secondo root layout produrrebbe markup annidato invalido).
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      className={`${inter.variable} ${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background font-sans text-foreground">
        {children}
      </body>
    </html>
  );
}
