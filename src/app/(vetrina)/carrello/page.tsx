// Pagina del carrello.
// Il contenuto interattivo (righe, totali, free-shipping, checkout) e guidato
// dal CartProvider lato client (CarrelloContenuto), stessa fonte di verita di
// badge e mini-cart. Il provider e gia seedato dal layout della vetrina, quindi
// la lista rende anche in SSR (primo paint con contenuto).

import CarrelloContenuto from "@/components/cart/CarrelloContenuto";

export const metadata = {
  title: "Carrello · by Frody",
};

export default function CarrelloPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground">
        Il tuo carrello
      </h1>
      <CarrelloContenuto />
    </main>
  );
}
