import { notFound } from "next/navigation";

import { requireGestore } from "@/lib/gestore/auth";
import FormProdotto, {
  type ProdottoForm,
} from "@/components/gestore/FormProdotto";
import GestoreGalleria from "@/components/gestore/GestoreGalleria";
import EliminaProdotto from "@/components/gestore/EliminaProdotto";
import type {
  VarianteSalvata,
  FotoGalleriaRow,
} from "@/lib/gestore/actions";
import { caricaCategorie } from "@/lib/categorie";

// Modifica prodotto. In Next 16 `params` e una Promise: va atteso.
export default async function ModificaProdottoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireGestore();

  const { data } = await supabase
    .from("prodotti")
    .select(
      "id, nome, slug, codice, descrizione, categoria_id, prezzo_cents, valuta, attivo, disponibilita_su_richiesta, solo_online, immagine_url",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const prodotto = data as ProdottoForm & { immagine_url: string | null };

  const categorie = await caricaCategorie(supabase);

  const { data: varData } = await supabase
    .from("varianti")
    .select("id, taglia, colore, sku, stock")
    .eq("prodotto_id", id)
    .order("creato_il", { ascending: true });
  const varianti = (varData as VarianteSalvata[] | null) ?? [];
  // Colori distinti del prodotto, per associare le foto della galleria.
  const coloriProdotto = [
    ...new Set(varianti.map((v) => v.colore).filter((c): c is string => !!c)),
  ];

  const { data: fotoData } = await supabase
    .from("prodotto_foto")
    .select("id, prodotto_id, variante_id, colore, url, ordine")
    .eq("prodotto_id", id)
    .order("ordine", { ascending: true });
  const fotoGalleria = (fotoData as FotoGalleriaRow[] | null) ?? [];

  return (
    <div className="pb-28">
      <h1 className="mx-auto mb-5 max-w-xl text-xl font-semibold text-foreground lg:max-w-5xl">
        Modifica prodotto
      </h1>
      <FormProdotto
        prodotto={prodotto}
        categorie={categorie}
        variantiIniziali={varianti}
      />
      <GestoreGalleria
        prodottoId={prodotto.id}
        colori={coloriProdotto}
        fotoIniziali={fotoGalleria}
      />

      {/* Immagine social scaricabile (poster verticale col QR) per IG/stampa. */}
      <section className="mx-auto mt-8 max-w-xl lg:max-w-5xl">
        <div className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-line">
          <h2 className="font-display text-base font-bold text-foreground">
            Condivisione social
          </h2>
          <p className="mt-1 text-sm text-muted">
            Immagine verticale (1080×1920) pronta per Instagram, col QR del
            prodotto. Scaricala e pubblicala tra storie e post, o stampala per la
            vetrina.
          </p>
          {!prodotto.attivo && (
            <p className="mt-2 text-sm font-medium text-coral">
              Il prodotto è nascosto: pubblicalo per includere foto, nome e prezzo
              nell’immagine.
            </p>
          )}
          <a
            href={`/prodotti/${prodotto.slug}/social`}
            download={`anna-shop-${prodotto.slug}.png`}
            className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-sea px-5 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            Scarica immagine
          </a>
        </div>
      </section>

      <EliminaProdotto id={prodotto.id} nome={prodotto.nome} />
    </div>
  );
}
