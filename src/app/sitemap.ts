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
    const [prodottiSlug, categorieSlug] = await Promise.all([
      leggiTutteLeRighe<{ slug: string }>((conteggio) =>
        supabase
          .from("prodotti")
          .select("slug", conteggio ? { count: "exact" } : undefined)
          .eq("attivo", true)
          .order("id", { ascending: true }),
      ),
      leggiTutteLeRighe<{ slug: string }>((conteggio) =>
        supabase
          .from("categorie")
          .select("slug", conteggio ? { count: "exact" } : undefined)
          .order("id", { ascending: true }),
      ),
    ]);

    const prodotti: MetadataRoute.Sitemap = prodottiSlug.map((p) => ({
      url: `${SITE}/prodotti/${p.slug}`,
      changeFrequency: "weekly",
      priority: 0.8,
    }));

    const categorie: MetadataRoute.Sitemap = categorieSlug.map((c) => ({
      url: `${SITE}/categoria/${c.slug}`,
      changeFrequency: "weekly",
      priority: 0.7,
    }));

    return [...statiche, ...categorie, ...prodotti];
  } catch {
    return statiche;
  }
}
