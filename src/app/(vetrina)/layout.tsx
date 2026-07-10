// Layout della vetrina pubblica: header del brand + contenitore principale.
// Vive nel route group (vetrina) cosi che l'area /gestore (nel group (gestore))
// non erediti header e impaginazione della vetrina. Non e un root layout:
// niente <html>/<body> (quelli stanno in src/app/layout.tsx).
//
// Async: legge lo stato del carrello lato server (il cookie cart_id e httpOnly,
// non leggibile dal client) e lo passa al CartProvider, che da li in poi guida
// badge, mini-cart e totali. ToasterProvider avvolge tutto (lo usa il provider).

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ToasterProvider } from "@/components/Toaster";
import { CartProvider } from "@/components/cart/CartProvider";
import CartDrawer from "@/components/cart/CartDrawer";
import { statoCarrello } from "@/lib/cart";
import { caricaCategoriePubbliche } from "@/lib/categorie";
import { gruppiCategorie } from "@/lib/categorie-albero";

export default async function VetrinaLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Carrello e categorie sono indipendenti: falli partire insieme (Promise.all)
  // invece di serializzarli (~2x latenza DB sul TTFB di ogni pagina).
  const [statoIniziale, categorie] = await Promise.all([
    statoCarrello(),
    caricaCategoriePubbliche(),
  ]);
  const gruppi = gruppiCategorie(categorie);

  return (
    <ToasterProvider>
      <CartProvider statoIniziale={statoIniziale}>
        {/* Skip link: nascosto finche non riceve focus da tastiera, poi visibile. */}
        <a
          href="#contenuto"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-lg focus:bg-sea focus:px-4 focus:py-2 focus:text-white"
        >
          Vai al contenuto
        </a>
        <div className="flex min-h-screen flex-col">
          <Header gruppi={gruppi} />
          <main id="contenuto" className="flex-1">
            {children}
          </main>
          <Footer />
        </div>
        <CartDrawer />
      </CartProvider>
    </ToasterProvider>
  );
}
