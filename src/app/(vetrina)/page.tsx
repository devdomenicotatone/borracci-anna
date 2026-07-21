// Vetrina "Anna Shop": home a fasce curate dal pannello (hero, banner,
// scorciatoie categoria, caroselli di prodotti scelti a mano o per regola).
// Legge le sezioni da Supabase lato server; se le env mancano degrada a una
// vetrina d'esempio (lib/vetrina-home), cosi la pagina rende SEMPRE.

import type { Metadata } from "next";

import Vetrina from "@/components/vetrina/Vetrina";
import { caricaCategoriePubbliche } from "@/lib/categorie";
import { gruppiCategorie } from "@/lib/categorie-albero";
import { NEGOZIO } from "@/lib/negozio";
import { caricaVetrinaCache } from "@/lib/vetrina-home";

// Le fasce sono cachate (unstable_cache + TAG_VETRINA_HOME) invece di girare a
// ogni richiesta: le modifiche del gestore/sync invalidano via revalidateTag.
// Niente piu force-dynamic (che rendeva le query non cacheabili).

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function Home() {
  const [fasce, categorie] = await Promise.all([
    caricaVetrinaCache(),
    caricaCategoriePubbliche(),
  ]);
  const gruppi = gruppiCategorie(categorie);

  // Dati strutturati (schema.org): aiuta Google a capire che è un negozio di
  // abbigliamento a Rimini, con indirizzo, contatti e orari.
  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const datiStrutturati = {
    "@context": "https://schema.org",
    "@type": "ClothingStore",
    name: "Anna Shop",
    legalName: NEGOZIO.ragioneSociale,
    // @id con frammento dedicato: la radice nuda colliderebbe con un futuro
    // nodo WebSite. image e' richiesta dal pannello LocalBusiness: in assenza
    // di una foto del negozio si usa la card OG di radice (audit SEO 2026-07).
    ...(SITE
      ? { "@id": `${SITE}/#negozio`, url: SITE, image: `${SITE}/opengraph-image` }
      : {}),
    telephone: NEGOZIO.telefono,
    email: NEGOZIO.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: NEGOZIO.indirizzo.via,
      addressLocality: NEGOZIO.indirizzo.citta,
      postalCode: NEGOZIO.indirizzo.cap,
      addressRegion: NEGOZIO.indirizzo.provincia,
      addressCountry: "IT",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: NEGOZIO.coordinate.lat,
      longitude: NEGOZIO.coordinate.lng,
    },
    // Derivato dall'unica fonte NEGOZIO.orariStrutturati. Negozio STAGIONALE
    // (da Pasqua al 30 settembre): un blocco per ciascun periodo a date
    // fisse, ancorato all'anno corrente al render — il dato non scade mai.
    // Il tratto pasquale (marzo-aprile, inizio mobile ogni anno) non ha date
    // affidabili: vive solo nel testo di NEGOZIO.orari, meglio nessun dato
    // che date sbagliate su Google.
    openingHoursSpecification: NEGOZIO.orariStrutturati.periodi.map((p) => {
      const anno = new Date().getFullYear();
      return {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: NEGOZIO.orariStrutturati.giorni,
        opens: p.apre,
        closes: p.chiude,
        validFrom: `${anno}-${p.validaDa}`,
        validThrough: `${anno}-${p.validaA}`,
      };
    }),
    priceRange: "€-€€",
    vatID: NEGOZIO.partitaIva,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(datiStrutturati).replace(/</g, "\\u003c"),
        }}
      />
      <Vetrina fasce={fasce} gruppi={gruppi} />
    </>
  );
}
