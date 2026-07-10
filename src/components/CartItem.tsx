"use client";

// Riga del carrello (client component), usata sia nella pagina /carrello sia
// nel mini-cart drawer (prop `compatto`). Le mutazioni passano dal CartProvider
// (aggiorna/rimuovi) cosi badge, totali e drawer restano sincronizzati con
// feedback ottimistico. Lo useTransition locale gestisce il pending della riga
// (e fornisce la transition richiesta dal dispatch ottimistico del provider).

import Image from "next/image";
import { useTransition } from "react";

import { useCarrello } from "@/components/cart/CartProvider";
import { useToast } from "@/components/Toaster";
import { formatPrezzo } from "@/lib/format";
import type { RigaCarrello } from "@/lib/types";

/** Compone l'etichetta della variante (es. "Taglia M · Rosso"). */
function etichettaVariante(riga: RigaCarrello): string | null {
  const parti: string[] = [];
  if (riga.variante.taglia) {
    parti.push(`Taglia ${riga.variante.taglia}`);
  }
  if (riga.variante.colore) {
    parti.push(riga.variante.colore);
  }
  return parti.length > 0 ? parti.join(" · ") : null;
}

export default function CartItem({
  riga,
  compatto = false,
}: {
  riga: RigaCarrello;
  compatto?: boolean;
}) {
  const { aggiorna, rimuovi } = useCarrello();
  const [inAttesa, startTransition] = useTransition();

  const variante = etichettaVariante(riga);
  const subtotale = riga.prodotto.prezzo_cents * riga.quantita;
  // Su richiesta: magazzino non in tempo reale -> nessun cap di stock sul "+"
  // e nessun avviso "Solo N rimasti" (coerente con la PDP e il flusso richiesta).
  const suRichiesta = riga.prodotto.disponibilita_su_richiesta ?? false;
  const maxQuantita = suRichiesta
    ? Number.POSITIVE_INFINITY
    : Math.max(riga.variante.stock, riga.quantita);
  const stockBasso =
    !suRichiesta && riga.variante.stock > 0 && riga.variante.stock <= 3;
  const lato = compatto ? "h-20 w-20" : "h-24 w-24";

  function impostaQuantita(nuova: number) {
    if (nuova === riga.quantita || nuova < 1) {
      return;
    }
    // La chiamata al provider (dispatch ottimistico) sta dentro la transition.
    startTransition(async () => {
      await aggiorna(riga.id, nuova);
    });
  }

  function rimuoviRiga() {
    startTransition(async () => {
      await rimuovi(riga.id);
    });
  }

  return (
    <li
      className={`flex gap-4 transition-opacity ${compatto ? "py-4" : "py-5"} ${
        inAttesa ? "opacity-60" : "opacity-100"
      }`}
      aria-busy={inAttesa}
    >
      {/* Immagine prodotto */}
      <div
        className={`relative ${lato} shrink-0 overflow-hidden rounded-2xl`}
      >
        {riga.prodotto.immagine_url ? (
          <Image
            src={riga.prodotto.immagine_url}
            alt={riga.prodotto.nome}
            fill
            sizes="96px"
            className="object-cover"
          />
        ) : (
          <div className="tile-cyan flex h-full w-full items-center justify-center">
            <svg
              className="w-1/2 text-white drop-shadow-[0_4px_8px_rgba(0,40,70,0.25)]"
              viewBox="0 0 100 100"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M32 18 L18 28 L24 40 L31 35 L31 84 L69 84 L69 35 L76 40 L82 28 L68 18 C64 24 56 26 50 26 C44 26 36 24 32 18 Z" />
            </svg>
          </div>
        )}
      </div>

      {/* Dettagli */}
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        <div className="flex justify-between gap-4">
          <div className="min-w-0">
            <h3 className="truncate font-display font-bold text-foreground">
              {riga.prodotto.nome}
            </h3>
            {variante && (
              <p className="mt-0.5 text-sm text-muted">{variante}</p>
            )}
            <p className="mt-0.5 text-sm text-muted">
              {formatPrezzo(riga.prodotto.prezzo_cents, riga.prodotto.valuta)}{" "}
              cad.
            </p>
            {stockBasso && (
              <p className="mt-1 text-xs font-semibold text-coral-ink">
                Solo {riga.variante.stock} rimasti
              </p>
            )}
          </div>
          <p className="shrink-0 font-display font-bold text-sea">
            {formatPrezzo(subtotale, riga.prodotto.valuta)}
          </p>
        </div>

        <div className="flex items-center justify-between gap-4">
          {/* Selettore quantita */}
          <div className="flex items-center gap-1 rounded-full bg-white p-1 ring-2 ring-surface-2">
            <button
              type="button"
              onClick={() => impostaQuantita(riga.quantita - 1)}
              disabled={inAttesa || riga.quantita <= 1}
              aria-label="Diminuisci quantita"
              className="flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold text-sea transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
            >
              −
            </button>
            <span
              className="w-8 text-center font-display text-sm font-bold tabular-nums text-foreground"
              aria-live="polite"
            >
              {riga.quantita}
            </span>
            <button
              type="button"
              onClick={() => impostaQuantita(riga.quantita + 1)}
              disabled={inAttesa || riga.quantita >= maxQuantita}
              aria-label="Aumenta quantita"
              className="flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold text-sea transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
            >
              +
            </button>
          </div>

          {/* Rimuovi */}
          <button
            type="button"
            onClick={rimuoviRiga}
            disabled={inAttesa}
            className="text-sm font-medium text-muted underline-offset-2 transition-colors hover:text-coral hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            Rimuovi
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * Bottone "Vai al pagamento": fa POST a /api/checkout e redirige all'URL della
 * sessione Stripe. Gli errori NON sono piu silenziosi: vengono mostrati con il
 * Toaster (role="alert"), e un AbortController evita lo stato "Reindirizzamento"
 * infinito su rete lenta.
 */
export function CheckoutButton({
  disabilitato = false,
}: {
  disabilitato?: boolean;
}) {
  const { mostra } = useToast();
  const { ricarica } = useCarrello();
  const [inAttesa, startTransition] = useTransition();

  function vaiAlPagamento() {
    startTransition(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch("/api/checkout", {
          method: "POST",
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
          let messaggio = "Non è stato possibile avviare il pagamento. Riprova.";
          if (res.status === 400) {
            messaggio = "Il carrello è vuoto.";
          } else if (res.status === 501) {
            messaggio = "Pagamenti non disponibili al momento. Scrivici per ordinare.";
          } else {
            try {
              const dati: { errore?: string } = await res.json();
              if (dati?.errore) messaggio = dati.errore;
            } catch {
              // body non-JSON: resta il messaggio generico.
            }
          }
          mostra(messaggio, "errore");
          // 409 = il server ha riconciliato il carrello alle giacenze (rimosso o
          // cappato righe). Rileggilo cosi la lista mostrata riflette subito le
          // modifiche di cui parla il messaggio, invece di restare stale.
          if (res.status === 409) await ricarica();
          return;
        }

        const dati: { url?: string } = await res.json();
        if (dati.url) {
          window.location.href = dati.url;
        } else {
          mostra("Risposta di pagamento non valida. Riprova.", "errore");
        }
      } catch (err) {
        clearTimeout(timeout);
        const messaggio =
          err instanceof DOMException && err.name === "AbortError"
            ? "Il pagamento sta impiegando troppo tempo. Riprova."
            : "Si e verificato un problema. Riprova.";
        mostra(messaggio, "errore");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={vaiAlPagamento}
      disabled={disabilitato || inAttesa}
      className="flex h-12 w-full items-center justify-center rounded-full bg-sea px-6 font-display font-bold text-white shadow-sea transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
    >
      {inAttesa ? "Reindirizzamento…" : "Vai al pagamento"}
    </button>
  );
}
