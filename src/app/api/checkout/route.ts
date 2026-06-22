// Route handler che crea una Stripe Checkout Session a partire dal carrello.
//
// Regole di build: nessun accesso a process.env a livello di modulo, client
// Stripe/Supabase inizializzati lazy. Degrada con grazia se le env mancano.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getStripe } from "@/lib/stripe";
import { createServerSupabase } from "@/lib/supabase/server";
import { leggiCarrello } from "@/lib/cart";
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

  // 2) Legge il carrello (degrada a [] se Supabase non e configurato).
  const righe = await leggiCarrello();
  if (righe.length === 0) {
    return erroreJson("Il carrello e vuoto.", 400);
  }

  // 3) Prepara i line items dai prezzi in centesimi (currency eur).
  const lineItems = righe.map((riga) => ({
    quantity: riga.quantita,
    price_data: {
      currency: "eur",
      unit_amount: riga.prodotto.prezzo_cents,
      product_data: {
        name: etichettaRiga(riga),
        // Lo SKU della variante viaggia nei metadata del product Stripe:
        // il webhook lo rilegge per decrementare lo stock giusto.
        metadata: { sku: riga.variante.sku },
        ...(riga.prodotto.descrizione
          ? { description: riga.prodotto.descrizione }
          : {}),
        ...(riga.prodotto.immagine_url
          ? { images: [riga.prodotto.immagine_url] }
          : {}),
      },
    },
  }));

  const totaleCents = righe.reduce(
    (acc, riga) => acc + riga.prodotto.prezzo_cents * riga.quantita,
    0,
  );

  try {
    const stripe = getStripe();

    // 4) Crea la Checkout Session in modalita pagamento.
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      success_url: `${siteUrl}/checkout/successo?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/checkout/annullato`,
      billing_address_collection: "auto",
      shipping_address_collection: { allowed_countries: ["IT"] },
      locale: "it",
    });

    // 5) Salva un ordine "in_attesa" con lo stripe_session_id, se Supabase c'e.
    //    Non blocca il checkout se il salvataggio fallisce: il webhook fa fede.
    try {
      const supabase = await createServerSupabase();
      if (supabase) {
        await supabase.from("ordini").insert({
          stato: "in_attesa",
          totale_cents: totaleCents,
          email: session.customer_details?.email ?? null,
          stripe_session_id: session.id,
        });
      }
    } catch {
      // Il salvataggio dell'ordine e best effort: il webhook lo creera/aggiornera.
    }

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
    const messaggio =
      err instanceof Error ? err.message : "Errore sconosciuto.";
    return erroreJson(`Errore nella creazione del checkout: ${messaggio}`, 500);
  }
}
