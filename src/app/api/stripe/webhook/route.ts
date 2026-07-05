// Webhook Stripe: riceve gli eventi e finalizza gli ordini.
//
// Regole di build: nessun accesso a process.env a livello di modulo, nessun
// throw durante l'import, client Stripe/Supabase inizializzati lazy.
//
// Sicurezza: la firma va verificata sul RAW body, quindi NON usare req.json().
// Atomicita + idempotenza: la finalizzazione (stato -> "pagato" + decremento
// stock) avviene in UNA transazione Postgres con lock di riga, dentro la RPC
// finalizza_ordine_pagato. Le consegne concorrenti/ritentate dello stesso evento
// si serializzano e lo stock viene scalato una sola volta.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getStripe } from "@/lib/stripe";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

// Eventi che corrispondono a un pagamento andato a buon fine.
const EVENTI_FINALIZZAZIONE = new Set<Stripe.Event["type"]>([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

// Eventi "negativi" (sessione scaduta o pagamento fallito): non cambiano stato
// ne stock, ma li logghiamo per non lasciarli silenziosi.
const EVENTI_SCADUTI = new Set<Stripe.Event["type"]>([
  "checkout.session.expired",
]);
const EVENTI_PAGAMENTO_FALLITO = new Set<Stripe.Event["type"]>([
  "checkout.session.async_payment_failed",
  "payment_intent.payment_failed",
]);

/** Riga da scalare a magazzino: SKU della variante + quantita acquistata. */
interface RigaStock {
  sku: string;
  qta: number;
}

/**
 * Ricava le righe (SKU, quantita) dalle line item della sessione. Le line item
 * non sono espanse di default: vanno richieste a Stripe. Lo SKU viaggia nei
 * metadata del product Stripe (impostato alla creazione della sessione).
 */
async function righeDaSessione(sessionId: string): Promise<RigaStock[]> {
  const stripe = getStripe();
  const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, {
    limit: 100,
    expand: ["data.price.product"],
  });

  const righe: RigaStock[] = [];
  for (const item of lineItems.data) {
    const qta = item.quantity ?? 0;
    if (qta <= 0) continue;

    const prodotto = item.price?.product;
    const sku =
      prodotto && typeof prodotto !== "string" && "metadata" in prodotto
        ? (prodotto.metadata?.sku ?? null)
        : null;
    if (!sku) continue;

    righe.push({ sku, qta });
  }
  return righe;
}

/**
 * Estrae l'indirizzo di spedizione scelto dal cliente, da persistere come jsonb.
 * In Checkout one-time i dati arrivano in collected_information.shipping_details
 * (popolato perche shipping_address_collection e attivo). null se assente.
 */
function indirizzoDaSessione(session: Stripe.Checkout.Session): Json {
  const dettagli = session.collected_information?.shipping_details ?? null;
  if (!dettagli) return null;
  const a = dettagli.address;
  return {
    nome: dettagli.name ?? null,
    indirizzo: a
      ? {
          line1: a.line1 ?? null,
          line2: a.line2 ?? null,
          cap: a.postal_code ?? null,
          citta: a.city ?? null,
          provincia: a.state ?? null,
          paese: a.country ?? null,
        }
      : null,
  };
}

/**
 * Finalizza una sessione di checkout pagata: delega alla RPC atomica/idempotente
 * che segna l'ordine "pagato", decrementa lo stock una sola volta e salva costo
 * di spedizione (session.shipping_cost) e indirizzo nella stessa transazione.
 */
async function finalizzaOrdine(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const righe = await righeDaSessione(session.id);

  const { error } = await supabase.rpc("finalizza_ordine_pagato", {
    p_session_id: session.id,
    p_email: session.customer_details?.email ?? null,
    p_total: session.amount_total ?? 0,
    p_righe: righe,
    // shipping_cost.amount_total = costo della tariffa scelta dal cliente.
    p_shipping_cents: session.shipping_cost?.amount_total ?? null,
    p_indirizzo: indirizzoDaSessione(session),
  });
  if (error) {
    throw new Error(`Finalizzazione ordine fallita: ${error.message}`);
  }
}

export async function POST(req: Request): Promise<Response> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // Senza secret non possiamo verificare la firma: non configurato.
  if (!webhookSecret || !process.env.STRIPE_SECRET_KEY) {
    return new Response(
      JSON.stringify({ errore: "Webhook Stripe non configurato." }),
      { status: 501, headers: { "content-type": "application/json" } },
    );
  }

  const firma = req.headers.get("stripe-signature");
  if (!firma) {
    return new Response("Firma mancante.", { status: 400 });
  }

  // Raw body necessario per la verifica della firma.
  const body = await req.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, firma, webhookSecret);
  } catch (err) {
    const messaggio = err instanceof Error ? err.message : "firma non valida";
    return new Response(`Firma non valida: ${messaggio}`, { status: 400 });
  }

  // Finalizza solo gli eventi di pagamento riuscito. I metodi a regolamento
  // asincrono completano la sessione con payment_status != "paid": NON li
  // segniamo pagati qui (arrivera async_payment_succeeded). Gli altri -> 200.
  if (EVENTI_FINALIZZAZIONE.has(event.type)) {
    const session = event.data.object as Stripe.Checkout.Session;
    const pagato =
      session.payment_status === "paid" ||
      session.payment_status === "no_payment_required";

    if (pagato) {
      try {
        const supabase = createAdminSupabase();
        await finalizzaOrdine(supabase, session);
      } catch (err) {
        // Errore lato nostro (DB/Stripe): logghiamo e rispondiamo 500 cosi
        // Stripe ritenta. Nessun dettaglio interno verso l'esterno.
        console.error("[stripe-webhook] finalizzazione fallita:", err);
        return new Response("Elaborazione fallita.", { status: 500 });
      }
    }
  } else if (EVENTI_SCADUTI.has(event.type)) {
    // Sessione scaduta senza pagamento: nessun ordine da finalizzare, nessuno
    // stock scalato. Logghiamo per tracciabilita e restiamo idempotenti.
    const session = event.data.object as Stripe.Checkout.Session;
    console.info(
      "[stripe-webhook] sessione scaduta:",
      `session=${session.id}`,
      `payment_status=${session.payment_status}`,
    );
  } else if (EVENTI_PAGAMENTO_FALLITO.has(event.type)) {
    // Pagamento fallito (metodo asincrono o PaymentIntent): non tocchiamo stato
    // ne stock, ci limitiamo a un warning con i riferimenti utili.
    const oggetto = event.data.object as
      | Stripe.Checkout.Session
      | Stripe.PaymentIntent;
    console.warn(
      "[stripe-webhook] pagamento fallito:",
      `type=${event.type}`,
      `ref=${oggetto.id}`,
    );
  }

  // Evento ricevuto e (eventualmente) gestito con successo.
  return new Response(JSON.stringify({ ricevuto: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
