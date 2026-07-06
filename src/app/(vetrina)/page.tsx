// Vetrina "Anna Shop": home a fasce curate dal pannello (hero, banner,
// scorciatoie categoria, caroselli di prodotti scelti a mano o per regola).
// Legge le sezioni da Supabase lato server; se le env mancano degrada a una
// vetrina d'esempio (lib/vetrina-home), cosi la pagina rende SEMPRE.

import type { Metadata } from "next";

import Vetrina from "@/components/vetrina/Vetrina";
import { caricaCategoriePubbliche } from "@/lib/categorie";
import { gruppiCategorie } from "@/lib/categorie-albero";
import { NEGOZIO } from "@/lib/negozio";
import { createServerSupabase } from "@/lib/supabase/server";
import { caricaVetrina } from "@/lib/vetrina-home";

// Le fasce arrivano dal DB e cambiano quando il gestore le modifica
// (revalidatePath("/") nelle action): niente prerender statico.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function Home() {
  const supabase = await createServerSupabase();
  const [fasce, categorie] = await Promise.all([
    caricaVetrina(supabase),
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
    ...(SITE ? { "@id": SITE, url: SITE } : {}),
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
    openingHours: "Mo-Su 09:00-24:00",
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
