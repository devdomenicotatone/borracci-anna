import type { MetadataRoute } from "next";

// Manifest della PWA "Anna Gestore", app SEPARATA dalla vetrina: scope e
// start_url sotto /gestore, id proprio, icone scure. Route handler perche' la
// convention manifest.ts vale solo nella root di app/. Il proxy lo lascia
// passare (estensione .webmanifest esclusa dal matcher): Chrome scarica il
// manifest SENZA cookie e un redirect alla login lo renderebbe illeggibile
// (app non installabile). E' un file pubblico come ogni asset: la protezione
// dell'area resta la login + RLS, installare l'app non da' alcun accesso.

const manifest: MetadataRoute.Manifest = {
  id: "/gestore",
  name: "Anna Gestore",
  short_name: "Anna Gestore",
  description: "Catalogo, ordini e vetrina di Anna Shop — area gestore.",
  lang: "it",
  start_url: "/gestore",
  scope: "/gestore",
  display: "standalone",
  background_color: "#0a1f33",
  theme_color: "#0a1f33",
  icons: [
    {
      src: "/gestore-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/gestore-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/gestore-192-maskable.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "maskable",
    },
    {
      src: "/gestore-512-maskable.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
  // Tasto destro sull'icona dell'app (Windows/Android): salti diretti.
  shortcuts: [
    {
      name: "Ordini",
      url: "/gestore/ordini",
      icons: [{ src: "/gestore-192.png", sizes: "192x192", type: "image/png" }],
    },
    {
      name: "Prodotti",
      url: "/gestore/prodotti",
      icons: [{ src: "/gestore-192.png", sizes: "192x192", type: "image/png" }],
    },
    {
      name: "Nuovo prodotto",
      url: "/gestore/prodotti/nuovo",
      icons: [{ src: "/gestore-192.png", sizes: "192x192", type: "image/png" }],
    },
  ],
};

export function GET() {
  return Response.json(manifest, {
    headers: { "content-type": "application/manifest+json" },
  });
}
