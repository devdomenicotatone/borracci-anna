"use client";

// Lista prodotti del gestore: ricerca, filtro stato, filtro categoria,
// ordinamento e selezione multipla con assegnazione categoria in blocco.
// Filtri e ordinamento girano client-side sui dati gia caricati dal server
// component padre (fino a 1000 righe: istantaneo, niente round-trip).

import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { formatPrezzo } from "@/lib/format";
import {
  etichettaCategoria,
  gruppiCategorie,
  idConDiscendenti,
} from "@/lib/categorie-albero";
import {
  assegnaCategoriaBulkAction,
  eliminaProdottiBulkAction,
} from "@/lib/gestore/actions";
import type { Categoria } from "@/lib/types";
import CategoriaSelect from "@/components/gestore/CategoriaSelect";
import ToggleAttivo from "@/components/gestore/ToggleAttivo";
import { useToast } from "@/components/gestore/Toaster";

export interface ProdottoLista {
  id: string;
  slug: string;
  nome: string;
  prezzo_cents: number;
  valuta: string;
  immagine_url: string | null;
  attivo: boolean;
  suRichiesta: boolean;
  categoriaId: string | null;
  numVarianti: number;
  stockTotale: number;
}

type FiltroStato = "tutti" | "attivi" | "nascosti";

/** Valore del filtro categoria: "" tutte, "none" senza categoria, altrimenti id. */
type FiltroCategoria = string;

const ORDINAMENTI_LISTA = [
  { valore: "recenti", etichetta: "Più recenti" },
  { valore: "nome", etichetta: "Nome (A-Z)" },
  { valore: "prezzo-asc", etichetta: "Prezzo: dal più basso" },
  { valore: "prezzo-desc", etichetta: "Prezzo: dal più alto" },
  { valore: "scorte", etichetta: "Scorte: prima le basse" },
] as const;

type OrdinamentoLista = (typeof ORDINAMENTI_LISTA)[number]["valore"];

/** Soglia sotto la quale si segnala "scorte basse". */
const SOGLIA_SCORTE = 5;

export default function ListaProdotti({
  prodotti,
  categorie,
}: {
  prodotti: ProdottoLista[];
  categorie: Categoria[];
}) {
  const [query, setQuery] = useState("");
  const [filtro, setFiltro] = useState<FiltroStato>("tutti");
  const [filtroCategoria, setFiltroCategoria] = useState<FiltroCategoria>("");
  const [ordina, setOrdina] = useState<OrdinamentoLista>("recenti");

  // Selezione multipla per l'assegnazione categoria in blocco.
  const [selezionati, setSelezionati] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [bulkCategoria, setBulkCategoria] = useState("");
  // Ancora per la selezione a intervalli con Shift; conferma inline dell'elimina.
  const [ancoraId, setAncoraId] = useState<string | null>(null);
  const shiftRef = useRef(false);
  const [confermaElimina, setConfermaElimina] = useState(false);
  const [inCorso, startTransition] = useTransition();
  const { mostra } = useToast();
  const router = useRouter();

  const gruppi = useMemo(() => gruppiCategorie(categorie), [categorie]);

  // Conteggi per il dropdown categoria (sull'intero catalogo, non filtrato):
  // diretti per ogni categoria + senza categoria.
  const conteggi = useMemo(() => {
    const perCategoria = new Map<string, number>();
    let senza = 0;
    for (const p of prodotti) {
      if (p.categoriaId) {
        perCategoria.set(
          p.categoriaId,
          (perCategoria.get(p.categoriaId) ?? 0) + 1,
        );
      } else {
        senza++;
      }
    }
    return { perCategoria, senza };
  }, [prodotti]);

  const conteggioCon = (ids: string[]) =>
    ids.reduce((s, id) => s + (conteggi.perCategoria.get(id) ?? 0), 0);

  const visibili = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Filtro per macro = macro + figlie (stessa semantica della vetrina).
    const idsCategoria =
      filtroCategoria && filtroCategoria !== "none"
        ? new Set(idConDiscendenti(categorie, filtroCategoria))
        : null;

    const filtrati = prodotti.filter((p) => {
      if (filtro === "attivi" && !p.attivo) return false;
      if (filtro === "nascosti" && p.attivo) return false;
      if (filtroCategoria === "none" && p.categoriaId) return false;
      if (idsCategoria && (!p.categoriaId || !idsCategoria.has(p.categoriaId)))
        return false;
      if (!q) return true;
      return (
        p.nome.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)
      );
    });

    // "recenti" = ordine dal server (creato_il desc): niente ri-sort.
    if (ordina === "recenti") return filtrati;
    const copia = [...filtrati];
    switch (ordina) {
      case "nome":
        copia.sort((a, b) => a.nome.localeCompare(b.nome, "it"));
        break;
      case "prezzo-asc":
        copia.sort((a, b) => a.prezzo_cents - b.prezzo_cents);
        break;
      case "prezzo-desc":
        copia.sort((a, b) => b.prezzo_cents - a.prezzo_cents);
        break;
      case "scorte":
        copia.sort((a, b) => a.stockTotale - b.stockTotale);
        break;
    }
    return copia;
  }, [prodotti, query, filtro, filtroCategoria, ordina, categorie]);

  const filtriAttivi =
    (query.trim() ? 1 : 0) +
    (filtro !== "tutti" ? 1 : 0) +
    (filtroCategoria ? 1 : 0);

  function azzeraFiltri() {
    setQuery("");
    setFiltro("tutti");
    setFiltroCategoria("");
    setOrdina("recenti");
  }

  function toggleSelezione(id: string) {
    setSelezionati((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Click su una checkbox riga. Con Shift SELEZIONA (aggiunge) l'intervallo tra
  // l'ultima riga cliccata (ancora) e questa, nell'ordine visibile — come Gmail
  // o il Finder. Senza Shift: toggle singolo e nuova ancora. Il modificatore si
  // legge nell'onClick (l'onChange non porta i tasti premuti) via shiftRef.
  // L'ancora e un ID, non un indice: resta valida anche se i filtri cambiano.
  function selezionaClick(id: string) {
    if (shiftRef.current && ancoraId && ancoraId !== id) {
      const a = visibili.findIndex((p) => p.id === ancoraId);
      const b = visibili.findIndex((p) => p.id === id);
      if (a !== -1 && b !== -1) {
        const [da, fine] = a < b ? [a, b] : [b, a];
        setSelezionati((prev) => {
          const next = new Set(prev);
          for (let i = da; i <= fine; i++) next.add(visibili[i].id);
          return next;
        });
        return; // ancora invariata: si puo continuare a estendere
      }
    }
    toggleSelezione(id);
    setAncoraId(id);
  }

  const tuttiVisibiliSelezionati =
    visibili.length > 0 && visibili.every((p) => selezionati.has(p.id));

  function toggleTuttiVisibili() {
    setSelezionati((prev) => {
      if (tuttiVisibiliSelezionati) {
        const next = new Set(prev);
        for (const p of visibili) next.delete(p.id);
        return next;
      }
      const next = new Set(prev);
      for (const p of visibili) next.add(p.id);
      return next;
    });
  }

  function applicaBulk() {
    const ids = [...selezionati];
    startTransition(async () => {
      const esito = await assegnaCategoriaBulkAction(
        ids,
        bulkCategoria || null,
      );
      if (esito.ok) {
        const n = esito.aggiornati ?? ids.length;
        mostra(
          bulkCategoria
            ? `Categoria assegnata a ${n} ${n === 1 ? "prodotto" : "prodotti"}.`
            : `Categoria rimossa da ${n} ${n === 1 ? "prodotto" : "prodotti"}.`,
        );
        setSelezionati(new Set());
        setBulkCategoria("");
        setAncoraId(null);
        router.refresh();
      } else {
        mostra(esito.error ?? "Impossibile aggiornare la categoria.", "errore");
      }
    });
  }

  function eseguiElimina() {
    const ids = [...selezionati];
    startTransition(async () => {
      const esito = await eliminaProdottiBulkAction(ids);
      if (!esito.ok) {
        mostra(esito.error ?? "Impossibile eliminare i prodotti.", "errore");
        return;
      }
      const el = esito.eliminati ?? 0;
      const na = esito.nascosti ?? 0;
      let msg: string;
      if (na === 0) {
        msg = `${el} ${el === 1 ? "prodotto eliminato" : "prodotti eliminati"}.`;
      } else if (el === 0) {
        msg = `${na} ${na === 1 ? "prodotto nascosto" : "prodotti nascosti"} (già venduti, mantenuti per lo storico ordini).`;
      } else {
        msg = `${el} ${el === 1 ? "eliminato" : "eliminati"}, ${na} ${na === 1 ? "nascosto" : "nascosti"} (già venduti, mantenuti per lo storico).`;
      }
      mostra(msg);
      setSelezionati(new Set());
      setConfermaElimina(false);
      setAncoraId(null);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-3xl lg:max-w-5xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-sea">
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
              <rect x="3" y="4" width="7" height="7" rx="1.5" />
              <rect x="14" y="4" width="7" height="7" rx="1.5" />
              <rect x="3" y="15" width="7" height="5" rx="1.5" />
              <rect x="14" y="15" width="7" height="5" rx="1.5" />
            </svg>
            Catalogo
          </span>
          <h1 className="font-display text-2xl font-extrabold text-foreground">
            Prodotti
          </h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href="/gestore/prodotti/importa"
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-4 font-display text-sm font-bold text-sea ring-2 ring-sea transition-all hover:-translate-y-0.5 hover:bg-surface"
          >
            📦 Importa
          </Link>
          <Link
            href="/gestore/prodotti/genera"
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-4 font-display text-sm font-bold text-sea ring-2 ring-sea transition-all hover:-translate-y-0.5 hover:bg-surface"
          >
            ✨ Genera
          </Link>
          <Link
            href="/gestore/prodotti/nuovo"
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-sea px-5 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5"
          >
            + Nuovo
          </Link>
        </div>
      </div>

      {/* Toolbar: ricerca + stato + categoria + ordinamento */}
      <div className="sticky top-14 z-10 -mx-4 mb-2 flex flex-col gap-2.5 bg-background/95 px-4 py-2 backdrop-blur md:top-0 md:mx-0 md:px-0">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
          <div className="relative lg:flex-1">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none absolute inset-y-0 left-4 my-auto h-5 w-5 text-muted"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              inputMode="search"
              placeholder="Cerca per nome o slug…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-12 w-full rounded-full bg-white pl-11 pr-4 text-base text-foreground ring-1 ring-line outline-none transition-shadow"
            />
          </div>
          <div className="flex gap-1 rounded-full bg-surface-2 p-1 text-sm lg:w-auto">
            {(["tutti", "attivi", "nascosti"] as FiltroStato[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filtro === f}
                onClick={() => setFiltro(f)}
                className={[
                  "flex-1 rounded-full py-2 font-display font-bold capitalize transition-all lg:flex-none lg:px-5",
                  filtro === f
                    ? "bg-sea text-white shadow-sea"
                    : "text-muted hover:text-foreground",
                ].join(" ")}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Filtro categoria (con conteggi) */}
          <label className="relative min-w-0 flex-1 sm:flex-none">
            <span className="sr-only">Filtra per categoria</span>
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className={[
                "h-11 w-full appearance-none rounded-full bg-white pl-4 pr-9 font-display text-sm font-bold outline-none ring-1 transition-shadow sm:w-auto",
                filtroCategoria
                  ? "text-sea ring-sea"
                  : "text-foreground ring-line hover:ring-sea",
              ].join(" ")}
            >
              <option value="">Tutte le categorie</option>
              <option value="none">Senza categoria ({conteggi.senza})</option>
              {gruppi.map(({ radice, figlie }) =>
                figlie.length === 0 ? (
                  <option key={radice.id} value={radice.id}>
                    {radice.nome} ({conteggi.perCategoria.get(radice.id) ?? 0})
                  </option>
                ) : (
                  <optgroup key={radice.id} label={radice.nome}>
                    <option value={radice.id}>
                      {radice.nome} (tutto:{" "}
                      {conteggioCon(idConDiscendenti(categorie, radice.id))})
                    </option>
                    {figlie.map(({ figlia, nipoti }) =>
                      nipoti.length === 0 ? (
                        <option key={figlia.id} value={figlia.id}>
                          {figlia.nome} ({conteggi.perCategoria.get(figlia.id) ?? 0})
                        </option>
                      ) : (
                        <Fragment key={figlia.id}>
                          <option value={figlia.id}>
                            {figlia.nome} (tutto:{" "}
                            {conteggioCon(idConDiscendenti(categorie, figlia.id))})
                          </option>
                          {nipoti.map((n) => (
                            <option key={n.id} value={n.id}>
                              {"   "}
                              {n.nome} ({conteggi.perCategoria.get(n.id) ?? 0})
                            </option>
                          ))}
                        </Fragment>
                      ),
                    )}
                  </optgroup>
                ),
              )}
            </select>
            <ChevronSelect />
          </label>

          {/* Ordinamento */}
          <label className="relative min-w-0 flex-1 sm:flex-none">
            <span className="sr-only">Ordina per</span>
            <select
              value={ordina}
              onChange={(e) => setOrdina(e.target.value as OrdinamentoLista)}
              className="h-11 w-full appearance-none rounded-full bg-white pl-4 pr-9 font-display text-sm font-bold text-foreground outline-none ring-1 ring-line transition-shadow hover:ring-sea sm:w-auto"
            >
              {ORDINAMENTI_LISTA.map((o) => (
                <option key={o.valore} value={o.valore}>
                  {o.etichetta}
                </option>
              ))}
            </select>
            <ChevronSelect />
          </label>

          <span className="ml-auto text-sm tabular-nums text-muted">
            {visibili.length === prodotti.length
              ? `${prodotti.length} prodotti`
              : `${visibili.length} di ${prodotti.length}`}
          </span>

          {filtriAttivi > 0 && (
            <button
              type="button"
              onClick={azzeraFiltri}
              className="font-display text-sm font-bold text-coral transition-colors hover:text-coral-ink"
            >
              Azzera filtri
            </button>
          )}
        </div>
      </div>

      {visibili.length === 0 ? (
        <StatoVuoto haProdotti={prodotti.length > 0} />
      ) : (
        // A lg la lista diventa una "tabella in card": sotto restano le card di sempre.
        <div className="lg:overflow-hidden lg:rounded-2xl lg:bg-white lg:shadow-soft lg:ring-1 lg:ring-line">
          <div className="hidden border-b border-line px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-muted lg:grid lg:grid-cols-[1.75rem_minmax(0,1fr)_9.5rem_6rem_9.5rem_7.5rem] lg:items-center lg:gap-3">
            <input
              type="checkbox"
              aria-label="Seleziona tutti i prodotti visibili"
              checked={tuttiVisibiliSelezionati}
              onChange={toggleTuttiVisibili}
              className="h-5 w-5 cursor-pointer rounded accent-sea"
            />
            <span>Prodotto</span>
            <span>Categoria</span>
            <span className="text-right">Prezzo</span>
            <span>Disponibilità</span>
            <span className="text-right">In vendita</span>
          </div>
          <ul className="flex flex-col gap-2.5 lg:gap-0 lg:divide-y lg:divide-line">
            {visibili.map((p) => {
              const selezionato = selezionati.has(p.id);
              return (
                <li
                  key={p.id}
                  className={[
                    "flex items-center gap-3 rounded-2xl bg-white p-3 shadow-soft ring-1 transition-all lg:grid lg:grid-cols-[1.75rem_minmax(0,1fr)_9.5rem_6rem_9.5rem_7.5rem] lg:rounded-none lg:px-4 lg:py-2.5 lg:shadow-none lg:ring-0",
                    selezionato
                      ? "ring-sea lg:bg-sea/5"
                      : "ring-line hover:-translate-y-0.5 hover:shadow-sea lg:hover:translate-y-0 lg:hover:bg-surface lg:hover:shadow-none",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    aria-label={`Seleziona ${p.nome}`}
                    checked={selezionato}
                    onClick={(e) => {
                      shiftRef.current = e.shiftKey;
                    }}
                    onChange={() => selezionaClick(p.id)}
                    className="h-5 w-5 shrink-0 cursor-pointer rounded accent-sea"
                  />
                  <Link
                    href={`/gestore/prodotti/${p.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 lg:flex-none"
                  >
                    <Miniatura url={p.immagine_url} nome={p.nome} />
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-bold text-foreground">
                        {p.nome}
                      </p>
                      <p className="truncate font-mono text-xs text-muted">
                        /{p.slug}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 lg:hidden">
                        <span className="text-sm font-bold tabular-nums text-sea">
                          {formatPrezzo(p.prezzo_cents, p.valuta)}
                        </span>
                        <BadgeCategoria
                          categorie={categorie}
                          categoriaId={p.categoriaId}
                        />
                        <BadgeStock
                          stock={p.stockTotale}
                          numVarianti={p.numVarianti}
                          suRichiesta={p.suRichiesta}
                        />
                      </div>
                    </div>
                  </Link>
                  {/* Celle categoria/prezzo/disponibilità: solo desktop. */}
                  <div className="hidden min-w-0 lg:block">
                    <BadgeCategoria
                      categorie={categorie}
                      categoriaId={p.categoriaId}
                    />
                  </div>
                  <span className="hidden text-right text-sm font-bold tabular-nums text-sea lg:block">
                    {formatPrezzo(p.prezzo_cents, p.valuta)}
                  </span>
                  <div className="hidden min-w-0 lg:flex">
                    <BadgeStock
                      stock={p.stockTotale}
                      numVarianti={p.numVarianti}
                      suRichiesta={p.suRichiesta}
                    />
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={[
                        "font-display text-xs font-bold lg:hidden",
                        p.attivo ? "text-sea" : "text-muted",
                      ].join(" ")}
                    >
                      {p.attivo ? "In vendita" : "Nascosto"}
                    </span>
                    <ToggleAttivo id={p.id} attivo={p.attivo} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Barra assegnazione in blocco (sopra la bottom-nav mobile). */}
      {selezionati.size > 0 && (
        <div className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 md:inset-x-auto md:bottom-6 md:left-1/2 md:w-auto md:-translate-x-1/2">
          <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-2.5 rounded-3xl bg-foreground p-3 text-white shadow-[0_18px_50px_-12px_rgba(10,31,51,0.55)] md:flex-nowrap md:rounded-full md:py-2.5 md:pl-5">
            {confermaElimina ? (
              // Conferma inline a due passi: niente modale, ma un'azione
              // distruttiva non parte mai al primo click.
              <>
                <span className="min-w-0 flex-1 font-display text-sm font-bold">
                  Eliminare {selezionati.size}{" "}
                  {selezionati.size === 1 ? "prodotto" : "prodotti"}?
                </span>
                <button
                  type="button"
                  onClick={() => setConfermaElimina(false)}
                  disabled={inCorso}
                  className="inline-flex h-11 shrink-0 items-center rounded-full px-4 font-display text-sm font-bold text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-60"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={eseguiElimina}
                  disabled={inCorso}
                  className="inline-flex h-11 shrink-0 items-center rounded-full bg-coral px-5 font-display text-sm font-bold text-white shadow-coral transition-all hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {inCorso ? "Elimino…" : "Sì, elimina"}
                </button>
              </>
            ) : (
              <>
                <span className="font-display text-sm font-bold tabular-nums">
                  {selezionati.size}{" "}
                  {selezionati.size === 1 ? "selezionato" : "selezionati"}
                </span>
                <div className="min-w-0 flex-1 basis-40 [&_select]:h-11 [&_select]:rounded-full [&_select]:text-sm">
                  <CategoriaSelect
                    id="bulk-categoria"
                    categorie={categorie}
                    value={bulkCategoria}
                    onChange={setBulkCategoria}
                    disabled={inCorso}
                  />
                </div>
                <button
                  type="button"
                  onClick={applicaBulk}
                  disabled={inCorso}
                  className="inline-flex h-11 shrink-0 items-center rounded-full bg-sea px-5 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {inCorso
                    ? "Applico…"
                    : bulkCategoria
                      ? "Assegna"
                      : "Rimuovi categoria"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfermaElimina(true)}
                  disabled={inCorso}
                  className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 font-display text-sm font-bold text-coral ring-1 ring-coral/40 transition-colors hover:bg-coral hover:text-white disabled:opacity-60"
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
                    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
                  </svg>
                  Elimina
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelezionati(new Set());
                    setConfermaElimina(false);
                    setAncoraId(null);
                  }}
                  disabled={inCorso}
                  aria-label="Annulla selezione"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
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
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Freccia dei select "pill" della toolbar. */
function ChevronSelect() {
  return (
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
  );
}

function BadgeCategoria({
  categorie,
  categoriaId,
}: {
  categorie: Categoria[];
  categoriaId: string | null;
}) {
  if (!categoriaId) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sun/25 px-2.5 py-0.5 text-xs font-bold text-[#8a6500]">
        Senza categoria
      </span>
    );
  }
  const etichetta = etichettaCategoria(categorie, categoriaId);
  if (!etichetta) {
    // Id orfano (categoria cancellata e lista non ancora ricaricata).
    return (
      <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted">
        —
      </span>
    );
  }
  return (
    <span
      title={etichetta}
      className="inline-block max-w-full truncate rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-bold text-foreground"
    >
      {etichetta}
    </span>
  );
}

function Miniatura({ url, nome }: { url: string | null; nome: string }) {
  return (
    <div className="relative aspect-[3/3.4] w-14 shrink-0 overflow-hidden rounded-xl bg-surface ring-1 ring-line lg:w-12">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- url da Storage con cache-bust
        <img
          src={url}
          alt={nome}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="tile-cyan grid h-full w-full place-items-center text-white">
          <svg
            viewBox="0 0 100 100"
            fill="currentColor"
            aria-hidden="true"
            className="w-1/2 drop-shadow-[0_4px_8px_rgba(0,40,70,0.25)]"
          >
            <path d="M32 18 L18 28 L24 40 L31 35 L31 84 L69 84 L69 35 L76 40 L82 28 L68 18 C64 24 56 26 50 26 C44 26 36 24 32 18 Z" />
          </svg>
        </div>
      )}
    </div>
  );
}

function BadgeStock({
  stock,
  numVarianti,
  suRichiesta,
}: {
  stock: number;
  numVarianti: number;
  suRichiesta: boolean;
}) {
  if (numVarianti === 0) {
    return (
      <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted">
        Nessuna variante
      </span>
    );
  }
  // Magazzino non in tempo reale: niente conteggio, solo "su richiesta".
  if (suRichiesta) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-bold text-sea">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3 w-3"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Su richiesta
      </span>
    );
  }
  if (stock === 0) {
    return (
      <span className="rounded-full bg-coral/15 px-2.5 py-0.5 text-xs font-bold text-coral">
        Esaurito
      </span>
    );
  }
  if (stock <= SOGLIA_SCORTE) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sun/30 px-2.5 py-0.5 text-xs font-bold text-[#8a6500]">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-sun" />
        Scorte basse · {stock}
      </span>
    );
  }
  return <span className="text-xs text-muted">{stock} pz</span>;
}

function StatoVuoto({ haProdotti }: { haProdotti: boolean }) {
  return (
    <div className="rounded-3xl bg-surface px-6 py-12 text-center ring-1 ring-dashed ring-line">
      <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-sea">
        <svg
          viewBox="0 0 100 100"
          fill="currentColor"
          aria-hidden="true"
          className="h-8 w-8"
        >
          <path d="M32 18 L18 28 L24 40 L31 35 L31 84 L69 84 L69 35 L76 40 L82 28 L68 18 C64 24 56 26 50 26 C44 26 36 24 32 18 Z" />
        </svg>
      </span>
      <p className="text-sm text-muted">
        {haProdotti
          ? "Nessun prodotto corrisponde ai filtri."
          : "Non ci sono ancora prodotti."}
      </p>
      {!haProdotti && (
        <Link
          href="/gestore/prodotti/nuovo"
          className="mt-4 inline-flex h-11 items-center rounded-full bg-sea px-5 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5"
        >
          + Crea il primo prodotto
        </Link>
      )}
    </div>
  );
}
