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
// Le email di notifica partono via `after()` DOPO la risposta 200 a Stripe: su
// serverless il loro invio SMTP estende comunque la durata della funzione, quindi
// diamo margine (default 10s troppo stretto per il connect+send SMTP).
export const maxDuration = 30;

import { after } from "next/server";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getStripe } from "@/lib/stripe";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { inviaEmail } from "@/lib/email";
import { NEGOZIO } from "@/lib/negozio";
import { formatPrezzo } from "@/lib/format";
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

/**
 * Riga della sessione: SKU + quantita (per scalare lo stock) e nome leggibile +
 * importo (per le email di notifica). Ricavata dalle line item della sessione.
 */
interface LineaSessione {
  sku: string;
  qta: number;
  nome: string;
  importoCents: number;
}

/**
 * Ricava le righe dalle line item della sessione. Le line item non sono espanse
 * di default: vanno richieste a Stripe. Lo SKU viaggia nei metadata del product
 * Stripe (impostato alla creazione della sessione); il nome e la label mostrata
 * al cliente sul checkout, riusata nelle email.
 */
async function righeDaSessione(sessionId: string): Promise<LineaSessione[]> {
  const stripe = getStripe();
  const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, {
    limit: 100,
    expand: ["data.price.product"],
  });

  const righe: LineaSessione[] = [];
  for (const item of lineItems.data) {
    const qta = item.quantity ?? 0;
    if (qta <= 0) continue;

    const prodotto = item.price?.product;
    const sku =
      prodotto && typeof prodotto !== "string" && "metadata" in prodotto
        ? (prodotto.metadata?.sku ?? null)
        : null;
    if (!sku) continue;

    const nome =
      prodotto && typeof prodotto !== "string" && "name" in prodotto
        ? (prodotto.name ?? item.description ?? sku)
        : (item.description ?? sku);

    righe.push({ sku, qta, nome, importoCents: item.amount_total ?? 0 });
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
 * Ritorna true SOLO se questa invocazione ha davvero finalizzato l'ordine (la RPC
 * distingue la prima chiamata dai retry idempotenti): il chiamante lo usa per
 * inviare le email di notifica una volta sola.
 */
async function finalizzaOrdine(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
  righe: LineaSessione[],
): Promise<boolean> {
  const { data, error } = await supabase.rpc("finalizza_ordine_pagato", {
    p_session_id: session.id,
    p_email: session.customer_details?.email ?? null,
    p_total: session.amount_total ?? 0,
    p_righe: righe.map((r) => ({ sku: r.sku, qta: r.qta })),
    // shipping_cost.amount_total = costo della tariffa scelta dal cliente.
    p_shipping_cents: session.shipping_cost?.amount_total ?? null,
    p_indirizzo: indirizzoDaSessione(session),
  });
  if (error) {
    throw new Error(`Finalizzazione ordine fallita: ${error.message}`);
  }
  // true = prima finalizzazione. Con la vecchia RPC `returns void` data e null
  // -> false: nessuna email finche la migration 20260708120000 non e applicata
  // (nessun doppione, degrada in sicurezza).
  return data === true;
}

/** Indirizzo di spedizione in testo leggibile per le email. "—" se assente. */
function indirizzoLeggibile(session: Stripe.Checkout.Session): string {
  const d = session.collected_information?.shipping_details;
  if (!d) return "—";
  const a = d.address;
  const cap = a
    ? [a.postal_code, a.city, a.state].filter(Boolean).join(" ")
    : "";
  const righe = [d.name, a?.line1, a?.line2, cap, a?.country].filter(
    (r): r is string => Boolean(r && r.trim()),
  );
  return righe.length > 0 ? righe.join("\n") : "—";
}

/**
 * Notifica un ordine pagato: email alla titolare (va spedito) e conferma al
 * cliente. Best effort (Promise.allSettled + inviaEmail non lancia mai): non
 * deve mai far ritentare il webhook. Chiamata via `after()`, cioe dopo aver gia
 * risposto 200 a Stripe, così l'SMTP non blocca la risposta.
 */
async function inviaNotificheOrdinePagato(
  session: Stripe.Checkout.Session,
  righe: LineaSessione[],
): Promise<void> {
  const clienteEmail = session.customer_details?.email ?? null;
  const clienteNome =
    session.customer_details?.name ??
    session.collected_information?.shipping_details?.name ??
    "";
  const totale = formatPrezzo(session.amount_total ?? 0);
  const articoli = righe.map((r) => `• ${r.qta}× ${r.nome}`).join("\n");
  const indirizzo = indirizzoLeggibile(session);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  await Promise.allSettled([
    // 1) Notifica alla titolare: una vendita e stata pagata, va spedita.
    inviaEmail({
      to: NEGOZIO.email,
      replyTo: clienteEmail ?? undefined,
      subject: `Nuovo ordine pagato — ${totale}`,
      text: `Un cliente ha pagato un ordine su Anna Shop.\n\n${
        clienteNome ? `Cliente: ${clienteNome}\n` : ""
      }${clienteEmail ? `Email: ${clienteEmail}\n` : ""}\nArticoli:\n${articoli}\n\nTotale incassato: ${totale}\n\nSpedire a:\n${indirizzo}\n\nGestisci l'ordine: ${siteUrl}/gestore/ordini`,
    }),
    // 2) Conferma al cliente (solo se Stripe ha raccolto un'email).
    ...(clienteEmail
      ? [
          inviaEmail({
            to: clienteEmail,
            subject: "Ordine confermato — Anna Shop",
            text: `Ciao${clienteNome ? ` ${clienteNome}` : ""},\n\ngrazie per il tuo acquisto! Abbiamo ricevuto il pagamento e prepariamo la spedizione.\n\nArticoli:\n${articoli}\n\nTotale: ${totale}\n\nSpedizione a:\n${indirizzo}\n\nA presto,\nAnna Shop di Borracci Anna — ${NEGOZIO.indirizzoCompleto}`,
          }),
        ]
      : []),
  ]);
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
        const righe = await righeDaSessione(session.id);
        const appenaFinalizzato = await finalizzaOrdine(
          supabase,
          session,
          righe,
        );
        // Email di notifica solo alla PRIMA finalizzazione (idempotenza sui retry
        // Stripe). Inviate via `after()`: partono dopo la risposta 200, così un
        // SMTP lento non fa scadere il webhook (che Stripe interpreterebbe come
        // fallimento, disabilitando l'endpoint dopo troppi retry).
        if (appenaFinalizzato) {
          after(() => inviaNotificheOrdinePagato(session, righe));
        }
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
