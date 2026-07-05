import type { MetadataRoute } from "next";

import { createServerSupabase } from "@/lib/supabase/server";

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
  ];

  try {
    const supabase = await createServerSupabase();
    if (!supabase) return statiche;

    const [prodRes, catRes] = await Promise.all([
      supabase.from("prodotti").select("slug").eq("attivo", true),
      supabase.from("categorie").select("slug"),
    ]);

    const prodotti: MetadataRoute.Sitemap = (prodRes.data ?? []).map((p) => ({
      url: `${SITE}/prodotti/${p.slug}`,
      changeFrequency: "weekly",
      priority: 0.8,
    }));

    const categorie: MetadataRoute.Sitemap = (catRes.data ?? []).map((c) => ({
      url: `${SITE}/categoria/${c.slug}`,
      changeFrequency: "weekly",
      priority: 0.7,
    }));

    return [...statiche, ...categorie, ...prodotti];
  } catch {
    return statiche;
  }
}
