import { requireGestore } from "@/lib/gestore/auth";
import GestoreMedia, {
  type GruppoMedia,
} from "@/components/gestore/GestoreMedia";

// Riga grezza letta da Supabase: la foto + il prodotto a cui appartiene (per
// raggruppare ed etichettare). `prodotti` e l'oggetto della relazione to-one.
interface RigaFotoGrezza {
  id: string;
  prodotto_id: string;
  colore: string | null;
  url: string;
  ordine: number;
  prodotti: { nome: string; slug: string; attivo: boolean } | null;
}

// Vista globale di tutte le foto del catalogo (prodotto_foto), raggruppate per
// prodotto. Dinamica perche requireGestore() legge i cookie di sessione; la RLS
// "gestore" mostra anche le foto dei prodotti bozza (non attivi).
export default async function MediaPage() {
  const { supabase } = await requireGestore();

  const { data } = await supabase
    .from("prodotto_foto")
    .select("id, prodotto_id, colore, url, ordine, prodotti(nome, slug, attivo)")
    .order("prodotto_id", { ascending: true })
    .order("ordine", { ascending: true });

  const righe = (data as unknown as RigaFotoGrezza[] | null) ?? [];

  // Raggruppa per prodotto preservando l'ordine delle foto.
  const mappa = new Map<string, GruppoMedia>();
  for (const r of righe) {
    let g = mappa.get(r.prodotto_id);
    if (!g) {
      g = {
        prodottoId: r.prodotto_id,
        nome: r.prodotti?.nome ?? "Senza nome",
        slug: r.prodotti?.slug ?? "",
        attivo: r.prodotti?.attivo ?? false,
        foto: [],
      };
      mappa.set(r.prodotto_id, g);
    }
    g.foto.push({
      id: r.id,
      prodotto_id: r.prodotto_id,
      colore: r.colore,
      url: r.url,
      ordine: r.ordine,
    });
  }

  // Prodotti in ordine alfabetico per una libreria leggibile.
  const gruppi = [...mappa.values()].sort((a, b) =>
    a.nome.localeCompare(b.nome, "it"),
  );

  return <GestoreMedia gruppiIniziali={gruppi} />;
}
