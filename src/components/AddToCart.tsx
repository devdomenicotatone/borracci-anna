"use client";

// AddToCart - by Frody.
// Selettore di variante (taglia) + bottone "Aggiungi al carrello".
// Chiama la Server Action aggiungiAlCarrello(varianteId, quantita) da @/lib/cart,
// gestendo stato di caricamento e feedback all'utente.

import { useState, useTransition } from "react";

import { aggiungiAlCarrello } from "@/lib/cart";
import type { Variante } from "@/lib/types";

interface AddToCartProps {
  /** Tutte le varianti del prodotto (incluse quelle esaurite, mostrate ma non selezionabili). */
  varianti: Variante[];
}

/** Etichetta leggibile di una variante (taglia, con fallback al SKU). */
function etichettaVariante(v: Variante): string {
  if (v.taglia && v.colore) return `${v.taglia} - ${v.colore}`;
  if (v.taglia) return v.taglia;
  if (v.colore) return v.colore;
  return v.sku;
}

type Esito = { tipo: "ok" } | { tipo: "errore"; messaggio: string } | null;

export default function AddToCart({ varianti }: AddToCartProps) {
  const disponibili = varianti.filter((v) => v.stock > 0);

  // Preseleziona la prima variante disponibile.
  const [varianteId, setVarianteId] = useState<string>(
    disponibili[0]?.id ?? "",
  );
  const [quantita, setQuantita] = useState<number>(1);
  const [esito, setEsito] = useState<Esito>(null);
  const [inCorso, startTransition] = useTransition();

  const varianteScelta = varianti.find((v) => v.id === varianteId) ?? null;
  const stockMax = varianteScelta?.stock ?? 0;
  const puoAggiungere = !!varianteScelta && stockMax > 0 && quantita >= 1;

  function handleAggiungi() {
    if (!varianteScelta) {
      setEsito({ tipo: "errore", messaggio: "Seleziona una taglia." });
      return;
    }
    setEsito(null);

    const qta = Math.min(Math.max(1, quantita), stockMax);

    startTransition(async () => {
      try {
        await aggiungiAlCarrello(varianteScelta.id, qta);
        setEsito({ tipo: "ok" });
      } catch {
        setEsito({
          tipo: "errore",
          messaggio: "Impossibile aggiungere al carrello. Riprova.",
        });
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Selettore taglia */}
      <fieldset>
        <legend className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-muted">
          Taglia
        </legend>
        <div className="flex flex-wrap gap-2.5">
          {varianti.map((v) => {
            const esaurita = v.stock <= 0;
            const selezionata = v.id === varianteId;
            return (
              <button
                key={v.id}
                type="button"
                disabled={esaurita}
                aria-pressed={selezionata}
                onClick={() => {
                  setVarianteId(v.id);
                  setQuantita(1);
                  setEsito(null);
                }}
                className={[
                  "h-[50px] min-w-[50px] rounded-xl px-3 font-display font-bold transition-all",
                  esaurita
                    ? "cursor-not-allowed text-muted line-through ring-2 ring-surface-2 [background:repeating-linear-gradient(45deg,#fff,#fff_6px,#f1f5f8_6px,#f1f5f8_12px)]"
                    : selezionata
                      ? "bg-sea text-white shadow-sea"
                      : "bg-white text-foreground ring-2 ring-surface-2 hover:-translate-y-0.5 hover:ring-lagoon",
                ].join(" ")}
                title={esaurita ? "Esaurita" : etichettaVariante(v)}
              >
                {v.taglia ?? etichettaVariante(v)}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Selettore quantita */}
      <div>
        <label
          htmlFor="quantita"
          className="mb-3 block font-display text-sm font-bold uppercase tracking-wide text-muted"
        >
          Quantita
        </label>
        <div className="inline-flex items-center gap-1 rounded-full bg-white p-1.5 ring-2 ring-surface-2">
          <button
            type="button"
            aria-label="Diminuisci quantita"
            disabled={quantita <= 1}
            onClick={() => setQuantita((q) => Math.max(1, q - 1))}
            className="grid h-11 w-11 place-items-center rounded-full text-xl font-bold leading-none text-sea transition-colors hover:bg-surface disabled:opacity-40"
          >
            -
          </button>
          <input
            id="quantita"
            type="number"
            min={1}
            max={stockMax || 1}
            value={quantita}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              if (Number.isNaN(n)) {
                setQuantita(1);
                return;
              }
              setQuantita(Math.min(Math.max(1, n), stockMax || 1));
            }}
            className="w-12 bg-transparent text-center font-display text-lg font-bold text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            type="button"
            aria-label="Aumenta quantita"
            disabled={quantita >= stockMax}
            onClick={() => setQuantita((q) => Math.min(stockMax || 1, q + 1))}
            className="grid h-11 w-11 place-items-center rounded-full text-xl font-bold leading-none text-sea transition-colors hover:bg-surface disabled:opacity-40"
          >
            +
          </button>
        </div>
        {varianteScelta && (
          <p className="mt-2 text-xs text-muted">{stockMax} disponibili</p>
        )}
      </div>

      {/* Azione */}
      <button
        type="button"
        onClick={handleAggiungi}
        disabled={!puoAggiungere || inCorso}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-coral px-6 font-display font-bold text-white shadow-coral transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 sm:w-auto"
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
        {inCorso ? "Aggiunta in corso..." : "Aggiungi al carrello"}
      </button>

      {/* Feedback */}
      {esito?.tipo === "ok" && (
        <p role="status" className="text-sm font-semibold text-sea">
          Aggiunto al carrello.{" "}
          <a
            href="/carrello"
            className="text-lagoon underline underline-offset-2"
          >
            Vai al carrello
          </a>
        </p>
      )}
      {esito?.tipo === "errore" && (
        <p role="alert" className="text-sm font-semibold text-coral">
          {esito.messaggio}
        </p>
      )}
    </div>
  );
}
