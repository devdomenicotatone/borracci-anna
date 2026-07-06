import { requireGestore } from "@/lib/gestore/auth";
import { caricaCategorie } from "@/lib/categorie";
import ListaProdotti, {
  type ProdottoLista,
} from "@/components/gestore/ListaProdotti";

// Forma grezza della riga letta da Supabase (varianti embeddate per conteggio,
// stock e SKU: questi ultimi alimentano la ricerca lato client).
interface RigaProdottoGrezza {
  id: string;
  slug: string;
  nome: string;
  prezzo_cents: number;
  valuta: string;
  immagine_url: string | null;
  attivo: boolean;
  disponibilita_su_richiesta: boolean;
  categoria_id: string | null;
  codice: string | null;
  creato_il: string;
  varianti: { stock: number; sku: string }[] | null;
}

// Lista prodotti del gestore. La pagina e dinamica perche requireGestore()
// legge i cookie di sessione (niente force-dynamic esplicito necessario).
export default async function ProdottiPage() {
  const { supabase } = await requireGestore();

  // Prodotti + categorie in parallelo: le categorie alimentano filtro, badge
  // di riga e assegnazione in blocco. Limite alzato a 1000 (cap PostgREST):
  // filtri e ricerca girano client-side e restano istantanei a queste scale.
  const [{ data }, categorie] = await Promise.all([
    supabase
      .from("prodotti")
      .select(
        "id, slug, nome, prezzo_cents, valuta, immagine_url, attivo, disponibilita_su_richiesta, categoria_id, codice, creato_il, varianti(stock, sku)",
      )
      .order("creato_il", { ascending: false })
      .limit(1000),
    caricaCategorie(supabase),
  ]);

  const righe = (data as unknown as RigaProdottoGrezza[] | null) ?? [];
  const prodotti: ProdottoLista[] = righe.map((p) => ({
    id: p.id,
    slug: p.slug,
    nome: p.nome,
    prezzo_cents: p.prezzo_cents,
    valuta: p.valuta,
    immagine_url: p.immagine_url,
    attivo: p.attivo,
    suRichiesta: p.disponibilita_su_richiesta,
    categoriaId: p.categoria_id,
    numVarianti: p.varianti?.length ?? 0,
    stockTotale: (p.varianti ?? []).reduce((s, v) => s + (v.stock ?? 0), 0),
    codice: p.codice,
    skus: (p.varianti ?? [])
      .map((v) => v.sku)
      .filter((s): s is string => Boolean(s)),
  }));

  return <ListaProdotti prodotti={prodotti} categorie={categorie} />;
}
