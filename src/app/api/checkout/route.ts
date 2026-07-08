// Route handler che crea una Stripe Checkout Session a partire dal carrello.
//
// Regole di build: nessun accesso a process.env a livello di modulo, client
// Stripe/Supabase inizializzati lazy. Degrada con grazia se le env mancano.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getStripe } from "@/lib/stripe";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { leggiCarrello, riconciliaCarrello } from "@/lib/cart";
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

  // 2) Legge il carrello (degrada a [] se Supabase non e configurato).
  const righe = await leggiCarrello();
  if (righe.length === 0) {
    return erroreJson("Il carrello è vuoto.", 400);
  }

  // Articoli "su richiesta": niente pagamento diretto. Devono passare dal flusso
  // richiesta -> conferma del gestore. Difesa lato server contro un checkout che
  // aggirerebbe la conferma di disponibilita.
  if (righe.some((riga) => riga.prodotto.disponibilita_su_richiesta)) {
    return erroreJson(
      "Alcuni articoli sono disponibili su richiesta: invia prima la richiesta dal carrello.",
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

  // Opzioni di spedizione: calcolate server-side dal subtotale merce (fonte di
  // verita = carrello server-side, mai input del client). Stripe le mostra come
  // scelte sulla pagina hosted; il costo reale scelto torna nel webhook.
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
    });

    // 5) Salva l'ordine "in_attesa" + le righe con lo stripe_session_id (client
    //    ADMIN: `ordini` non ha policy anon, l'anon key verrebbe respinta dalla
    //    RLS). Cosi il webhook AGGIORNA un record gia completo invece di ricrearlo
    //    monco. Best effort: non blocca il checkout, il webhook resta autoritativo.
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const admin = createAdminSupabase();
        const { data: ordine, error } = await admin
          .from("ordini")
          .insert({
            stato: "in_attesa",
            totale_cents: totaleCents,
            email: session.customer_details?.email ?? null,
            stripe_session_id: session.id,
          })
          .select("id")
          .single();
        if (error || !ordine) throw error ?? new Error("insert ordine vuoto");

        // Snapshot foto per riga (stessa logica di inviaRichiestaAction): la
        // prima foto del colore della variante, fallback copertina prodotto.
        // Best effort: senza foto la riga resta valida (miniatura generica).
        const prodottoIds = [...new Set(righe.map((r) => r.prodotto.id))];
        let foto: { prodotto_id: string; colore: string | null; url: string }[] =
          [];
        try {
          const { data: dataFoto } = await admin
            .from("prodotto_foto")
            .select("prodotto_id, colore, url, ordine")
            .in("prodotto_id", prodottoIds)
            .order("ordine", { ascending: true });
          foto = dataFoto ?? [];
        } catch {
          foto = [];
        }
        const fotoRiga = (r: RigaCarrello): string | null => {
          if (r.variante.colore) {
            const match = foto.find(
              (f) =>
                f.prodotto_id === r.prodotto.id &&
                f.colore === r.variante.colore,
            );
            if (match) return match.url;
          }
          return r.prodotto.immagine_url;
        };

        const righeOrdine = righe.map((riga) => ({
          ordine_id: ordine.id,
          prodotto_id: riga.prodotto.id,
          variante_id: riga.variante.id,
          nome_prodotto: riga.prodotto.nome,
          sku: riga.variante.sku,
          taglia: riga.variante.taglia,
          colore: riga.variante.colore,
          prezzo_cents: riga.prodotto.prezzo_cents,
          quantita: riga.quantita,
          immagine_url: fotoRiga(riga),
        }));
        const { error: errRighe } = await admin
          .from("ordine_righe")
          .insert(righeOrdine);
        if (errRighe) throw errRighe;
      } catch (err) {
        // Best effort: il webhook creera/aggiornera l'ordine dalle line item.
        console.error("[checkout] salvataggio ordine pre-pagamento fallito:", err);
      }
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
    // Il dettaglio (spesso in inglese, tecnico) resta nei log: al cliente va un
    // messaggio chiaro in italiano, non l'errore grezzo di Stripe.
    console.error("[checkout] creazione sessione fallita:", err);
    return erroreJson(
      "Non è stato possibile avviare il pagamento. Riprova tra poco o scrivici per completare l'ordine.",
      500,
    );
  }
}
