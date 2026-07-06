// Helper puri sull'albero categorie (3 livelli: macro > figlie > nipoti).
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

/** Figlia di secondo livello con le sue eventuali figlie di terzo livello. */
export interface SottogruppoCategorie {
  figlia: Categoria;
  nipoti: Categoria[];
}

/** Macro con figlie e nipoti: la forma usata da menu, select e filtri. */
export interface GruppoCategorie {
  radice: Categoria;
  figlie: SottogruppoCategorie[];
}

export function gruppiCategorie(categorie: Categoria[]): GruppoCategorie[] {
  return radiciCategorie(categorie).map((radice) => ({
    radice,
    figlie: figlieDi(categorie, radice.id).map((figlia) => ({
      figlia,
      nipoti: figlieDi(categorie, figlia.id),
    })),
  }));
}

/**
 * Id della categoria + di tutte le sue discendenti (figlie, nipoti, ...).
 * Filtrare per una macro (es. Uomo) deve includere i prodotti di tutta la
 * discendenza (T-shirt e le sue Manga/Calcio). Visita in ampiezza con guardia
 * sui gia visti: un eventuale ciclo a DB non manda in loop il render.
 */
export function idConDiscendenti(categorie: Categoria[], id: string): string[] {
  const ids = [id];
  const visti = new Set(ids);
  for (let i = 0; i < ids.length; i++) {
    for (const c of categorie) {
      if (c.parent_id === ids[i] && !visti.has(c.id)) {
        visti.add(c.id);
        ids.push(c.id);
      }
    }
  }
  return ids;
}

/**
 * Percorso dalla macro alla categoria (es. [Uomo, T-shirt, Manga]); [] se id
 * ignoto. Risale i parent con guardia sui gia visti (niente loop su cicli).
 */
export function percorsoCategoria(
  categorie: Categoria[],
  id: string,
): Categoria[] {
  const percorso: Categoria[] = [];
  const visti = new Set<string>();
  let cat = categorie.find((c) => c.id === id) ?? null;
  while (cat && !visti.has(cat.id)) {
    visti.add(cat.id);
    percorso.unshift(cat);
    cat = cat.parent_id
      ? (categorie.find((c) => c.id === cat!.parent_id) ?? null)
      : null;
  }
  return percorso;
}

/** Etichetta compatta "Uomo · T-shirt · Manga" (solo "Uomo" per le macro). */
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
