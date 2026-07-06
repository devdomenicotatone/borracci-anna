// Orchestratore della home a fasce: mappa ogni sezione curata al suo
// componente, nell'ordine deciso dal gestore. La prima fascia di prodotti
// riceve la priorita LCP sulle sue prime card.

import type { GruppoCategorie } from "@/lib/categorie-albero";
import type { FasciaVetrina } from "@/lib/vetrina-home";
import Wordmark from "@/components/Wordmark";
import FasciaHero from "@/components/vetrina/FasciaHero";
import FasciaBanner from "@/components/vetrina/FasciaBanner";
import FasciaCategorie from "@/components/vetrina/FasciaCategorie";
import CaroselloProdotti from "@/components/vetrina/CaroselloProdotti";

export default function Vetrina({
  fasce,
  gruppi,
}: {
  fasce: FasciaVetrina[];
  gruppi: GruppoCategorie[];
}) {
  if (fasce.length === 0) {
    return (
      <section className="mx-auto max-w-6xl px-5 py-24 text-center">
        <Wordmark className="select-none text-3xl opacity-60" />
        <p className="mt-4 text-sm text-muted">
          La vetrina è in aggiornamento. Torna presto.
        </p>
      </section>
    );
  }

  // La prima fascia di prodotti guida l'LCP: le sue prime card sono eager.
  const primaFasciaProdotti = fasce.find(
    (f) => f.tipo === "prodotti_manuale" || f.tipo === "prodotti_auto",
  )?.id;

  return (
    <>
      {fasce.map((fascia) => {
        switch (fascia.tipo) {
          case "hero":
            return <FasciaHero key={fascia.id} fascia={fascia} />;
          case "banner":
            return <FasciaBanner key={fascia.id} fascia={fascia} />;
          case "categorie":
            return (
              <FasciaCategorie key={fascia.id} fascia={fascia} gruppi={gruppi} />
            );
          case "prodotti_manuale":
          case "prodotti_auto":
            return (
              <CaroselloProdotti
                key={fascia.id}
                fascia={fascia}
                prioritaPrimi={fascia.id === primaFasciaProdotti}
              />
            );
          default:
            return null;
        }
      })}
      {/* Chiusura pagina: un filo d'aria sotto l'ultima fascia. */}
      <div className="pb-12 sm:pb-16" />
    </>
  );
}
