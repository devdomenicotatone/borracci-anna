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

/**
 * Metadata consapevole della paginazione (audit SEO 2026-07): le pagine
 * ?pagina=N rendono il CUMULATO (non un duplicato della base), quindi
 * canonicalizzarle tutte sulla pagina 1 era un hint che Google puo' rigettare
 * (index bloat con title identici). Per pagina > 1: titolo distinto, noindex
 * (follow: i link alle PDP profonde restano seguibili) e nessun canonical.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParamsCatalogo>;
}): Promise<Metadata> {
  const pagina = parsePagina(await searchParams);
  const descrizione =
    "Sfoglia tutta la collezione di Anna Shop, il negozio di abbigliamento sul lungomare di Rimini: filtra per taglia, colore e prezzo, spedizione in tutta Italia.";
  if (pagina > 1) {
    return {
      title: `Tutti i prodotti — pagina ${pagina}`,
      description: descrizione,
      robots: { index: false, follow: true },
    };
  }
  return {
    title: "Tutti i prodotti",
    description: descrizione,
    alternates: { canonical: "/prodotti" },
  };
}

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

  // xl:max-w-7xl: sui desktop larghi il catalogo passa a 5 colonne (griglia in
  // CatalogoSezione) — prima usava 1112px fissi anche a 1920.
  return (
    <section className="mx-auto max-w-6xl px-5 py-12 sm:py-16 xl:max-w-7xl">
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
