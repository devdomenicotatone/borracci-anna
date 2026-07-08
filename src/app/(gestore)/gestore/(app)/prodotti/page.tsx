import { requireGestore } from "@/lib/gestore/auth";
import { caricaCategorie } from "@/lib/categorie";
import ListaProdotti from "@/components/gestore/ListaProdotti";
import BannerSyncGiacenze from "@/components/gestore/BannerSyncGiacenze";
import {
  parseFiltriGestore,
  parsePaginaGestore,
  type SearchParamsGestore,
} from "@/lib/filtri-gestore";
import {
  caricaConteggiCategorieGestore,
  caricaProdottiGestore,
} from "@/lib/gestore/prodotti-lista";
import { leggiUltimoSync } from "@/lib/gestore/sync-catalogo";

// Lista prodotti del gestore. Ricerca, filtri, ordinamento e paginazione girano
// lato DB (RPC) in base ai searchParams: la pagina non carica piu l'intero
// catalogo nel browser. E dinamica perche requireGestore() legge i cookie di
// sessione e i dati dipendono dalla query string.
export default async function ProdottiPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsGestore>;
}) {
  const { supabase } = await requireGestore();
  const sp = await searchParams;
  const filtri = parseFiltriGestore(sp);
  const pagina = parsePaginaGestore(sp);

  // Le categorie servono sia alla RPC (espansione del filtro categoria ai
  // discendenti) sia al render (menu + badge), quindi prima; poi prodotti e
  // conteggi in parallelo.
  const categorie = await caricaCategorie(supabase);
  const [esito, conteggi, ultimoSync] = await Promise.all([
    caricaProdottiGestore(supabase, { filtri, pagina, categorie }),
    caricaConteggiCategorieGestore(supabase),
    leggiUltimoSync(supabase),
  ]);

  return (
    <>
      <BannerSyncGiacenze ultimo={ultimoSync} />
      <ListaProdotti
        prodotti={esito.prodotti}
        totale={esito.totale}
        filtri={filtri}
        pagina={pagina}
        categorie={categorie}
        conteggi={conteggi}
      />
    </>
  );
}
