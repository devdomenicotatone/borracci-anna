// Helper puri sull'albero categorie (2 livelli: macro > figlie).
// Nessuna dipendenza server: usabili sia nei Server Component (vetrina,
// pagine categoria, sitemap) sia nei client component (menu, select, filtri).
// Il criterio di ordinamento (ordine, poi id) e lo stesso del pannello gestore.

import type { Categoria } from "@/lib/types";

/** Confronto standard: `ordine` ascendente con tie-break stabile per id. */
function confrontaCategorie(a: Categoria, b: Categoria): number {
  return a.ordine - b.ordine || a.id.localeCompare(b.id);
}

/** Categorie di primo livello (macro), ordinate. */
export function radiciCategorie(categorie: Categoria[]): Categoria[] {
  return categorie.filter((c) => !c.parent_id).sort(confrontaCategorie);
}

/** Figlie dirette di una categoria, ordinate. */
export function figlieDi(categorie: Categoria[], id: string): Categoria[] {
  return categorie.filter((c) => c.parent_id === id).sort(confrontaCategorie);
}

/** Macro con le rispettive figlie: la forma usata da menu, select e filtri. */
export interface GruppoCategorie {
  radice: Categoria;
  figlie: Categoria[];
}

export function gruppiCategorie(categorie: Categoria[]): GruppoCategorie[] {
  return radiciCategorie(categorie).map((radice) => ({
    radice,
    figlie: figlieDi(categorie, radice.id),
  }));
}

/**
 * Id della categoria + di tutte le sue discendenti. Filtrare per una macro
 * (es. Uomo) deve includere i prodotti delle figlie (Polo, Coreane).
 */
export function idConDiscendenti(categorie: Categoria[], id: string): string[] {
  return [id, ...figlieDi(categorie, id).map((f) => f.id)];
}

/** Percorso dalla macro alla categoria (es. [Uomo, Polo]); [] se id ignoto. */
export function percorsoCategoria(
  categorie: Categoria[],
  id: string,
): Categoria[] {
  const cat = categorie.find((c) => c.id === id);
  if (!cat) return [];
  const padre = cat.parent_id
    ? categorie.find((c) => c.id === cat.parent_id)
    : null;
  return padre ? [padre, cat] : [cat];
}

/** Etichetta compatta "Uomo · Polo" (solo "Uomo" per le macro). */
export function etichettaCategoria(
  categorie: Categoria[],
  id: string,
): string {
  return percorsoCategoria(categorie, id)
    .map((c) => c.nome)
    .join(" · ");
}

/** Categoria per slug (gli slug sono univoci a DB). */
export function categoriaPerSlug(
  categorie: Categoria[],
  slug: string,
): Categoria | null {
  return categorie.find((c) => c.slug === slug) ?? null;
}
