// Webhook Stripe: riceve gli eventi e finalizza gli ordini.
//
// Regole di build: nessun accesso a process.env a livello di modulo, nessun
// throw durante l'import, client Stripe/Supabase inizializzati lazy.
//
// Sicurezza: la firma va verificata sul RAW body, quindi NON usare req.json().
// Idempotenza: su "checkout.session.completed" l'ordine viene segnato "pagato"
// e lo stock decrementato una sola volta (salta se gia pagato).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getStripe } from "@/lib/stripe";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Finalizza una sessione di checkout completata: segna l'ordine "pagato" e
 * decrementa lo stock delle varianti acquistate. Idempotente.
 */
async function finalizzaOrdine(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const sessionId = session.id;

  // Recupera l'ordine collegato alla sessione.
  const { data: ordine, error: errOrdine } = await supabase
    .from("ordini")
    .select("id, stato")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();

  if (errOrdine) {
    throw new Error(`Lettura ordine fallita: ${errOrdine.message}`);
  }

  // Idempotenza: se l'ordine e gia pagato non rifacciamo nulla.
  if (ordine && ordine.stato === "pagato") {
    return;
  }

  const email = session.customer_details?.email ?? null;

  let ordineId: string | null = ordine?.id ?? null;

  if (ordineId) {
    // Aggiorna l'ordine esistente solo se non gia pagato (guardia atomica).
    const { error: errUpdate } = await supabase
      .from("ordini")
      .update({ stato: "pagato", email })
      .eq("id", ordineId)
      .neq("stato", "pagato");
    if (errUpdate) {
      throw new Error(`Aggiornamento ordine fallito: ${errUpdate.message}`);
    }
  } else {
    // Nessun ordine pre-creato (es. salvataggio fallito in /api/checkout):
    // creiamo l'ordine come pagato.
    const { data: nuovo, error: errInsert } = await supabase
      .from("ordini")
      .insert({
        stato: "pagato",
        totale_cents: session.amount_total ?? 0,
        email,
        stripe_session_id: sessionId,
      })
      .select("id")
      .single();
    if (errInsert || !nuovo) {
      throw new Error(
        `Creazione ordine fallita: ${errInsert?.message ?? "esito vuoto"}`,
      );
    }
    ordineId = nuovo.id;
  }

  // Decrementa lo stock in base alle line items della sessione.
  // Le line items non sono espanse di default: vanno richieste a Stripe.
  await decrementaStock(supabase, sessionId);
}

/**
 * Recupera le line items della sessione da Stripe e decrementa lo stock della
 * variante corrispondente (matchata via SKU = price.product metadata o nome).
 * Best effort per riga: un errore su una riga non blocca le altre.
 */
async function decrementaStock(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<void> {
  const stripe = getStripe();

  const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, {
    limit: 100,
    expand: ["data.price.product"],
  });

  for (const item of lineItems.data) {
    const quantita = item.quantity ?? 0;
    if (quantita <= 0) {
      continue;
    }

    const prodotto = item.price?.product;
    // Lo SKU della variante e salvato nei metadata del product Stripe.
    const sku =
      prodotto && typeof prodotto !== "string" && "metadata" in prodotto
        ? (prodotto.metadata?.sku ?? null)
        : null;

    if (!sku) {
      continue;
    }

    // Legge lo stock corrente della variante e lo decrementa (mai sotto zero).
    const { data: variante } = await supabase
      .from("varianti")
      .select("id, stock")
      .eq("sku", sku)
      .maybeSingle();

    if (!variante) {
      continue;
    }

    const nuovoStock = Math.max(0, variante.stock - quantita);
    await supabase
      .from("varianti")
      .update({ stock: nuovoStock })
      .eq("id", variante.id);
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

  // Gestisce solo il completamento del checkout. Gli altri eventi -> 200.
  if (event.type === "checkout.session.completed") {
    try {
      const supabase = createAdminSupabase();
      const session = event.data.object as Stripe.Checkout.Session;
      await finalizzaOrdine(supabase, session);
    } catch (err) {
      // Errore lato nostro (DB/env): rispondiamo 500 cosi Stripe ritenta.
      const messaggio =
        err instanceof Error ? err.message : "errore interno";
      return new Response(`Elaborazione fallita: ${messaggio}`, {
        status: 500,
      });
    }
  }

  // Evento ricevuto e (eventualmente) gestito con successo.
  return new Response(JSON.stringify({ ricevuto: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
