// Vetrina "by Frody": griglia dei prodotti attivi.
// Legge da Supabase lato server; se le env mancano, la query fallisce o non
// ci sono prodotti, degrada con grazia mostrando alcuni prodotti di esempio
// hardcoded cosi la pagina rende SEMPRE (anche in build senza env).

import type { Prodotto } from "@/lib/types";
import { createServerSupabase } from "@/lib/supabase/server";
import ProductCard from "@/components/ProductCard";

// I dati arrivano dal DB in base alla richiesta: niente prerender statico.
export const dynamic = "force-dynamic";

// Prodotti di esempio usati come fallback quando Supabase non e configurato
// o non restituisce risultati. Prezzi in centesimi, valuta EUR.
const PRODOTTI_ESEMPIO: Prodotto[] = [
  {
    id: "esempio-1",
    slug: "t-shirt-essenziale-bianca",
    nome: "T-shirt essenziale bianca",
    descrizione: "Cotone pettinato, vestibilita regolare.",
    prezzo_cents: 2900,
    valuta: "EUR",
    immagine_url: null,
    attivo: true,
  },
  {
    id: "esempio-2",
    slug: "felpa-girocollo-sabbia",
    nome: "Felpa girocollo sabbia",
    descrizione: "Spugna pesante, taglio rilassato.",
    prezzo_cents: 7900,
    valuta: "EUR",
    immagine_url: null,
    attivo: true,
  },
  {
    id: "esempio-3",
    slug: "pantalone-cargo-nero",
    nome: "Pantalone cargo nero",
    descrizione: "Tela di cotone, tasche laterali.",
    prezzo_cents: 9900,
    valuta: "EUR",
    immagine_url: null,
    attivo: true,
  },
  {
    id: "esempio-4",
    slug: "camicia-overshirt-verde",
    nome: "Overshirt verde militare",
    descrizione: "Doppio uso camicia-giacca.",
    prezzo_cents: 11900,
    valuta: "EUR",
    immagine_url: null,
    attivo: true,
  },
];

/**
 * Recupera i prodotti attivi dal DB.
 * Non lancia mai: in caso di env mancanti o errore ritorna i dati di esempio.
 */
async function caricaProdotti(): Promise<Prodotto[]> {
  try {
    const supabase = await createServerSupabase();
    if (!supabase) return PRODOTTI_ESEMPIO;

    const { data, error } = await supabase
      .from("prodotti")
      .select(
        "id, slug, nome, descrizione, prezzo_cents, valuta, immagine_url, attivo",
      )
      .eq("attivo", true)
      .order("nome", { ascending: true });

    if (error || !data || data.length === 0) return PRODOTTI_ESEMPIO;
    return data as Prodotto[];
  } catch {
    // Qualsiasi problema lato rete/DB: la vetrina resta comunque popolata.
    return PRODOTTI_ESEMPIO;
  }
}

export default async function Home() {
  const prodotti = await caricaProdotti();

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
      {/* Intestazione editoriale della vetrina */}
      <section className="mb-10 max-w-2xl sm:mb-14">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">
          Collezione
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
          Pochi capi, scelti bene.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted">
          Una selezione essenziale firmata <span className="font-medium text-foreground">by Frody</span>:
          tagli puliti, materiali onesti, niente di superfluo.
        </p>
      </section>

      {/* Griglia prodotti */}
      <section
        aria-label="Prodotti in vetrina"
        className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4"
      >
        {prodotti.map((prodotto) => (
          <ProductCard key={prodotto.id} prodotto={prodotto} />
        ))}
      </section>
    </div>
  );
}
