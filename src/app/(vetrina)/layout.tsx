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

export default async function VetrinaLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const statoIniziale = await statoCarrello();

  return (
    <ToasterProvider>
      <CartProvider statoIniziale={statoIniziale}>
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
        <CartDrawer />
      </CartProvider>
    </ToasterProvider>
  );
}
