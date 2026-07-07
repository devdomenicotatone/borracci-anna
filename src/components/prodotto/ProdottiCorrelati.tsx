// Sezione "Ti potrebbe piacere anche" in fondo alla scheda prodotto.
// Server component async: carica i correlati (calcolo lato Postgres, cachato) e
// li mostra nella stessa griglia della vetrina, riusando ProductCard.
// Non si mostra se i correlati sono troppo pochi (evita una fila sguarnita).

import ProductCard from "@/components/ProductCard";
import { caricaProdottiCorrelati, CORRELATI_LIMITE } from "@/lib/correlati";

/** Sotto questa soglia la sezione non compare (meglio niente che 1-2 card sole). */
const MIN_CORRELATI = 3;

export default async function ProdottiCorrelati({ slug }: { slug: string }) {
  const prodotti = await caricaProdottiCorrelati(slug, CORRELATI_LIMITE);

  if (prodotti.length < MIN_CORRELATI) return null;

  return (
    <section
      aria-labelledby="correlati-heading"
      className="mt-14 border-t border-line pt-10"
    >
      <p className="mb-1 font-display text-xs font-bold uppercase tracking-wide text-sea">
        Della stessa collezione
      </p>
      <h2
        id="correlati-heading"
        className="mb-6 font-display text-2xl font-bold text-foreground"
      >
        Ti potrebbe piacere anche
      </h2>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
        {prodotti.map((prodotto) => (
          <ProductCard key={prodotto.id} prodotto={prodotto} />
        ))}
      </div>
    </section>
  );
}
