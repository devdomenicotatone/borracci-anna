// Pagina Prodotto (PDP) - Borracci Anna.
// Server Component dinamico: carica il prodotto, le sue varianti e la galleria
// foto da Supabase per slug. Se le env Supabase non sono configurate degrada
// con grazia a un prodotto d'esempio, cosi il progetto builda anche senza DB.

import { Fragment, cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import ProdottoDettaglio from "@/components/prodotto/ProdottoDettaglio";
import { createServerSupabase } from "@/lib/supabase/server";
import { ordineTaglia } from "@/lib/catalogo";
import type {
  Categoria,
  ProdottoConVarianti,
  ProdottoFoto,
  Variante,
} from "@/lib/types";

// Le pagine che leggono dal DB non vanno prerenderizzate staticamente.
export const dynamic = "force-dynamic";

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
  try {
    const supabase = await createServerSupabase();
    if (!supabase) return prodottoEsempio(slug);

    // Prodotto e lista categorie in parallelo: le categorie non dipendono dal
    // prodotto, cosi la catena del breadcrumb non aggiunge un round-trip.
    const [prodottoRes, categorieRes] = await Promise.all([
      supabase
        .from("prodotti")
        .select(
          "id, slug, codice, nome, descrizione, prezzo_cents, valuta, immagine_url, attivo, disponibilita_su_richiesta, categoria_id, varianti(id, prodotto_id, taglia, colore, sku, stock), prodotto_foto(id, prodotto_id, variante_id, colore, url, ordine, blur_data_url)",
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
      prezzo_cents: data.prezzo_cents,
      valuta: data.valuta,
      immagine_url: data.immagine_url,
      attivo: data.attivo,
      disponibilita_su_richiesta: data.disponibilita_su_richiesta,
      varianti,
      foto,
      percorso,
    };
  } catch {
    return prodottoEsempio(slug);
  }
});

interface PdpProps {
  // Next 16: params e una Promise.
  params: Promise<{ slug: string }>;
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

  const descrizione =
    (prodotto.descrizione ?? "").replace(/\s+/g, " ").trim().slice(0, 160) ||
    `${prodotto.nome} — Anna Shop, moda fresca sul lungomare di Rimini.`;

  return {
    title: prodotto.nome, // -> "<nome> · Anna Shop" via template del root
    description: descrizione,
    openGraph: {
      title: `${prodotto.nome} · Anna Shop`,
      description: descrizione,
      type: "website",
      // L'immagine OG la genera opengraph-image.tsx (card foto + nome + prezzo).
    },
  };
}

export default async function PaginaProdotto({ params }: PdpProps) {
  const { slug } = await params;
  const prodotto = await caricaProdotto(slug);

  if (!prodotto) {
    notFound();
  }

  const { foto, percorso, ...prodottoBase } = prodotto;

  // Dati strutturati (schema.org Product): su Google il prodotto puo mostrare
  // prezzo e disponibilita nei risultati.
  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const datiStrutturati = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: prodotto.nome,
    description: prodotto.descrizione ?? undefined,
    image: prodotto.immagine_url ? [prodotto.immagine_url] : undefined,
    brand: { "@type": "Brand", name: "Anna Shop" },
    offers: {
      "@type": "Offer",
      price: (prodotto.prezzo_cents / 100).toFixed(2),
      priceCurrency: prodotto.valuta ?? "EUR",
      availability: "https://schema.org/InStock",
      ...(SITE ? { url: `${SITE}/prodotti/${prodotto.slug}` } : {}),
    },
  };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(datiStrutturati).replace(/</g, "\\u003c"),
        }}
      />
      <nav
        className="mb-8 flex flex-wrap items-center gap-2 text-sm text-muted"
        aria-label="Percorso di navigazione"
      >
        {percorso.length > 0 ? (
          // Catena categorie (es. Uomo / Polo). Solo testo: non esistono ancora
          // pagine filtrate per categoria a cui collegarsi.
          percorso.map((c) => (
            <Fragment key={c.id}>
              <span className="font-medium">{c.nome}</span>
              <span aria-hidden="true" className="text-line">
                /
              </span>
            </Fragment>
          ))
        ) : (
          // Fallback senza categoria: link alla home come prima.
          <>
            <Link
              href="/"
              className="font-medium text-sea transition-colors hover:text-lagoon"
            >
              Anna Shop
            </Link>
            <span aria-hidden="true" className="text-line">
              /
            </span>
          </>
        )}
        <span className="font-medium text-foreground">{prodotto.nome}</span>
      </nav>

      <ProdottoDettaglio
        // Rimonta al cambio prodotto: azzera la selezione colore/taglia/foto
        // (altrimenti la navigazione client-side tra PDP mantiene lo stato di A).
        key={prodottoBase.slug}
        prodotto={prodottoBase}
        foto={foto}
        suRichiesta={prodottoBase.disponibilita_su_richiesta ?? true}
      />
    </main>
  );
}
