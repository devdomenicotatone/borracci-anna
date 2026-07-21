"use server";

// Server Actions del flusso ordine "a pagamento differito" (lato cliente).
//   inviaRichiestaAction   -> crea un ordine in_attesa dal carrello (no pagamento)
//   creaCheckoutOrdineAction -> avvia il pagamento Stripe di un ordine CONFERMATO
//
// Gli ordini NON sono accessibili dall'anon (RLS senza policy): si scrive/legge
// solo col service role (admin client), come il webhook. Il carrello e la fonte
// di verita degli articoli (server-side, da cookie): il client non li sceglie.

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { createAdminSupabase } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { leggiCarrello } from "@/lib/cart";
import { verificaSessioneCliente } from "@/lib/account/auth";
import { consentiPerIp } from "@/lib/rate-limit-ip";
import {
  ambienteStripe,
  assicuraStripeCustomer,
} from "@/lib/account/stripe-cliente";
import { inviaEmail } from "@/lib/email";
import { rigaContattiEmail, testoCondizioniCheckout } from "@/lib/legale";
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

  const carrello = await leggiCarrello();
  if (carrello.length === 0) return { error: "Il carrello è vuoto." };

  // Sezioni separate del carrello misto: la richiesta copre SOLO gli articoli
  // su richiesta. Quelli in pronta consegna si pagano subito con il checkout
  // diretto e NON entrano nell'ordine differito (prima un carrello misto veniva
  // fuso in un'unica richiesta). Restano nel carrello dopo l'invio.
  const righe = carrello.filter((r) => r.prodotto.disponibilita_su_richiesta);
  if (righe.length === 0) {
    return {
      error:
        'Gli articoli nel carrello sono disponibili subito: completa l’acquisto con "Vai al pagamento".',
    };
  }

  // Rate limit per-IP (freno anti-flood reale): l'email e un campo libero, quindi
  // il cap per-email piu sotto si aggira variandola; il per-IP no. Fail-open.
  if (!(await consentiPerIp("richiesta_ordine"))) {
    return {
      error: "Hai inviato troppe richieste di recente. Riprova tra qualche minuto.",
    };
  }

  // Cliente loggato: l'ordine nasce gia collegato al suo account, anche se
  // l'email di contatto e diversa (e lui a inviare la richiesta). Per gli
  // OSPITI ci pensa il trigger DB sull'email verificata: qui nulla cambia.
  const sessioneCliente = await verificaSessioneCliente();

  const totaleCents = righe.reduce(
    (acc, r) => acc + r.prodotto.prezzo_cents * r.quantita,
    0,
  );
  const token = crypto.randomUUID();

  try {
    const admin = createAdminSupabase();

    // Rate limit best-effort (DB-backed, condiviso tra istanze). Il freno
    // anti-flood principale e ora il cap PER-IP (consentiPerIp sopra). Qui
    // restano, letti dalla tabella `ordini` sulla finestra di 60s:
    //   1) per-email: max 3 (blocca il singolo indirizzo che spamma);
    //   2) globale: solo SEGNALE DI ALLARME (log), NON piu un hard-block —
    //      negare il servizio a TUTTI quando il volume saliva era un DoS sui
    //      clienti legittimi; il per-IP copre gia il flood da un singolo attore.
    const daPocoIso = new Date(Date.now() - 60_000).toISOString();
    // Soglia del volume globale oltre cui logghiamo un allarme (nessun blocco).
    const SOGLIA_ALLARME_GLOBALE = 50;

    // Log dell'IP (x-forwarded-for) per tracciabilita del flood; headers() e
    // async in Next 16.
    try {
      const h = await headers();
      const ip = h.get("x-forwarded-for");
      if (ip) console.warn(`[ordini] richiesta da IP ${ip}`);
    } catch {
      // Contesto senza header (es. test): ignora.
    }

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

    const { count: recentiGlobali } = await admin
      .from("ordini")
      .select("id", { count: "exact", head: true })
      .eq("stato", "in_attesa")
      .gte("creato_il", daPocoIso);
    // Solo osservabilita: NON blocchiamo piu il servizio a tutti (era un DoS sui
    // clienti legittimi). Il flood da un singolo attore lo ferma gia il per-IP.
    if ((recentiGlobali ?? 0) >= SOGLIA_ALLARME_GLOBALE) {
      console.warn(
        `[ordini] volume richieste elevato: ${recentiGlobali} in_attesa/60s`,
      );
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
        user_id: sessioneCliente?.userId ?? null,
      })
      .select("id, numero")
      .single();
    if (error || !ordine) {
      return { error: "Impossibile creare la richiesta. Riprova." };
    }

    // Snapshot della foto per riga: la prima foto del colore della variante,
    // altrimenti la copertina del prodotto. Best effort: se la lettura delle
    // foto fallisce si degrada alla copertina, mai bloccare l'ordine.
    let foto: { prodotto_id: string; colore: string | null; url: string }[] = [];
    try {
      const prodottoIds = [...new Set(righe.map((r) => r.prodotto.id))];
      const { data: dataFoto } = await admin
        .from("prodotto_foto")
        .select("prodotto_id, colore, url, ordine")
        .in("prodotto_id", prodottoIds)
        .order("ordine", { ascending: true });
      foto = dataFoto ?? [];
    } catch {
      foto = [];
    }
    const fotoRiga = (r: (typeof righe)[number]): string | null => {
      if (r.variante.colore) {
        const match = foto.find(
          (f) =>
            f.prodotto_id === r.prodotto.id && f.colore === r.variante.colore,
        );
        if (match) return match.url;
      }
      return r.prodotto.immagine_url;
    };

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
      immagine_url: fotoRiga(r),
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
    // Riferimento (M10) e recapiti cliccabili (B9) anche sulla ricezione: il
    // numero e' assegnato dal default della colonna al momento dell'insert.
    const rifRichiesta =
      ordine.numero != null ? ` (richiesta #${ordine.numero})` : "";
    await Promise.allSettled([
      // 1) Notifica al gestore (rispondibile direttamente al cliente).
      inviaEmail({
        to: NEGOZIO.email,
        replyTo: email,
        subject: `Nuova richiesta da ${nome}`,
        text: `Nuova richiesta d'ordine su Anna Shop${rifRichiesta}.\n\nCliente: ${nome}\nEmail: ${email}${telefono ? `\nTelefono: ${telefono}` : ""}\n\nArticoli:\n${articoli}\n\nTotale stimato: ${totale}${note ? `\n\nNote: ${note}` : ""}\n\nGestisci la richiesta: ${siteUrl}/gestore/ordini`,
      }),
      // 2) Conferma di ricezione al cliente, col link alla pagina ordine.
      inviaEmail({
        to: email,
        subject: "Abbiamo ricevuto la tua richiesta — Anna Shop",
        text: `Ciao ${nome},\n\ngrazie! Abbiamo ricevuto la tua richiesta${rifRichiesta}. Verifichiamo la disponibilità di tutti gli articoli e ti ricontattiamo a breve: appena confermiamo potrai pagare in sicurezza da questa pagina.\n\nArticoli:\n${articoli}\n\nTotale stimato: ${totale}\n\nSegui la tua richiesta qui:\n${siteUrl}/ordine/${token}\n\n${rigaContattiEmail()}\n\nA presto,\nAnna Shop di Borracci Anna — ${NEGOZIO.indirizzoCompleto}`,
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
      .select("id, stato, costo_spedizione_cents, stripe_session_id, user_id")
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
      .select(
        "variante_id, nome_prodotto, sku, taglia, colore, prezzo_cents, quantita, rimossa_il",
      )
      .eq("ordine_id", ordine.id);
    if (!righe || righe.length === 0) {
      return { ok: false, error: "Ordine senza articoli." };
    }

    // Le righe rimosse in fase di conferma parziale NON vanno mai pagate:
    // il cliente paga solo gli articoli disponibili.
    const attive = righe.filter((r) => !r.rimossa_il);
    if (attive.length === 0) {
      return { ok: false, error: "Ordine senza articoli disponibili." };
    }

    // Riverifica le giacenze: tra la conferma del gestore e il pagamento lo stock
    // puo essere cambiato (sync BLT, altre vendite). Per i prodotti a magazzino
    // non facciamo mai pagare merce non piu disponibile; i "su richiesta" sono
    // esclusi (giacenza non in tempo reale, gia validata dal gestore).
    const perVariante = new Map<string, { nome: string; qta: number }>();
    const nonDisponibili: string[] = [];
    for (const r of attive) {
      // Riga attiva SENZA variante collegata: la variante e stata eliminata dal
      // gestore dopo la conferma (il FK ordine_righe.variante_id e ON DELETE SET
      // NULL, non CASCADE). Non e piu verificabile ne evadibile e non deve MAI
      // essere fatta pagare: la marchiamo non disponibile invece di saltarla in
      // silenzio (altrimenti finirebbe nei line item Stripe senza controllo).
      if (!r.variante_id) {
        nonDisponibili.push(r.nome_prodotto);
        continue;
      }
      const cur = perVariante.get(r.variante_id);
      perVariante.set(r.variante_id, {
        nome: r.nome_prodotto,
        qta: (cur?.qta ?? 0) + r.quantita,
      });
    }
    if (perVariante.size > 0) {
      const { data: varStock } = await admin
        .from("varianti")
        .select("id, stock, prodotti (attivo, disponibilita_su_richiesta)")
        .in("id", [...perVariante.keys()]);
      for (const v of varStock ?? []) {
        const rel = (
          v as unknown as {
            prodotti:
              | { attivo: boolean; disponibilita_su_richiesta: boolean }
              | { attivo: boolean; disponibilita_su_richiesta: boolean }[]
              | null;
          }
        ).prodotti;
        const info = Array.isArray(rel) ? rel[0] : rel;
        const serve = perVariante.get(v.id as string);
        if (!serve) continue;
        // Prodotto ritirato dal catalogo dopo la conferma: mai farlo pagare,
        // nemmeno se su richiesta (il soft-delete non azzera lo stock).
        if (info?.attivo === false) {
          nonDisponibili.push(serve.nome);
          continue;
        }
        if (info?.disponibilita_su_richiesta) continue;
        if ((v.stock ?? 0) < serve.qta) {
          nonDisponibili.push(serve.nome);
        }
      }
    }
    if (nonDisponibili.length > 0) {
      return {
        ok: false,
        error: `Alcuni articoli non sono più disponibili (o non nella quantità richiesta): ${[
          ...new Set(nonDisponibili),
        ].join(", ")}. Contatta il negozio prima di pagare.`,
      };
    }

    const lineItems = attive.map((r) => ({
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

    // Spedizione gia concordata dal gestore in fase di conferma: la passiamo
    // come opzione fissa (un'unica voce), cosi Stripe la incassa e il webhook la
    // persiste come nel flusso diretto. 0/null = nessun addebito spedizione.
    const spedizioneCents = ordine.costo_spedizione_cents ?? 0;
    const shippingOptions =
      spedizioneCents > 0
        ? [
            {
              shipping_rate_data: {
                type: "fixed_amount" as const,
                display_name: "Spedizione",
                fixed_amount: { amount: spedizioneCents, currency: "eur" },
              },
            },
          ]
        : undefined;

    const stripe = getStripe();

    // Se esiste gia una sessione per questo ordine, gestiscila PRIMA di crearne
    // una nuova. Se risulta gia COMPLETATA (il cliente ha pagato, magari col
    // webhook ancora in ritardo), NON creare una nuova sessione: orfanerebbe
    // quella pagata (il webhook cerca l'ordine per stripe_session_id e non lo
    // ritroverebbe piu) e aprirebbe la porta a un secondo addebito. Altrimenti
    // (sessione ancora aperta o scaduta non pagata) la si fa scadere e si ricrea.
    if (ordine.stripe_session_id) {
      try {
        const esistente = await stripe.checkout.sessions.retrieve(
          ordine.stripe_session_id,
        );
        if (
          esistente.status === "complete" ||
          esistente.payment_status === "paid"
        ) {
          return {
            ok: false,
            error:
              "Un pagamento per questo ordine risulta già ricevuto: aggiorna la pagina tra qualche secondo.",
          };
        }
        await stripe.checkout.sessions.expire(ordine.stripe_session_id);
      } catch {
        // Sessione non piu recuperabile (inesistente/scaduta): si procede a
        // crearne una nuova.
      }
    }

    // Ordine di un account? Il pagamento confluisce nel suo Customer Stripe.
    // Se a pagare e il proprietario loggato, il customer viene creato al volo
    // (lazy); se il link col token e aperto senza sessione si riusa il customer
    // gia esistente, senza mai crearne per conto terzi. Ospiti: invariato.
    // Il Customer Stripe si aggancia SOLO quando a pagare e il proprietario
    // loggato: mai per un portatore qualunque del token (il pagamento "per
    // conto terzi" e supportato, e il pagatore non deve vedere email/indirizzo
    // del titolare ne sovrascriverne lo shipping salvato su Stripe). Per i non
    // proprietari la sessione resta identica al flusso ospite originale.
    let customerId: string | null = null;
    if (ordine.user_id && ambienteStripe()) {
      const sessioneCliente = await verificaSessioneCliente();
      if (sessioneCliente?.userId === ordine.user_id) {
        customerId = await assicuraStripeCustomer(sessioneCliente);
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      ...(shippingOptions ? { shipping_options: shippingOptions } : {}),
      success_url: `${siteUrl}/ordine/${token}?pagato=1`,
      cancel_url: `${siteUrl}/ordine/${token}`,
      client_reference_id: ordine.id,
      billing_address_collection: "auto",
      shipping_address_collection: { allowed_countries: ["IT"] },
      locale: "it",
      // Condizioni di vendita e recesso davanti al cliente al momento della
      // conclusione del contratto (art. 49 Cod. Consumo; audit C2).
      custom_text: { submit: { message: testoCondizioniCheckout(siteUrl) } },
      ...(customerId
        ? {
            customer: customerId,
            // Obbligatorio con customer + shipping_address_collection.
            customer_update: {
              shipping: "auto" as const,
              address: "auto" as const,
            },
          }
        : {}),
    });

    // Il legame ordine<->sessione e cio che permette al webhook di ritrovare
    // l'ordine: se non riusciamo a salvarlo, consegnare comunque l'URL creerebbe
    // un ordine "pagato" duplicato senza righe (fallback RPC) e lascerebbe
    // l'originale ancora pagabile. Meglio far scadere la sessione e far riprovare.
    const { error: errSessione } = await admin
      .from("ordini")
      .update({ stripe_session_id: session.id })
      .eq("id", ordine.id);
    if (errSessione) {
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch {
        // Best effort: non recuperabile, scade comunque da sola in 24h.
      }
      return {
        ok: false,
        error:
          "Non è stato possibile avviare il pagamento. Riprova tra qualche istante.",
      };
    }

    if (!session.url) {
      return { ok: false, error: "URL di pagamento assente." };
    }
    return { ok: true, url: session.url };
  } catch (err) {
    const m = err instanceof Error ? err.message : "Errore sconosciuto.";
    return { ok: false, error: `Avvio pagamento non riuscito: ${m}` };
  }
}
