import { requireGestore } from "@/lib/gestore/auth";
import GestorePrezzi from "@/components/gestore/GestorePrezzi";
import type { Categoria } from "@/lib/types";

// Pagina "Prezzi": modifica dei prezzi a gruppi di categorie (aumento o
// riduzione in % o in euro, con selezione fine dei prodotti). Carica in
// parallelo la tassonomia e i conteggi per categoria (stessa coppia della
// pagina Categorie); i prodotti arrivano DOPO, on demand, via server action,
// quando il gestore ha scelto le categorie.
export default async function PrezziPage() {
  const { supabase } = await requireGestore();

  const [catRes, conteggiRes] = await Promise.all([
    supabase
      .from("categorie")
      .select("id, slug, nome, parent_id, ordine")
      .order("ordine", { ascending: true })
      .order("id", { ascending: true }),
    supabase.rpc("conteggi_categorie_gestore"),
  ]);

  const categorie = (catRes.data as Categoria[] | null) ?? [];

  const conteggi: Record<string, number> = {};
  for (const riga of conteggiRes.data ?? []) {
    const { categoria_id, n } = riga as { categoria_id: string | null; n: number };
    if (categoria_id) conteggi[categoria_id] = Number(n);
  }

  return (
    <div className="mx-auto max-w-xl pb-24 lg:max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold text-foreground">Prezzi</h1>
      <p className="mb-6 text-sm text-muted">
        Aumenta o riduci i prezzi di interi gruppi di categorie, in percentuale
        o in euro. Prima di applicare vedi il nuovo prezzo di ogni prodotto e
        puoi escludere quelli da lasciare com&apos;erano.
      </p>
      <GestorePrezzi categorie={categorie} conteggi={conteggi} />
    </div>
  );
}
