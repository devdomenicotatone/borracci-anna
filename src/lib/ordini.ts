"use server";

// Server Actions del flusso ordine "a pagamento differito" (lato cliente).
//   inviaRichiestaAction   -> crea un ordine in_attesa dal carrello (no pagamento)
//   creaCheckoutOrdineAction -> avvia il pagamento Stripe di un ordine CONFERMATO
//
// Gli ordini NON sono accessibili dall'anon (RLS senza policy): si scrive/legge
// solo col service role (admin client), come il webhook. Il carrello e la fonte
// di verita degli articoli (server-side, da cookie): il client non li sceglie.

import { revalidatePath } from "next/cache";

import { createAdminSupabase } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { leggiCarrello } from "@/lib/cart";
import { inviaEmail } from "@/lib/email";
import { NEGOZIO } from "@/lib/negozio";
import { formatPrezzo } from "@/lib/format";

/** Esito del form "Invia richiesta": `token` su successo, altrimenti errori. */
export interface StatoRichiesta {
  /** Token dell'ordine creato: il client svuota il carrello e va a /ordine/[token]. */
  token?: string;
  error?: string;
  errors?: { nome?: string; email?: string };
}

function emailValida(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/** Etichetta riga per Stripe: "Nome (Colore, Taglia M)". */
function etichettaRiga(r: {
  nome_prodotto: string;
  colore: string | null;
  taglia: string | null;
}): string {
  const d = [r.colore, r.taglia ? `Taglia ${r.taglia}` : null].filter(Boolean);
  return d.length ? `${r.nome_prodotto} (${d.join(", ")})` : r.nome_prodotto;
}

/**
 * Crea un ordine "in_attesa" dal carrello corrente, senza pagamento.
 * Validazione lato server; gli articoli arrivano dal carrello (cookie), non dal
 * client. Su successo svuota il carrello e redirige a /ordine/[token].
 */
export async function inviaRichiestaAction(
  _stato: StatoRichiesta,
  formData: FormData,
): Promise<StatoRichiesta> {
  // Endpoint pubblico (POST): trim + cap di lunghezza per evitare DB bloat e
  // payload abnormi nelle email.
  const nome = String(formData.get("nome") ?? "").trim().slice(0, 200);
  const email = String(formData.get("email") ?? "").trim().slice(0, 254);
  const telefono = String(formData.get("telefono") ?? "").trim().slice(0, 40);
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);

  const errors: NonNullable<StatoRichiesta["errors"]> = {};
  if (!nome) errors.nome = "Inserisci il tuo nome.";
  if (!email || !emailValida(email)) errors.email = "Inserisci un'email valida.";
  if (Object.keys(errors).length > 0) return { errors };

  const righe = await leggiCarrello();
  if (righe.length === 0) return { error: "Il carrello è vuoto." };

  const totaleCents = righe.reduce(
    (acc, r) => acc + r.prodotto.prezzo_cents * r.quantita,
    0,
  );
  const token = crypto.randomUUID();

  try {
    const admin = createAdminSupabase();

    // Rate limit best-effort (DB-backed, quindi condiviso tra istanze): frena
    // flood e doppi invii. Max 3 richieste / 60s per email.
    const daPocoIso = new Date(Date.now() - 60_000).toISOString();
    const { count: recenti } = await admin
      .from("ordini")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("creato_il", daPocoIso);
    if ((recenti ?? 0) >= 3) {
      return {
        error: "Hai inviato troppe richieste di recente. Riprova tra qualche minuto.",
      };
    }

    const { data: ordine, error } = await admin
      .from("ordini")
      .insert({
        stato: "in_attesa",
        totale_cents: totaleCents,
        nome,
        email,
        telefono: telefono || null,
        note: note || null,
        token,
      })
      .select("id")
      .single();
    if (error || !ordine) {
      return { error: "Impossibile creare la richiesta. Riprova." };
    }

    const righeOrdine = righe.map((r) => ({
      ordine_id: ordine.id,
      prodotto_id: r.prodotto.id,
      variante_id: r.variante.id,
      nome_prodotto: r.prodotto.nome,
      sku: r.variante.sku,
      taglia: r.variante.taglia,
      colore: r.variante.colore,
      prezzo_cents: r.prodotto.prezzo_cents,
      quantita: r.quantita,
    }));
    const { error: errRighe } = await admin
      .from("ordine_righe")
      .insert(righeOrdine);
    if (errRighe) {
      // Niente ordini "monchi": rollback dell'ordine appena creato.
      await admin.from("ordini").delete().eq("id", ordine.id);
      return { error: "Impossibile salvare gli articoli. Riprova." };
    }

    // Notifiche email (best effort: non bloccano la creazione dell'ordine).
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const articoli = righe
      .map((r) => {
        const det = [
          r.variante.colore,
          r.variante.taglia ? `Taglia ${r.variante.taglia}` : null,
        ].filter(Boolean);
        return `• ${r.quantita}× ${r.prodotto.nome}${det.length ? ` (${det.join(", ")})` : ""}`;
      })
      .join("\n");
    const totale = formatPrezzo(totaleCents);
    await Promise.allSettled([
      // 1) Notifica al gestore (rispondibile direttamente al cliente).
      inviaEmail({
        to: NEGOZIO.email,
        replyTo: email,
        subject: `Nuova richiesta da ${nome}`,
        text: `Nuova richiesta d'ordine su Anna Shop.\n\nCliente: ${nome}\nEmail: ${email}${telefono ? `\nTelefono: ${telefono}` : ""}\n\nArticoli:\n${articoli}\n\nTotale stimato: ${totale}${note ? `\n\nNote: ${note}` : ""}\n\nGestisci la richiesta: ${siteUrl}/gestore/ordini`,
      }),
      // 2) Conferma di ricezione al cliente, col link alla pagina ordine.
      inviaEmail({
        to: email,
        subject: "Abbiamo ricevuto la tua richiesta — Anna Shop",
        text: `Ciao ${nome},\n\ngrazie! Abbiamo ricevuto la tua richiesta. Verifichiamo la disponibilità di tutti gli articoli e ti ricontattiamo a breve: appena confermiamo potrai pagare in sicurezza da questa pagina.\n\nArticoli:\n${articoli}\n\nTotale stimato: ${totale}\n\nSegui la tua richiesta qui:\n${siteUrl}/ordine/${token}\n\nA presto,\nAnna Shop di Borracci Anna — ${NEGOZIO.indirizzoCompleto}`,
      }),
    ]);

    revalidatePath("/gestore/ordini");
    // Il client svuota il carrello (provider) e naviga a /ordine/[token].
    return { token };
  } catch {
    return { error: "Errore di rete. Riprova." };
  }
}

/** Esito dell'avvio pagamento. */
export interface EsitoPagamento {
  ok: boolean;
  url?: string;
  error?: string;
}

/**
 * Avvia il pagamento Stripe di un ordine gia CONFERMATO dal gestore.
 * Crea una Checkout Session fresca dalle righe d'ordine e ne salva l'id.
 */
export async function creaCheckoutOrdineAction(
  token: string,
): Promise<EsitoPagamento> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { ok: false, error: "Pagamenti non disponibili al momento." };
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    return { ok: false, error: "Configurazione mancante (NEXT_PUBLIC_SITE_URL)." };
  }

  try {
    const admin = createAdminSupabase();
    const { data: ordine } = await admin
      .from("ordini")
      .select("id, stato")
      .eq("token", token)
      .maybeSingle();
    if (!ordine) return { ok: false, error: "Ordine non trovato." };
    if (ordine.stato === "pagato") {
      return { ok: false, error: "Questo ordine risulta già pagato." };
    }
    if (ordine.stato !== "confermato") {
      return { ok: false, error: "L'ordine non è ancora confermato dal negozio." };
    }

    const { data: righe } = await admin
      .from("ordine_righe")
      .select("nome_prodotto, sku, taglia, colore, prezzo_cents, quantita")
      .eq("ordine_id", ordine.id);
    if (!righe || righe.length === 0) {
      return { ok: false, error: "Ordine senza articoli." };
    }

    const lineItems = righe.map((r) => ({
      quantity: r.quantita,
      price_data: {
        currency: "eur",
        unit_amount: r.prezzo_cents,
        product_data: {
          name: etichettaRiga(r),
          metadata: { sku: r.sku ?? "" },
        },
      },
    }));

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      success_url: `${siteUrl}/ordine/${token}?pagato=1`,
      cancel_url: `${siteUrl}/ordine/${token}`,
      client_reference_id: ordine.id,
      billing_address_collection: "auto",
      shipping_address_collection: { allowed_countries: ["IT"] },
      locale: "it",
    });

    await admin
      .from("ordini")
      .update({ stripe_session_id: session.id })
      .eq("id", ordine.id);

    if (!session.url) {
      return { ok: false, error: "URL di pagamento assente." };
    }
    return { ok: true, url: session.url };
  } catch (err) {
    const m = err instanceof Error ? err.message : "Errore sconosciuto.";
    return { ok: false, error: `Avvio pagamento non riuscito: ${m}` };
  }
}
