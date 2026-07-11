// Ciclo di vita del Customer Stripe collegato a un account cliente.
//
// Creazione LAZY al primo checkout (mai alla registrazione: niente chiamate
// Stripe nel signup, zero customer orfani per chi non compra). L'id vive in
// clienti.stripe_customer_id insieme all'ambiente ("test"/"live"): gli id NON
// sono trasferibili tra chiavi test e live, al mismatch si ricrea.
//
// Ogni funzione degrada con grazia (null / no-op): un problema Stripe non deve
// MAI bloccare un checkout (si ricade su customer_email) ne un salvataggio
// indirizzo.

import "server-only";
import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { SessioneCliente } from "@/lib/account/auth";
import { indirizzoPredefinito } from "@/lib/account/dati";
import type { Indirizzo } from "@/lib/types";

/** Ambiente delle chiavi correnti, dal prefisso della secret key. */
export function ambienteStripe(): "test" | "live" | null {
  const chiave = process.env.STRIPE_SECRET_KEY;
  if (!chiave) return null;
  return /^(sk|rk)_test_/.test(chiave) ? "test" : "live";
}

/** Shipping Stripe costruito da un indirizzo della rubrica. */
function shippingDaIndirizzo(
  indirizzo: Indirizzo,
): Stripe.CustomerCreateParams.Shipping {
  return {
    name: indirizzo.nome,
    ...(indirizzo.telefono ? { phone: indirizzo.telefono } : {}),
    address: {
      line1: indirizzo.line1,
      ...(indirizzo.line2 ? { line2: indirizzo.line2 } : {}),
      postal_code: indirizzo.cap,
      city: indirizzo.citta,
      state: indirizzo.provincia,
      country: indirizzo.paese,
    },
  };
}

/**
 * Garantisce un Customer Stripe per il cliente e ne ritorna l'id.
 * null su QUALSIASI problema (env mancanti, Stripe giu, ambiente ignoto):
 * il chiamante degrada a `customer_email`.
 */
export async function assicuraStripeCustomer(
  sessione: SessioneCliente,
): Promise<string | null> {
  const ambiente = ambienteStripe();
  if (!ambiente) return null;

  try {
    const stripe = getStripe();

    // 1) Id gia salvato E creato con le chiavi di questo ambiente: riusalo,
    //    dopo un retrieve di conferma (il customer puo essere stato cancellato
    //    a mano dalla dashboard).
    // Id gia salvato la cui riga va sovrascritta perche il customer non esiste
    // piu su Stripe (cancellato dalla dashboard): senza tracciarlo, il CAS allo
    // step 3 non troverebbe la riga (stripe_customer_id non-null, ambiente
    // uguale) e finirebbe per restituire l'id MORTO, bloccando il checkout.
    let idMorto: string | null = null;

    if (
      sessione.cliente.stripe_customer_id &&
      sessione.cliente.stripe_customer_ambiente === ambiente
    ) {
      try {
        const esistente = await stripe.customers.retrieve(
          sessione.cliente.stripe_customer_id,
        );
        if (!("deleted" in esistente && esistente.deleted)) {
          // Allinea l'email del customer se e cambiata (secure email change):
          // altrimenti ricevute Stripe e prefill andrebbero alla vecchia email.
          if (esistente.email !== sessione.email) {
            try {
              await stripe.customers.update(sessione.cliente.stripe_customer_id, {
                email: sessione.email,
              });
            } catch {
              // Best effort: l'aggancio ordine resta garantito dal trigger DB.
            }
          }
          return sessione.cliente.stripe_customer_id;
        }
        idMorto = sessione.cliente.stripe_customer_id; // deleted
      } catch {
        // resource_missing: il customer non esiste piu -> va ricreato.
        idMorto = sessione.cliente.stripe_customer_id;
      }
    }

    // 2) Crea il customer (idempotencyKey: due checkout paralleli dello stesso
    //    utente ottengono lo stesso customer entro la finestra Stripe di 24h).
    const predefinito = await indirizzoPredefinito(sessione);
    const creato = await stripe.customers.create(
      {
        email: sessione.email,
        ...(sessione.cliente.nome ? { name: sessione.cliente.nome } : {}),
        ...(predefinito ? { shipping: shippingDaIndirizzo(predefinito) } : {}),
        metadata: { supabase_user_id: sessione.userId },
      },
      { idempotencyKey: `cliente-${sessione.userId}-${ambiente}` },
    );

    // 3) Salvataggio compare-and-set col service role (stripe_customer_id NON
    //    e scrivibile dal client, vedi grant di colonna nella migration).
    //    Il filtro sovrascrive: riga senza customer, ambiente diverso, oppure
    //    id morto appena rilevato. Se un'altra richiesta ha vinto la corsa, si
    //    usa il suo id e si cancella il doppione best effort.
    const admin = createAdminSupabase();
    const condizioniCas = [
      "stripe_customer_id.is.null",
      `stripe_customer_ambiente.neq.${ambiente}`,
      ...(idMorto ? [`stripe_customer_id.eq.${idMorto}`] : []),
    ];
    const { data: aggiornato } = await admin
      .from("clienti")
      .update({
        stripe_customer_id: creato.id,
        stripe_customer_ambiente: ambiente,
      })
      .eq("id", sessione.userId)
      .or(condizioniCas.join(","))
      .select("stripe_customer_id")
      .maybeSingle();

    if (aggiornato?.stripe_customer_id === creato.id) return creato.id;

    // CAS perso: rileggi l'id vincente e butta il doppione appena creato.
    const { data: attuale } = await admin
      .from("clienti")
      .select("stripe_customer_id, stripe_customer_ambiente")
      .eq("id", sessione.userId)
      .maybeSingle();
    if (
      attuale?.stripe_customer_id &&
      attuale.stripe_customer_ambiente === ambiente &&
      attuale.stripe_customer_id !== creato.id
    ) {
      try {
        await stripe.customers.del(creato.id);
      } catch {
        // Doppione orfano: innocuo.
      }
      return attuale.stripe_customer_id;
    }
    return creato.id;
  } catch (err) {
    console.error("[account] assicuraStripeCustomer fallita:", err);
    return null;
  }
}

/**
 * Sync mono-direzionale rubrica -> Stripe: aggiorna lo shipping del customer
 * con l'indirizzo predefinito corrente. Best effort, chiamata dalle action
 * indirizzi quando cambia il predefinito. Se il customer non esiste ancora NON
 * lo crea (lo fara la creazione lazy al primo checkout, gia col predefinito).
 */
export async function sincronizzaIndirizzoClienteStripe(
  sessione: SessioneCliente,
): Promise<void> {
  const ambiente = ambienteStripe();
  if (
    !ambiente ||
    !sessione.cliente.stripe_customer_id ||
    sessione.cliente.stripe_customer_ambiente !== ambiente
  ) {
    return;
  }
  try {
    const predefinito = await indirizzoPredefinito(sessione);
    if (!predefinito) return;
    const stripe = getStripe();
    await stripe.customers.update(sessione.cliente.stripe_customer_id, {
      shipping: shippingDaIndirizzo(predefinito),
    });
  } catch (err) {
    // Best effort: la rubrica in-app resta la fonte di verita.
    console.error("[account] sync indirizzo su Stripe fallita:", err);
  }
}
