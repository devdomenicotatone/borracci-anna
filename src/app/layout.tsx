import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "by Frody — abbigliamento",
  description:
    "by Frody: capi d'abbigliamento dal taglio essenziale e contemporaneo. Selezione curata, pochi pezzi, qualita prima di tutto.",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
