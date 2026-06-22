// Pagina Prodotto (PDP) - by Frody.
// Server Component dinamico: carica il prodotto e le sue varianti da Supabase
// per slug. Se le env Supabase non sono configurate degrada con grazia a un
// prodotto d'esempio, cosi il progetto builda anche senza database.

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import AddToCart from "@/components/AddToCart";
import { formatPrezzo } from "@/lib/format";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ProdottoConVarianti, Variante } from "@/lib/types";

// Le pagine che leggono dal DB non vanno prerenderizzate staticamente.
export const dynamic = "force-dynamic";

/**
 * Prodotto d'esempio usato quando Supabase non e configurato (build/anteprima
 * senza env). Coerente con i dati di esempio dello schema.
 */
function prodottoEsempio(slug: string): ProdottoConVarianti {
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
    varianti,
  };
}

/**
 * Carica un prodotto attivo + varianti per slug.
 * Ritorna:
 *  - il prodotto, se trovato;
 *  - `null` se Supabase e configurato ma lo slug non esiste (=> notFound);
 *  - un prodotto d'esempio se Supabase NON e configurato (degrado morbido).
 */
async function caricaProdotto(
  slug: string,
): Promise<ProdottoConVarianti | null> {
  try {
    const supabase = await createServerSupabase();

    // Env mancanti: degrada all'esempio (niente errori in build).
    if (!supabase) {
      return prodottoEsempio(slug);
    }

    const { data, error } = await supabase
      .from("prodotti")
      .select(
        "id, slug, nome, descrizione, prezzo_cents, valuta, immagine_url, attivo, varianti(id, prodotto_id, taglia, colore, sku, stock)",
      )
      .eq("slug", slug)
      .eq("attivo", true)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    // Ordina le varianti per taglia in modo prevedibile (S, M, L, XL, ...).
    const ordineTaglie = ["XS", "S", "M", "L", "XL", "XXL"];
    const varianti = [...((data.varianti as Variante[]) ?? [])].sort((a, b) => {
      const ia = ordineTaglie.indexOf(a.taglia ?? "");
      const ib = ordineTaglie.indexOf(b.taglia ?? "");
      if (ia === -1 && ib === -1) return (a.taglia ?? "").localeCompare(b.taglia ?? "");
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    return {
      id: data.id,
      slug: data.slug,
      nome: data.nome,
      descrizione: data.descrizione,
      prezzo_cents: data.prezzo_cents,
      valuta: data.valuta,
      immagine_url: data.immagine_url,
      attivo: data.attivo,
      varianti,
    };
  } catch {
    // Errore imprevisto a runtime: meglio una pagina d'esempio che un crash.
    return prodottoEsempio(slug);
  }
}

interface PdpProps {
  // Next 16: params e una Promise.
  params: Promise<{ slug: string }>;
}

export default async function PaginaProdotto({ params }: PdpProps) {
  const { slug } = await params;
  const prodotto = await caricaProdotto(slug);

  if (!prodotto) {
    notFound();
  }

  const disponibili = prodotto.varianti.filter((v) => v.stock > 0);
  const esaurito = prodotto.varianti.length > 0 && disponibili.length === 0;
  const senzaVarianti = prodotto.varianti.length === 0;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
      <nav
        className="mb-8 flex items-center gap-2 text-sm text-muted"
        aria-label="Percorso di navigazione"
      >
        <Link
          href="/"
          className="font-medium text-sea transition-colors hover:text-lagoon"
        >
          by Frody
        </Link>
        <span aria-hidden="true" className="text-line">
          /
        </span>
        <span className="font-medium text-foreground">{prodotto.nome}</span>
      </nav>

      <div className="grid grid-cols-1 items-start gap-10 md:grid-cols-2">
        {/* Immagine prodotto */}
        <div className="relative aspect-square w-full overflow-hidden rounded-3xl shadow-sea">
          {prodotto.immagine_url ? (
            <Image
              src={prodotto.immagine_url}
              alt={prodotto.nome}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
              priority
            />
          ) : (
            <div className="tile-cyan dots-overlay flex h-full w-full items-center justify-center">
              <svg
                className="w-2/5 text-white drop-shadow-[0_6px_12px_rgba(0,40,70,0.25)]"
                viewBox="0 0 100 100"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M32 18 L18 28 L24 40 L31 35 L31 84 L69 84 L69 35 L76 40 L82 28 L68 18 C64 24 56 26 50 26 C44 26 36 24 32 18 Z" />
              </svg>
            </div>
          )}
        </div>

        {/* Dettagli e acquisto */}
        <div className="flex flex-col">
          <span className="mb-2 inline-flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-lagoon">
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
              <circle cx="12" cy="12" r="3.4" />
            </svg>
            Dettaglio prodotto
          </span>

          <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            {prodotto.nome}
          </h1>

          <p className="mt-3 font-display text-3xl font-extrabold text-coral">
            {formatPrezzo(prodotto.prezzo_cents, prodotto.valuta)}
          </p>

          {prodotto.descrizione && (
            <p className="mt-6 max-w-prose leading-relaxed text-muted">
              {prodotto.descrizione}
            </p>
          )}

          <div className="mt-8">
            {senzaVarianti ? (
              <p className="rounded-2xl bg-surface px-4 py-3 text-sm text-muted ring-1 ring-line">
                Nessuna variante disponibile per questo prodotto.
              </p>
            ) : esaurito ? (
              <p className="rounded-2xl bg-surface px-4 py-3 text-sm font-semibold text-coral ring-1 ring-coral/30">
                Prodotto esaurito.
              </p>
            ) : (
              <AddToCart varianti={prodotto.varianti} />
            )}
          </div>

          <p className="mt-8 font-mono text-xs text-muted">
            SKU prodotto: {prodotto.slug}
          </p>
        </div>
      </div>
    </main>
  );
}
