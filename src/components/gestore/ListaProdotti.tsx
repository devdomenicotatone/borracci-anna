"use client";

// Lista prodotti del gestore: ricerca, filtro stato, filtro categoria,
// ordinamento, paginazione e selezione multipla con azioni in blocco.
// Ricerca/filtri/ordinamento/paginazione girano LATO SERVER (RPC) con lo stato
// nell'URL: la pagina server (prodotti/page.tsx) legge i searchParams, carica la
// pagina di risultati col totale e la passa qui gia pronta. Cosi il browser non
// riceve piu l'intero catalogo (ne gli sku di tutte le varianti). La selezione e
// le azioni bulk restano client.

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
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
  idsProdottiFiltratiAction,
} from "@/lib/gestore/actions";
import type { Categoria } from "@/lib/types";
import {
  ETICHETTE_ORDINAMENTO_GESTORE,
  ORDINAMENTI_GESTORE,
  PAGINA_MAX_GESTORE,
  contaFiltriGestoreAttivi,
  serializzaFiltriGestore,
  type ConteggiCategorie,
  type FiltriGestore,
  type OrdinamentoGestore,
  type StatoProdotto,
} from "@/lib/filtri-gestore";
import CategoriaSelect from "@/components/gestore/CategoriaSelect";
import ToggleAttivo from "@/components/gestore/ToggleAttivo";
import CondividiProdotto from "@/components/prodotto/CondividiProdotto";
import { useToast } from "@/components/gestore/Toaster";

/** Una riga della lista, gia proiettata dal server (niente sku/codice: la
 *  ricerca e lato DB, quindi non serve spedirli al browser). */
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

/** Soglia sotto la quale si segnala "scorte basse". */
const SOGLIA_SCORTE = 5;

const BASE_PATH = "/gestore/prodotti";

export default function ListaProdotti({
  prodotti,
  totale,
  filtri,
  pagina,
  categorie,
  conteggi,
}: {
  /** Pagina di risultati (cumulativa fino a `pagina`), gia filtrata/ordinata. */
  prodotti: ProdottoLista[];
  /** Totale prodotti che rispettano i filtri (oltre la pagina corrente). */
  totale: number;
  /** Filtri correnti, gia interpretati dal server dai searchParams. */
  filtri: FiltriGestore;
  pagina: number;
  categorie: Categoria[];
  /** Conteggi per categoria (intero catalogo), per i numeri del menu. */
  conteggi: ConteggiCategorie;
}) {
  const router = useRouter();
  const [navPending, startNav] = useTransition();
  const { mostra } = useToast();

  /** Naviga con i filtri aggiornati. Ometti `pagina` = torna alla prima pagina
   *  (ogni cambio di filtro riparte da capo); passala solo per "Mostra altri". */
  const naviga = useCallback(
    (nuovi: Partial<FiltriGestore>, opts?: { pagina?: number }) => {
      const params = new URLSearchParams(
        serializzaFiltriGestore({ ...filtri, ...nuovi }),
      );
      if (opts?.pagina && opts.pagina > 1) {
        params.set("pagina", String(opts.pagina));
      }
      const qs = params.toString();
      startNav(() =>
        router.replace(qs ? `${BASE_PATH}?${qs}` : BASE_PATH, { scroll: false }),
      );
    },
    [filtri, router, startNav],
  );

  // --- Ricerca: input reattivo (focus mai perso) + push all'URL con debounce ---
  // Il campo e stato locale (digitazione fluida); l'URL si aggiorna in ritardo.
  // `ultimoPushQ` = ultimo valore sincronizzato con l'URL: distingue le NOSTRE
  // push dai cambi esterni (Azzera, back/forward) senza calpestare la digitazione
  // in corso. Il ref si scrive solo dentro effetti/handler, mai durante il render.
  const [q, setQ] = useState(filtri.q);
  const ultimoPushQ = useRef(filtri.q);

  useEffect(() => {
    if (q === ultimoPushQ.current) return;
    const t = setTimeout(() => {
      ultimoPushQ.current = q;
      naviga({ q: q.trim() });
    }, 300);
    return () => clearTimeout(t);
  }, [q, naviga]);

  useEffect(() => {
    if (filtri.q === ultimoPushQ.current) return; // e' una nostra push: ignora
    ultimoPushQ.current = filtri.q;
    setQ(filtri.q);
  }, [filtri.q]);

  // --- Selezione multipla (client) --------------------------------------------
  // La selezione e un insieme di id: puo coprire piu della pagina caricata
  // (vedi selezionaTuttiFiltrati). Persiste tra le navigazioni: il componente
  // resta montato mentre il server ri-renderizza la lista.
  const [selezionati, setSelezionati] = useState<ReadonlySet<string>>(new Set());
  const [selezionandoTutti, setSelezionandoTutti] = useState(false);
  const [bulkCategoria, setBulkCategoria] = useState("");
  const [ancoraId, setAncoraId] = useState<string | null>(null);
  const shiftRef = useRef(false);
  const [confermaElimina, setConfermaElimina] = useState(false);
  const [inCorso, startTransition] = useTransition();

  const gruppi = useMemo(() => gruppiCategorie(categorie), [categorie]);
  const conteggioCon = (ids: string[]) =>
    ids.reduce((s, id) => s + (conteggi.perCategoria[id] ?? 0), 0);

  const attivi = contaFiltriGestoreAttivi(filtri);

  function azzeraFiltri() {
    naviga({ q: "", stato: "tutti", categoria: "", ordina: "recenti" });
  }

  function toggleSelezione(id: string) {
    setSelezionati((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Click su una checkbox riga. Con Shift SELEZIONA l'intervallo tra l'ultima
  // riga cliccata (ancora) e questa, nell'ordine visibile — come Gmail/Finder.
  // Senza Shift: toggle singolo e nuova ancora. Il modificatore si legge
  // nell'onClick (l'onChange non porta i tasti premuti) via shiftRef. L'ancora e
  // un ID, non un indice: resta valida anche se i filtri cambiano.
  function selezionaClick(id: string) {
    if (shiftRef.current && ancoraId && ancoraId !== id) {
      const a = prodotti.findIndex((p) => p.id === ancoraId);
      const b = prodotti.findIndex((p) => p.id === id);
      if (a !== -1 && b !== -1) {
        const [da, fine] = a < b ? [a, b] : [b, a];
        setSelezionati((prev) => {
          const next = new Set(prev);
          for (let i = da; i <= fine; i++) next.add(prodotti[i].id);
          return next;
        });
        return; // ancora invariata: si puo continuare a estendere
      }
    }
    toggleSelezione(id);
    setAncoraId(id);
  }

  const tuttiVisibiliSelezionati =
    prodotti.length > 0 && prodotti.every((p) => selezionati.has(p.id));

  function toggleTuttiVisibili() {
    setSelezionati((prev) => {
      if (tuttiVisibiliSelezionati) {
        const next = new Set(prev);
        for (const p of prodotti) next.delete(p.id);
        return next;
      }
      const next = new Set(prev);
      for (const p of prodotti) next.add(p.id);
      return next;
    });
  }

  // Estende la selezione a TUTTI i prodotti che rispettano i filtri (oltre la
  // pagina caricata): recupera i soli id dal server e li seleziona.
  async function selezionaTuttiFiltrati() {
    setSelezionandoTutti(true);
    try {
      const esito = await idsProdottiFiltratiAction(filtri);
      if (esito.ok && esito.ids) {
        setSelezionati(new Set(esito.ids));
      } else {
        mostra(esito.error ?? "Impossibile selezionare tutti i prodotti.", "errore");
      }
    } finally {
      setSelezionandoTutti(false);
    }
  }

  function svuotaSelezione() {
    setSelezionati(new Set());
    setConfermaElimina(false);
    setAncoraId(null);
  }

  function applicaBulk() {
    const ids = [...selezionati];
    startTransition(async () => {
      const esito = await assegnaCategoriaBulkAction(ids, bulkCategoria || null);
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
      svuotaSelezione();
      router.refresh();
    });
  }

  const puoMostrareAltri =
    prodotti.length < totale && pagina < PAGINA_MAX_GESTORE;
  const cappato = prodotti.length < totale && pagina >= PAGINA_MAX_GESTORE;

  // Scroll infinito: quando la sentinella (il blocco "Mostra altri") entra in
  // vista si carica la pagina successiva. Durante il caricamento (navPending)
  // l'observer si stacca — niente doppio fire —; a fine load si riaggancia e, se
  // la sentinella e ancora in vista, prosegue. Il bottone resta come fallback
  // accessibile (tastiera/screen reader) e per riprovare in caso di errore.
  const sentinellaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!puoMostrareAltri || navPending) return;
    const el = sentinellaRef.current;
    if (!el) return;
    const osservatore = new IntersectionObserver(
      (voci) => {
        if (voci[0]?.isIntersecting) naviga({}, { pagina: pagina + 1 });
      },
      { rootMargin: "800px" },
    );
    osservatore.observe(el);
    return () => osservatore.disconnect();
  }, [puoMostrareAltri, navPending, pagina, naviga]);

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
              placeholder="Cerca per nome, slug o SKU…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-12 w-full rounded-full bg-white pl-11 pr-4 text-base text-foreground ring-1 ring-line outline-none transition-shadow"
            />
          </div>
          <div className="flex gap-1 rounded-full bg-surface-2 p-1 text-sm lg:w-auto">
            {(["tutti", "attivi", "nascosti"] as StatoProdotto[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filtri.stato === f}
                onClick={() => naviga({ stato: f })}
                className={[
                  "flex-1 rounded-full py-2 font-display font-bold capitalize transition-all lg:flex-none lg:px-5",
                  filtri.stato === f
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
              value={filtri.categoria}
              onChange={(e) => naviga({ categoria: e.target.value })}
              className={[
                "h-11 w-full appearance-none rounded-full bg-white pl-4 pr-9 font-display text-sm font-bold outline-none ring-1 transition-shadow sm:w-auto",
                filtri.categoria
                  ? "text-sea ring-sea"
                  : "text-foreground ring-line hover:ring-sea",
              ].join(" ")}
            >
              <option value="">Tutte le categorie</option>
              <option value="none">Senza categoria ({conteggi.senza})</option>
              {gruppi.map(({ radice, figlie }) =>
                figlie.length === 0 ? (
                  <option key={radice.id} value={radice.id}>
                    {radice.nome} ({conteggi.perCategoria[radice.id] ?? 0})
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
                          {figlia.nome} ({conteggi.perCategoria[figlia.id] ?? 0})
                        </option>
                      ) : (
                        <Fragment key={figlia.id}>
                          <option value={figlia.id}>
                            {figlia.nome} (tutto:{" "}
                            {conteggioCon(idConDiscendenti(categorie, figlia.id))})
                          </option>
                          {nipoti.map((n) => (
                            <option key={n.id} value={n.id}>
                              {"   "}
                              {n.nome} ({conteggi.perCategoria[n.id] ?? 0})
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
              value={filtri.ordina}
              onChange={(e) =>
                naviga({ ordina: e.target.value as OrdinamentoGestore })
              }
              className="h-11 w-full appearance-none rounded-full bg-white pl-4 pr-9 font-display text-sm font-bold text-foreground outline-none ring-1 ring-line transition-shadow hover:ring-sea sm:w-auto"
            >
              {ORDINAMENTI_GESTORE.map((o) => (
                <option key={o} value={o}>
                  {ETICHETTE_ORDINAMENTO_GESTORE[o]}
                </option>
              ))}
            </select>
            <ChevronSelect />
          </label>

          <span
            aria-live="polite"
            className="ml-auto text-sm tabular-nums text-muted"
          >
            {navPending
              ? "Aggiorno…"
              : prodotti.length >= totale
                ? `${totale} ${totale === 1 ? "prodotto" : "prodotti"}`
                : `${prodotti.length} di ${totale}`}
          </span>

          {attivi > 0 && (
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

      {/* Tutti i caricati selezionati e ce ne sono altri oltre la pagina: offri
          di selezionare l'INTERO set dei match (id presi dal server). Sparisce
          quando sono gia tutti selezionati. */}
      {tuttiVisibiliSelezionati &&
        totale > prodotti.length &&
        selezionati.size < totale && (
          <div className="mb-2.5 flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-sea/10 px-4 py-2.5 text-center text-sm text-foreground">
            <span>
              Selezionati i{" "}
              <span className="font-bold tabular-nums">{prodotti.length}</span> in
              questa vista.
            </span>
            <button
              type="button"
              onClick={selezionaTuttiFiltrati}
              disabled={selezionandoTutti}
              className="font-display font-bold text-sea hover:text-sea/80 disabled:opacity-60"
            >
              {selezionandoTutti ? "Seleziono…" : `Seleziona tutti i ${totale}`}
            </button>
          </div>
        )}

      {prodotti.length === 0 ? (
        <StatoVuoto conFiltri={attivi > 0} onAzzera={azzeraFiltri} />
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
            {prodotti.map((p) => {
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
                  <div className="flex items-center justify-end gap-2">
                    {/* Condivisione (QR/link) e download immagine social. Solo
                        per gli attivi: la PDP e il poster leggono il catalogo
                        attivo, quindi per un nascosto porterebbero a un 404. */}
                    {p.attivo && (
                      <>
                        <CondividiProdotto
                          slug={p.slug}
                          nome={p.nome}
                          variante="icona"
                        />
                        <a
                          href={`/prodotti/${p.slug}/social`}
                          download={`anna-shop-${p.slug}-storia.png`}
                          title="Scarica immagine per social"
                          aria-label={`Scarica immagine social di ${p.nome}`}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted ring-1 ring-line transition-colors hover:text-sea hover:ring-sea"
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
                            <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                          </svg>
                        </a>
                      </>
                    )}
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
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Scroll infinito: questo blocco e la sentinella dell'IntersectionObserver
          (autocarica la pagina successiva entrando in vista); il bottone resta
          come fallback accessibile. */}
      {puoMostrareAltri && (
        <div
          ref={sentinellaRef}
          className="mt-6 flex flex-col items-center gap-2"
        >
          <p className="text-sm tabular-nums text-muted">
            Hai visto {prodotti.length} di {totale}
          </p>
          <button
            type="button"
            onClick={() => naviga({}, { pagina: pagina + 1 })}
            disabled={navPending}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 font-display text-sm font-bold text-sea ring-2 ring-sea transition-all hover:-translate-y-0.5 hover:bg-surface disabled:opacity-60"
          >
            {navPending && (
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-sea/30 border-t-sea"
              />
            )}
            {navPending ? "Carico…" : "Mostra altri"}
          </button>
        </div>
      )}
      {cappato && (
        <p className="mt-6 text-center text-sm text-muted">
          Visualizzati {prodotti.length} prodotti su {totale}. Affina la ricerca o
          i filtri per trovare gli altri.
        </p>
      )}

      {/* Barra azioni in blocco (sopra la bottom-nav mobile). */}
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
                  onClick={svuotaSelezione}
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

function StatoVuoto({
  conFiltri,
  onAzzera,
}: {
  conFiltri: boolean;
  onAzzera: () => void;
}) {
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
        {conFiltri
          ? "Nessun prodotto corrisponde ai filtri."
          : "Non ci sono ancora prodotti."}
      </p>
      {conFiltri ? (
        <button
          type="button"
          onClick={onAzzera}
          className="mt-4 inline-flex h-11 items-center rounded-full bg-sea px-5 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5"
        >
          Azzera i filtri
        </button>
      ) : (
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
