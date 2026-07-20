// Route handler che crea una Stripe Checkout Session a partire dal carrello.
//
// Regole di build: nessun accesso a process.env a livello di modulo, client
// Stripe/Supabase inizializzati lazy. Degrada con grazia se le env mancano.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getStripe } from "@/lib/stripe";
import { leggiCarrello, riconciliaCarrello } from "@/lib/cart";
import { verificaSessioneCliente } from "@/lib/account/auth";
import { assicuraStripeCustomer } from "@/lib/account/stripe-cliente";
import { consentiPerIp } from "@/lib/rate-limit-ip";
import {
  CONSEGNA_MAX_GG,
  CONSEGNA_MIN_GG,
  opzioniSpedizione,
} from "@/lib/spedizione";
import type { RigaCarrello } from "@/lib/types";

/** Costruisce un'etichetta leggibile per una riga (nome + taglia/colore). */
function etichettaRiga(riga: RigaCarrello): string {
  const dettagli: string[] = [];
  if (riga.variante.taglia) {
    dettagli.push(`Taglia ${riga.variante.taglia}`);
  }
  if (riga.variante.colore) {
    dettagli.push(riga.variante.colore);
  }
  return dettagli.length > 0
    ? `${riga.prodotto.nome} (${dettagli.join(", ")})`
    : riga.prodotto.nome;
}

/** Risposta JSON di errore con status dato. */
function erroreJson(messaggio: string, status: number): Response {
  return new Response(JSON.stringify({ errore: messaggio }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(): Promise<Response> {
  // 1) Verifica che Stripe sia configurato (senza lanciare).
  if (!process.env.STRIPE_SECRET_KEY) {
    return erroreJson(
      "Pagamenti non disponibili: Stripe non e configurato.",
      501,
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    return erroreJson(
      "Configurazione mancante: imposta NEXT_PUBLIC_SITE_URL.",
      501,
    );
  }

  // Rate limit per-IP: endpoint pubblico (ospite ammesso), nessuna auth. Ogni
  // chiamata crea una Stripe Checkout Session; senza tetto un anonimo puo
  // generarne a raffica (rumore in dashboard, erosione del rate limit account
  // Stripe condiviso, carico DB dalle letture di riconciliazione). Fail-open.
  if (!(await consentiPerIp("checkout"))) {
    return erroreJson("Troppe richieste. Riprova tra qualche minuto.", 429);
  }

  // 2) Legge il carrello (degrada a [] se Supabase non e configurato).
  const righe = await leggiCarrello();
  if (righe.length === 0) {
    return erroreJson("Il carrello è vuoto.", 400);
  }

  // Sezioni separate: il pagamento diretto copre SOLO le righe in pronta
  // consegna. Gli articoli "su richiesta" non entrano mai nella sessione (la
  // conferma di disponibilita resta al gestore, via flusso richiesta) e restano
  // nel carrello dopo il pagamento (li rimuove la success page, parzialmente).
  // Prima un carrello misto veniva respinto in blocco con 409.
  const righeDirette = righe.filter(
    (riga) => !riga.prodotto.disponibilita_su_richiesta,
  );
  if (righeDirette.length === 0) {
    return erroreJson(
      "Gli articoli nel carrello sono su richiesta: invia la richiesta dal carrello.",
      409,
    );
  }

  // Riverifica le giacenze reali: il carrello resta nel cookie per 30 giorni ma
  // lo stock cambia ogni giorno (sync BLT, altre vendite, ritiri dal catalogo).
  // Se qualcosa non e piu disponibile, riallinea il carrello e ferma il checkout:
  // non si crea mai una sessione di pagamento per merce che non c'e.
  const riconc = await riconciliaCarrello();
  if (riconc.modificato) {
    const parti: string[] = [];
    if (riconc.rimossi.length > 0) {
      parti.push(`non più disponibili: ${riconc.rimossi.join(", ")}`);
    }
    if (riconc.cappati.length > 0) {
      parti.push(
        `quantità aggiornate per: ${riconc.cappati.map((c) => c.nome).join(", ")}`,
      );
    }
    return erroreJson(
      `Le disponibilità sono cambiate (${parti.join("; ")}). Abbiamo aggiornato il carrello: controllalo e riprova.`,
      409,
    );
  }

  // 3) Prepara i line items dai prezzi in centesimi (currency eur).
  const lineItems = righeDirette.map((riga) => ({
    quantity: riga.quantita,
    price_data: {
      currency: "eur",
      unit_amount: riga.prodotto.prezzo_cents,
      product_data: {
        name: etichettaRiga(riga),
        // SKU + variante_id (IMMUTABILE) nei metadata del product Stripe: il
        // webhook li rilegge per ricostruire le righe del direct-buy (l'ordine
        // non e pre-salvato). Il variante_id e la chiave robusta al rename dello
        // SKU tra creazione sessione e pagamento (finding I1); lo SKU resta come
        // fallback per le sessioni vecchie.
        metadata: { sku: riga.variante.sku, variante_id: riga.variante.id },
        ...(riga.prodotto.descrizione
          ? { description: riga.prodotto.descrizione }
          : {}),
        ...(riga.prodotto.immagine_url
          ? { images: [riga.prodotto.immagine_url] }
          : {}),
      },
    },
  }));

  const totaleCents = righeDirette.reduce(
    (acc, riga) => acc + riga.prodotto.prezzo_cents * riga.quantita,
    0,
  );

  // Spedizione: calcolata server-side dal subtotale merce (fonte di verita =
  // carrello server-side, mai input del client). SEMPRE una sola opzione
  // (gratuita sopra soglia, tariffa unica Italia sotto): niente scelta di zona
  // lasciata al cliente su Stripe (finding 16). Il costo torna nel webhook.
  const shippingOptions = opzioniSpedizione(totaleCents).map((opzione) => ({
    shipping_rate_data: {
      type: "fixed_amount" as const,
      display_name: opzione.etichetta,
      fixed_amount: { amount: opzione.costoCents, currency: "eur" },
      delivery_estimate: {
        minimum: { unit: "business_day" as const, value: CONSEGNA_MIN_GG },
        maximum: { unit: "business_day" as const, value: CONSEGNA_MAX_GG },
      },
    },
  }));

  // Cliente loggato? Il checkout si "aggancia" al suo Customer Stripe: email
  // prefillata (e bloccata sull'email dell'account: cosi il trigger DB collega
  // sempre l'ordine allo storico), indirizzo prefillato dal predefinito,
  // pagamenti unificati sotto un solo customer. Per l'OSPITE non cambia nulla.
  const sessioneCliente = await verificaSessioneCliente();
  const customerId = sessioneCliente
    ? await assicuraStripeCustomer(sessioneCliente)
    : null;

  try {
    const stripe = getStripe();

    // 4) Crea la Checkout Session in modalita pagamento.
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      shipping_options: shippingOptions,
      success_url: `${siteUrl}/checkout/successo?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/checkout/annullato`,
      billing_address_collection: "auto",
      shipping_address_collection: { allowed_countries: ["IT"] },
      locale: "it",
      ...(customerId
        ? {
            customer: customerId,
            // Obbligatorio con customer + shipping_address_collection: salva
            // sul customer l'indirizzo inserito (prefill al prossimo acquisto).
            customer_update: {
              shipping: "auto" as const,
              address: "auto" as const,
            },
          }
        : sessioneCliente
          ? // Stripe degradato (niente customer): almeno l'email prefillata.
            { customer_email: sessioneCliente.email }
          : {}),
      ...(sessioneCliente
        ? {
            // Solo osservabilita (dashboard Stripe): l'aggancio ordine<->account
            // lo fa il trigger DB sull'email verificata, non questi metadata.
            client_reference_id: sessioneCliente.userId,
            metadata: { user_id: sessioneCliente.userId },
          }
        : {}),
    });

    // 5) NIENTE ordine salvato qui. Un checkout abbandonato (cliente che torna
    //    indietro senza pagare) NON deve lasciare un ordine fantasma "da
    //    confermare" nel pannello: l'ordine si registra SOLO a pagamento
    //    riuscito. Lo crea il webhook Stripe (checkout.session.completed), dove
    //    la RPC finalizza_ordine_pagato inserisce l'ordine gia "pagato" con le
    //    righe complete, ricostruite dallo SKU (nome/taglia/colore/prezzo/foto).
    //    Vedi 20260708170000_ordine_righe_fallback.sql e api/stripe/webhook.
    //    Lo SKU della variante viaggia nei metadata del product Stripe (sopra).

    if (!session.url) {
      return erroreJson(
        "Impossibile avviare il pagamento: URL di checkout assente.",
        502,
      );
    }

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    // Il dettaglio (spesso in inglese, tecnico) resta nei log: al cliente va un
    // messaggio chiaro in italiano, non l'errore grezzo di Stripe.
    console.error("[checkout] creazione sessione fallita:", err);
    return erroreJson(
      "Non è stato possibile avviare il pagamento. Riprova tra poco o scrivici per completare l'ordine.",
      500,
    );
  }
}
