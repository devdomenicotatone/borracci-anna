"use client";

// Scorrimento infinito della griglia catalogo, ad APPEND incrementale: una
// sentinella invisibile a fondo lista che, quando entra nel viewport (con
// ampio margine di preload), chiede via Server Action (paginaCatalogo) SOLO le
// card della pagina successiva e le appende qui sotto. Prima ogni blocco
// rinavigava a ?pagina=N+1: il server ricaricava dal DB l'intero cumulato e
// ritrasmetteva TUTTA la griglia nel payload RSC — al quinto blocco ~120 card
// ritrasferite per riceverne 24, spinner sempre piu lenti su rete cellulare.
//
// PROGRESSIVE ENHANCEMENT: il link "Mostra altri" con href ?pagina=N+1 resta
// il fallback senza JS (e per condividere l'URL della vista corrente); con JS
// il click viene intercettato (onNavigate + preventDefault: scatta solo sulla
// navigazione SPA, non su ctrl/cmd+click che apre la scheda nuova) e fa
// l'append via action invece della navigazione. Dopo ogni append l'URL avanza
// comunque a ?pagina=N con replaceState nativo (integrato dal router di Next,
// stesso pattern dei drawer): niente re-render server all'istante, ma il back
// da una scheda prodotto riapre il cumulato giusto e ritrova lo scroll.
//
// TETTO: dopo MAX_AUTO caricamenti automatici consecutivi la sentinella si
// mette in pausa e resta solo il bottone — senza pausa il footer sarebbe
// irraggiungibile con ~1800 prodotti. Il click sul bottone azzera il conteggio
// e riattiva l'automatico.
//
// RESET: il componente va montato con key={chiaveFiltri} (vedi
// CatalogoSezione): filtri/ricerca/ordinamento nuovi = rimonta = pagine
// accumulate azzerate. Se invece cambia la pagina SERVER (?pagina=N via
// back/forward o URL diretto: il cumulato server copre gia tutto) lo stato si
// azzera durante il render (pattern "adjusting state when props change", vedi
// MenuMobile); le risposte ancora in volo vengono scartate dall'aggiornamento
// funzionale, che accetta un blocco solo se la base non e cambiata.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import ProductCard from "@/components/ProductCard";
import EtichettaMostraAltri from "@/components/catalogo/EtichettaMostraAltri";
import { paginaCatalogo } from "@/lib/catalogo-actions";
import type { Prodotto } from "@/lib/types";

/** Blocchi caricati da soli tra un click e l'altro (~120 card). */
const MAX_AUTO = 5;

/** Stato dell'append in un oggetto solo: ogni aggiornamento e atomico e puo
 *  essere validato sulla `base` (la pagina server al momento della richiesta),
 *  cosi una risposta stantia arrivata dopo un back/forward si scarta intera
 *  invece di appendere doppioni sullo stato appena azzerato. */
type StatoAppend = {
  base: number;
  blocchi: Prodotto[][];
  totaleVivo: number;
  esaurito: boolean;
};

export default function CaricamentoAutomatico({
  basePath,
  categoriaSlug,
  filtriQs,
  pagina,
  idsServer,
  totale,
}: {
  /** Percorso della pagina catalogo (per l'href del link fallback). */
  basePath: string;
  /** Slug categoria per la Server Action ("" = catalogo completo /prodotti). */
  categoriaSlug: string;
  /** Filtri correnti serializzati (query string SENZA `pagina`). */
  filtriQs: string;
  /** Ultima pagina gia renderizzata dal SERVER (1-based, cumulata via
   *  ?pagina=N): l'append client parte da qui + 1, senza duplicati. */
  pagina: number;
  /** Id delle card gia renderizzate dal server (conteggio "hai visto" e
   *  deduplicazione dell'append). */
  idsServer: string[];
  /** Totale dei prodotti che rispettano i filtri (count del server). */
  totale: number;
}) {
  // Blocchi appesi lato client: card gia deduplicate, renderizzate in griglie
  // gemelle di quella server (24 card riempiono sempre righe intere a 2/3/4
  // colonne, quindi i blocchi si impilano senza sfalsare le righe). Il totale
  // viene rinfrescato da ogni risposta: il catalogo puo cambiare sotto i piedi.
  const [stato, setStato] = useState<StatoAppend>({
    base: pagina,
    blocchi: [],
    totaleVivo: totale,
    esaurito: false,
  });
  const [inCorso, setInCorso] = useState(false);

  // Pagina server cambiata a parita di filtri (back/forward su ?pagina=N):
  // il cumulato server comprende gia le pagine appese qui — si azzerano
  // durante il render, la griglia nuova non vede mai i doppioni.
  if (stato.base !== pagina) {
    setStato({ base: pagina, blocchi: [], totaleVivo: totale, esaurito: false });
  }

  const sentinella = useRef<HTMLSpanElement>(null);
  // Una sola richiesta in volo: il ref (non lo stato, che si aggiorna al
  // render dopo) para il doppio invio da click + sentinella nello stesso tick.
  const inVolo = useRef(false);
  // Caricamenti automatici consecutivi dall'ultimo click.
  const autoConsecutivi = useRef(0);

  const visti = idsServer.length + stato.blocchi.reduce((n, b) => n + b.length, 0);
  const prossima = pagina + stato.blocchi.length + 1;
  const finito = stato.esaurito || visti >= stato.totaleVivo;

  // Il back da una PDP deve ritrovare il punto raggiunto: dopo ogni append
  // l'URL avanza a ?pagina=N via History API nativa (nessun re-render server:
  // il percorso cumulativo gira solo se l'utente ci torna davvero). Effect e
  // non callback: legge stato e props freschi, mai quelli di una closure.
  useEffect(() => {
    if (stato.blocchi.length === 0) return;
    const qs = new URLSearchParams(filtriQs);
    qs.set("pagina", String(stato.base + stato.blocchi.length));
    window.history.replaceState(
      window.history.state,
      "",
      `${basePath}?${qs.toString()}`,
    );
  }, [stato.base, stato.blocchi.length, filtriQs, basePath]);

  const caricaProssima = () => {
    if (inVolo.current || finito) return;
    inVolo.current = true;
    setInCorso(true);
    // Catturati alla richiesta: se al ritorno la base non coincide piu, la
    // risposta e stantia e l'updater la scarta.
    const baseRichiesta = pagina;
    const idsCatturati = idsServer;
    paginaCatalogo({ categoriaSlug, filtriQs, pagina: prossima })
      .then((esito) => {
        // null = errore nell'action: NON e un fine lista — pausa
        // dell'automatico, resta il bottone e il click ritenta.
        if (!esito) {
          autoConsecutivi.current = MAX_AUTO;
          return;
        }
        setStato((s) => {
          // Base cambiata mentre la richiesta era in volo (back/forward):
          // il cumulato server copre gia queste card, si scarta tutto.
          if (s.base !== baseRichiesta) return s;
          // Risposta riuscita ma vuota: fine lista genuino (o categoria
          // sparita nel frattempo) — si chiude, niente bottone che ritenta.
          if (esito.prodotti.length === 0) {
            return { ...s, totaleVivo: esito.totale, esaurito: true };
          }
          // Dedup contro tutte le card gia in griglia: con l'ordinamento a
          // offset un inserimento/rimozione concorrente puo far slittare le
          // pagine di una riga — meglio una card in meno che un doppione.
          const gia = new Set(idsCatturati);
          for (const blocco of s.blocchi) for (const p of blocco) gia.add(p.id);
          const nuovi = esito.prodotti.filter((p) => !gia.has(p.id));
          // Nessuna card nuova a totale non raggiunto (dati slittati): stop,
          // o la sentinella richiederebbe la stessa pagina in loop.
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
        // Rete assente/instabile: pausa dell'automatico, il click ritenta.
        autoConsecutivi.current = MAX_AUTO;
      })
      .finally(() => {
        inVolo.current = false;
        setInCorso(false);
      });
  };

  // Sentinella: si (ri)arma a ogni render — costa nulla e l'osservazione
  // iniziale di IntersectionObserver fa ripartire da sola la catena quando,
  // ad append concluso, la sentinella e ancora nel viewport. Niente observer
  // durante il caricamento o a fine lista.
  useEffect(() => {
    if (inCorso || finito) return;
    const nodo = sentinella.current;
    if (!nodo || typeof IntersectionObserver === "undefined") return;
    // L'observer scatta a raffica durante lo scroll: una richiesta per armata.
    let chiesto = false;
    const observer = new IntersectionObserver(
      (voci) => {
        if (chiesto) return;
        if (!voci.some((v) => v.isIntersecting)) return;
        if (autoConsecutivi.current >= MAX_AUTO) return;
        chiesto = true;
        autoConsecutivi.current += 1;
        caricaProssima();
      },
      // Parte ~una riga di card prima del fondo: il flusso non si interrompe.
      { rootMargin: "600px 0px" },
    );
    observer.observe(nodo);
    return () => observer.disconnect();
  });

  // Fallback (e condivisione): l'URL della pagina successiva al cumulato
  // corrente, server + append client.
  const qsProssima = new URLSearchParams(filtriQs);
  qsProssima.set("pagina", String(prossima));

  return (
    <>
      {stato.blocchi.map((blocco, i) => (
        <div
          key={stato.base + i + 1}
          aria-label="Altri prodotti in vetrina"
          className="mt-4 grid grid-cols-2 gap-4 sm:mt-5 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5"
        >
          {blocco.map((prodotto) => (
            // Identiche alle card server sotto la piega: niente priorita, le
            // immagini appese sono SEMPRE lazy.
            <ProductCard key={prodotto.id} prodotto={prodotto} />
          ))}
        </div>
      ))}

      {!finito && (
        <div className="mt-8 flex flex-col items-center gap-2">
          {/* aria-live sul conteggio: il <p> esiste PRIMA dell'append e viene
              solo aggiornato, quindi lo screen reader annuncia ogni blocco in
              modo affidabile (un elemento live montato gia pieno non verrebbe
              letto). */}
          <p aria-live="polite" className="text-sm tabular-nums text-muted">
            Hai visto {visti} prodotti su {stato.totaleVivo}
          </p>
          <span ref={sentinella} aria-hidden="true" />
          {/* Un SOLO controllo sempre montato: smontare il link durante il
              caricamento farebbe cadere il focus sul body (WCAG 2.4.3). Qui
              cambia solo il contenuto (spinner + "Carico…") e la guardia in
              onNavigate ignora le attivazioni finche l'append e in corso. */}
          <Link
            href={`${basePath}?${qsProssima.toString()}`}
            scroll={false}
            // Con JS il link non naviga mai: prefetchare il percorso
            // cumulativo ?pagina=N sarebbe proprio il traffico da evitare.
            prefetch={false}
            aria-disabled={inCorso}
            onNavigate={(e) => {
              // Progressive enhancement: la navigazione SPA si annulla e si
              // appende il delta via action. onNavigate NON scatta senza JS
              // ne su ctrl/cmd+click (scheda nuova): li vale l'href.
              e.preventDefault();
              // Attivazione durante il caricamento: ignorata (il controllo
              // resta montato e il focus non si muove).
              if (inCorso) return;
              autoConsecutivi.current = 0;
              caricaProssima();
            }}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 font-display text-sm font-bold text-sea ring-2 ring-sea transition-all hover:-translate-y-0.5 hover:bg-surface aria-disabled:cursor-wait aria-disabled:hover:translate-y-0 aria-disabled:hover:bg-white"
          >
            {inCorso ? (
              <>
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-sea border-t-transparent"
                />
                Carico…
              </>
            ) : (
              <EtichettaMostraAltri />
            )}
          </Link>
        </div>
      )}
    </>
  );
}
