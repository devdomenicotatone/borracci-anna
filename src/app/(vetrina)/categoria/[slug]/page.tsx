// Pagina categoria: /categoria/uomo, /categoria/polo, ...
// Stessa griglia con filtri/ordinamento della home ma ristretta alla categoria
// e alle sue discendenti. Breadcrumb (visivo + JSON-LD), chip di navigazione
// tra sottocategorie/sorelle che CONSERVANO i filtri attivi, metadata SEO.
// Senza env Supabase degrada a una pagina demo (come il resto della vetrina).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import CatalogoSezione from "@/components/catalogo/CatalogoSezione";
import { caricaCategoriePubbliche } from "@/lib/categorie";
import {
  categoriaPerSlug,
  figlieDi,
  idConDiscendenti,
  percorsoCategoria,
} from "@/lib/categorie-albero";
import {
  parseFiltri,
  parsePagina,
  serializzaFiltri,
  type SearchParamsCatalogo,
} from "@/lib/filtri-catalogo";
import { createServerSupabase } from "@/lib/supabase/server";
import { caricaFacetteVetrina, caricaProdottiVetrina } from "@/lib/vetrina";
import type { Categoria } from "@/lib/types";

// I dati arrivano dal DB in base alla richiesta: niente prerender statico.
export const dynamic = "force-dynamic";

interface PropsPagina {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParamsCatalogo>;
}

/** "polo-manica-lunga" -> "Polo manica lunga" (solo per la demo senza env). */
function nomeDaSlug(slug: string): string {
  const s = decodeURIComponent(slug).replace(/-/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const categorie = await caricaCategoriePubbliche();
  const cat = categoriaPerSlug(categorie, slug);
  if (!cat) return { title: nomeDaSlug(slug) };

  const percorso = percorsoCategoria(categorie, cat.id);
  // "Polo Uomo" per le figlie, "Uomo" per le macro: piu parlante nei risultati.
  const titolo =
    percorso.length === 2 ? `${cat.nome} ${percorso[0].nome}` : cat.nome;

  return {
    title: titolo,
    description: `${titolo} da Anna Shop, il negozio di abbigliamento sul lungomare di Rimini. Scopri la selezione: te la spediamo a casa o la ritiri in negozio.`,
    alternates: { canonical: `/categoria/${slug}` },
  };
}

export default async function CategoriaPage({
  params,
  searchParams,
}: PropsPagina) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const filtri = parseFiltri(sp);
  const pagina = parsePagina(sp);

  const supabase = await createServerSupabase();
  const categorie = await caricaCategoriePubbliche();

  let cat = categoriaPerSlug(categorie, slug);
  if (!cat) {
    // Con DB connesso uno slug ignoto e un vero 404. Senza env (build/anteprima)
    // la pagina rende comunque, con nome derivato dallo slug e griglia demo.
    if (supabase) notFound();
    cat = { id: "demo", slug, nome: nomeDaSlug(slug), parent_id: null, ordine: 0 };
  }

  const ids = idConDiscendenti(categorie, cat.id);
  const [esito, facette] = await Promise.all([
    caricaProdottiVetrina(supabase, { filtri, categoriaIds: ids, pagina }),
    caricaFacetteVetrina(supabase, ids),
  ]);

  const percorsoDb = percorsoCategoria(categorie, cat.id);
  const percorso = percorsoDb.length > 0 ? percorsoDb : [cat];
  const padre = percorso.length === 2 ? percorso[0] : null;
  const figlie = figlieDi(categorie, cat.id);
  // Chip di navigazione: le figlie per una macro, le sorelle per una figlia.
  const chips: Categoria[] = figlie.length > 0 ? figlie : padre ? figlieDi(categorie, padre.id) : [];
  const radiceChips = padre ?? cat;

  // Cambiando categoria dai chip si conservano filtri e ordinamento correnti.
  const qsCorrente = serializzaFiltri(filtri);
  const hrefCategoria = (c: Categoria) =>
    qsCorrente ? `/categoria/${c.slug}?${qsCorrente}` : `/categoria/${c.slug}`;

  // JSON-LD BreadcrumbList: Home > (Uomo >) Polo.
  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${SITE}/`,
      },
      ...percorso.map((c, i) => ({
        "@type": "ListItem",
        position: i + 2,
        name: c.nome,
        item: `${SITE}/categoria/${c.slug}`,
      })),
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbLd).replace(/</g, "\\u003c"),
        }}
      />

      {/* Intestazione categoria */}
      <section className="mx-auto max-w-6xl px-5 pt-8 sm:pt-10">
        {/* Breadcrumb */}
        <nav aria-label="Percorso" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
            <li>
              <Link
                href="/"
                className="rounded-full transition-colors hover:text-sea"
              >
                Home
              </Link>
            </li>
            {percorso.map((c, i) => {
              const ultimo = i === percorso.length - 1;
              return (
                <li key={c.id} className="flex items-center gap-1.5">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3.5 w-3.5 text-line"
                    aria-hidden="true"
                  >
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                  {ultimo ? (
                    <span aria-current="page" className="font-medium text-foreground">
                      {c.nome}
                    </span>
                  ) : (
                    <Link
                      href={`/categoria/${c.slug}`}
                      className="transition-colors hover:text-sea"
                    >
                      {c.nome}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <h1 className="font-display text-3xl font-extrabold leading-tight text-foreground sm:text-4xl">
          {cat.nome}
        </h1>

        {/* Chip sottocategorie (o sorelle, per navigare in orizzontale) */}
        {chips.length > 0 && (
          <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link
              href={hrefCategoria(radiceChips)}
              aria-current={radiceChips.id === cat.id ? "page" : undefined}
              className={[
                "shrink-0 rounded-full px-4 py-2 font-display text-sm font-bold transition-all",
                radiceChips.id === cat.id
                  ? "bg-sea text-white shadow-sea"
                  : "bg-white text-foreground ring-1 ring-line hover:ring-sea",
              ].join(" ")}
            >
              Tutto {radiceChips.nome}
            </Link>
            {chips.map((c) => (
              <Link
                key={c.id}
                href={hrefCategoria(c)}
                aria-current={c.id === cat.id ? "page" : undefined}
                className={[
                  "shrink-0 rounded-full px-4 py-2 font-display text-sm font-bold transition-all",
                  c.id === cat.id
                    ? "bg-sea text-white shadow-sea"
                    : "bg-white text-foreground ring-1 ring-line hover:ring-sea",
                ].join(" ")}
              >
                {c.nome}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Griglia con filtri */}
      <section
        aria-label={`Prodotti della categoria ${cat.nome}`}
        className="mx-auto max-w-6xl px-5 py-8 sm:py-10"
      >
        <CatalogoSezione
          basePath={`/categoria/${cat.slug}`}
          filtri={filtri}
          pagina={pagina}
          facette={facette}
          prodotti={esito.prodotti}
          totale={esito.totale}
          messaggioVuoto="Non ci sono ancora prodotti in questa categoria. Torna presto!"
        />
      </section>
    </>
  );
}
