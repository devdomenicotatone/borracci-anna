import type { MetadataRoute } from "next";

import {
  PERCORSO_CONDIZIONI,
  PERCORSO_PRIVACY,
  PERCORSO_RECESSO,
} from "@/lib/legale";
import { createServerSupabase } from "@/lib/supabase/server";
import { leggiTutteLeRighe } from "@/lib/supabase/scansione";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Sitemap: pagine statiche + una entry per ogni prodotto attivo e per ogni
// pagina categoria. Degrada alle sole pagine statiche se Supabase non e
// configurato o la query fallisce.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const statiche: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1 },
    {
      url: `${SITE}/vieni-a-trovarci`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    ...[PERCORSO_CONDIZIONI, PERCORSO_RECESSO, PERCORSO_PRIVACY].map(
      (percorso) => ({
        url: `${SITE}${percorso}`,
        changeFrequency: "yearly" as const,
        priority: 0.3,
      }),
    ),
  ];

  try {
    const supabase = await createServerSupabase();
    if (!supabase) return statiche;

    // Scansione a blocchi: il catalogo supera le 1000 righe e una select non
    // paginata verrebbe troncata a max-rows, lasciando ~metà delle schede fuori
    // dalla sitemap (e quindi fuori dall'indice) in silenzio. L'ordine per id
    // rende stabile la paginazione.
    const [prodottiRighe, categorieRighe] = await Promise.all([
      leggiTutteLeRighe<{ slug: string; categoria_id: string | null }>(
        (conteggio) =>
          supabase
            .from("prodotti")
            .select(
              "slug, categoria_id",
              conteggio ? { count: "exact" } : undefined,
            )
            .eq("attivo", true)
            .order("id", { ascending: true }),
      ),
      leggiTutteLeRighe<{ id: string; slug: string; parent_id: string | null }>(
        (conteggio) =>
          supabase
            .from("categorie")
            .select(
              "id, slug, parent_id",
              conteggio ? { count: "exact" } : undefined,
            )
            .order("id", { ascending: true }),
      ),
    ]);

    const prodotti: MetadataRoute.Sitemap = prodottiRighe.map((p) => ({
      url: `${SITE}/prodotti/${p.slug}`,
      changeFrequency: "weekly",
      priority: 0.8,
    }));

    // In sitemap entrano solo le categorie col SOTTOALBERO non vuoto: una
    // foglia senza prodotti attivi risponde 200 col solo "nessun prodotto"
    // (soft-404 dichiarato come contenuto da indicizzare — audit SEO 2026-07).
    // Le macro vivono dei prodotti dei discendenti, quindi si risale: ogni
    // categoria con prodotti "accende" tutti i suoi antenati. Le pagine
    // restano comunque raggiungibili dalla navigazione.
    const perId = new Map(categorieRighe.map((c) => [c.id, c]));
    const vive = new Set<string>();
    for (const p of prodottiRighe) {
      let corrente = p.categoria_id ? perId.get(p.categoria_id) : undefined;
      const visti = new Set<string>();
      while (corrente && !visti.has(corrente.id)) {
        visti.add(corrente.id);
        vive.add(corrente.id);
        corrente = corrente.parent_id
          ? perId.get(corrente.parent_id)
          : undefined;
      }
    }

    const categorie: MetadataRoute.Sitemap = categorieRighe
      .filter((c) => vive.has(c.id))
      .map((c) => ({
        url: `${SITE}/categoria/${c.slug}`,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));

    return [...statiche, ...categorie, ...prodotti];
  } catch {
    return statiche;
  }
}
