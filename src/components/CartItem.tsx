"use client";

// Riga del carrello (client component).
// Permette di modificare la quantita (aggiornaQuantita) e rimuovere la riga
// (rimuoviDalCarrello). Le mutazioni sono Server Actions: durante l'attesa la
// riga viene messa in stato "in aggiornamento" tramite useTransition.

import Image from "next/image";
import { useTransition } from "react";

import { aggiornaQuantita, rimuoviDalCarrello } from "@/lib/cart";
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

export default function CartItem({ riga }: { riga: RigaCarrello }) {
  const [inAttesa, startTransition] = useTransition();

  const variante = etichettaVariante(riga);
  const subtotale = riga.prodotto.prezzo_cents * riga.quantita;
  // Non superare lo stock disponibile della variante.
  const maxQuantita = Math.max(riga.variante.stock, riga.quantita);

  function impostaQuantita(nuova: number) {
    if (nuova === riga.quantita) {
      return;
    }
    startTransition(async () => {
      await aggiornaQuantita(riga.id, nuova);
    });
  }

  function rimuovi() {
    startTransition(async () => {
      await rimuoviDalCarrello(riga.id);
    });
  }

  return (
    <li
      className={`flex gap-4 py-5 transition-opacity ${
        inAttesa ? "opacity-50" : "opacity-100"
      }`}
      aria-busy={inAttesa}
    >
      {/* Immagine prodotto */}
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl">
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
      <div className="flex flex-1 flex-col justify-between gap-2">
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
              disabled={inAttesa}
              aria-label="Diminuisci quantita"
              className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold text-sea transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
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
              className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold text-sea transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              +
            </button>
          </div>

          {/* Rimuovi */}
          <button
            type="button"
            onClick={rimuovi}
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
 * Bottone "Vai al pagamento": fa POST a /api/checkout e redirige all'URL
 * della sessione Stripe restituita. Co-locato qui per restare un client
 * component senza aggiungere altri file.
 */
export function CheckoutButton({ disabilitato = false }: { disabilitato?: boolean }) {
  const [inAttesa, startTransition] = useTransition();

  function vaiAlPagamento() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/checkout", { method: "POST" });
        if (!res.ok) {
          return;
        }
        const dati: { url?: string } = await res.json();
        if (dati.url) {
          window.location.href = dati.url;
        }
      } catch {
        // Silenzioso: in caso di errore l'utente resta sul carrello.
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
