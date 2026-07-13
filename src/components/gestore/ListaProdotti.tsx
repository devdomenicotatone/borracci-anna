"use client";

// Lista prodotti del gestore: ricerca, filtro stato, filtro categoria,
// ordinamento, paginazione e selezione multipla con azioni in blocco.
// Ricerca/filtri/ordinamento girano LATO SERVER (RPC) con lo stato nell'URL:
// la pagina server (prodotti/page.tsx) legge i searchParams, carica la pagina
// di risultati col totale e la passa qui gia pronta. Cosi il browser non
// riceve piu l'intero catalogo (ne gli sku di tutte le varianti).
//
// SCROLL INFINITO ad APPEND incrementale (come CaricamentoAutomatico in
// vetrina): la pagina successiva arriva via Server Action
// (paginaProdottiGestoreAction) come DELTA di 50 righe e si accumula qui.
// Prima ogni blocco rinavigava a ?pagina=N+1: il server rifaceva la RPC
// dall'inizio e ritrasmetteva TUTTO il cumulato nel payload RSC — verso pagina
// 20+ oltre 1000 righe ritrasferite per riceverne 50. Dopo ogni append l'URL
// avanza comunque a ?pagina=N con replaceState nativo (integrato dal router di
// Next): un refresh o il back ritrovano il cumulato giusto dal percorso URL.
// La selezione e le azioni bulk restano client.

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Image from "next/image";
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
  cambiaVisibilitaBulkAction,
  eliminaProdottiBulkAction,
  idsProdottiFiltratiAction,
} from "@/lib/gestore/actions";
import { paginaProdottiGestoreAction } from "@/lib/gestore/prodotti-lista-actions";
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
import { ChevronSelect, Spinner } from "@/components/gestore/ui";
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

/** Stato dell'append dello scroll infinito, in un oggetto solo: ogni
 *  aggiornamento e atomico e puo essere validato sulla `base` (il payload
 *  server al momento della richiesta), cosi una risposta stantia arrivata dopo
 *  una navigazione o un refresh si scarta intera invece di appendere doppioni
 *  sullo stato appena azzerato. */
type StatoAppend = {
  /** Il cumulato server di riferimento: identita nuova = payload nuovo. */
  base: ProdottoLista[];
  /** Pagine appese dal client (delta gia deduplicati per id). */
  blocchi: ProdottoLista[][];
  /** Totale rinfrescato da ogni risposta (il catalogo puo cambiare sotto). */
  totaleVivo: number;
  /** Fine lista raggiunta (pagina vuota o dati slittati): stop alla catena. */
  esaurito: boolean;
  /** Errore (action o rete): l'automatico e in pausa, il bottone ritenta.
   *  Vive nello stato (non in un ref) cosi si azzera col reset dell'accumulo
   *  al cambio di vista, senza mutare ref durante il render. */
  pausa: boolean;
};

/** Stato dell'append azzerato su un nuovo payload server. */
function appendIniziale(base: ProdottoLista[], totale: number): StatoAppend {
  return { base, blocchi: [], totaleVivo: totale, esaurito: false, pausa: false };
}

export default function ListaProdotti({
  prodotti,
  totale,
  filtri,
  pagina,
  categorie,
  conteggi,
  errore = false,
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
  /** La RPC di caricamento e fallita: mostra lo stato "errore" invece del
   *  catalogo vuoto (un hiccup di Supabase non e un catalogo senza prodotti). */
  errore?: boolean;
}) {
  const router = useRouter();
  const [navPending, startNav] = useTransition();
  const { mostra } = useToast();

  /** Naviga con i filtri aggiornati, ripartendo sempre dalla prima pagina: le
   *  pagine successive si accumulano ad append via Server Action, non via URL. */
  const naviga = useCallback(
    (nuovi: Partial<FiltriGestore>) => {
      const qs = serializzaFiltriGestore({ ...filtri, ...nuovi });
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

  // --- Scroll infinito ad APPEND (delta via Server Action) ---------------------
  const [append, setAppend] = useState<StatoAppend>(() =>
    appendIniziale(prodotti, totale),
  );

  // Payload server nuovo — cambio filtri/ricerca/ordinamento, back/forward su
  // ?pagina=N, router.refresh() dopo un'azione bulk: il cumulato server copre
  // (o sostituisce) gia tutto e i blocchi appesi si azzerano durante il render
  // (pattern "adjusting state when props change", come CaricamentoAutomatico);
  // le risposte ancora in volo verranno scartate dall'aggiornamento funzionale.
  // La selezione invece persiste: e un insieme di id, non di indici.
  if (append.base !== prodotti) {
    setAppend(appendIniziale(prodotti, totale));
  }

  // Lista in vista = cumulato server + blocchi appesi (gia deduplicati per id
  // all'append). TUTTE le feature esistenti (selezione con shift, "seleziona
  // visibili", azioni bulk, render) lavorano su questa lista.
  const prodottiVisibili = useMemo(
    () =>
      append.base === prodotti && append.blocchi.length > 0
        ? [...prodotti, ...append.blocchi.flat()]
        : prodotti,
    [prodotti, append],
  );

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
      const a = prodottiVisibili.findIndex((p) => p.id === ancoraId);
      const b = prodottiVisibili.findIndex((p) => p.id === id);
      if (a !== -1 && b !== -1) {
        const [da, fine] = a < b ? [a, b] : [b, a];
        setSelezionati((prev) => {
          const next = new Set(prev);
          for (let i = da; i <= fine; i++) next.add(prodottiVisibili[i].id);
          return next;
        });
        return; // ancora invariata: si puo continuare a estendere
      }
    }
    toggleSelezione(id);
    setAncoraId(id);
  }

  const tuttiVisibiliSelezionati =
    prodottiVisibili.length > 0 &&
    prodottiVisibili.every((p) => selezionati.has(p.id));

  function toggleTuttiVisibili() {
    setSelezionati((prev) => {
      if (tuttiVisibiliSelezionati) {
        const next = new Set(prev);
        for (const p of prodottiVisibili) next.delete(p.id);
        return next;
      }
      const next = new Set(prev);
      for (const p of prodottiVisibili) next.add(p.id);
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

  function cambiaVisibilita(attivo: boolean) {
    const ids = [...selezionati];
    startTransition(async () => {
      const esito = await cambiaVisibilitaBulkAction(ids, attivo);
      if (!esito.ok) {
        mostra(esito.error ?? "Operazione non riuscita.", "errore");
        return;
      }
      const n = esito.aggiornati ?? ids.length;
      mostra(
        attivo
          ? `${n} ${n === 1 ? "prodotto messo" : "prodotti messi"} in vendita.`
          : `${n} ${n === 1 ? "prodotto nascosto" : "prodotti nascosti"}.`,
      );
      svuotaSelezione();
      router.refresh();
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

  const filtriQs = serializzaFiltriGestore(filtri);
  /** Ultima pagina in vista: il cumulato server + i blocchi appesi qui. */
  const paginaCaricata = pagina + append.blocchi.length;
  const puoMostrareAltri =
    !append.esaurito &&
    prodottiVisibili.length < append.totaleVivo &&
    paginaCaricata < PAGINA_MAX_GESTORE;
  const cappato =
    !append.esaurito &&
    prodottiVisibili.length < append.totaleVivo &&
    paginaCaricata >= PAGINA_MAX_GESTORE;

  const [caricoAltri, setCaricoAltri] = useState(false);
  // Una sola richiesta in volo: il ref (non lo stato, che si aggiorna al render
  // dopo) para il doppio invio da click + sentinella nello stesso tick.
  const inVolo = useRef(false);

  // Errore (action null o rete giu): pausa dell'automatico validata sulla base
  // — se nel frattempo la vista e cambiata, la vista nuova non va in pausa.
  function pausaSuErrore(baseRichiesta: ProdottoLista[]) {
    setAppend((s) => (s.base === baseRichiesta ? { ...s, pausa: true } : s));
  }

  function caricaAltri() {
    if (inVolo.current || !puoMostrareAltri) return;
    inVolo.current = true;
    setCaricoAltri(true);
    // Catturato alla richiesta: se al ritorno il payload server e cambiato
    // (filtri nuovi, refresh dopo un bulk), la risposta e stantia e l'updater
    // la scarta intera.
    const baseRichiesta = prodotti;
    paginaProdottiGestoreAction({ filtriQs, pagina: paginaCaricata + 1 })
      .then((esito) => {
        // null = errore nell'action: NON e un fine lista — pausa
        // dell'automatico, il bottone ritenta.
        if (!esito) {
          pausaSuErrore(baseRichiesta);
          return;
        }
        setAppend((s) => {
          if (s.base !== baseRichiesta) return s; // risposta stantia: scartata
          // Pagina vuota = fine lista genuino. Il totale della RPC viaggia
          // sulle righe (window count): una pagina vuota non ne porta uno
          // affidabile, ci si allinea a quanto gia in vista.
          if (esito.prodotti.length === 0) {
            const visti =
              baseRichiesta.length +
              s.blocchi.reduce((n, b) => n + b.length, 0);
            return { ...s, totaleVivo: visti, esaurito: true };
          }
          // Dedup per id contro tutto cio che e gia in vista: con
          // l'ordinamento a offset un inserimento/rimozione concorrente fa
          // slittare le pagine di una riga — meglio una riga in meno che un
          // doppione.
          const gia = new Set(baseRichiesta.map((p) => p.id));
          for (const blocco of s.blocchi) for (const p of blocco) gia.add(p.id);
          const nuovi = esito.prodotti.filter((p) => !gia.has(p.id));
          // Nessuna riga nuova a totale non raggiunto (dati slittati): stop, o
          // la sentinella richiederebbe la stessa pagina in loop.
          if (nuovi.length === 0) {
            return { ...s, totaleVivo: esito.totale, esaurito: true };
          }
          return {
            ...s,
            blocchi: [...s.blocchi, nuovi],
            totaleVivo: esito.totale,
          };
        });
      })
      .catch(() => {
        pausaSuErrore(baseRichiesta); // rete assente/instabile: il click ritenta
      })
      .finally(() => {
        inVolo.current = false;
        setCaricoAltri(false);
      });
  }

  // Refresh e back devono ritrovare il punto raggiunto: dopo ogni append l'URL
  // avanza a ?pagina=N via History API nativa (integrata dal router di Next,
  // stesso pattern della vetrina) — nessun re-render server all'istante, ma un
  // router.refresh() o un ritorno alla pagina ricaricano il cumulato giusto.
  useEffect(() => {
    if (append.blocchi.length === 0) return;
    const params = new URLSearchParams(filtriQs);
    params.set("pagina", String(pagina + append.blocchi.length));
    window.history.replaceState(
      window.history.state,
      "",
      `${BASE_PATH}?${params.toString()}`,
    );
  }, [append.blocchi.length, filtriQs, pagina]);

  // Scroll infinito: quando la sentinella (il blocco "Mostra altri") entra in
  // vista (con ampio preload) si appende la pagina successiva. L'effetto si
  // (ri)arma a ogni render — costa nulla e l'osservazione iniziale fa ripartire
  // da sola la catena quando, ad append concluso, la sentinella e ancora in
  // vista. Niente observer durante il caricamento, in pausa (dopo un errore) o
  // a fine lista; il bottone resta come fallback accessibile (tastiera/screen
  // reader) e per riprovare in caso di errore.
  const sentinellaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (caricoAltri || append.pausa || !puoMostrareAltri) return;
    const el = sentinellaRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // L'observer scatta a raffica durante lo scroll: una richiesta per armata.
    let chiesto = false;
    const osservatore = new IntersectionObserver(
      (voci) => {
        if (chiesto) return;
        if (!voci.some((v) => v.isIntersecting)) return;
        chiesto = true;
        caricaAltri();
      },
      { rootMargin: "800px" },
    );
    osservatore.observe(el);
    return () => osservatore.disconnect();
  });

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
            {(["tutti", "attivi", "nascosti", "esauriti"] as StatoProdotto[]).map((f) => (
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
              : errore
                ? ""
                : prodottiVisibili.length >= append.totaleVivo
                  ? `${append.totaleVivo} ${append.totaleVivo === 1 ? "prodotto" : "prodotti"}`
                  : `${prodottiVisibili.length} di ${append.totaleVivo}`}
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
        append.totaleVivo > prodottiVisibili.length &&
        selezionati.size < append.totaleVivo && (
          <div className="mb-2.5 flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-sea/10 px-4 py-2.5 text-center text-sm text-foreground">
            <span>
              Selezionati i{" "}
              <span className="font-bold tabular-nums">
                {prodottiVisibili.length}
              </span>{" "}
              in questa vista.
            </span>
            <button
              type="button"
              onClick={selezionaTuttiFiltrati}
              disabled={selezionandoTutti}
              className="font-display font-bold text-sea hover:text-sea/80 disabled:opacity-60"
            >
              {selezionandoTutti
                ? "Seleziono…"
                : `Seleziona tutti i ${append.totaleVivo}`}
            </button>
          </div>
        )}

      {errore ? (
        <StatoErrore onRiprova={() => router.refresh()} />
      ) : prodottiVisibili.length === 0 ? (
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
            {prodottiVisibili.map((p) => {
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
                          immagine={p.immagine_url}
                          prezzo={formatPrezzo(p.prezzo_cents, p.valuta)}
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
          (appende la pagina successiva entrando in vista); il bottone resta
          come fallback accessibile e per riprovare dopo un errore. */}
      {puoMostrareAltri && (
        <div
          ref={sentinellaRef}
          className="mt-6 flex flex-col items-center gap-2"
        >
          <p className="text-sm tabular-nums text-muted">
            Hai visto {prodottiVisibili.length} di {append.totaleVivo}
          </p>
          <button
            type="button"
            onClick={() => {
              // Il click riattiva anche l'automatico dopo un errore.
              setAppend((s) => (s.pausa ? { ...s, pausa: false } : s));
              caricaAltri();
            }}
            disabled={caricoAltri || navPending}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 font-display text-sm font-bold text-sea ring-2 ring-sea transition-all hover:-translate-y-0.5 hover:bg-surface disabled:opacity-60"
          >
            {caricoAltri && <Spinner className="h-4 w-4 text-sea" />}
            {caricoAltri ? "Carico…" : "Mostra altri"}
          </button>
        </div>
      )}
      {cappato && (
        <p className="mt-6 text-center text-sm text-muted">
          Visualizzati {prodottiVisibili.length} prodotti su {append.totaleVivo}.
          Affina la ricerca o i filtri per trovare gli altri.
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
                  onClick={() => cambiaVisibilita(true)}
                  disabled={inCorso}
                  className="inline-flex h-11 shrink-0 items-center rounded-full px-4 font-display text-sm font-bold text-white ring-1 ring-white/30 transition-colors hover:bg-white/10 disabled:opacity-60"
                >
                  In vendita
                </button>
                <button
                  type="button"
                  onClick={() => cambiaVisibilita(false)}
                  disabled={inCorso}
                  className="inline-flex h-11 shrink-0 items-center rounded-full px-4 font-display text-sm font-bold text-white/80 ring-1 ring-white/30 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-60"
                >
                  Nascondi
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
        // Miniatura via optimizer di Next (lazy, ~56px): mai il master 2560px
        // usato come thumbnail (pattern GestoreMedia).
        <Image
          src={url}
          alt={nome}
          fill
          sizes="56px"
          quality={75}
          loading="lazy"
          className="object-cover"
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

/** Errore transitorio di caricamento (RPC fallita): distinto dal catalogo vuoto,
 *  invita a riprovare senza suggerire di "creare il primo prodotto". */
function StatoErrore({ onRiprova }: { onRiprova: () => void }) {
  return (
    <div className="rounded-3xl bg-surface px-6 py-12 text-center ring-1 ring-dashed ring-line">
      <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-coral/15 text-coral">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-8 w-8"
          aria-hidden="true"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      </span>
      <p className="text-sm text-muted">
        Impossibile caricare i prodotti, riprova.
      </p>
      <button
        type="button"
        onClick={onRiprova}
        className="mt-4 inline-flex h-11 items-center rounded-full bg-sea px-5 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5"
      >
        Riprova
      </button>
    </div>
  );
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
