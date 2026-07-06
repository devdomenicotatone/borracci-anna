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

  // Prodotti + categorie in parallelo. I prodotti si caricano a BLOCCHI di 1000
  // (cap PostgREST per singola richiesta) finche non sono tutti: con oltre 1000
  // articoli una query sola ne perderebbe una parte. L'ordinamento ha un
  // tie-break su `id` per una paginazione STABILE — i `creato_il` degli import
  // massivi sono quasi identici e senza tie-break i blocchi si sovrappongono.
  // Filtri e ricerca restano client-side (istantanei a queste scale).
  const DIM_BLOCCO = 1000;
  const [righe, categorie] = await Promise.all([
    (async () => {
      const tutte: RigaProdottoGrezza[] = [];
      for (let da = 0; da < 50_000; da += DIM_BLOCCO) {
        const { data, error } = await supabase
          .from("prodotti")
          .select(
            "id, slug, nome, prezzo_cents, valuta, immagine_url, attivo, disponibilita_su_richiesta, categoria_id, codice, creato_il, varianti(stock, sku)",
          )
          .order("creato_il", { ascending: false })
          .order("id", { ascending: false })
          .range(da, da + DIM_BLOCCO - 1);
        if (error) break;
        const blocco = (data as unknown as RigaProdottoGrezza[] | null) ?? [];
        tutte.push(...blocco);
        if (blocco.length < DIM_BLOCCO) break; // ultimo blocco raggiunto
      }
      return tutte;
    })(),
    caricaCategorie(supabase),
  ]);
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
