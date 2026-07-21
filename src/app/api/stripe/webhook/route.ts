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
// diamo margine (default 10s troppo stretto per il connect+send SMTP). 60 = tetto
// del piano Hobby: copre anche il caso peggiore "SMTP giu" (notifiche fallite in
// timeout + email di segnalazione alla titolare, in sequenza).
export const maxDuration = 60;

import { after } from "next/server";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getStripe } from "@/lib/stripe";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { inviaEmail } from "@/lib/email";
import { noteLegaliEmail } from "@/lib/legale";
import { NEGOZIO } from "@/lib/negozio";
import { formatPrezzo } from "@/lib/format";
import { segnalaProblema } from "@/lib/osservabilita";
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
  /** Id immutabile della variante (dai metadata Stripe): chiave robusta al
   *  rename dello SKU per la ricostruzione righe del direct-buy. null per le
   *  sessioni vecchie senza questo metadata -> la RPC ripiega sullo SKU. */
  varianteId: string | null;
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
    const haMetadata =
      prodotto && typeof prodotto !== "string" && "metadata" in prodotto;
    const sku = haMetadata ? (prodotto.metadata?.sku ?? null) : null;
    if (!sku) continue;
    const varianteId = haMetadata
      ? (prodotto.metadata?.variante_id ?? null)
      : null;

    const nome =
      prodotto && typeof prodotto !== "string" && "name" in prodotto
        ? (prodotto.name ?? item.description ?? sku)
        : (item.description ?? sku);

    righe.push({
      sku,
      varianteId,
      qta,
      nome,
      importoCents: item.amount_total ?? 0,
    });
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
    // nome + prezzo unitario: servono alla RPC per ricostruire le ordine_righe
    // se il pre-save della route checkout e fallito (migration 20260708170000).
    // Le versioni precedenti della RPC ignorano le chiavi extra.
    p_righe: righe.map((r) => ({
      sku: r.sku,
      // variante_id: chiave immutabile per la ricostruzione (robusta al rename
      // dello SKU); la RPC ripiega sullo SKU se assente. Le RPC vecchie ignorano
      // la chiave extra (join per SKU = comportamento precedente).
      variante_id: r.varianteId,
      qta: r.qta,
      nome: r.nome,
      prezzo_cents: r.qta > 0 ? Math.round(r.importoCents / r.qta) : 0,
    })),
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

/** Voce del deficit di giacenza fotografato dalla RPC (ordini.stock_mancante). */
interface VoceStockMancante {
  sku: string | null;
  richiesti: number;
  disponibili: number;
}

/**
 * Rilegge il deficit di giacenza scritto dalla RPC nella stessa transazione del
 * decremento (migration 20260720170000): se il pagamento ha "venduto" piu pezzi
 * di quelli a magazzino, l'email alla titolare deve dirlo subito, non lasciarlo
 * scoprire al momento del pacco. Best effort: DB senza la colonna (migration
 * non ancora applicata) o lettura fallita -> null, nessun avviso ma nessun errore.
 */
async function stockMancanteOrdine(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<VoceStockMancante[] | null> {
  try {
    const { data, error } = await supabase
      .from("ordini")
      .select("stock_mancante")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();
    if (error || !data) return null;
    const grezzo = (data as { stock_mancante?: unknown }).stock_mancante;
    if (!Array.isArray(grezzo) || grezzo.length === 0) return null;
    return grezzo as VoceStockMancante[];
  } catch {
    return null;
  }
}

/**
 * Ripulisce dal carrello d'origine le righe appena PAGATE, per variante_id.
 * Senza questo, se il cliente chiude il browser prima del redirect alla success
 * page (unico punto che svuotava il carrello) le righe pagate restano nel
 * carrello, ripagabili per sbaglio. Le righe su richiesta di un carrello misto
 * non sono mai nella sessione, quindi restano intatte. Il cart_id arriva dai
 * metadata della sessione (assente nelle sessioni vecchie e nel flusso ordine
 * confermato: in quei casi non c'e nulla da pulire qui). Best effort e
 * idempotente: sui retry Stripe le righe sono gia sparite.
 */
async function ripulisciCarrelloPagato(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
  righe: LineaSessione[],
): Promise<void> {
  const cartId = session.metadata?.cart_id ?? null;
  if (!cartId) return;
  const varianteIds = righe
    .map((r) => r.varianteId)
    .filter((v): v is string => Boolean(v));
  if (varianteIds.length === 0) return;
  try {
    await supabase
      .from("carrello_righe")
      .delete()
      .eq("carrello_id", cartId)
      .in("variante_id", varianteIds);
  } catch {
    // Best effort: al peggio resta la pulizia client-side della success page.
  }
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
 * Registra sull'ordine l'esito dell'email di conferma al cliente (finding M11
 * audit legale: senza un flag persistito non si puo provare l'adempimento
 * dell'art. 51 co. 7 per lo specifico ordine, ne accorgersi dei mancati invii).
 * Gira dentro `after()`: client admin FRESCO, quello della richiesta potrebbe
 * essere gia smontato. Fail-safe: DB senza le colonne (migration
 * 20260721120000 non ancora applicata) o scrittura fallita -> solo log,
 * l'ordine resta valido.
 */
async function registraEsitoEmailConferma(
  sessionId: string,
  inviata: boolean,
): Promise<void> {
  try {
    const admin = createAdminSupabase();
    const { error } = await admin
      .from("ordini")
      .update({
        email_conferma_inviata: inviata,
        email_conferma_il: inviata ? new Date().toISOString() : null,
      })
      .eq("stripe_session_id", sessionId);
    if (error) {
      console.error(
        "[stripe-webhook] flag email_conferma non registrato:",
        error.message,
      );
    }
  } catch (err) {
    console.error("[stripe-webhook] flag email_conferma non registrato:", err);
  }
}

/**
 * Notifica un ordine pagato: email alla titolare (va spedito) e conferma al
 * cliente. Best effort (Promise.allSettled + inviaEmail non lancia mai): non
 * deve mai far ritentare il webhook. Chiamata via `after()`, cioe dopo aver gia
 * risposto 200 a Stripe, così l'SMTP non blocca la risposta. L'esito della
 * conferma al cliente viene persistito sull'ordine (M11) e i mancati invii
 * vengono segnalati alla titolare.
 */
async function inviaNotificheOrdinePagato(
  session: Stripe.Checkout.Session,
  righe: LineaSessione[],
  stockMancante: VoceStockMancante[] | null,
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

  // Giacenza insufficiente al momento dell'incasso: avviso in testa all'email
  // della titolare (il cliente NON viene allarmato: decide il negozio come
  // gestire — riassortimento, attesa o rimborso).
  const avvisoStock =
    stockMancante && stockMancante.length > 0
      ? `⚠️ ATTENZIONE: giacenza insufficiente per questo ordine.\nIl pagamento e' stato incassato ma a magazzino mancavano dei pezzi:\n${stockMancante
          .map(
            (v) =>
              `• SKU ${v.sku ?? "?"}: ordinati ${v.richiesti}, disponibili ${v.disponibili}`,
          )
          .join(
            "\n",
          )}\nVerifica in negozio e, se la merce manca davvero, contatta il cliente.\n\n`
      : "";

  const [esitoTitolare, esitoCliente] = await Promise.allSettled([
    // 1) Notifica alla titolare: una vendita e stata pagata, va spedita.
    inviaEmail({
      to: NEGOZIO.email,
      replyTo: clienteEmail ?? undefined,
      subject: avvisoStock
        ? `⚠️ Ordine pagato con stock insufficiente — ${totale}`
        : `Nuovo ordine pagato — ${totale}`,
      text: `${avvisoStock}Un cliente ha pagato un ordine su Anna Shop.\n\n${
        clienteNome ? `Cliente: ${clienteNome}\n` : ""
      }${clienteEmail ? `Email: ${clienteEmail}\n` : ""}\nArticoli:\n${articoli}\n\nTotale incassato: ${totale}\n\nSpedire a:\n${indirizzo}\n\nGestisci l'ordine: ${siteUrl}/gestore/ordini`,
    }),
    // 2) Conferma al cliente (solo se Stripe ha raccolto un'email). E' la
    //    conferma del contratto su supporto durevole ex art. 51 co. 7 Cod.
    //    Consumo: il blocco noteLegaliEmail (recesso + modulo, garanzia,
    //    condizioni, identita del venditore) e' contenuto obbligatorio.
    clienteEmail
      ? inviaEmail({
          to: clienteEmail,
          subject: "Ordine confermato — Anna Shop",
          text: `Ciao${clienteNome ? ` ${clienteNome}` : ""},\n\ngrazie per il tuo acquisto! Abbiamo ricevuto il pagamento e prepariamo la spedizione.\n\nArticoli:\n${articoli}\n\nTotale: ${totale} (IVA inclusa)\n\nSpedizione a:\n${indirizzo}\n\n${noteLegaliEmail(siteUrl)}\n\nA presto,\nAnna Shop di Borracci Anna — ${NEGOZIO.indirizzoCompleto}`,
        })
      : Promise.resolve<boolean | null>(null),
  ]);

  // M11: la conferma al cliente e "inviata" solo se l'SMTP l'ha accettata
  // davvero. Flag persistito sull'ordine (prova + badge nel pannello gestore).
  const confermaInviata =
    esitoCliente.status === "fulfilled" && esitoCliente.value === true;
  await registraEsitoEmailConferma(session.id, confermaInviata);

  // Segnalazione dei mancati invii (un solo avviso per ordine: se l'SMTP e giu
  // le due email falliscono insieme, inutile tempestare). L'avviso viaggia
  // sullo stesso SMTP: se e giu del tutto resta comunque il log su Vercel e il
  // flag a false nel pannello ordini, che non dipende dall'email.
  const titolareInviata =
    esitoTitolare.status === "fulfilled" && esitoTitolare.value === true;
  if (!confermaInviata || !titolareInviata) {
    const problemi: string[] = [];
    if (!confermaInviata) {
      problemi.push(
        clienteEmail
          ? `• La conferma d'ordine al cliente (${clienteEmail}) NON e partita: va contattato direttamente (obbligo di conferma su supporto durevole, art. 51 co. 7).`
          : "• Stripe non ha fornito un'email del cliente: la conferma d'ordine non e recapitabile.",
      );
    }
    if (!titolareInviata) {
      problemi.push(
        "• La notifica di vendita alla casella del negozio NON e partita: controlla il pannello ordini per non perdere la spedizione.",
      );
    }
    await segnalaProblema({
      titolo: "Problema email su un ordine pagato",
      chiave: `email-ordine:${session.id}`,
      dettaglio: `Ordine PAGATO e registrato (${totale}, sessione ${session.id}), ma:\n\n${problemi.join(
        "\n",
      )}\n\nPannello ordini: ${siteUrl}/gestore/ordini`,
    });
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
    // Header presente ma verifica fallita: con ogni probabilita e Stripe con un
    // secret ruotato/sbagliato (gli scanner di solito non impostano l'header).
    // Se fosse davvero cosi, NESSUN evento verrebbe piu elaborato: da segnalare.
    // Via after(): la risposta 400 parte subito. Chiave fissa: max 1 email/24h.
    after(() =>
      segnalaProblema({
        titolo: "Webhook Stripe: firma non valida",
        chiave: "webhook-firma",
        dettaglio: `Una chiamata al webhook Stripe presentava una firma non valida (${messaggio}).\n\nSe nelle prossime ore arrivano altri avvisi come questo, quasi certamente STRIPE_WEBHOOK_SECRET su Vercel non corrisponde piu al secret dell'endpoint nella dashboard Stripe: in quel caso gli ordini pagati NON vengono piu registrati sul sito. Verifica in Dashboard Stripe → Developers → Webhooks.\n\nSe invece resta un caso isolato, era probabilmente una chiamata estranea: nessuna azione necessaria.`,
      }),
    );
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
        // Pulizia del carrello d'origine (righe pagate, per variante_id): fuori
        // dal gate appenaFinalizzato perche idempotente — sui retry e un no-op.
        await ripulisciCarrelloPagato(supabase, session, righe);
        // Email di notifica solo alla PRIMA finalizzazione (idempotenza sui retry
        // Stripe). Inviate via `after()`: partono dopo la risposta 200, così un
        // SMTP lento non fa scadere il webhook (che Stripe interpreterebbe come
        // fallimento, disabilitando l'endpoint dopo troppi retry).
        if (appenaFinalizzato) {
          // Deficit di giacenza fotografato dalla RPC: letto ORA (non dentro
          // after(), dove il client admin potrebbe essere gia smontato).
          const stockMancante = await stockMancanteOrdine(supabase, session.id);
          after(() => inviaNotificheOrdinePagato(session, righe, stockMancante));
        }
      } catch (err) {
        // Errore lato nostro (DB/Stripe): logghiamo e rispondiamo 500 cosi
        // Stripe ritenta. Nessun dettaglio interno verso l'esterno.
        console.error("[stripe-webhook] finalizzazione fallita:", err);
        // Segnalazione alla titolare: un pagamento INCASSATO non risulta sul
        // sito finche un retry non riesce. Via after() (la risposta 500 parte
        // subito); dedup per sessione: i retry di Stripe non tempestano.
        const messaggio = err instanceof Error ? err.message : String(err);
        after(() =>
          segnalaProblema({
            titolo: "Webhook Stripe: ordine pagato NON registrato",
            chiave: `webhook-fin:${session.id}`,
            dettaglio: `La registrazione di un ordine PAGATO e fallita (evento ${event.type}, sessione ${session.id}).\n\nErrore: ${messaggio}\n\nStripe ritentera automaticamente per qualche giorno: se il problema e passeggero l'ordine comparira da solo nel pannello. Se questo avviso si ripete per la stessa sessione, il pagamento e stato incassato ma l'ordine NON e sul sito: verifica su Dashboard Stripe → Payments e contatta il cliente.`,
          }),
        );
        return new Response("Elaborazione fallita.", { status: 500 });
      }
    }
  } else if (EVENTI_SCADUTI.has(event.type)) {
    // Sessione scaduta senza pagamento: nessuno stock scalato. I checkout diretti
    // non pre-creano piu l'ordine (si registra solo a pagamento riuscito), ma
    // teniamo questa pulizia come rete di sicurezza per eventuali ordini
    // "in_attesa" legacy con una sessione, creati prima di quel cambiamento: li
    // marchiamo annullato cosi non restano fantasmi nel pannello "Da confermare".
    // Gli ordini del flusso richiesta hanno una sessione solo DOPO la conferma
    // (stato 'confermato'), quindi il filtro sullo stato li lascia intatti.
    // Idempotente sui retry.
    const session = event.data.object as Stripe.Checkout.Session;
    try {
      const supabase = createAdminSupabase();
      const { error } = await supabase
        .from("ordini")
        .update({ stato: "annullato" })
        .eq("stripe_session_id", session.id)
        .eq("stato", "in_attesa");
      if (error) throw error;
    } catch (err) {
      // 500 -> Stripe ritenta: la pulizia e idempotente, il retry e innocuo.
      console.error("[stripe-webhook] pulizia sessione scaduta fallita:", err);
      // Qui non ci sono soldi in ballo (nessun pagamento), ma un fallimento
      // ripetuto e comunque un guasto (DB giu?): stessa segnalazione con dedup.
      const messaggio = err instanceof Error ? err.message : String(err);
      after(() =>
        segnalaProblema({
          titolo: "Webhook Stripe: pulizia sessione scaduta fallita",
          chiave: `webhook-exp:${session.id}`,
          dettaglio: `La pulizia di una sessione di checkout scaduta e fallita (sessione ${session.id}).\n\nErrore: ${messaggio}\n\nNessun pagamento coinvolto: al peggio un ordine legacy resta "Da confermare" nel pannello. Se l'avviso si ripete, il database potrebbe avere problemi.`,
        }),
      );
      return new Response("Elaborazione fallita.", { status: 500 });
    }
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
