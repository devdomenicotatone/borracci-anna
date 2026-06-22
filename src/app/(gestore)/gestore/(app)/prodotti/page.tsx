import { requireGestore } from "@/lib/gestore/auth";
import ListaProdotti, {
  type ProdottoLista,
} from "@/components/gestore/ListaProdotti";

// Forma grezza della riga letta da Supabase (varianti embeddate per il conteggio).
interface RigaProdottoGrezza {
  id: string;
  slug: string;
  nome: string;
  prezzo_cents: number;
  valuta: string;
  immagine_url: string | null;
  attivo: boolean;
  creato_il: string;
  varianti: { stock: number }[] | null;
}

// Lista prodotti del gestore. La pagina e dinamica perche requireGestore()
// legge i cookie di sessione (niente force-dynamic esplicito necessario).
export default async function ProdottiPage() {
  const { supabase } = await requireGestore();

  const { data } = await supabase
    .from("prodotti")
    .select(
      "id, slug, nome, prezzo_cents, valuta, immagine_url, attivo, creato_il, varianti(stock)",
    )
    .order("creato_il", { ascending: false })
    .limit(200);

  const righe = (data as unknown as RigaProdottoGrezza[] | null) ?? [];
  const prodotti: ProdottoLista[] = righe.map((p) => ({
    id: p.id,
    slug: p.slug,
    nome: p.nome,
    prezzo_cents: p.prezzo_cents,
    valuta: p.valuta,
    immagine_url: p.immagine_url,
    attivo: p.attivo,
    numVarianti: p.varianti?.length ?? 0,
    stockTotale: (p.varianti ?? []).reduce((s, v) => s + (v.stock ?? 0), 0),
  }));

  return <ListaProdotti prodotti={prodotti} />;
}
