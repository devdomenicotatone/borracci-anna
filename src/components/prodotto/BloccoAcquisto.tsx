"use client";

// Blocco acquisto della PDP, in DUE modalita che condividono selettore
// quantita e bottone (la scelta di colore/taglia avviene a monte, in
// ProdottoDettaglio: qui arriva gia la variante risolta):
// - vendita diretta: quantita cappata allo stock + "Aggiungi al carrello";
// - su richiesta:    nessun vincolo di giacenza + "Aggiungi alla richiesta"
//   (dal carrello si invia la richiesta, il negozio conferma la disponibilita
//   e solo dopo si paga), col contatto rapido ("Scrivici") in secondo piano.
// Anche la quantita vive a monte, perche e condivisa con la barra mobile: le
// due CTA aggiungono cosi SEMPRE la stessa quantita, in entrambi i flussi.
// Delega al CartProvider (badge ottimistico, mini-cart, toast gestiti li).

import { useState, useTransition } from "react";

import { useCarrello } from "@/components/cart/CartProvider";
import StatoInvio from "@/components/StatoInvio";
import { NEGOZIO } from "@/lib/negozio";
import type { Prodotto, Variante } from "@/lib/types";

export default function BloccoAcquisto({
  prodotto,
  variante,
  quantita,
  onQuantita,
  suRichiesta = false,
  colore = null,
  taglia = null,
}: {
  prodotto: Prodotto;
  variante: Variante | null;
  /** Quantita effettiva (in vendita diretta gia cappata allo stock a monte). */
  quantita: number;
  onQuantita: (n: number) => void;
  /** Modalita "su richiesta": lo stock non vincola, si aggiunge alla richiesta. */
  suRichiesta?: boolean;
  /** Selezione corrente, per errori e contatto rapido (solo su richiesta). */
  colore?: string | null;
  taglia?: string | null;
}) {
  const { aggiungi } = useCarrello();
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, startTransition] = useTransition();

  const stockMax = variante?.stock ?? 0;
  const stockBasso = !suRichiesta && stockMax > 0 && stockMax <= 3;
  // Tetto della quantita: lo stock in vendita diretta, NESSUNO su richiesta
  // (la disponibilita la conferma il negozio dopo l'invio della richiesta).
  const quantitaMax = suRichiesta ? Number.POSITIVE_INFINITY : stockMax || 1;

  // Aggiungibile ADESSO: in vendita serve stock, su richiesta basta la variante.
  const puoAggiungere = suRichiesta
    ? !!variante
    : !!variante && stockMax > 0 && quantita >= 1;

  // Contatto rapido in secondo piano (solo su richiesta): email/WhatsApp/
  // telefono precompilati con prodotto e selezione corrente.
  const dettagli = [colore, taglia ? `Taglia ${taglia}` : null].filter(Boolean);
  const testo =
    `Ciao! Vorrei sapere la disponibilità di "${prodotto.nome}"` +
    (dettagli.length ? ` (${dettagli.join(", ")})` : "") +
    `. Grazie!`;
  const mailto =
    `mailto:${NEGOZIO.email}` +
    `?subject=${encodeURIComponent(`Disponibilità: ${prodotto.nome}`)}` +
    `&body=${encodeURIComponent(testo)}`;
  const whatsapp = NEGOZIO.whatsapp
    ? `https://wa.me/${NEGOZIO.whatsapp}?text=${encodeURIComponent(testo)}`
    : null;
  const tel = NEGOZIO.telefono
    ? `tel:${NEGOZIO.telefono.replace(/[^\d+]/g, "")}`
    : null;

  function handleAggiungi() {
    if (!variante) {
      // Su richiesta con colore E taglia scelti: la variante mancante e una
      // combinazione che non esiste (matrice colore/taglia sparsa), non una
      // selezione incompleta.
      setErrore(
        suRichiesta && colore && taglia
          ? "Questa combinazione di colore e taglia non è disponibile: scegline un'altra."
          : "Seleziona colore e taglia.",
      );
      return;
    }
    setErrore(null);
    startTransition(async () => {
      await aggiungi({ prodotto, variante, quantita });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Selettore quantita */}
      <div>
        <label
          htmlFor="quantita"
          className="mb-3 block font-display text-sm font-bold uppercase tracking-wide text-muted"
        >
          Quantità
        </label>
        <div className="inline-flex items-center gap-1 rounded-full bg-white p-1.5 ring-2 ring-surface-2">
          <button
            type="button"
            aria-label="Diminuisci quantita"
            disabled={quantita <= 1}
            onClick={() => onQuantita(Math.max(1, quantita - 1))}
            className="grid h-11 w-11 place-items-center rounded-full text-xl font-bold leading-none text-sea transition hover:bg-surface active:scale-95 disabled:opacity-40"
          >
            -
          </button>
          <input
            id="quantita"
            type="number"
            min={1}
            max={Number.isFinite(quantitaMax) ? quantitaMax : undefined}
            value={quantita}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              if (Number.isNaN(n)) {
                onQuantita(1);
                return;
              }
              onQuantita(Math.min(Math.max(1, n), quantitaMax));
            }}
            className="w-12 bg-transparent text-center font-display text-lg font-bold text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            type="button"
            aria-label="Aumenta quantita"
            disabled={quantita >= quantitaMax}
            onClick={() => onQuantita(Math.min(quantitaMax, quantita + 1))}
            className="grid h-11 w-11 place-items-center rounded-full text-xl font-bold leading-none text-sea transition hover:bg-surface active:scale-95 disabled:opacity-40"
          >
            +
          </button>
        </div>
        {!suRichiesta && variante && (
          <p
            className={`mt-2 text-xs ${stockBasso ? "font-semibold text-coral-ink" : "text-muted"}`}
          >
            {stockBasso ? `Solo ${stockMax} rimasti` : `${stockMax} disponibili`}
          </p>
        )}
      </div>

      {/* Azione. Su richiesta il bottone NON e disabilitato quando manca la
          variante: cliccandolo mostra il motivo (selezione incompleta o
          combinazione inesistente) invece di restare inerte e muto. */}
      <button
        type="button"
        onClick={handleAggiungi}
        disabled={suRichiesta ? inCorso : !puoAggiungere || inCorso}
        aria-disabled={suRichiesta ? !puoAggiungere : undefined}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-coral-ink px-6 font-display font-bold text-white shadow-coral transition-transform hover:-translate-y-0.5 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 aria-disabled:opacity-60 sm:w-auto"
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="9" cy="20" r="1.4" />
          <circle cx="18" cy="20" r="1.4" />
          <path d="M2.5 3h2l2.3 12.2a1.6 1.6 0 0 0 1.6 1.3h8.5a1.6 1.6 0 0 0 1.6-1.3L21 7H6" />
        </svg>
        {inCorso
          ? "Aggiunta in corso..."
          : suRichiesta
            ? "Aggiungi alla richiesta"
            : "Aggiungi al carrello"}
      </button>
      <StatoInvio
        attivo={inCorso}
        testo={
          suRichiesta
            ? "Aggiunta alla richiesta in corso"
            : "Aggiunta al carrello in corso"
        }
      />

      {errore && (
        <p role="alert" className="text-sm font-semibold text-coral-ink">
          {errore}
        </p>
      )}

      {suRichiesta && (
        <>
          <p className="max-w-prose text-xs text-muted">
            <span className="font-semibold text-foreground">
              Nessun pagamento ora.
            </span>{" "}
            Dal carrello invii la richiesta: confermiamo la disponibilità e solo
            dopo paghi.
          </p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-4 text-sm">
            <span className="text-muted">Preferisci chiedere prima?</span>
            <a
              href={mailto}
              className="font-semibold text-sea underline underline-offset-2 transition-colors hover:text-lagoon-ink"
            >
              Scrivici via email
            </a>
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-sea underline underline-offset-2 transition-colors hover:text-lagoon-ink"
              >
                WhatsApp
              </a>
            )}
            {tel && (
              <a
                href={tel}
                className="font-semibold text-sea underline underline-offset-2 transition-colors hover:text-lagoon-ink"
              >
                Chiamaci
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}
