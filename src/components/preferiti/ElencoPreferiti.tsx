"use client";

// Griglia della pagina /preferiti. Gli id vivono in localStorage (store
// preferiti-client): qui si risolvono in prodotti via Server Action, con una
// cache locale per id cosi togliere un cuore NON rifa la fetch — la card
// sparisce e basta. Skeleton finche non si e montati (SSR non conosce i
// preferiti) o durante il caricamento degli id nuovi. Se la fetch fallisce
// (rete mobile assente/instabile) NIENTE stato vuoto — direbbe il falso —
// ma un blocco di errore con "Riprova" che rilancia la fetch dei mancanti.

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";

import ProductCard from "@/components/ProductCard";
import { prodottiPerId } from "@/lib/card-actions";
import { usePreferiti } from "@/lib/preferiti-client";
import type { Prodotto } from "@/lib/types";

/** true solo dopo l'idratazione (il server non conosce i preferiti): idioma
 *  useSyncExternalStore senza setState-in-effect. */
function useMontato(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export default function ElencoPreferiti() {
  const ids = usePreferiti();
  const montato = useMontato();
  // null = id gia chiesto ma assente dal catalogo (rimosso/disattivato).
  const [perId, setPerId] = useState<Map<string, Prodotto | null>>(
    () => new Map(),
  );

  // Id ancora da risolvere; il caricamento e uno stato DERIVATO, non un flag.
  const mancanti = ids.filter((id) => !perId.has(id));
  const chiaveMancanti = mancanti.join(",");

  // Fetch dei mancanti fallita (rete): distinta dagli id davvero assenti dal
  // catalogo. `tentativo` rilancia l'effect a parita di id (bottone Riprova).
  const [errore, setErrore] = useState(false);
  const [tentativo, setTentativo] = useState(0);
  // Se l'insieme dei mancanti cambia (cuore tolto, fetch riuscita) l'errore
  // vecchio non vale piu: reset durante il render (pattern "adjusting state
  // when props change", vedi MenuMobile/FormProdotto), niente setState
  // sincrono in effect.
  const [chiaveVista, setChiaveVista] = useState(chiaveMancanti);
  if (chiaveMancanti !== chiaveVista) {
    setChiaveVista(chiaveMancanti);
    setErrore(false);
  }

  const caricamento = montato && !errore && mancanti.length > 0;

  useEffect(() => {
    if (!montato || mancanti.length === 0) return;
    let vivo = true;
    prodottiPerId(mancanti)
      .then((prodotti) => {
        if (!vivo) return;
        setPerId((prima) => {
          const dopo = new Map(prima);
          for (const p of prodotti) dopo.set(p.id, p);
          // Id che il server non ha ritornato (prodotto rimosso/disattivato):
          // si marcano comunque, cosi non vengono richiesti in loop.
          for (const id of mancanti) {
            if (!dopo.has(id)) dopo.set(id, null);
          }
          return dopo;
        });
      })
      .catch(() => {
        // Rete assente/instabile: gli id NON si marcano null (non sono
        // spariti dal catalogo), cosi il Riprova puo richiederli.
        if (vivo) setErrore(true);
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mancanti via chiave stabile
  }, [montato, chiaveMancanti, tentativo]);

  const prodotti = ids
    .map((id) => perId.get(id))
    .filter((p): p is Prodotto => p != null);

  // Skeleton: prima del mount (SSR/idratazione) e finche non c'e nulla da mostrare.
  if (!montato || (caricamento && prodotti.length === 0)) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-3xl bg-white p-2.5 shadow-soft"
          >
            <div className="aspect-[3/4] w-full rounded-2xl bg-surface-2" />
            <div className="px-2 pb-1 pt-3">
              <div className="h-4 w-3/4 rounded bg-surface-2" />
              <div className="mt-2 h-4 w-1/3 rounded bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const griglia =
    prodotti.length > 0 ? (
      <div
        aria-label="I tuoi preferiti"
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4"
      >
        {prodotti.map((prodotto, i) => (
          <ProductCard key={prodotto.id} prodotto={prodotto} priorita={i < 4} />
        ))}
      </div>
    ) : null;

  // Fetch fallita: blocco di errore con Riprova al posto dello stato vuoto
  // (l'utente HA dei preferiti, solo non caricabili ora). I prodotti gia in
  // cache, se ci sono, restano visibili sotto.
  if (errore) {
    return (
      <div className="space-y-5">
        <div
          role="alert"
          className="rounded-3xl border border-dashed border-line bg-surface px-6 py-16 text-center shadow-soft"
        >
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-white text-coral shadow-soft">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-7 w-7"
              aria-hidden="true"
            >
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
          </span>
          <p className="font-display text-base font-bold text-foreground">
            Impossibile caricare i preferiti
          </p>
          <p className="mt-1 text-sm text-muted">
            Controlla la connessione e riprova.
          </p>
          <button
            type="button"
            onClick={() => {
              setErrore(false);
              setTentativo((t) => t + 1);
            }}
            className="mt-5 inline-flex h-11 items-center rounded-full bg-coral-ink px-6 font-display text-sm font-bold text-white shadow-coral transition-transform hover:-translate-y-0.5"
          >
            Riprova
          </button>
        </div>
        {griglia}
      </div>
    );
  }

  // Stato vuoto SOLO a fetch riuscita: qui mancanti e vuoto e nessun errore.
  if (prodotti.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-line bg-surface px-6 py-16 text-center shadow-soft">
        <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-white text-coral shadow-soft">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-7 w-7"
            aria-hidden="true"
          >
            <path d="M12 20.7S4.6 16 2.8 11.6C1.5 8.6 3.2 5.3 6.4 4.9c2-.3 3.8.7 4.7 2.2h1.8c.9-1.5 2.7-2.5 4.7-2.2 3.2.4 4.9 3.7 3.6 6.7C19.4 16 12 20.7 12 20.7Z" />
          </svg>
        </span>
        <p className="font-display text-base font-bold text-foreground">
          Non hai ancora salvato preferiti
        </p>
        <p className="mt-1 text-sm text-muted">
          Tocca il cuoricino su un prodotto per ritrovarlo qui.
        </p>
        <Link
          href="/prodotti"
          className="mt-5 inline-flex h-11 items-center rounded-full bg-coral-ink px-6 font-display text-sm font-bold text-white shadow-coral transition-transform hover:-translate-y-0.5"
        >
          Scopri la collezione
        </Link>
      </div>
    );
  }

  return griglia;
}
