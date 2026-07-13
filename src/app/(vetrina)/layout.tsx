// Layout della vetrina pubblica: header del brand + contenitore principale.
// Vive nel route group (vetrina) cosi che l'area /gestore (nel group (gestore))
// non erediti header e impaginazione della vetrina. Non e un root layout:
// niente <html>/<body> (quelli stanno in src/app/layout.tsx).
//
// Async: legge lo stato del carrello lato server (il cookie cart_id e httpOnly,
// non leggibile dal client) e lo passa al CartProvider, che da li in poi guida
// badge, mini-cart e totali. Legge anche la sessione cliente (memoizzata con
// cache(): Header e pagine non ripetono il getUser) per l'icona account e la
// sincronizzazione preferiti. ToasterProvider avvolge tutto (lo usa il provider).

import { Suspense } from "react";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ToasterProvider } from "@/components/Toaster";
import { CartProvider } from "@/components/cart/CartProvider";
import CartDrawer from "@/components/cart/CartDrawer";
import SincronizzaPreferiti from "@/components/account/SincronizzaPreferiti";
import AvvisoAccountEliminato from "@/components/account/AvvisoAccountEliminato";
import { statoCarrello } from "@/lib/cart";
import { caricaCategoriePubbliche } from "@/lib/categorie";
import { gruppiCategorie } from "@/lib/categorie-albero";
import { verificaSessioneCliente } from "@/lib/account/auth";

export default async function VetrinaLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Carrello, categorie e sessione cliente sono indipendenti: falli partire
  // insieme (Promise.all) invece di serializzarli (latenza DB sul TTFB).
  const [statoIniziale, categorie, sessione] = await Promise.all([
    statoCarrello(),
    caricaCategoriePubbliche(),
    verificaSessioneCliente(),
  ]);
  const gruppi = gruppiCategorie(categorie);
  // Ai client component passa solo il minimo serializzabile (mai il client
  // Supabase della sessione).
  const cliente = sessione
    ? { nome: sessione.cliente.nome, email: sessione.email }
    : null;

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
          <Header gruppi={gruppi} cliente={cliente} />
          {/* scroll-mt-20: l'header sticky (h-16) non copre il target dello
              skip link (stesso accorgimento di #contatti nel Footer). */}
          <main id="contenuto" className="flex-1 scroll-mt-20">
            {children}
          </main>
          <Footer />
        </div>
        <CartDrawer />
        <SincronizzaPreferiti userId={sessione?.userId ?? null} />
        {/* useSearchParams richiede un confine Suspense per non de-optimizzare
            la pagina a dynamic. */}
        <Suspense fallback={null}>
          <AvvisoAccountEliminato />
        </Suspense>
      </CartProvider>
    </ToasterProvider>
  );
}
