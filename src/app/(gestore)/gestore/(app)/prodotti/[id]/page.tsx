import { notFound } from "next/navigation";

import { requireGestore } from "@/lib/gestore/auth";
import FormProdotto, {
  type ProdottoForm,
} from "@/components/gestore/FormProdotto";
import EditorVarianti from "@/components/gestore/EditorVarianti";
import UploaderFoto from "@/components/gestore/UploaderFoto";
import EliminaProdotto from "@/components/gestore/EliminaProdotto";
import type { VarianteSalvata } from "@/lib/gestore/actions";

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
      "id, nome, slug, descrizione, prezzo_cents, valuta, attivo, immagine_url",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const prodotto = data as ProdottoForm & { immagine_url: string | null };

  const { data: varData } = await supabase
    .from("varianti")
    .select("id, taglia, colore, sku, stock")
    .eq("prodotto_id", id)
    .order("creato_il", { ascending: true });
  const varianti = (varData as VarianteSalvata[] | null) ?? [];

  return (
    <div className="pb-28">
      <h1 className="mx-auto mb-5 max-w-xl text-xl font-semibold text-foreground">
        Modifica prodotto
      </h1>
      <FormProdotto prodotto={prodotto} />
      <UploaderFoto prodottoId={prodotto.id} urlIniziale={prodotto.immagine_url} />
      <EditorVarianti
        prodottoId={prodotto.id}
        slugProdotto={prodotto.slug}
        varianti={varianti}
      />
      <EliminaProdotto id={prodotto.id} nome={prodotto.nome} />
    </div>
  );
}
