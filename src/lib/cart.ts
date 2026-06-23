"use server";

// Server Actions del carrello.
// Il carrello e identificato da un id salvato in un cookie httpOnly "cart_id".
// Le righe vivono nella tabella "carrello_righe" (vedi supabase/schema.sql).
// Se Supabase non e configurato tutto degrada con grazia: leggiCarrello -> [],
// le mutazioni ritornano un esito ok=false motivo="non_configurato".
//
// Le mutazioni RITORNANO sempre lo stato corrente del carrello (EsitoCarrello):
// righe + count + subtotale. Cosi il client (CartProvider) aggiorna badge,
// mini-cart e totali in un solo round-trip, senza rileggere a parte.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { createServerSupabase } from "@/lib/supabase/server";
import type {
  EsitoCarrello,
  Prodotto,
  RigaCarrello,
  Variante,
} from "@/lib/types";

/** Nome del cookie che contiene l'id del carrello corrente. */
const COOKIE_CARRELLO = "cart_id";
/** Durata del cookie carrello: 30 giorni. */
const DURATA_COOKIE_SECONDI = 60 * 60 * 24 * 30;

/**
 * Forma grezza della riga letta dal DB con le relazioni embeddate.
 * Supabase ritorna le relazioni come oggetto o array a seconda dello schema:
 * qui la FK e singola, quindi ci aspettiamo oggetti.
 */
interface RigaGrezza {
  id: string;
  quantita: number;
  prodotto: Prodotto | Prodotto[] | null;
  variante: Variante | Variante[] | null;
}

/** Normalizza una relazione che puo arrivare come oggetto o array. */
function primo<T>(rel: T | T[] | null): T | null {
  if (Array.isArray(rel)) {
    return rel.length > 0 ? rel[0] : null;
  }
  return rel;
}

/** Riepilogo (count, subtotale, valuta) da una lista di righe. */
function riepiloga(righe: RigaCarrello[]): {
  count: number;
  subtotaleCents: number;
  valuta: string;
} {
  let count = 0;
  let subtotaleCents = 0;
  for (const r of righe) {
    count += r.quantita;
    subtotaleCents += r.prodotto.prezzo_cents * r.quantita;
  }
  const valuta = righe[0]?.prodotto.valuta ?? "EUR";
  return { count, subtotaleCents, valuta };
}

/** Esito "vuoto" (carrello non leggibile o azzerato). */
function esitoVuoto(
  ok: boolean,
  motivo?: EsitoCarrello["motivo"],
): EsitoCarrello {
  return {
    ok,
    righe: [],
    count: 0,
    subtotaleCents: 0,
    valuta: "EUR",
    motivo,
  };
}

/** Esito con lo stato corrente del carrello riletto dal DB. */
async function esitoCorrente(
  ok: boolean,
  motivo?: EsitoCarrello["motivo"],
): Promise<EsitoCarrello> {
  const righe = await leggiCarrello();
  const { count, subtotaleCents, valuta } = riepiloga(righe);
  return { ok, righe, count, subtotaleCents, valuta, motivo };
}

/**
 * Restituisce l'id del carrello dal cookie, oppure null se assente.
 * Non crea nulla: la creazione avviene solo in aggiungiAlCarrello.
 */
async function leggiCartId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_CARRELLO)?.value ?? null;
}

/**
 * Legge le righe del carrello corrente, con prodotto e variante risolti.
 * Ritorna [] se non c'e carrello o se Supabase non e configurato.
 */
export async function leggiCarrello(): Promise<RigaCarrello[]> {
  try {
    const supabase = await createServerSupabase();
    if (!supabase) {
      return [];
    }

    const cartId = await leggiCartId();
    if (!cartId) {
      return [];
    }

    const { data, error } = await supabase
      .from("carrello_righe")
      .select(
        `id, quantita,
         prodotto:prodotti (id, slug, nome, descrizione, prezzo_cents, valuta, immagine_url, attivo),
         variante:varianti (id, prodotto_id, taglia, colore, sku, stock)`,
      )
      .eq("carrello_id", cartId)
      .order("creato_il", { ascending: true });

    if (error || !data) {
      return [];
    }

    const righe: RigaCarrello[] = [];
    for (const r of data as unknown as RigaGrezza[]) {
      const prodotto = primo(r.prodotto);
      const variante = primo(r.variante);
      // Salta righe orfane (prodotto/variante eliminati o non leggibili).
      if (!prodotto || !variante) {
        continue;
      }
      righe.push({
        id: r.id,
        quantita: r.quantita,
        prodotto,
        variante,
      });
    }

    return righe;
  } catch {
    // Qualunque problema (rete, env, schema) degrada a carrello vuoto.
    return [];
  }
}

/**
 * Stato corrente del carrello come EsitoCarrello (ok=true).
 * Usato per seedare il CartProvider lato server (layout vetrina).
 */
export async function statoCarrello(): Promise<EsitoCarrello> {
  return esitoCorrente(true);
}

/**
 * Assicura l'esistenza di un carrello e ritorna il suo id.
 * Crea la riga in "carrelli" e imposta il cookie httpOnly se serve.
 * Ritorna null se Supabase non e configurato.
 */
async function assicuraCarrello(): Promise<string | null> {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return null;
  }

  const store = await cookies();
  const esistente = store.get(COOKIE_CARRELLO)?.value ?? null;

  if (esistente) {
    return esistente;
  }

  const { data, error } = await supabase
    .from("carrelli")
    .insert({})
    .select("id")
    .single();

  if (error || !data) {
    return null;
  }

  store.set(COOKIE_CARRELLO, data.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURATA_COOKIE_SECONDI,
  });

  return data.id;
}

/**
 * Aggiunge una variante al carrello (o incrementa la quantita se gia presente).
 * Ricontrolla lo stock lato server e limita la quantita al disponibile
 * (anti-oversell): se cappata ritorna ok=true con `avviso`.
 * Ritorna l'esito con lo stato aggiornato del carrello.
 */
export async function aggiungiAlCarrello(
  varianteId: string,
  quantita: number = 1,
): Promise<EsitoCarrello> {
  try {
    if (quantita < 1) {
      return esitoCorrente(false, "errore");
    }

    const supabase = await createServerSupabase();
    if (!supabase) {
      return esitoVuoto(false, "non_configurato");
    }

    const cartId = await assicuraCarrello();
    if (!cartId) {
      return esitoVuoto(false, "errore");
    }

    // Risolve prodotto_id e stock attuale della variante.
    const { data: variante, error: errVar } = await supabase
      .from("varianti")
      .select("id, prodotto_id, stock")
      .eq("id", varianteId)
      .single();

    if (errVar || !variante) {
      return esitoCorrente(false, "errore");
    }
    if (variante.stock <= 0) {
      return esitoCorrente(false, "esaurito");
    }

    // Quantita gia presente in carrello per questa variante.
    const { data: esistente } = await supabase
      .from("carrello_righe")
      .select("id, quantita")
      .eq("carrello_id", cartId)
      .eq("variante_id", varianteId)
      .maybeSingle();

    const giaInCarrello = esistente?.quantita ?? 0;
    const desiderata = giaInCarrello + quantita;
    // Cap allo stock disponibile (anti-oversell).
    const finale = Math.min(desiderata, variante.stock);
    const cappata = finale < desiderata;

    if (finale <= giaInCarrello && esistente) {
      // Niente da aggiungere (gia al massimo dello stock): segnala l'avviso.
      const esito = await esitoCorrente(true);
      if (cappata) {
        esito.avviso = `Hai gia il massimo disponibile (${variante.stock}) nel carrello.`;
      }
      return esito;
    }

    if (esistente) {
      await supabase
        .from("carrello_righe")
        .update({ quantita: finale })
        .eq("id", esistente.id);
    } else {
      await supabase.from("carrello_righe").insert({
        carrello_id: cartId,
        prodotto_id: variante.prodotto_id,
        variante_id: varianteId,
        quantita: finale,
      });
    }

    revalidatePath("/carrello");

    const esito = await esitoCorrente(true);
    if (cappata) {
      esito.avviso = `Disponibili solo ${variante.stock} pezzi: quantita aggiornata.`;
    }
    return esito;
  } catch {
    // Errore imprevisto: non perdere lo stato gia mostrato al client.
    return esitoCorrente(false, "errore");
  }
}

/**
 * Aggiorna la quantita di una riga. Se quantita <= 0 rimuove la riga.
 * Limita al disponibile (anti-oversell) e ritorna lo stato aggiornato.
 */
export async function aggiornaQuantita(
  rigaId: string,
  quantita: number,
): Promise<EsitoCarrello> {
  try {
    if (quantita <= 0) {
      return rimuoviDalCarrello(rigaId);
    }

    const supabase = await createServerSupabase();
    if (!supabase) {
      return esitoVuoto(false, "non_configurato");
    }

    const cartId = await leggiCartId();
    if (!cartId) {
      return esitoVuoto(false, "errore");
    }

    // Stock disponibile della variante della riga (per il cap).
    const { data: riga } = await supabase
      .from("carrello_righe")
      .select("id, variante:varianti (stock)")
      .eq("id", rigaId)
      .eq("carrello_id", cartId)
      .maybeSingle();

    const variante = riga
      ? primo((riga as unknown as { variante: { stock: number } | { stock: number }[] | null }).variante)
      : null;
    const stock = variante?.stock;

    let finale = quantita;
    let cappata = false;
    if (typeof stock === "number" && quantita > stock) {
      finale = Math.max(1, stock);
      cappata = true;
    }

    await supabase
      .from("carrello_righe")
      .update({ quantita: finale })
      .eq("id", rigaId)
      .eq("carrello_id", cartId);

    revalidatePath("/carrello");

    const esito = await esitoCorrente(true);
    if (cappata) {
      esito.avviso = `Disponibili solo ${stock} pezzi.`;
    }
    return esito;
  } catch {
    return esitoCorrente(false, "errore");
  }
}

/**
 * Rimuove una riga dal carrello. Ritorna lo stato aggiornato.
 */
export async function rimuoviDalCarrello(
  rigaId: string,
): Promise<EsitoCarrello> {
  try {
    const supabase = await createServerSupabase();
    if (!supabase) {
      return esitoVuoto(false, "non_configurato");
    }

    const cartId = await leggiCartId();
    if (!cartId) {
      return esitoVuoto(false, "errore");
    }

    await supabase
      .from("carrello_righe")
      .delete()
      .eq("id", rigaId)
      .eq("carrello_id", cartId);

    revalidatePath("/carrello");
    return esitoCorrente(true);
  } catch {
    return esitoCorrente(false, "errore");
  }
}

/**
 * Svuota completamente il carrello: cancella le righe e azzera il cookie.
 * Usato dopo un pagamento andato a buon fine (success page), cosi il badge
 * torna a 0. La verita dell'ordine resta affidata al webhook Stripe.
 */
export async function svuotaCarrello(): Promise<EsitoCarrello> {
  try {
    const supabase = await createServerSupabase();
    const cartId = await leggiCartId();

    if (supabase && cartId) {
      await supabase
        .from("carrello_righe")
        .delete()
        .eq("carrello_id", cartId);
    }

    // Azzera il cookie: la prossima aggiunta creera un carrello pulito.
    const store = await cookies();
    store.delete(COOKIE_CARRELLO);

    revalidatePath("/carrello");
    return esitoVuoto(true);
  } catch {
    return esitoVuoto(false, "errore");
  }
}
