import { requireGestore } from "@/lib/gestore/auth";
import GestoreCategorie from "@/components/gestore/GestoreCategorie";
import type { Categoria } from "@/lib/types";

// Pagina gestione categorie. Carica in parallelo la tassonomia e il conteggio
// prodotti per categoria (un solo fetch dei categoria_id, ridotto qui: niente
// N+1). Il raggruppamento radici/figli/nipoti lo fa il client (come FormProdotto).
export default async function CategoriePage() {
  const { supabase } = await requireGestore();

  // I conteggi arrivano da una RPC che li aggrega a Postgres (group by): niente
  // scansione di tutti i prodotti nel browser, che oltre le 1000 righe verrebbe
  // troncata da max-rows falsando i numeri del menu.
  const [catRes, conteggiRes] = await Promise.all([
    supabase
      .from("categorie")
      .select("id, slug, nome, parent_id, ordine")
      .order("ordine", { ascending: true }),
    supabase.rpc("conteggi_categorie_gestore"),
  ]);

  const categorie = (catRes.data as Categoria[] | null) ?? [];

  const conteggiProdotti: Record<string, number> = {};
  for (const riga of conteggiRes.data ?? []) {
    const { categoria_id, n } = riga as { categoria_id: string | null; n: number };
    if (categoria_id) conteggiProdotti[categoria_id] = Number(n);
  }

  return (
    <div className="mx-auto max-w-xl pb-24 lg:max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold text-foreground">Categorie</h1>
      <p className="mb-6 text-sm text-muted">
        Organizza il catalogo: categorie principali e sottocategorie, fino a 3
        livelli (es. Uomo › T-shirt › Manga). Riordina con un trascinamento e
        sposta dove vuoi.
      </p>
      <GestoreCategorie iniziali={categorie} conteggiProdotti={conteggiProdotti} />
    </div>
  );
}
