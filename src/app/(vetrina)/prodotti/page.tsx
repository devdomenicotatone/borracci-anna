// Catalogo completo "/prodotti": tutti i prodotti attivi con toolbar filtri e
// ordinamento (stato nell'URL). E la destinazione dei "Vedi tutti" delle fasce
// della home non legate a una categoria. Riusa lo stesso blocco catalogo delle
// pagine categoria (CatalogoSezione). Coesiste con /prodotti/[slug] (la PDP).

import type { Metadata } from "next";

import CatalogoSezione from "@/components/catalogo/CatalogoSezione";
import OcchielloSezione from "@/components/vetrina/OcchielloSezione";
import {
  parseFiltri,
  parsePagina,
  type SearchParamsCatalogo,
} from "@/lib/filtri-catalogo";
import { createServerSupabase } from "@/lib/supabase/server";
import { caricaFacetteVetrina, caricaProdottiVetrina } from "@/lib/vetrina";

// I dati arrivano dal DB in base a filtri/pagina (searchParams): niente
// prerender statico.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tutti i prodotti",
  description:
    "Sfoglia tutta la collezione di Anna Shop: filtra per taglia, colore e prezzo.",
  alternates: { canonical: "/prodotti" },
};

export default async function CatalogoCompleto({
  searchParams,
}: {
  searchParams: Promise<SearchParamsCatalogo>;
}) {
  const sp = await searchParams;
  const filtri = parseFiltri(sp);
  const pagina = parsePagina(sp);

  const supabase = await createServerSupabase();
  const [esito, facette] = await Promise.all([
    caricaProdottiVetrina(supabase, { filtri, pagina }),
    caricaFacetteVetrina(supabase),
  ]);

  return (
    <section className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
      <div className="mb-8 sm:mb-10">
        <OcchielloSezione>Catalogo</OcchielloSezione>
        <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight text-foreground sm:text-4xl">
          Tutti i prodotti
        </h1>
      </div>

      <CatalogoSezione
        basePath="/prodotti"
        filtri={filtri}
        pagina={pagina}
        facette={facette}
        prodotti={esito.prodotti}
        totale={esito.totale}
      />
    </section>
  );
}
