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

      {/* Mobile: rail orizzontale con snap (la griglia 2-col allungava troppo la
          pagina e le righe sotto la prima non le vedeva quasi nessuno); il pb-3
          lascia respirare la shadow-soft dentro il contenitore scrollabile.
          ATTENZIONE: con overflow-x-auto anche overflow-y computa ad auto (spec
          CSS), quindi il rail ritaglia pure in verticale e il pannello quick-add
          taglie — che si apre verso l'alto oltre il bordo della card — verrebbe
          tagliato sul lato start, irraggiungibile scrollando. Rimedio: pt-36 crea
          headroom DENTRO il padding box del rail (l'area di clip è il padding
          box, lì il pannello dipinge libero: basta per ~5 righe di taglie) e
          -mt-36 lo compensa, così il layout non cambia; il box trasparente in più
          copre solo il titolo della sezione e il margine vuoto sopra, mai i
          controlli della scheda prodotto. Da sm in su torna la griglia della
          vetrina (overflow-visible: nessun trucco necessario). */}
      <div className="-mt-36 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-3 pt-36 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mt-0 sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible sm:pb-0 sm:pt-0 lg:grid-cols-4">
        {prodotti.map((prodotto) => (
          // min-w-40: sotto ~355px di viewport 45vw farebbe scendere il pannello
          // quick-add a 1 taglia per riga (pannello altissimo, oltre l'headroom).
          <div
            key={prodotto.id}
            className="w-[45vw] min-w-40 max-w-[220px] shrink-0 snap-start sm:w-auto sm:min-w-0 sm:max-w-none"
          >
            <ProductCard prodotto={prodotto} />
          </div>
        ))}
      </div>
    </section>
  );
}
