// Pagina del carrello.
// Il contenuto interattivo (righe, totali, free-shipping, checkout) e guidato
// dal CartProvider lato client (CarrelloContenuto), stessa fonte di verita di
// badge e mini-cart. Il provider e gia seedato dal layout della vetrina, quindi
// la lista rende anche in SSR (primo paint con contenuto).
//
// Cliente loggato: i suoi dati prefillano il form del flusso richiesta (campi
// comunque modificabili). Il guest checkout resta identico.

import CarrelloContenuto from "@/components/cart/CarrelloContenuto";
import { verificaSessioneCliente } from "@/lib/account/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Carrello",
  // noindex CRAWLABILE (niente Disallow in robots.txt): un Disallow blocca il
  // crawl ma non l'indicizzazione da link esterni; il noindex de-indicizza
  // davvero solo se Googlebot puo' leggerlo. Stesso pattern di /preferiti.
  robots: { index: false, follow: false },
};

export default async function CarrelloPage() {
  const sessione = await verificaSessioneCliente();
  const prefill = sessione
    ? { nome: sessione.cliente.nome ?? "", email: sessione.email }
    : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground">
        Il tuo carrello
      </h1>
      <CarrelloContenuto prefill={prefill} />
    </main>
  );
}
