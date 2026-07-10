"use client";

// Toolbar del catalogo vetrina: chip franchise, ordinamento, bottone "Filtri"
// con drawer (prezzo, taglie, colori) e chip dei filtri attivi rimovibili.
// Lo stato vive nell'URL: ogni modifica naviga (router.replace, scroll
// invariato) e il server ri-renderizza la griglia. Cosi i filtri sono
// condivisibili via link, il back del browser funziona e niente stato doppio.
//
// Accessibilita drawer: stesso pattern del CartDrawer (dialog modale, ESC,
// click sull'overlay, scroll-lock, focus trap, focus ripristinato).

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import NavScorribile from "@/components/vetrina/NavScorribile";
import {
  ETICHETTE_ORDINAMENTO,
  FILTRI_VUOTI,
  ORDINAMENTI,
  contaFiltriDrawer,
  serializzaFiltri,
  type FacetteCatalogo,
  type FiltriCatalogo,
  type Ordinamento,
} from "@/lib/filtri-catalogo";
import { coloreChiaro, coloreHex } from "@/lib/catalogo";

/** Bozza dei filtri mentre si compone la selezione nel drawer. */
interface BozzaFiltri {
  taglie: string[];
  colori: string[];
  prezzoMin: string;
  prezzoMax: string;
}

function bozzaDaFiltri(filtri: FiltriCatalogo): BozzaFiltri {
  return {
    taglie: filtri.taglie,
    colori: filtri.colori,
    prezzoMin: filtri.prezzoMin != null ? String(filtri.prezzoMin) : "",
    prezzoMax: filtri.prezzoMax != null ? String(filtri.prezzoMax) : "",
  };
}

/** "20" -> 20; vuoto/invalido -> null (il campo prezzo e opzionale). */
function interoDaCampo(s: string): number | null {
  const n = Number.parseFloat(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

export default function ToolbarCatalogo({
  basePath,
  filtri,
  facette,
  totale,
}: {
  /** Path della pagina corrente ("/" o "/categoria/slug"). */
  basePath: string;
  /** Filtri correnti (gia interpretati dal server). */
  filtri: FiltriCatalogo;
  /** Opzioni realmente disponibili (taglie/colori/range prezzo). */
  facette: FacetteCatalogo;
  /** Totale prodotti che rispettano i filtri. */
  totale: number;
}) {
  const router = useRouter();
  const [inTransito, startTransition] = useTransition();
  const [aperto, setAperto] = useState(false);
  const [bozza, setBozza] = useState<BozzaFiltri>(() => bozzaDaFiltri(filtri));

  // Filtri del drawer (taglia/colore/prezzo), per il badge e i chip attivi.
  const filtriDrawer = contaFiltriDrawer(filtri);
  // Difensivo: facette da una cache precedente potrebbero non avere i franchise.
  const franchiseDisponibili = facette.franchise ?? [];

  /** Naviga verso la stessa pagina con i filtri dati (pagina implicitamente 1). */
  const naviga = useCallback(
    (nuovi: FiltriCatalogo) => {
      const qs = serializzaFiltri(nuovi);
      startTransition(() => {
        router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
      });
    },
    [basePath, router],
  );

  function apriDrawer() {
    setBozza(bozzaDaFiltri(filtri)); // riparte sempre dai filtri applicati
    setAperto(true);
  }

  function applicaBozza() {
    let min = interoDaCampo(bozza.prezzoMin);
    let max = interoDaCampo(bozza.prezzoMax);
    if (min != null && max != null && min > max) [min, max] = [max, min];
    naviga({
      taglie: bozza.taglie,
      colori: bozza.colori,
      prezzoMin: min,
      prezzoMax: max,
      q: filtri.q, // la ricerca ha il suo campo: qui resta com'e
      franchise: filtri.franchise, // idem il franchise: ha i suoi chip
      ordina: filtri.ordina,
    });
    setAperto(false);
  }

  function toggle(lista: string[], voce: string): string[] {
    return lista.includes(voce)
      ? lista.filter((v) => v !== voce)
      : [...lista, voce];
  }

  return (
    <div className="mb-6">
      {/* Chip dei temi: scorciatoie per saga/serie presenti nella categoria,
          dalla colonna `tema` (conteggi DB-side, vedi lib/vetrina); in coda il
          chip "Altro" col complemento (senza tema o sotto soglia): la somma
          dei numeri e il totale. Servono alla scoperta: mostrano cosa c'e
          senza doverlo cercare. Stessa riga scorribile con frecce delle
          categorie (NavScorribile): quando sono tanti si raggiungono tutti. */}
      {franchiseDisponibili.length > 0 && (
        <div className="mb-3">
          <NavScorribile etichetta="i temi">
            {/* "Tutto" = default: nessun franchise attivo, si vede l'intera
                categoria. Coerente con le righe di navigazione sopra, dove una
                voce "Tutto" resta selezionata finche non si restringe. */}
            <button
              type="button"
              onClick={() => naviga({ ...filtri, franchise: "" })}
              aria-pressed={filtri.franchise === ""}
              className={[
                "inline-flex shrink-0 items-center rounded-full px-3.5 py-2 font-display text-sm font-bold transition-all",
                filtri.franchise === ""
                  ? "bg-sea text-white shadow-sea"
                  : "bg-white text-foreground ring-1 ring-line hover:-translate-y-0.5 hover:ring-sea",
              ].join(" ")}
            >
              Tutto
            </button>
            {franchiseDisponibili.map((f) => {
              const attivo = filtri.franchise === f.slug;
              return (
                <button
                  key={f.slug}
                  type="button"
                  onClick={() =>
                    naviga({ ...filtri, franchise: attivo ? "" : f.slug })
                  }
                  aria-pressed={attivo}
                  className={[
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 font-display text-sm font-bold transition-all",
                    attivo
                      ? "bg-sea text-white shadow-sea"
                      : "bg-white text-foreground ring-1 ring-line hover:-translate-y-0.5 hover:ring-sea",
                  ].join(" ")}
                >
                  {f.etichetta}
                  <span
                    className={[
                      "rounded-full px-1.5 text-xs font-bold tabular-nums",
                      attivo ? "bg-white/25 text-white" : "bg-surface-2 text-sea",
                    ].join(" ")}
                  >
                    {f.count}
                  </span>
                </button>
              );
            })}
          </NavScorribile>
        </div>
      )}

      {/* Riga strumenti: filtri + conteggio + ordinamento */}
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={apriDrawer}
          aria-haspopup="dialog"
          className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-4 font-display text-sm font-bold text-sea ring-2 ring-sea transition-all hover:-translate-y-0.5 hover:bg-surface"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          Filtri
          {filtriDrawer > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1 font-display text-[11px] font-bold text-white">
              {filtriDrawer}
            </span>
          )}
        </button>

        <span
          aria-live="polite"
          className="text-sm tabular-nums text-muted"
        >
          {inTransito
            ? "Aggiorno…"
            : `${totale} ${totale === 1 ? "prodotto" : "prodotti"}`}
        </span>

        {/* Ordinamento (a destra) */}
        <label className="relative ml-auto inline-flex items-center">
          <span className="sr-only">Ordina per</span>
          <select
            value={filtri.ordina}
            onChange={(e) =>
              naviga({ ...filtri, ordina: e.target.value as Ordinamento })
            }
            className="h-11 appearance-none rounded-full bg-white pl-4 pr-9 font-display text-base font-bold text-foreground ring-1 ring-line outline-none transition-shadow hover:ring-sea sm:text-sm"
          >
            {ORDINAMENTI.map((o) => (
              <option key={o} value={o}>
                {ETICHETTE_ORDINAMENTO[o]}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-muted">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </label>
      </div>

      {/* Chip dei filtri del drawer (rimozione a un tap). La ricerca ha il suo
          campo con la X, quindi non compare qui. */}
      {filtriDrawer > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {filtri.taglie.map((t) => (
            <ChipFiltro
              key={`t-${t}`}
              etichetta={`Taglia ${t}`}
              onRimuovi={() =>
                naviga({ ...filtri, taglie: filtri.taglie.filter((x) => x !== t) })
              }
            />
          ))}
          {filtri.colori.map((c) => (
            <ChipFiltro
              key={`c-${c}`}
              etichetta={c}
              swatch={coloreHex(c)}
              onRimuovi={() =>
                naviga({ ...filtri, colori: filtri.colori.filter((x) => x !== c) })
              }
            />
          ))}
          {(filtri.prezzoMin != null || filtri.prezzoMax != null) && (
            <ChipFiltro
              etichetta={
                filtri.prezzoMin != null && filtri.prezzoMax != null
                  ? `${filtri.prezzoMin}–${filtri.prezzoMax} €`
                  : filtri.prezzoMin != null
                    ? `da ${filtri.prezzoMin} €`
                    : `fino a ${filtri.prezzoMax} €`
              }
              onRimuovi={() =>
                naviga({ ...filtri, prezzoMin: null, prezzoMax: null })
              }
            />
          )}
          {filtriDrawer > 1 && (
            <button
              type="button"
              onClick={() =>
                naviga({
                  ...FILTRI_VUOTI,
                  q: filtri.q,
                  franchise: filtri.franchise,
                  ordina: filtri.ordina,
                })
              }
              className="ml-1 font-display text-sm font-bold text-coral-ink transition-colors hover:text-coral"
            >
              Azzera tutto
            </button>
          )}
        </div>
      )}

      {aperto && (
        <DrawerFiltri
          bozza={bozza}
          setBozza={setBozza}
          facette={facette}
          onApplica={applicaBozza}
          onAzzera={() =>
            setBozza({ taglie: [], colori: [], prezzoMin: "", prezzoMax: "" })
          }
          onChiudi={() => setAperto(false)}
          toggle={toggle}
        />
      )}
    </div>
  );
}

/** Chip di filtro attivo con bottone di rimozione. */
function ChipFiltro({
  etichetta,
  swatch,
  onRimuovi,
}: {
  etichetta: string;
  swatch?: string;
  onRimuovi: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-sm font-medium text-foreground">
      {swatch && (
        <span
          aria-hidden="true"
          className={[
            "h-3.5 w-3.5 rounded-full",
            coloreChiaro(swatch) ? "ring-1 ring-line" : "",
          ].join(" ")}
          style={{ backgroundColor: swatch }}
        />
      )}
      {etichetta}
      <button
        type="button"
        onClick={onRimuovi}
        aria-label={`Rimuovi filtro ${etichetta}`}
        className="grid h-6 w-6 place-items-center rounded-full text-muted transition-colors hover:bg-white hover:text-foreground"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}

/** Drawer laterale coi controlli di filtro (bozza applicata solo su "Mostra"). */
function DrawerFiltri({
  bozza,
  setBozza,
  facette,
  onApplica,
  onAzzera,
  onChiudi,
  toggle,
}: {
  bozza: BozzaFiltri;
  setBozza: React.Dispatch<React.SetStateAction<BozzaFiltri>>;
  facette: FacetteCatalogo;
  onApplica: () => void;
  onAzzera: () => void;
  onChiudi: () => void;
  toggle: (lista: string[], voce: string) => string[];
}) {
  const pannelloRef = useRef<HTMLDivElement>(null);
  const elementoPrecedenteRef = useRef<HTMLElement | null>(null);
  // onChiudi letta via ref: l'effetto di setup gira SOLO al mount, ma la ESC
  // deve sempre chiamare l'ultima onChiudi. Senza questo, mettere onChiudi tra
  // le dipendenze rieseguirebbe l'effetto a ogni render (a ogni tasto digitato
  // il focus tornava al primo elemento = la X).
  const onChiudiRef = useRef(onChiudi);
  useEffect(() => {
    onChiudiRef.current = onChiudi;
  }, [onChiudi]);

  // Scroll-lock, focus iniziale, ESC e focus-trap (pattern del CartDrawer).
  useEffect(() => {
    elementoPrecedenteRef.current = document.activeElement as HTMLElement | null;
    const overflowPrecedente = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const pannello = pannelloRef.current;
    const focusabili = () =>
      Array.from(
        pannello?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusabili()[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onChiudiRef.current();
        return;
      }
      if (e.key === "Tab") {
        const items = focusabili();
        if (items.length === 0) return;
        const primo = items[0];
        const ultimo = items[items.length - 1];
        const attivo = document.activeElement;
        if (e.shiftKey && attivo === primo) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && attivo === ultimo) {
          e.preventDefault();
          primo.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflowPrecedente;
      elementoPrecedenteRef.current?.focus?.();
    };
    // Solo al mount/unmount: il focus iniziale non deve ripetersi a ogni render,
    // altrimenti ogni tasto digitato riporta il focus al primo elemento (la X).
  }, []);

  const placeholderMin =
    facette.prezzoMinCents != null
      ? String(Math.floor(facette.prezzoMinCents / 100))
      : "0";
  const placeholderMax =
    facette.prezzoMaxCents != null
      ? String(Math.ceil(facette.prezzoMaxCents / 100))
      : "999";

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <button
        type="button"
        aria-label="Chiudi i filtri"
        onClick={onChiudi}
        className="animate-fade-in absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-[2px]"
      />

      {/* Pannello */}
      <div
        ref={pannelloRef}
        role="dialog"
        aria-modal="true"
        aria-label="Filtra il catalogo"
        className="animate-drawer-in absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-background shadow-[0_0_60px_-15px_rgba(10,31,51,0.5)]"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-extrabold text-foreground">
            Filtri
          </h2>
          <button
            type="button"
            onClick={onChiudi}
            aria-label="Chiudi"
            className="grid h-10 w-10 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form
          className="flex-1 space-y-6 overflow-y-auto px-5 py-5"
          onSubmit={(e) => {
            e.preventDefault();
            onApplica();
          }}
        >
          {/* Prezzo */}
          <div>
            <span className="mb-2 block font-display text-sm font-bold text-foreground">
              Prezzo (€)
            </span>
            <div className="flex items-center gap-3">
              <label className="flex-1">
                <span className="sr-only">Prezzo minimo in euro</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder={`da ${placeholderMin}`}
                  value={bozza.prezzoMin}
                  onChange={(e) =>
                    setBozza((b) => ({ ...b, prezzoMin: e.target.value }))
                  }
                  className="h-12 w-full rounded-2xl bg-white px-4 text-base text-foreground ring-1 ring-line outline-none transition-shadow"
                />
              </label>
              <span aria-hidden="true" className="text-muted">
                –
              </span>
              <label className="flex-1">
                <span className="sr-only">Prezzo massimo in euro</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder={`a ${placeholderMax}`}
                  value={bozza.prezzoMax}
                  onChange={(e) =>
                    setBozza((b) => ({ ...b, prezzoMax: e.target.value }))
                  }
                  className="h-12 w-full rounded-2xl bg-white px-4 text-base text-foreground ring-1 ring-line outline-none transition-shadow"
                />
              </label>
            </div>
          </div>

          {/* Taglie */}
          {facette.taglie.length > 0 && (
            <fieldset>
              <legend className="mb-2 font-display text-sm font-bold text-foreground">
                Taglia
              </legend>
              <div className="flex flex-wrap gap-2">
                {facette.taglie.map((t) => {
                  const attiva = bozza.taglie.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={attiva}
                      onClick={() =>
                        setBozza((b) => ({ ...b, taglie: toggle(b.taglie, t) }))
                      }
                      className={[
                        "h-10 min-w-12 rounded-full px-3 font-display text-sm font-bold transition-all",
                        attiva
                          ? "bg-sea text-white shadow-sea"
                          : "bg-white text-foreground ring-1 ring-line hover:ring-sea",
                      ].join(" ")}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {/* Colori */}
          {facette.colori.length > 0 && (
            <fieldset>
              <legend className="mb-2 font-display text-sm font-bold text-foreground">
                Colore
              </legend>
              <div className="flex flex-wrap gap-2">
                {facette.colori.map((c) => {
                  const attivo = bozza.colori.includes(c);
                  const hex = coloreHex(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={attivo}
                      onClick={() =>
                        setBozza((b) => ({ ...b, colori: toggle(b.colori, c) }))
                      }
                      className={[
                        "inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium transition-all",
                        attivo
                          ? "bg-sea/10 text-sea ring-2 ring-sea"
                          : "bg-white text-foreground ring-1 ring-line hover:ring-sea",
                      ].join(" ")}
                    >
                      <span
                        aria-hidden="true"
                        className={[
                          "h-4 w-4 rounded-full",
                          coloreChiaro(hex) ? "ring-1 ring-line" : "",
                        ].join(" ")}
                        style={{ backgroundColor: hex }}
                      />
                      {c}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
        </form>

        {/* Footer azioni */}
        <div className="grid grid-cols-2 gap-3 border-t border-line bg-surface px-5 py-4">
          <button
            type="button"
            onClick={onAzzera}
            className="flex h-12 items-center justify-center rounded-full bg-white px-4 font-display text-sm font-bold text-sea ring-2 ring-surface-2 transition-colors hover:bg-surface"
          >
            Azzera
          </button>
          <button
            type="button"
            onClick={onApplica}
            className="flex h-12 items-center justify-center rounded-full bg-sea px-4 font-display text-sm font-bold text-white shadow-sea transition-transform hover:-translate-y-0.5"
          >
            Applica filtri
          </button>
        </div>
      </div>
    </div>
  );
}
