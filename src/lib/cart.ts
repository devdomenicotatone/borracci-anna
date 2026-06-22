"use server";

// Server Actions del carrello.
// Il carrello e identificato da un id salvato in un cookie httpOnly "cart_id".
// Le righe vivono nella tabella "carrello_righe" (vedi supabase/schema.sql).
// Se Supabase non e configurato tutto degrada con grazia: leggiCarrello -> [],
// le mutazioni diventano no-op silenziose.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { createServerSupabase } from "@/lib/supabase/server";
import type { Prodotto, RigaCarrello, Variante } from "@/lib/types";

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
 * No-op silenzioso se Supabase non e configurato.
 */
export async function aggiungiAlCarrello(
  varianteId: string,
  quantita: number = 1,
): Promise<void> {
  try {
    if (quantita < 1) {
      return;
    }

    const supabase = await createServerSupabase();
    if (!supabase) {
      return;
    }

    const cartId = await assicuraCarrello();
    if (!cartId) {
      return;
    }

    // Risolve il prodotto_id della variante (serve per la riga).
    const { data: variante, error: errVar } = await supabase
      .from("varianti")
      .select("id, prodotto_id")
      .eq("id", varianteId)
      .single();

    if (errVar || !variante) {
      return;
    }

    // Se la variante e gia nel carrello incrementa, altrimenti inserisce.
    const { data: esistente } = await supabase
      .from("carrello_righe")
      .select("id, quantita")
      .eq("carrello_id", cartId)
      .eq("variante_id", varianteId)
      .maybeSingle();

    if (esistente) {
      await supabase
        .from("carrello_righe")
        .update({ quantita: esistente.quantita + quantita })
        .eq("id", esistente.id);
    } else {
      await supabase.from("carrello_righe").insert({
        carrello_id: cartId,
        prodotto_id: variante.prodotto_id,
        variante_id: varianteId,
        quantita,
      });
    }

    revalidatePath("/carrello");
  } catch {
    // No-op: l'errore non deve rompere la navigazione.
  }
}

/**
 * Aggiorna la quantita di una riga. Se quantita <= 0 rimuove la riga.
 * No-op silenzioso se Supabase non e configurato.
 */
export async function aggiornaQuantita(
  rigaId: string,
  quantita: number,
): Promise<void> {
  try {
    if (quantita <= 0) {
      await rimuoviDalCarrello(rigaId);
      return;
    }

    const supabase = await createServerSupabase();
    if (!supabase) {
      return;
    }

    const cartId = await leggiCartId();
    if (!cartId) {
      return;
    }

    await supabase
      .from("carrello_righe")
      .update({ quantita })
      .eq("id", rigaId)
      .eq("carrello_id", cartId);

    revalidatePath("/carrello");
  } catch {
    // No-op.
  }
}

/**
 * Rimuove una riga dal carrello.
 * No-op silenzioso se Supabase non e configurato.
 */
export async function rimuoviDalCarrello(rigaId: string): Promise<void> {
  try {
    const supabase = await createServerSupabase();
    if (!supabase) {
      return;
    }

    const cartId = await leggiCartId();
    if (!cartId) {
      return;
    }

    await supabase
      .from("carrello_righe")
      .delete()
      .eq("id", rigaId)
      .eq("carrello_id", cartId);

    revalidatePath("/carrello");
  } catch {
    // No-op.
  }
}
