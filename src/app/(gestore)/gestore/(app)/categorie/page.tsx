import { requireGestore } from "@/lib/gestore/auth";
import GestoreCategorie from "@/components/gestore/GestoreCategorie";
import type { Categoria } from "@/lib/types";

// Pagina gestione categorie. Carica in parallelo la tassonomia e il conteggio
// prodotti per categoria (un solo fetch dei categoria_id, ridotto qui: niente
// N+1). Il raggruppamento radici/figli lo fa il client (come FormProdotto).
export default async function CategoriePage() {
  const { supabase } = await requireGestore();

  const [catRes, prodRes] = await Promise.all([
    supabase
      .from("categorie")
      .select("id, slug, nome, parent_id, ordine")
      .order("ordine", { ascending: true }),
    supabase.from("prodotti").select("categoria_id"),
  ]);

  const categorie = (catRes.data as Categoria[] | null) ?? [];

  const conteggiProdotti: Record<string, number> = {};
  for (const riga of prodRes.data ?? []) {
    const cid = (riga as { categoria_id: string | null }).categoria_id;
    if (cid) conteggiProdotti[cid] = (conteggiProdotti[cid] ?? 0) + 1;
  }

  return (
    <div className="mx-auto max-w-xl pb-24">
      <h1 className="mb-1 text-xl font-semibold text-foreground">Categorie</h1>
      <p className="mb-6 text-sm text-muted">
        Organizza il catalogo: categorie principali e sottocategorie (2 livelli).
        Riordina con un trascinamento e sposta dove vuoi.
      </p>
      <GestoreCategorie iniziali={categorie} conteggiProdotti={conteggiProdotti} />
    </div>
  );
}
