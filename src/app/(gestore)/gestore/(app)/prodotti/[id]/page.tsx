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
      "id, nome, slug, codice, descrizione, categoria_id, prezzo_cents, valuta, attivo, disponibilita_su_richiesta, immagine_url",
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
      <EliminaProdotto id={prodotto.id} nome={prodotto.nome} />
    </div>
  );
}
