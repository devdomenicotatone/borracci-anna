// Pagina Prodotto (PDP) - Borracci Anna.
// Server Component dinamico: carica il prodotto, le sue varianti e la galleria
// foto da Supabase per slug. Se le env Supabase non sono configurate degrada
// con grazia a un prodotto d'esempio, cosi il progetto builda anche senza DB.

import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import ProdottoDettaglio from "@/components/prodotto/ProdottoDettaglio";
import ProdottiCorrelati from "@/components/prodotto/ProdottiCorrelati";
import { createServerSupabase } from "@/lib/supabase/server";
import { ordineTaglia } from "@/lib/catalogo";
import {
  CONSEGNA_MAX_GG,
  CONSEGNA_MIN_GG,
  SPEDIZIONE_ITALIA_CENTS,
} from "@/lib/spedizione";
import type {
  Categoria,
  ProdottoConVarianti,
  ProdottoFoto,
  Variante,
} from "@/lib/types";

// Le pagine che leggono dal DB non vanno prerenderizzate staticamente.
export const dynamic = "force-dynamic";

// Finestra rolling ~1 anno per offers.priceValidUntil (price snippet dei
// merchant listing): prezzi IVA inclusa stabili, la precisione al giorno non
// serve. A livello di MODULO perche' Date.now() e' impuro durante il render
// (regola del compiler React); si rivaluta a ogni avvio del processo server.
const PRICE_VALID_UNTIL = new Date(Date.now() + 365 * 24 * 3600 * 1000)
  .toISOString()
  .slice(0, 10);

type ProdottoPdp = ProdottoConVarianti & {
  foto: ProdottoFoto[];
  /** Catena categorie dal livello macro (es. Uomo) alla foglia (es. Polo),
   *  usata dal breadcrumb. Vuota se il prodotto non ha categoria. */
  percorso: Categoria[];
};

/**
 * Prodotto d'esempio usato quando Supabase non e configurato (build/anteprima
 * senza env). Coerente con i dati di esempio dello schema.
 */
function prodottoEsempio(slug: string): ProdottoPdp {
  const prodottoId = "esempio-prodotto";
  const taglie: Array<{ taglia: string; stock: number }> = [
    { taglia: "S", stock: 10 },
    { taglia: "M", stock: 15 },
    { taglia: "L", stock: 15 },
    { taglia: "XL", stock: 0 },
  ];

  const varianti: Variante[] = taglie.map((t) => ({
    id: `esempio-${slug}-${t.taglia.toLowerCase()}`,
    prodotto_id: prodottoId,
    taglia: t.taglia,
    colore: "Bianco",
    sku: `${slug}-${t.taglia.toLowerCase()}`,
    stock: t.stock,
  }));

  return {
    id: prodottoId,
    slug,
    nome: "T-shirt Basic Bianca",
    descrizione:
      "T-shirt in puro cotone organico, vestibilita regular. Un essenziale del guardaroba. (Anteprima d'esempio: configura Supabase per i dati reali.)",
    prezzo_cents: 1999,
    valuta: "EUR",
    immagine_url: null,
    attivo: true,
    disponibilita_su_richiesta: true,
    solo_online: false,
    varianti,
    foto: [],
    percorso: [],
  };
}

/**
 * Carica un prodotto attivo + varianti + galleria foto per slug.
 * Ritorna il prodotto, `null` se Supabase e configurato ma lo slug non esiste
 * (=> notFound), o un prodotto d'esempio se Supabase NON e configurato.
 */
const caricaProdotto = cache(async (
  slug: string,
): Promise<ProdottoPdp | null> => {
  // Il prodotto demo e SOLO per l'assenza di env (build/anteprima): mai come
  // fallback di un errore runtime col DB configurato, o qualunque slug
  // risponderebbe 200 con contenuto fittizio indicizzabile (soft-404 su spazio
  // URL infinito; audit SEO 2026-07). Un'eccezione runtime deve propagarsi:
  // la error boundary risponde 5xx e Google sospende il crawl senza
  // de-indicizzare.
  const supabase = await createServerSupabase();
  if (!supabase) return prodottoEsempio(slug);

  {
    // Prodotto e lista categorie in parallelo: le categorie non dipendono dal
    // prodotto, cosi la catena del breadcrumb non aggiunge un round-trip.
    const [prodottoRes, categorieRes] = await Promise.all([
      supabase
        .from("prodotti")
        .select(
          "id, slug, codice, nome, descrizione, composizione, fabbricante, prezzo_cents, valuta, immagine_url, attivo, disponibilita_su_richiesta, solo_online, categoria_id, varianti(id, prodotto_id, taglia, colore, sku, stock), prodotto_foto(id, prodotto_id, variante_id, colore, url, ordine, blur_data_url)",
        )
        .eq("slug", slug)
        .eq("attivo", true)
        .maybeSingle(),
      supabase.from("categorie").select("id, slug, nome, parent_id, ordine"),
    ]);

    const { data, error } = prodottoRes;
    if (error || !data) return null;

    // Ordina le varianti per taglia (scala S→6XL) e poi per colore.
    const varianti = [...((data.varianti as Variante[]) ?? [])].sort(
      (a, b) =>
        ordineTaglia(a.taglia) - ordineTaglia(b.taglia) ||
        (a.colore ?? "").localeCompare(b.colore ?? ""),
    );

    const foto = [...((data.prodotto_foto as ProdottoFoto[]) ?? [])].sort(
      (a, b) => a.ordine - b.ordine,
    );

    // Risale la gerarchia dalla foglia (categoria del prodotto) alla macro,
    // partendo dalla lista completa (tabella minuscola). `unshift` mette la
    // radice per prima -> [Uomo, Polo]. Guardia anti-ciclo per sicurezza.
    const catPerId = new Map(
      ((categorieRes.data as Categoria[] | null) ?? []).map((c) => [c.id, c]),
    );
    const percorso: Categoria[] = [];
    const visti = new Set<string>();
    let corrente = data.categoria_id
      ? catPerId.get(data.categoria_id)
      : undefined;
    while (corrente && !visti.has(corrente.id)) {
      visti.add(corrente.id);
      percorso.unshift(corrente);
      corrente = corrente.parent_id
        ? catPerId.get(corrente.parent_id)
        : undefined;
    }

    return {
      id: data.id,
      slug: data.slug,
      codice: data.codice,
      nome: data.nome,
      descrizione: data.descrizione,
      composizione: data.composizione,
      fabbricante: data.fabbricante,
      prezzo_cents: data.prezzo_cents,
      valuta: data.valuta,
      immagine_url: data.immagine_url,
      attivo: data.attivo,
      disponibilita_su_richiesta: data.disponibilita_su_richiesta,
      solo_online: data.solo_online,
      varianti,
      foto,
      percorso,
    };
  }
});

interface PdpProps {
  // Next 16: params e searchParams sono Promise.
  params: Promise<{ slug: string }>;
  /** `?taglia=M` dal quick add delle card: taglia preselezionata in scheda. */
  searchParams?: Promise<{ taglia?: string | string[] }>;
}

/**
 * Metadati per-prodotto (title/description/OpenGraph). Condivide il fetch con la
 * pagina via cache(): caricaProdotto e memoizzato per-richiesta, niente doppio
 * round-trip al DB.
 */
export async function generateMetadata({
  params,
}: PdpProps): Promise<Metadata> {
  const { slug } = await params;
  const prodotto = await caricaProdotto(slug);
  if (!prodotto) {
    return { title: "Prodotto non trovato" };
  }

  // Troncatura a fine parola con ellissi: uno slice cieco a 160 lasciava lo
  // snippet SERP/social a meta' parola (audit SEO 2026-07).
  const pulita = (prodotto.descrizione ?? "").replace(/\s+/g, " ").trim();
  const descrizione =
    (pulita.length > 160
      ? `${pulita.slice(0, 160).replace(/\s+\S*$/, "")}…`
      : pulita) ||
    `${prodotto.nome} — Anna Shop, moda fresca sul lungomare di Rimini.`;

  return {
    title: prodotto.nome, // -> "<nome> · Anna Shop" via template del root
    description: descrizione,
    // Canonical assoluto via metadataBase: neutralizza le query di tracciamento
    // (utm_*, gclid) con cui la PDP puo essere raggiunta.
    alternates: { canonical: `/prodotti/${slug}` },
    openGraph: {
      title: `${prodotto.nome} · Anna Shop`,
      description: descrizione,
      type: "website",
      // L'immagine OG la genera opengraph-image.tsx (card foto + nome + prezzo).
    },
  };
}

export default async function PaginaProdotto({
  params,
  searchParams,
}: PdpProps) {
  const { slug } = await params;
  const prodotto = await caricaProdotto(slug);

  if (!prodotto) {
    notFound();
  }

  // Taglia preselezionata dal quick add (?taglia=M). La validazione vera
  // (esiste? ha stock?) sta in ProdottoDettaglio: qui si normalizza soltanto.
  const { taglia } = (await searchParams) ?? {};
  const tagliaIniziale = typeof taglia === "string" ? taglia : null;

  const { foto, percorso, ...prodottoBase } = prodotto;

  // Dati strutturati (schema.org Product): su Google il prodotto puo mostrare
  // prezzo e disponibilita nei risultati.
  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  // La disponibilita del rich result deve rispecchiare il contenuto della
  // pagina (altrimenti Google segnala structured data incoerente): stessa
  // logica del blocco acquisto/richiesta (vedi ProdottoDettaglio).
  const suRichiesta = prodotto.disponibilita_su_richiesta ?? true;
  const senzaVarianti = prodotto.varianti.length === 0;
  const esaurito = !senzaVarianti && prodotto.varianti.every((v) => v.stock <= 0);
  // Su richiesta = ordinabile ORA con evasione differita, anche a stock 0:
  // BackOrder, non LimitedAvailability ("pochi pezzi", incoerente con la
  // pagina) ne' PreOrder (prodotti non ancora usciti). Audit SEO 2026-07.
  const disponibilitaSchema = suRichiesta
    ? "https://schema.org/BackOrder"
    : esaurito
      ? "https://schema.org/OutOfStock"
      : "https://schema.org/InStock";
  const datiStrutturati = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: prodotto.nome,
    description: prodotto.descrizione ?? undefined,
    image: prodotto.immagine_url ? [prodotto.immagine_url] : undefined,
    brand: { "@type": "Brand", name: "Anna Shop" },
    sku: prodotto.codice ?? undefined,
    itemCondition: "https://schema.org/NewCondition",
    offers: {
      "@type": "Offer",
      price: (prodotto.prezzo_cents / 100).toFixed(2),
      priceCurrency: prodotto.valuta ?? "EUR",
      availability: disponibilitaSchema,
      priceValidUntil: PRICE_VALID_UNTIL,
      ...(SITE ? { url: `${SITE}/prodotti/${prodotto.slug}` } : {}),
      // Spedizione e reso dai punti di verita reali (lib/spedizione + pagine
      // legali): alimentano il blocco "shipping & returns" del merchant
      // listing. Tariffa piena dichiarata come caso peggiore (prassi accettata
      // con soglia free-shipping); transit = stima 2-5 gg comunicata al
      // cliente "dall'affidamento al corriere", handling 0-1 gg.
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: {
          "@type": "MonetaryAmount",
          value: (SPEDIZIONE_ITALIA_CENTS / 100).toFixed(2),
          currency: "EUR",
        },
        shippingDestination: {
          "@type": "DefinedRegion",
          addressCountry: "IT",
        },
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          handlingTime: {
            "@type": "QuantitativeValue",
            minValue: 0,
            maxValue: 1,
            unitCode: "DAY",
          },
          transitTime: {
            "@type": "QuantitativeValue",
            minValue: CONSEGNA_MIN_GG,
            maxValue: CONSEGNA_MAX_GG,
            unitCode: "DAY",
          },
        },
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "IT",
        returnPolicyCategory:
          "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 14,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
      },
    },
  };
  // BreadcrumbList: stessa catena del breadcrumb visivo qui sotto (pattern di
  // categoria/[slug]); l'ultimo ListItem (il prodotto) resta senza `item`,
  // come da linee guida Google per la pagina corrente.
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      ...percorso.map((c, i) => ({
        "@type": "ListItem",
        position: i + 2,
        name: c.nome,
        item: `${SITE}/categoria/${c.slug}`,
      })),
      {
        "@type": "ListItem",
        position: percorso.length + 2,
        name: prodotto.nome,
      },
    ],
  };

  return (
    // <div>, non <main>: il landmark lo mette il layout vetrina (id="contenuto");
    // il <main> annidato era un residuo dell'audit a11y, uniformato toccando il
    // file. lg:max-w-6xl: a 1024+ la PDP usava meta schermo (960px totali, foto
    // 492px) — piu respiro a galleria e colonna acquisto sui desktop veri.
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 lg:max-w-6xl lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(datiStrutturati).replace(/</g, "\\u003c"),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbLd).replace(/</g, "\\u003c"),
        }}
      />
      <nav aria-label="Percorso di navigazione" className="mb-8">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
          <li>
            <Link
              href="/"
              className="rounded-full transition-colors hover:text-sea"
            >
              Home
            </Link>
          </li>
          {/* Catena categorie (es. Uomo > Polo): link alle pagine /categoria. */}
          {percorso.map((c) => (
            <li key={c.id} className="flex items-center gap-1.5">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5 text-line"
                aria-hidden="true"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
              <Link
                href={`/categoria/${c.slug}`}
                className="transition-colors hover:text-sea"
              >
                {c.nome}
              </Link>
            </li>
          ))}
          {/* Nodo finale: il nome prodotto, pagina corrente. */}
          <li className="flex items-center gap-1.5">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5 text-line"
              aria-hidden="true"
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
            {/* Troncato: su 360px il nome intero occuperebbe 3-4 righe e
                spingerebbe la galleria sotto la piega (è ripetuto nell'h1). */}
            <span
              aria-current="page"
              title={prodotto.nome}
              className="max-w-[18ch] truncate font-medium text-foreground"
            >
              {prodotto.nome}
            </span>
          </li>
        </ol>
      </nav>

      <ProdottoDettaglio
        // Rimonta al cambio prodotto: azzera la selezione colore/taglia/foto
        // (altrimenti la navigazione client-side tra PDP mantiene lo stato di A).
        key={prodottoBase.slug}
        prodotto={prodottoBase}
        foto={foto}
        suRichiesta={prodottoBase.disponibilita_su_richiesta ?? true}
        soloOnline={prodottoBase.solo_online ?? false}
        tagliaIniziale={tagliaIniziale}
      />

      {/* Suggerimenti correlati: renderizzati inline (niente Suspense) cosi la
          sezione fa parte dell'HTML iniziale e non "salta" dentro dopo il paint
          (evita il layout shift). La query e cachata (unstable_cache, 30 min):
          bloccarci sopra costa ~0 a cache calda. Se i correlati sono troppo
          pochi la sezione non compare (vedi ProdottiCorrelati). */}
      <ProdottiCorrelati slug={prodottoBase.slug} />
    </div>
  );
}
