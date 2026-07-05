// Vetrina "Borracci Anna": griglia dei prodotti attivi.
// Legge da Supabase lato server; se le env mancano, la query fallisce o non
// ci sono prodotti, degrada con grazia mostrando alcuni prodotti di esempio
// hardcoded cosi la pagina rende SEMPRE (anche in build senza env).

import Link from "next/link";

import type { Prodotto } from "@/lib/types";
import { createServerSupabase } from "@/lib/supabase/server";
import ProductCard from "@/components/ProductCard";
import Wordmark from "@/components/Wordmark";
import { NEGOZIO } from "@/lib/negozio";

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
 * I prodotti di esempio sono SOLO un fallback per quando Supabase non e
 * configurato (build/anteprima senza env): con DB connesso si mostrano i dati
 * reali, e se non ci sono prodotti attivi la vetrina resta vuota (stato vuoto),
 * senza mai mostrare prodotti finti (che porterebbero a pagine 404).
 */
async function caricaProdotti(): Promise<Prodotto[]> {
  try {
    const supabase = await createServerSupabase();
    if (!supabase) return PRODOTTI_ESEMPIO; // nessuna env: dati di esempio

    const { data, error } = await supabase
      .from("prodotti")
      .select(
        "id, slug, nome, descrizione, prezzo_cents, valuta, immagine_url, attivo, solo_online",
      )
      .eq("attivo", true)
      .order("nome", { ascending: true });

    if (error) return []; // errore: vetrina vuota, niente prodotti finti
    return (data as Prodotto[] | null) ?? [];
  } catch {
    return [];
  }
}

export default async function Home() {
  const prodotti = await caricaProdotti();

  // Dati strutturati (schema.org): aiuta Google a capire che è un negozio di
  // abbigliamento a Rimini, con indirizzo, contatti e orari.
  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const datiStrutturati = {
    "@context": "https://schema.org",
    "@type": "ClothingStore",
    name: "Anna Shop",
    legalName: NEGOZIO.ragioneSociale,
    ...(SITE ? { "@id": SITE, url: SITE } : {}),
    telephone: NEGOZIO.telefono,
    email: NEGOZIO.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: NEGOZIO.indirizzo.via,
      addressLocality: NEGOZIO.indirizzo.citta,
      postalCode: NEGOZIO.indirizzo.cap,
      addressRegion: NEGOZIO.indirizzo.provincia,
      addressCountry: "IT",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: NEGOZIO.coordinate.lat,
      longitude: NEGOZIO.coordinate.lng,
    },
    openingHours: "Mo-Su 09:00-24:00",
    vatID: NEGOZIO.partitaIva,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(datiStrutturati).replace(/</g, "\\u003c"),
        }}
      />
      {/* ===== HERO "Pop mare": banda full-bleed mare con onda in fondo ===== */}
      <section
        aria-labelledby="hero-title"
        className="bg-sea-gradient relative isolate overflow-hidden text-white"
      >
        {/* Sole sfumato in alto a destra (decorativo). */}
        <span
          aria-hidden="true"
          className="absolute -right-12 -top-16 -z-10 h-60 w-60 rounded-full [background:radial-gradient(circle_at_50%_50%,rgba(255,210,63,.95),rgba(255,210,63,0)_70%)]"
        />
        {/* Puntini bianchi sfumati verso il basso. */}
        <span
          aria-hidden="true"
          className="dots-overlay absolute inset-0 -z-10 opacity-50 [mask-image:linear-gradient(180deg,#000_0%,transparent_62%)]"
        />

        {/* Sticker ruotati (decorativi). Solo da md+ (a destra, lontano dalle
            CTA allineate a sinistra): su mobile lo spazio e troppo poco e
            finirebbero sopra occhiello/bottoni. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[1] hidden md:block"
        >
          <span className="absolute right-[6%] top-10 rotate-6 rounded-xl bg-coral px-4 py-2.5 font-display text-sm font-bold text-white shadow-[0_10px_24px_-10px_rgba(0,40,70,.5)]">
            Estate 2026
          </span>
          <span className="absolute bottom-28 right-[9%] -rotate-6 rounded-xl bg-white px-4 py-2.5 font-display text-sm font-bold text-sea shadow-[0_10px_24px_-10px_rgba(0,40,70,.5)]">
            ☀ Rimini beach
          </span>
        </div>

        <div className="mx-auto max-w-6xl px-5 pb-24 pt-12 sm:pb-28 sm:pt-16 lg:pb-32 lg:pt-20">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-medium ring-1 ring-white/35 backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-sun shadow-[0_0_0_4px_rgba(255,210,63,.35)]" />
            Negozio sul lungomare di Rimini
          </span>
          <h1
            id="hero-title"
            className="mt-4 max-w-[14ch] font-display text-[clamp(2.3rem,9vw,4.4rem)] font-extrabold leading-[1.05] [text-shadow:0_6px_24px_rgba(0,57,99,.35)]"
          >
            L&apos;estate si veste da Anna Shop.
          </h1>
          <p className="mt-3.5 max-w-[46ch] text-base text-white/95 sm:text-lg">
            Capi freschi e leggeri, scelti uno a uno. Vieni a trovarci sul
            lungomare o te li spediamo a casa.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="#vetrina"
              className="inline-flex items-center justify-center rounded-full bg-coral px-6 py-3.5 font-display font-bold text-white shadow-coral transition duration-200 hover:-translate-y-0.5"
            >
              Scopri la collezione
            </a>
            <Link
              href="/vieni-a-trovarci"
              className="inline-flex items-center justify-center rounded-full bg-white/15 px-6 py-3.5 font-display font-bold text-white ring-2 ring-white/70 backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:bg-white/25"
            >
              Vieni a trovarci
            </Link>
          </div>
        </div>

        {/* Onda bianca in fondo all'hero. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -bottom-px z-[2] leading-[0]"
        >
          <svg
            viewBox="0 0 1440 120"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
            className="block h-auto w-full"
          >
            <path
              fill="var(--background)"
              d="M0,64 C180,110 360,110 540,80 C720,50 900,8 1080,16 C1260,24 1380,72 1440,88 L1440,120 L0,120 Z"
            />
          </svg>
        </div>
      </section>

      {/* ===== GRIGLIA PRODOTTI ===== */}
      <section
        id="vetrina"
        aria-labelledby="novita-title"
        className="mx-auto max-w-6xl scroll-mt-20 px-5 py-12 sm:py-16"
      >
        <div className="mb-8 sm:mb-10">
          <span className="inline-flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-sea">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="h-[18px] w-[18px]"
            >
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
              <circle cx="12" cy="12" r="3.4" />
            </svg>
            Fresche di stagione
          </span>
          <h2
            id="novita-title"
            className="mt-2 font-display text-3xl font-extrabold leading-tight text-foreground sm:text-4xl"
          >
            Novità dell&apos;estate
          </h2>
        </div>

        {/* Griglia prodotti (o stato vuoto se non ci sono prodotti attivi) */}
        {prodotti.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-line bg-surface px-6 py-20 text-center shadow-soft">
            <Wordmark className="select-none text-3xl opacity-60" />
            <p className="mt-4 text-sm text-muted">
              La vetrina è in aggiornamento. Torna presto.
            </p>
          </div>
        ) : (
          <div
            aria-label="Prodotti in vetrina"
            className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4"
          >
            {prodotti.map((prodotto) => (
              <ProductCard key={prodotto.id} prodotto={prodotto} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
