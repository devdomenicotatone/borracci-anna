"use client";

// Svuota il carrello una sola volta all'arrivo sulla pagina di successo del
// checkout, cosi il badge torna a 0 e si evitano doppi acquisti. La verita
// dell'ordine resta affidata al webhook Stripe: qui e solo pulizia lato client.
//
// Carrello MISTO: il pagamento diretto copre solo le righe in pronta consegna,
// quindi si tolgono SOLO quelle e gli articoli su richiesta restano nel
// carrello (il flusso richiesta e ancora da completare). Senza righe su
// richiesta: svuotamento completo come sempre, cookie incluso.

import { useEffect, useRef, useTransition } from "react";

import { useCarrello } from "@/components/cart/CartProvider";

export default function SvuotaCarrelloAlSuccesso() {
  const { righe, svuota, svuotaParziale } = useCarrello();
  const fatto = useRef(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (fatto.current) return;
    fatto.current = true;
    const restaSuRichiesta = righe.some(
      (r) => r.prodotto.disponibilita_su_richiesta,
    );
    startTransition(async () => {
      await (restaSuRichiesta ? svuotaParziale("disponibili") : svuota());
    });
  }, [righe, svuota, svuotaParziale]);

  return null;
}
