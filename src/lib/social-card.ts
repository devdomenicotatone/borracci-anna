import "server-only";

// Helper condivisi dalle immagini social generate con Satori/next-og: i dati
// minimi del prodotto (card OG + poster) e il QR in stile brand. Centralizzati
// qui cosi le due immagini restano coerenti e non duplicano la logica.

import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";

import { formatPrezzo } from "@/lib/format";

export interface DatiCard {
  nome: string;
  prezzo: string | null;
  immagine: string | null;
  /** true = articolo disponibile SOLO online (non in negozio): cambia la
   *  tagline di disponibilita su poster/card. Vedi taglineDisponibilita(). */
  soloOnline: boolean;
}

/**
 * Tagline di disponibilita condivisa da tutte le superfici "share" (poster
 * social, e riusata identica dal cartellino stampato di GestiShop): rispecchia
 * il badge della scheda prodotto. `solo_online` = non presente in negozio,
 * quindi NON si puo dire "online o in negozio" (sarebbe falso).
 * ⚠️ Se cambi il testo, allinea la copia gemella in GestiShop
 * (lib/etichette.ts → taglineCartellino): sono due repo separate.
 */
export function taglineDisponibilita(soloOnline: boolean): string {
  return soloOnline
    ? "solo online · spedizione o ritiro in negozio"
    : "online o in negozio · Rimini";
}

/**
 * Dati minimi del prodotto per le card social. Lettura pubblica cookieless
 * (cacheable) del solo catalogo attivo: la RLS consente l'anon sui prodotti
 * attivi. Degrada a "card brand" (nome Anna Shop, niente prezzo/foto) se il
 * prodotto non esiste/non e attivo o mancano le env Supabase.
 */
export async function caricaProdottoCard(slug: string): Promise<DatiCard> {
  let nome = "Anna Shop";
  let prezzo: string | null = null;
  let immagine: string | null = null;
  let soloOnline = false;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anon) {
    try {
      const supabase = createClient(url, anon);
      const { data } = await supabase
        .from("prodotti")
        .select("nome, prezzo_cents, valuta, immagine_url, solo_online")
        .eq("slug", slug)
        .eq("attivo", true)
        .maybeSingle();
      if (data) {
        nome = (data.nome as string) ?? nome;
        immagine = (data.immagine_url as string | null) ?? null;
        soloOnline = (data.solo_online as boolean | null) ?? false;
        if (typeof data.prezzo_cents === "number") {
          prezzo = formatPrezzo(
            data.prezzo_cents,
            (data.valuta as string) ?? "EUR",
          );
        }
      }
    } catch {
      // degrada a card brand senza dati prodotto
    }
  }

  return { nome, prezzo, immagine, soloOnline };
}

/**
 * QR (PNG data URL) dell'URL dato, nello stile del brand: moduli blu-navy su
 * bianco, correzione errori Q (25%) — assorbe un piccolo logo centrale restando
 * leggibile da lontano/in stampa. `size` = lato del PNG in px (piu grande per il
 * poster). Ritorna null su errore (le immagini degradano alla card senza QR).
 */
export async function qrDataUrl(
  url: string,
  size = 264,
): Promise<string | null> {
  try {
    return await QRCode.toDataURL(url, {
      margin: 0,
      errorCorrectionLevel: "Q",
      width: size,
      color: { dark: "#0a1f33", light: "#ffffff" },
    });
  } catch {
    return null;
  }
}
