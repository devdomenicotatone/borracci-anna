import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "by Frody — moda fresca sul lungomare di Rimini",
  description:
    "by Frody: abbigliamento fresco e leggero, scelto uno a uno. Vieni a trovarci sul lungomare di Rimini o ricevi i capi comodamente a casa.",
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
