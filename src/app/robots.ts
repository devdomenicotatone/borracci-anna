import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Indicizza la vetrina pubblica; tiene fuori la sola area gestore. Le pagine
// transazionali (carrello, checkout, ordine con token) NON sono in Disallow di
// proposito: hanno il meta noindex, che funziona solo se Googlebot puo'
// crawlarle — un Disallow lo renderebbe illeggibile e un URL bloccato ma
// linkato resta indicizzabile "URL only" (audit SEO 2026-07). Stesso pattern
// gia' usato per /preferiti.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/gestore"],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
