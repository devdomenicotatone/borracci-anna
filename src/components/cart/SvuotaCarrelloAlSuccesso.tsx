"use client";

// Svuota il carrello una sola volta all'arrivo sulla pagina di successo del
// checkout, cosi il badge torna a 0 e si evitano doppi acquisti. La verita
// dell'ordine resta affidata al webhook Stripe: qui e solo pulizia lato client.

import { useEffect, useRef, useTransition } from "react";

import { useCarrello } from "@/components/cart/CartProvider";

export default function SvuotaCarrelloAlSuccesso() {
  const { svuota } = useCarrello();
  const fatto = useRef(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (fatto.current) return;
    fatto.current = true;
    startTransition(async () => {
      await svuota();
    });
  }, [svuota]);

  return null;
}
