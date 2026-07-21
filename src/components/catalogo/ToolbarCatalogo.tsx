"use client";

// Toolbar del catalogo vetrina: chip franchise, ordinamento, bottone "Filtri"
// con drawer (prezzo, taglie, colori) e chip dei filtri attivi rimovibili.
// Lo stato vive nell'URL: ogni modifica naviga (router.push, scroll invariato)
// e il server ri-renderizza la griglia. Cosi i filtri sono condivisibili via
// link, il back del browser annulla l'ultimo cambiamento e niente stato doppio.
// La sola ricerca testuale usa replace (via debounce) per non creare una voce
// di cronologia a ogni tasto.
//
// Accessibilita drawer: stesso pattern del CartDrawer (dialog modale, ESC,
// click sull'overlay, scroll-lock, focus trap, focus ripristinato).

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

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
import { bloccaScrollBody } from "@/lib/scroll-lock";

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

/**
 * Da quanti temi in su compare il bottone "Tutti i temi" (audit UX desktop
 * §3: con 127 chip arrivare in fondo alla riga scorribile costa ~16 click di
 * freccia; il pannello multi-riga li mostra tutti insieme). Sotto soglia la
 * riga si abbraccia con lo sguardo e il bottone sarebbe rumore.
 */
const SOGLIA_PANNELLO_TEMI = 12;

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
  const pathname = usePathname();
  const [inTransito, startTransition] = useTransition();
  const [aperto, setAperto] = useState(false);
  const [bozza, setBozza] = useState<BozzaFiltri>(() => bozzaDaFiltri(filtri));
  // Pannello "Tutti i temi" (desktop): i chip passano dalla riga scorribile a
  // una griglia multi-riga che li mostra tutti. Stato locale: e solo
  // presentazione, l'URL non c'entra.
  const [temiEspansi, setTemiEspansi] = useState(false);

  // Cambio di route col drawer aperto (back del browser verso un'altra pagina
  // catalogo: il componente resta montato e lo stato sopravvive): il drawer va
  // chiuso. I filtri toccano solo i searchParams, quindi il pathname non cambia
  // e la navigazione filtri resta indisturbata. Aggiustamento di stato durante
  // il render (pattern React "adjusting state when props change") invece di un
  // effect: niente setState sincrono post-commit, la pagina nuova non vede mai
  // il drawer aperto.
  const [pathnamePrecedente, setPathnamePrecedente] = useState(pathname);
  if (pathname !== pathnamePrecedente) {
    setPathnamePrecedente(pathname);
    setAperto(false);
    // Cambio pagina catalogo (altra categoria): i temi sono diversi, il
    // pannello espanso riparte chiuso come il drawer.
    setTemiEspansi(false);
  }

  // Filtri del drawer (taglia/colore/prezzo), per il badge e i chip attivi.
  const filtriDrawer = contaFiltriDrawer(filtri);
  // Difensivo: facette da una cache precedente potrebbero non avere i franchise.
  const franchiseDisponibili = facette.franchise ?? [];
  const conPannelloTemi = franchiseDisponibili.length > SOGLIA_PANNELLO_TEMI;

  /**
   * Naviga verso la stessa pagina con i filtri dati (pagina implicitamente 1).
   * Di default usa push: ogni filtro/ordinamento/chip crea una voce di
   * cronologia, cosi il back del browser annulla l'ultimo cambiamento invece di
   * uscire dal catalogo. La ricerca testuale passa `sostituisci` per NON
   * intasare la cronologia con una voce a ogni tasto digitato.
   */
  const naviga = useCallback(
    (nuovi: FiltriCatalogo, sostituisci = false) => {
      const qs = serializzaFiltri(nuovi);
      const url = qs ? `${basePath}?${qs}` : basePath;
      startTransition(() => {
        if (sostituisci) {
          router.replace(url, { scroll: false });
        } else {
          router.push(url, { scroll: false });
        }
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

  // — Ricerca testuale — Il backend la supporta gia (filtri.q → ricerca per
  // token su nome/descrizione in lib/vetrina), ma il campo mancava del tutto.
  // Stato locale + debounce per non navigare a ogni tasto; un ref tiene i filtri
  // correnti senza rieseguire l'effetto a ogni render.
  const [ricerca, setRicerca] = useState(filtri.q);
  // Campo in uso (focus): finche' si digita, il testo locale e' la verita'.
  const [ricercaInUso, setRicercaInUso] = useState(false);
  // Riallinea il campo se `q` cambia da fuori (back del browser): pattern React
  // "aggiusta lo stato durante il render", non un effetto con setState.
  // MAI mentre si digita, pero': la navigazione debounced e' asincrona e il
  // render server puo' metterci centinaia di ms (percorso semantico) — il suo
  // "eco" arriverebbe DOPO i tasti successivi e li cancellerebbe (visto in
  // produzione: parole che spariscono digitando). Col campo in uso vince il
  // testo locale; qVista si aggiorna comunque, cosi' al blur non scatta
  // nessuna sincronizzazione retroattiva col testo vecchio.
  const [qVista, setQVista] = useState(filtri.q);
  if (filtri.q !== qVista) {
    setQVista(filtri.q);
    if (!ricercaInUso) setRicerca(filtri.q);
  }
  // Ref ai filtri correnti, aggiornato in un effetto (mai durante il render):
  // serve a costruire la navigazione nel debounce senza rieseguire l'effetto a
  // ogni tasto (i filtri come dipendenza lo farebbero ripartire di continuo).
  const filtriRef = useRef(filtri);
  useEffect(() => {
    filtriRef.current = filtri;
  });
  // Debounce: naviga 350 ms dopo l'ultimo tasto, solo se il testo e cambiato.
  useEffect(() => {
    const pulita = ricerca.trim();
    if (pulita === filtriRef.current.q) return;
    const t = setTimeout(
      () => naviga({ ...filtriRef.current, q: pulita }, true),
      350,
    );
    return () => clearTimeout(t);
  }, [ricerca, naviga]);

  /**
   * Chip dei temi ("Tutto" + uno per franchise), condivisi tra riga
   * scorribile e pannello espanso. `dopoScelta` arriva dal pannello: dopo la
   * selezione si richiude da solo (compito finito, la griglia sotto e gia
   * filtrata).
   */
  function chipTemi(dopoScelta?: () => void) {
    return (
      <>
        {/* "Tutto" = default: nessun franchise attivo, si vede l'intera
            categoria. Coerente con le righe di navigazione sopra, dove una
            voce "Tutto" resta selezionata finche non si restringe. */}
        <button
          type="button"
          onClick={() => {
            naviga({ ...filtri, franchise: "" });
            dopoScelta?.();
          }}
          aria-pressed={filtri.franchise === ""}
          className={[
            "inline-flex shrink-0 items-center rounded-full px-3.5 py-2 font-display text-sm font-bold transition-all active:scale-95",
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
              onClick={() => {
                naviga({ ...filtri, franchise: attivo ? "" : f.slug });
                dopoScelta?.();
              }}
              aria-pressed={attivo}
              className={[
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 font-display text-sm font-bold transition-all active:scale-95",
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
      </>
    );
  }

  return (
    <div className="mb-6">
      {/* Ricerca testuale del catalogo (nome/descrizione, multi-parola).
          max-w cappata su desktop (audit UX §3): larga quanto il container
          7xl (1112px+) era sproporzionata per un campo di testo. */}
      <div className="mb-3 md:max-w-2xl">
        <label className="relative block">
          <span className="sr-only">Cerca nel catalogo</span>
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-muted">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            type="search"
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            onFocus={() => setRicercaInUso(true)}
            onBlur={() => setRicercaInUso(false)}
            placeholder="Cerca un prodotto, una squadra, un personaggio…"
            aria-label="Cerca nel catalogo"
            className="h-12 w-full rounded-full bg-white pl-12 pr-11 font-display text-base text-foreground ring-1 ring-line-strong outline-none transition-shadow placeholder:text-muted hover:ring-sea focus:ring-2 focus:ring-sea [&::-webkit-search-cancel-button]:hidden"
          />
          {/* Area tattile piena (44px, a filo del bordo destro): un tap
              mancato sull'icona nuda finirebbe nell'input riaprendo la
              tastiera. L'input ha pr-11, quindi la zona coincide col padding
              e non copre il testo digitato. */}
          {ricerca && (
            <button
              type="button"
              onClick={() => setRicerca("")}
              aria-label="Cancella la ricerca"
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted transition hover:text-foreground active:scale-95"
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
          )}
        </label>
      </div>
      {/* Chip dei temi: scorciatoie per saga/serie presenti nella categoria,
          dalla colonna `tema` (conteggi DB-side, vedi lib/vetrina); in coda il
          chip "Altro" col complemento (senza tema o sotto soglia): la somma
          dei numeri e il totale. Servono alla scoperta: mostrano cosa c'e
          senza doverlo cercare. Di default stessa riga scorribile con frecce
          delle categorie (NavScorribile); quando sono tanti (127!), da md in
          su il bottone "Tutti i temi" apre un pannello multi-riga che li
          mostra tutti insieme (audit UX §3: in riga costavano ~16 click di
          freccia) e si richiude da solo alla scelta. */}
      {franchiseDisponibili.length > 0 && (
        <div id="temi-catalogo" className="mb-3 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {temiEspansi ? (
              <div className="flex flex-wrap items-center gap-2">
                {chipTemi(() => setTemiEspansi(false))}
              </div>
            ) : (
              <NavScorribile etichetta="i temi">{chipTemi()}</NavScorribile>
            )}
          </div>
          {conPannelloTemi && (
            <button
              type="button"
              onClick={() => setTemiEspansi((v) => !v)}
              aria-expanded={temiEspansi}
              aria-controls="temi-catalogo"
              className="hidden shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 py-2 font-display text-sm font-bold text-sea ring-1 ring-line transition-all hover:-translate-y-0.5 hover:ring-sea active:scale-95 md:inline-flex"
            >
              {temiEspansi ? "Riduci" : "Tutti i temi"}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`h-4 w-4 transition-transform ${temiEspansi ? "rotate-180" : ""}`}
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Riga strumenti: filtri + conteggio + ordinamento */}
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={apriDrawer}
          aria-haspopup="dialog"
          className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-4 font-display text-sm font-bold text-sea ring-2 ring-sea transition-all hover:-translate-y-0.5 hover:bg-surface active:scale-95"
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
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-coral-ink px-1 font-display text-[11px] font-bold text-white">
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
            className="h-11 appearance-none rounded-full bg-white pl-4 pr-9 font-display text-base font-bold text-foreground ring-1 ring-line-strong outline-none transition hover:ring-sea active:scale-95 sm:text-sm"
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
              className="ml-1 font-display text-sm font-bold text-coral-ink transition hover:text-coral active:scale-95"
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
      {/* Area tattile estesa a ~44px (24px + 2×10px) col pseudo-elemento:
          coi chip adiacenti a gap-2 la X nuda faceva rimuovere il filtro
          sbagliato (stesso pattern di QuickAddTaglie). */}
      <button
        type="button"
        onClick={onRimuovi}
        aria-label={`Rimuovi filtro ${etichetta}`}
        className="relative grid h-6 w-6 place-items-center rounded-full text-muted transition after:absolute after:-inset-2.5 hover:bg-white hover:text-foreground active:scale-95"
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
    const sbloccaScroll = bloccaScrollBody();

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
      sbloccaScroll();
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
            className="grid h-10 w-10 place-items-center rounded-full text-muted transition hover:bg-surface hover:text-foreground active:scale-95"
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

        {/* overscroll-contain: a fine corsa lo scroll non si propaga alla
            pagina ne innesca il pull-to-refresh del browser mobile. */}
        <form
          className="flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-5"
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
                  className="h-12 w-full rounded-2xl bg-white px-4 text-base text-foreground ring-1 ring-line-strong outline-none transition-shadow"
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
                  className="h-12 w-full rounded-2xl bg-white px-4 text-base text-foreground ring-1 ring-line-strong outline-none transition-shadow"
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
                        "h-10 min-w-12 rounded-full px-3 font-display text-sm font-bold transition-all active:scale-95",
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
                        "inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium transition-all active:scale-95",
                        attivo
                          ? "bg-sea/10 text-sea-ink ring-2 ring-sea"
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
        <div className="grid grid-cols-2 gap-3 border-t border-line bg-surface px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <button
            type="button"
            onClick={onAzzera}
            className="flex h-12 items-center justify-center rounded-full bg-white px-4 font-display text-sm font-bold text-sea ring-2 ring-surface-2 transition hover:bg-surface active:scale-[.98]"
          >
            Azzera
          </button>
          <button
            type="button"
            onClick={onApplica}
            className="flex h-12 items-center justify-center rounded-full bg-sea px-4 font-display text-sm font-bold text-white shadow-sea transition-transform hover:-translate-y-0.5 active:scale-[.98]"
          >
            Applica filtri
          </button>
        </div>
      </div>
    </div>
  );
}
