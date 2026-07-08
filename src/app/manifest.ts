import type { MetadataRoute } from "next";

// Web App Manifest: rende il sito installabile come app (menu "Installa" di
// Chrome/Edge su Windows, macOS e Android; su iOS Safari usa l'apple-icon e
// "Aggiungi alla schermata Home", e da iOS 16.4 legge anche questo manifest).
// Le icone sono PNG statici in public/ — stesso design di apple-icon.tsx —
// perché il manifest richiede URL stabili, non route con hash di build.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Anna Shop",
    short_name: "Anna Shop",
    description:
      "Abbigliamento fresco e leggero a Rimini: guarda il catalogo e ordina online.",
    lang: "it",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0077c8",
    icons: [
      {
        src: "/icona-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icona-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // "maskable": Android ritaglia l'icona (cerchio/squircle); qui la "A"
      // sta nella safe zone centrale e lo sfondo riempie tutta la tela.
      {
        src: "/icona-192-maskable.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icona-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
