// Client Stripe lato server. Inizializzazione LAZY: nessun accesso a
// process.env a livello di modulo, cosi il build non fallisce senza env.

import Stripe from "stripe";

let _stripe: Stripe | null = null;

/**
 * Ritorna un'istanza singleton di Stripe.
 * Lancia solo se chiamata senza STRIPE_SECRET_KEY (mai durante import/build).
 *
 * Non viene fissata `apiVersion`: l'SDK usa la versione di default
 * con cui e stato pubblicato, evitando disallineamenti di tipo.
 */
export function getStripe(): Stripe {
  if (_stripe) {
    return _stripe;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Stripe non configurato: imposta STRIPE_SECRET_KEY.");
  }

  _stripe = new Stripe(secretKey, {
    typescript: true,
    appInfo: { name: "by Frody" },
  });

  return _stripe;
}
