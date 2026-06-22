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
    <div className="flex flex-col gap-5">
      {/* Selettore taglia */}
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Taglia
        </legend>
        <div className="flex flex-wrap gap-2">
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
                  "min-w-12 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  esaurita
                    ? "cursor-not-allowed border-zinc-200 text-zinc-300 line-through dark:border-zinc-800 dark:text-zinc-700"
                    : selezionata
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                      : "border-zinc-300 text-zinc-700 hover:border-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-100",
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
          className="mb-2 block text-sm font-medium text-zinc-900 dark:text-zinc-100"
        >
          Quantita
        </label>
        <div className="inline-flex items-center rounded-lg border border-zinc-300 dark:border-zinc-700">
          <button
            type="button"
            aria-label="Diminuisci quantita"
            disabled={quantita <= 1}
            onClick={() => setQuantita((q) => Math.max(1, q - 1))}
            className="px-3 py-2 text-lg leading-none text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
            className="w-14 border-x border-zinc-300 bg-transparent py-2 text-center text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:text-zinc-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            type="button"
            aria-label="Aumenta quantita"
            disabled={quantita >= stockMax}
            onClick={() => setQuantita((q) => Math.min(stockMax || 1, q + 1))}
            className="px-3 py-2 text-lg leading-none text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            +
          </button>
        </div>
        {varianteScelta && (
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            {stockMax} disponibili
          </p>
        )}
      </div>

      {/* Azione */}
      <button
        type="button"
        onClick={handleAggiungi}
        disabled={!puoAggiungere || inCorso}
        className="flex h-12 w-full items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 sm:w-auto"
      >
        {inCorso ? "Aggiunta in corso..." : "Aggiungi al carrello"}
      </button>

      {/* Feedback */}
      {esito?.tipo === "ok" && (
        <p
          role="status"
          className="text-sm font-medium text-green-700 dark:text-green-400"
        >
          Aggiunto al carrello.{" "}
          <a href="/carrello" className="underline underline-offset-2">
            Vai al carrello
          </a>
        </p>
      )}
      {esito?.tipo === "errore" && (
        <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
          {esito.messaggio}
        </p>
      )}
    </div>
  );
}
