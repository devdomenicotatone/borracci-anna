"use client";

// Flusso massivo "Importa da fornitore": da una pagina categoria/listing di
// Ingrosso BLT a N schede prodotto. Tre schermate:
//   1) CONFIGURA: categoria di destinazione (con creazione sottocategoria al
//      volo), modalita (automatica / con revisione), opzioni (riscrittura AI,
//      pubblicazione a fine import), anteprima dei prodotti trovati.
//   2) LAVORA: il client orchestra UN prodotto alla volta riusando le action
//      del flusso singolo (analizza -> crea bozza -> foto una alla volta ->
//      eventuale pubblicazione). Un errore su un prodotto non ferma gli altri;
//      pausa e annulla agiscono tra un passo e l'altro (mai a meta scheda).
//   3) RIEPILOGO: conteggi, errori con "riprova", link alle schede create.
//
// I duplicati (codice gia a catalogo) sono pre-marcati dalla scansione e
// saltati; la garanzia vera resta il vincolo unique su prodotti.codice, che il
// server segnala con `duplicato: true`.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";

import {
  analizzaUrlFornitoreAction,
  creaProdottoDaImportAction,
  importaFotoDaUrlAction,
  type BozzaImport,
} from "@/lib/gestore/import-actions";
import { toggleAttivoAction } from "@/lib/gestore/actions";
import { creaCategoriaAction } from "@/lib/gestore/categorie-actions";
import type { VoceListingBlt } from "@/lib/gestore/fornitori/ingrossoblt";
import CategoriaSelect from "@/components/gestore/CategoriaSelect";
import RevisioneBozza, {
  type DatiRevisione,
} from "@/components/gestore/RevisioneBozza";
import { useToast } from "@/components/gestore/Toaster";
import { slugify } from "@/lib/gestore/slug";
import type { Categoria } from "@/lib/types";

const inputCls =
  "h-12 w-full rounded-2xl bg-white px-4 text-base text-foreground ring-1 ring-line outline-none transition-shadow";

type StatoItem =
  | "attesa"
  | "duplicato"
  | "analisi"
  | "revisione"
  | "creazione"
  | "foto"
  | "fatto"
  | "pubblicato"
  | "saltato"
  | "errore";

interface ItemImport {
  url: string;
  sku: string | null;
  nome: string | null;
  stato: StatoItem;
  prodottoId?: string;
  fotoOk?: number;
  fotoTot?: number;
  /** Messaggio di errore (stato errore) o nota non bloccante (es. non pubblicato). */
  nota?: string;
}

/** Stati terminali: l'item non verra piu toccato dal motore. */
const STATI_FINALI = new Set<StatoItem>([
  "duplicato",
  "fatto",
  "pubblicato",
  "saltato",
  "errore",
]);

const STATO_UI: Record<StatoItem, { label: string; cls: string; spin?: boolean }> = {
  attesa: { label: "In attesa", cls: "bg-surface-2 text-muted" },
  duplicato: { label: "Già a catalogo", cls: "bg-sun/30 text-[#8a6500]" },
  analisi: { label: "Analisi…", cls: "bg-surface-2 text-sea", spin: true },
  revisione: { label: "In revisione", cls: "bg-surface-2 text-sea" },
  creazione: { label: "Creazione…", cls: "bg-surface-2 text-sea", spin: true },
  foto: { label: "Foto…", cls: "bg-surface-2 text-sea", spin: true },
  fatto: { label: "Bozza creata", cls: "bg-sea/10 text-sea" },
  pubblicato: { label: "Pubblicato", cls: "bg-sea text-white" },
  saltato: { label: "Saltato", cls: "bg-surface-2 text-muted" },
  errore: { label: "Errore", cls: "bg-coral/10 text-coral" },
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Cooldown crescente quando il fornitore ci blocca (403/429/5xx): al primo
// blocco 8s, poi 20s, poi 40s; dopo l'ultimo step il motore si mette in pausa
// e lascia decidere al gestore, invece di trasformare il blocco in una cascata
// di errori sui prodotti rimasti.
const COOLDOWN_BLOCCO_MS = [8_000, 20_000, 40_000];
const COOLDOWN_MAX_MS = 90_000;

// Attesa effettiva: il maggiore tra il cooldown crescente e il Retry-After
// dettato dal fornitore (con un tetto sano), così onoriamo il tempo che il WAF
// ci chiede invece di ripiombargli addosso troppo presto.
function attesaCooldown(base: number, retryAfterMs?: number): number {
  return Math.min(COOLDOWN_MAX_MS, Math.max(base, retryAfterMs ?? 0));
}

export default function ImportaBatch({
  voci,
  codiciEsistenti,
  totaleDichiarato,
  urlSorgente,
  categorie,
  onEsci,
}: {
  voci: VoceListingBlt[];
  /** Codici gia a catalogo (pre-check): le voci corrispondenti si saltano. */
  codiciEsistenti: string[];
  totaleDichiarato: number | null;
  urlSorgente: string;
  categorie: Categoria[];
  onEsci: () => void;
}) {
  const { mostra } = useToast();

  // --- Configurazione -------------------------------------------------------
  const [categorieList, setCategorieList] = useState<Categoria[]>(categorie);
  const [categoriaId, setCategoriaId] = useState("");
  const [modalita, setModalita] = useState<"auto" | "revisione">("auto");
  const [pubblica, setPubblica] = useState(false);
  const [riscriviAI, setRiscriviAI] = useState(true);
  const [soloOnline, setSoloOnline] = useState(false);

  // Creazione sottocategoria al volo (es. "Sport" sotto "Uomo").
  const [nuovaCatAperta, setNuovaCatAperta] = useState(false);
  const [nuovaCatNome, setNuovaCatNome] = useState("");
  const [nuovaCatParent, setNuovaCatParent] = useState("");
  const [creandoCat, startCreaCat] = useTransition();

  // --- Coda ------------------------------------------------------------------
  const esistenti = useMemo(
    () => new Set(codiciEsistenti.map((c) => c.toUpperCase())),
    [codiciEsistenti],
  );
  const [items, setItems] = useState<ItemImport[]>(() =>
    voci.map((v) => ({
      url: v.url,
      sku: v.sku,
      nome: v.nome,
      stato: v.sku && esistenti.has(v.sku) ? "duplicato" : "attesa",
    })),
  );
  const itemsRef = useRef<ItemImport[]>(items);

  const [fase, setFase] = useState<"configura" | "lavora" | "riepilogo">(
    "configura",
  );
  const [running, setRunning] = useState(false);
  const [pausa, setPausa] = useState(false);
  const runningRef = useRef(false);
  const abortRef = useRef(false);
  const pausaRef = useRef(false);
  // Contatore di generazione del run: incrementato da ogni avvia*/annulla.
  // Una callback rimasta in volo da un run precedente (es. analisi lanciata,
  // poi "Interrompi" + "Continua") confronta il proprio run e muore in
  // silenzio invece di affiancarsi al motore nuovo (doppio motore, form con i
  // dati dell'item sbagliato, item riportati in stati non finali).
  const runRef = useRef(0);
  // Blocchi consecutivi dal fornitore (403/429/5xx): guidano il cooldown
  // crescente e l'auto-pausa. Azzerato a ogni analisi andata a buon fine.
  const blocchiRef = useRef(0);

  // --- Revisione (modalita "con revisione") -----------------------------------
  const [correnteIdx, setCorrenteIdx] = useState<number | null>(null);
  const [bozzaCorrente, setBozzaCorrente] = useState<BozzaImport | null>(null);
  const [analizzando, setAnalizzando] = useState(false);
  const [creandoItem, setCreandoItem] = useState(false);
  const [progressoItem, setProgressoItem] = useState("");

  function aggiornaItem(i: number, patch: Partial<ItemImport>) {
    itemsRef.current = itemsRef.current.map((x, j) =>
      j === i ? { ...x, ...patch } : x,
    );
    setItems(itemsRef.current);
  }

  // Il lavoro va difeso dalla chiusura accidentale della scheda browser.
  // `fase === "lavora"` copre anche il form di revisione aperto in attesa
  // dell'utente: la coda residua esiste solo in memoria.
  const lavoroInCorso =
    fase === "lavora" || running || creandoItem || analizzando;
  useEffect(() => {
    if (!lavoroInCorso) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [lavoroInCorso]);

  async function attesaPausa() {
    while (pausaRef.current && !abortRef.current) await sleep(300);
  }

  // Attesa a step per il cooldown: si interrompe subito su "Interrompi".
  async function attesaInterrompibile(ms: number) {
    const fine = Date.now() + ms;
    while (Date.now() < fine && !abortRef.current) {
      await sleep(Math.min(400, Math.max(0, fine - Date.now())));
    }
  }

  function etichetta(item: ItemImport): string {
    return item.sku ?? item.nome ?? "prodotto";
  }

  // --- Passi condivisi (auto e revisione) -------------------------------------

  /**
   * Crea la bozza + importa le foto + eventualmente pubblica, aggiornando lo
   * stato dell'item passo per passo. Ritorna true se la scheda esiste a fine
   * corsa (anche con intoppi parziali), false su errore/duplicato.
   */
  async function creaConFoto(
    idx: number,
    dati: {
      nome: string;
      codice: string | null;
      prezzoCents: number;
      descrizione: string;
      taglie: string[];
      fotoSel: string[];
      categoriaId: string | null;
      soloOnline: boolean;
    },
  ): Promise<boolean> {
    aggiornaItem(idx, { stato: "creazione" });
    const c = await creaProdottoDaImportAction({
      nome: dati.nome,
      slug: slugify(dati.nome) || "prodotto",
      codice: dati.codice,
      descrizione: dati.descrizione,
      prezzoCents: dati.prezzoCents,
      taglie: dati.taglie,
      categoriaId: dati.categoriaId,
      soloOnline: dati.soloOnline,
    });
    if (!c.ok || !c.prodottoId) {
      if (c.duplicato) {
        aggiornaItem(idx, { stato: "duplicato" });
      } else {
        aggiornaItem(idx, {
          stato: "errore",
          nota: c.error ?? "Creazione non riuscita.",
        });
      }
      return false;
    }
    const avvisoServer = c.error ?? null; // ok:true + error = intoppo parziale

    // Da qui la scheda ESISTE sul server e si completa SEMPRE per intero
    // (foto + eventuale pubblicazione): l'annulla agisce solo tra una scheda
    // e l'altra, mai a meta — una bozza monca sarebbe peggio di un minuto in piu.
    let fotoOk = 0;
    // URL della scheda di provenienza: diventa il Referer del download foto
    // (fedeltà browser lato server, riduce i falsi positivi del WAF).
    const urlScheda = itemsRef.current[idx]?.url;
    aggiornaItem(idx, {
      stato: "foto",
      prodottoId: c.prodottoId,
      fotoOk: 0,
      fotoTot: dati.fotoSel.length,
    });
    for (let f = 0; f < dati.fotoSel.length; f++) {
      await attesaPausa();
      setProgressoItem(`Foto ${f + 1} di ${dati.fotoSel.length}…`);
      try {
        const esito = await importaFotoDaUrlAction(
          c.prodottoId,
          dati.fotoSel[f],
          urlScheda,
        );
        if (esito.ok) fotoOk++;
      } catch {
        // una foto persa non blocca le successive
      }
      aggiornaItem(idx, { fotoOk });
      // Piccola pausa tra un download e l'altro: le foto sono la sorgente
      // principale di richieste ravvicinate (una scheda = 1 pagina + N
      // immagini), ed e cio che fa scattare il blocco 403 a meta batch.
      if (f < dati.fotoSel.length - 1) await sleep(250);
    }
    const fotoPerse = dati.fotoSel.length - fotoOk;

    let statoFinale: StatoItem = "fatto";
    const note: string[] = [];
    if (avvisoServer) note.push(avvisoServer);
    if (fotoPerse > 0) note.push(`${fotoPerse} foto non importate.`);
    if (pubblica) {
      if (avvisoServer) {
        // Il server ha segnalato una scheda incompleta (es. varianti non
        // salvate): mai metterla in vendita senza che il gestore la riveda.
        note.push("Non pubblicato: completa la scheda prima di metterla in vendita.");
      } else if (fotoOk > 0) {
        setProgressoItem("Pubblico…");
        try {
          const t = await toggleAttivoAction(c.prodottoId, true);
          if (t.ok) statoFinale = "pubblicato";
          else note.push(`Creato ma non pubblicato: ${t.error ?? "errore"}.`);
        } catch {
          note.push("Creato ma non pubblicato: errore di rete.");
        }
      } else {
        note.push("Non pubblicato: nessuna foto importata.");
      }
    }
    aggiornaItem(idx, { stato: statoFinale, nota: note.join(" ") || undefined });
    return true;
  }

  // --- Motore automatico -------------------------------------------------------

  async function processaAuto(
    idx: number,
  ): Promise<{ bloccato: boolean; retryAfterMs?: number }> {
    const item = itemsRef.current[idx];
    aggiornaItem(idx, { stato: "analisi", nota: undefined });
    const r = await analizzaUrlFornitoreAction(item.url, { riscriviAI });
    if (abortRef.current) {
      // Interrotto durante l'analisi: la bozza e solo in memoria, si scarta e
      // l'item torna in coda (niente schede create DOPO il click di stop).
      aggiornaItem(idx, { stato: "attesa" });
      return { bloccato: false };
    }
    if (!r.ok || !r.bozza) {
      if (r.throttled) {
        // Non e un problema del prodotto: il fornitore ci frena. L'item torna
        // in coda e verra ritentato dopo il cooldown del motore.
        aggiornaItem(idx, { stato: "attesa", nota: undefined });
        return { bloccato: true, retryAfterMs: r.retryAfterMs };
      }
      aggiornaItem(idx, {
        stato: "errore",
        nota: r.error ?? "Analisi non riuscita.",
      });
      return { bloccato: false };
    }
    const b = r.bozza;
    await creaConFoto(idx, {
      nome: b.nome,
      codice: b.codice ?? item.sku,
      prezzoCents: b.prezzoCents,
      descrizione: b.descrizione,
      taglie: b.taglie,
      fotoSel: b.foto,
      categoriaId: categoriaId || null,
      soloOnline,
    });
    return { bloccato: false };
  }

  async function avviaAuto() {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    abortRef.current = false;
    pausaRef.current = false;
    setPausa(false);
    blocchiRef.current = 0;
    runRef.current++;
    setFase("lavora");
    for (;;) {
      if (abortRef.current) break;
      await attesaPausa();
      if (abortRef.current) break;
      const idx = itemsRef.current.findIndex((x) => x.stato === "attesa");
      if (idx === -1) break;
      let bloccato = false;
      let retryAfterMs: number | undefined;
      try {
        ({ bloccato, retryAfterMs } = await processaAuto(idx));
      } catch {
        aggiornaItem(idx, {
          stato: "errore",
          nota: "Errore di rete: riprova.",
        });
      }
      setProgressoItem("");
      if (bloccato) {
        // Il fornitore ci frena (403/429). L'item e gia tornato in coda: aspetto
        // un cooldown crescente e lo ritento, invece di bruciare i prodotti
        // rimasti in una cascata di errori come faceva prima.
        const n = ++blocchiRef.current;
        if (n > COOLDOWN_BLOCCO_MS.length) {
          // Blocco persistente: pausa e palla al gestore (niente loop infinito).
          blocchiRef.current = 0;
          pausaRef.current = true;
          setPausa(true);
          mostra(
            "Il fornitore sta bloccando le richieste (troppe in poco tempo). Ho messo in pausa: aspetta un minuto e premi «Riprendi».",
            "errore",
          );
          continue; // attesaPausa tiene fermo il motore fino a «Riprendi»
        }
        const attesa = attesaCooldown(COOLDOWN_BLOCCO_MS[n - 1], retryAfterMs);
        setProgressoItem(
          `Il fornitore ci frena: aspetto ${Math.round(attesa / 1000)}s e riprovo…`,
        );
        await attesaInterrompibile(attesa);
        setProgressoItem("");
        continue; // ritenta lo stesso item (e in stato "attesa")
      }
      blocchiRef.current = 0; // esito non-blocco: la serie di blocchi si azzera
      await sleep(350); // cortesia verso il fornitore
    }
    runningRef.current = false;
    setRunning(false);
    setProgressoItem("");
    // In auto-pausa NON vado al riepilogo: resto in "lavora", pronto a
    // riprendere. Ci arrivo solo a coda finita o su "Interrompi".
    if (!pausaRef.current) setFase("riepilogo");
  }

  // --- Motore con revisione ------------------------------------------------------

  async function analizzaProssimo() {
    // Loop (non ricorsione dentro try/finally: il finally esterno azzererebbe
    // `analizzando` mentre l'analisi successiva e ancora in volo). Il run
    // catturato all'ingresso invalida la catena se nel frattempo l'utente ha
    // interrotto/riavviato: la callback stantia muore senza toccare nulla.
    const run = runRef.current;
    for (;;) {
      if (abortRef.current || run !== runRef.current) return;
      const idx = itemsRef.current.findIndex((x) => x.stato === "attesa");
      if (idx === -1) {
        setCorrenteIdx(null);
        setBozzaCorrente(null);
        setAnalizzando(false);
        setFase("riepilogo");
        return;
      }
      setCorrenteIdx(idx);
      setBozzaCorrente(null);
      setAnalizzando(true);
      aggiornaItem(idx, { stato: "analisi", nota: undefined });
      let r: Awaited<ReturnType<typeof analizzaUrlFornitoreAction>>;
      try {
        r = await analizzaUrlFornitoreAction(itemsRef.current[idx].url, {
          riscriviAI,
        });
      } catch {
        r = { ok: false, error: "Errore di rete." };
      }
      // Run cambiato nel frattempo (Interrompi, o Interrompi+Continua): non
      // toccare stato ne item — chi ha cambiato run ha gia sistemato la coda.
      if (run !== runRef.current) return;
      if (abortRef.current) {
        aggiornaItem(idx, { stato: "attesa" });
        setAnalizzando(false);
        return;
      }
      if (!r.ok || !r.bozza) {
        if (r.throttled) {
          // Il fornitore ci frena: NON marcare errore e non passare oltre a
          // raffica (sarebbe la stessa cascata del motore auto). Cooldown e
          // ritenta lo stesso item; dopo troppi blocchi mi fermo.
          const n = ++blocchiRef.current;
          aggiornaItem(idx, { stato: "attesa" });
          if (n > COOLDOWN_BLOCCO_MS.length) {
            blocchiRef.current = 0;
            setCorrenteIdx(null);
            setBozzaCorrente(null);
            setAnalizzando(false);
            mostra(
              "Il fornitore sta bloccando le richieste. Mi fermo qui: aspetta un minuto e riprendi dal riepilogo.",
              "errore",
            );
            setFase("riepilogo");
            return;
          }
          const attesa = attesaCooldown(COOLDOWN_BLOCCO_MS[n - 1], r.retryAfterMs);
          mostra(
            `Il fornitore ci frena: aspetto ${Math.round(attesa / 1000)}s e riprovo…`,
            "errore",
          );
          await attesaInterrompibile(attesa);
          if (abortRef.current || run !== runRef.current) return;
          continue; // ripesca lo stesso item (ora "attesa")
        }
        aggiornaItem(idx, {
          stato: "errore",
          nota: r.error ?? "Analisi non riuscita.",
        });
        mostra(
          `${etichetta(itemsRef.current[idx])}: analisi non riuscita, passo al prossimo.`,
          "errore",
        );
        continue; // prossimo item della coda, `analizzando` resta true
      }
      aggiornaItem(idx, { stato: "revisione" });
      blocchiRef.current = 0; // analisi riuscita: azzera la serie di blocchi
      setBozzaCorrente(r.bozza);
      setAnalizzando(false);
      return;
    }
  }

  function avviaRevisione() {
    abortRef.current = false;
    blocchiRef.current = 0;
    runRef.current++;
    setFase("lavora");
    void analizzaProssimo();
  }

  async function confermaRevisione(dati: DatiRevisione) {
    const idx = correnteIdx;
    if (idx === null || creandoItem) return;
    setCreandoItem(true);
    try {
      const creata = await creaConFoto(idx, dati);
      if (!creata) {
        const item = itemsRef.current[idx];
        if (item.stato === "errore") {
          // Il gestore puo correggere i campi e riprovare: si resta sul form.
          mostra(item.nota ?? "Creazione non riuscita.", "errore");
          aggiornaItem(idx, { stato: "revisione" });
          return;
        }
        // Duplicato: si passa oltre.
        mostra("Codice già a catalogo: prodotto saltato.", "errore");
      }
      setBozzaCorrente(null);
      void analizzaProssimo();
    } catch {
      mostra("Errore di rete: riprova.", "errore");
      aggiornaItem(idx, { stato: "revisione" });
    } finally {
      setCreandoItem(false);
      setProgressoItem("");
    }
  }

  function saltaRevisione() {
    if (correnteIdx === null || creandoItem) return;
    aggiornaItem(correnteIdx, { stato: "saltato" });
    setBozzaCorrente(null);
    void analizzaProssimo();
  }

  // --- Controlli comuni -----------------------------------------------------------

  function annulla() {
    abortRef.current = true;
    pausaRef.current = false;
    setPausa(false);
    // Invalida le callback in volo del run corrente (vedi runRef).
    runRef.current++;
    if (!runningRef.current) {
      // Modalita revisione: l'item aperto torna in attesa e si va al riepilogo.
      const idx = itemsRef.current.findIndex(
        (x) => x.stato === "revisione" || x.stato === "analisi",
      );
      if (idx !== -1) aggiornaItem(idx, { stato: "attesa" });
      setCorrenteIdx(null);
      setBozzaCorrente(null);
      setAnalizzando(false);
      setFase("riepilogo");
    }
  }

  function togglePausa() {
    pausaRef.current = !pausaRef.current;
    setPausa(pausaRef.current);
  }

  function riprendi(resetErrori: boolean) {
    if (resetErrori) {
      itemsRef.current = itemsRef.current.map((x) =>
        x.stato === "errore" ? { ...x, stato: "attesa", nota: undefined } : x,
      );
      setItems(itemsRef.current);
    }
    if (modalita === "auto") void avviaAuto();
    else avviaRevisione();
  }

  function creaCategoria() {
    const nome = nuovaCatNome.trim();
    if (!nome) return;
    startCreaCat(async () => {
      try {
        const prima = new Set(categorieList.map((c) => c.id));
        const r = await creaCategoriaAction({
          nome,
          parentId: nuovaCatParent || null,
        });
        if (!r.ok || !r.categorie) {
          mostra(r.error ?? "Creazione categoria non riuscita.", "errore");
          return;
        }
        setCategorieList(r.categorie);
        const nuova = r.categorie.find((c) => !prima.has(c.id));
        if (nuova) setCategoriaId(nuova.id);
        setNuovaCatAperta(false);
        setNuovaCatNome("");
        mostra("Categoria creata.", "ok");
      } catch {
        mostra("Errore di rete: riprova.", "errore");
      }
    });
  }

  // --- Derivati ---------------------------------------------------------------------

  const totale = items.length;
  const daImportare = items.filter((x) => x.stato === "attesa").length;
  const duplicati = items.filter((x) => x.stato === "duplicato").length;
  const completati = items.filter((x) => STATI_FINALI.has(x.stato)).length;
  const creati = items.filter(
    (x) => x.stato === "fatto" || x.stato === "pubblicato",
  ).length;
  const pubblicati = items.filter((x) => x.stato === "pubblicato").length;
  const saltati = items.filter((x) => x.stato === "saltato").length;
  const errori = items.filter((x) => x.stato === "errore").length;
  const pct = totale > 0 ? Math.round((completati / totale) * 100) : 0;
  const radici = categorieList.filter((c) => !c.parent_id);

  // ==== FASE CONFIGURA ================================================================
  if (fase === "configura") {
    return (
      <div className="mx-auto max-w-xl pb-28 lg:max-w-4xl">
        <div className="flex flex-col gap-5">
          {/* Esito scansione */}
          <section className="rounded-3xl bg-white px-5 py-4 shadow-soft ring-1 ring-line">
            <div className="flex items-center gap-3">
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-xl"
                aria-hidden="true"
              >
                🗂️
              </span>
              <div className="min-w-0">
                <p className="font-display text-base font-extrabold text-foreground">
                  {totale} prodotti trovati
                  {totaleDichiarato !== null && totaleDichiarato !== totale
                    ? ` (il fornitore ne dichiara ${totaleDichiarato})`
                    : ""}
                </p>
                <p className="truncate text-xs text-muted" title={urlSorgente}>
                  {urlSorgente}
                </p>
              </div>
            </div>
            {duplicati > 0 && (
              <p className="mt-3 rounded-2xl bg-sun/20 px-3 py-2 text-sm font-medium text-[#8a6500] ring-1 ring-sun/50">
                {duplicati === 1
                  ? "1 prodotto è già a catalogo e verrà saltato."
                  : `${duplicati} prodotti sono già a catalogo e verranno saltati.`}
              </p>
            )}
          </section>

          {/* Categoria di destinazione */}
          <section className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="b-categoria"
                className="font-display text-sm font-bold text-foreground"
              >
                Categoria per tutti i prodotti
              </label>
              <button
                type="button"
                onClick={() => setNuovaCatAperta((v) => !v)}
                className="text-xs font-bold text-sea transition-colors hover:text-foreground"
              >
                {nuovaCatAperta ? "Chiudi" : "+ Nuova categoria"}
              </button>
            </div>
            <CategoriaSelect
              id="b-categoria"
              categorie={categorieList}
              value={categoriaId}
              onChange={setCategoriaId}
            />
            <p className="text-xs text-muted">
              In modalità &ldquo;con revisione&rdquo; potrai comunque cambiarla
              prodotto per prodotto.
            </p>
            {nuovaCatAperta && (
              <div className="mt-1 flex flex-col gap-2 rounded-2xl bg-surface-2 p-3 ring-1 ring-line sm:flex-row sm:items-center">
                <input
                  value={nuovaCatNome}
                  onChange={(e) => setNuovaCatNome(e.target.value)}
                  placeholder="Nome (es. Sport)"
                  disabled={creandoCat}
                  className={`${inputCls} sm:flex-1`}
                />
                <div className="relative sm:w-44">
                  <select
                    value={nuovaCatParent}
                    onChange={(e) => setNuovaCatParent(e.target.value)}
                    disabled={creandoCat}
                    aria-label="Categoria padre"
                    className="h-12 w-full appearance-none rounded-2xl bg-white px-4 pr-9 text-base text-foreground ring-1 ring-line outline-none"
                  >
                    <option value="">— macro —</option>
                    {radici.map((r) => (
                      <option key={r.id} value={r.id}>
                        Sotto {r.nome}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-muted">
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
                </div>
                <button
                  type="button"
                  onClick={creaCategoria}
                  disabled={creandoCat || !nuovaCatNome.trim()}
                  className="h-12 shrink-0 rounded-full bg-sea px-5 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                >
                  {creandoCat ? "Creo…" : "Crea"}
                </button>
              </div>
            )}
          </section>

          {/* Modalita */}
          <section className="flex flex-col gap-1.5">
            <span className="font-display text-sm font-bold text-foreground">
              Modalità
            </span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <CardModalita
                attiva={modalita === "auto"}
                onClick={() => setModalita("auto")}
                emoji="⚡"
                titolo="Automatica"
                descrizione="Crea tutte le schede una dopo l'altra, senza fermarsi. Controlli il riepilogo alla fine."
              />
              <CardModalita
                attiva={modalita === "revisione"}
                onClick={() => setModalita("revisione")}
                emoji="👀"
                titolo="Con revisione"
                descrizione="Ti mostro ogni scheda prima di crearla: puoi correggerla o saltarla."
              />
            </div>
          </section>

          {/* Opzioni */}
          <section className="flex flex-col gap-2">
            <span className="font-display text-sm font-bold text-foreground">
              Opzioni
            </span>
            <OpzioneToggle
              titolo="Riscrivi i testi con l'AI"
              descrizione="Nome e descrizione riscritti in stile catalogo. Più lento ma più curato."
              acceso={riscriviAI}
              onToggle={() => setRiscriviAI((v) => !v)}
            />
            <OpzioneToggle
              titolo="Pubblica subito"
              descrizione="A fine import i prodotti con almeno una foto vanno in vendita. Spento = restano bozze da rivedere."
              acceso={pubblica}
              onToggle={() => setPubblica((v) => !v)}
            />
            <OpzioneToggle
              titolo="Solo online"
              descrizione="Articoli non presenti in negozio: in vetrina compare il badge «Solo online» su tutti i prodotti importati."
              acceso={soloOnline}
              onToggle={() => setSoloOnline((v) => !v)}
            />
          </section>

          {/* Anteprima coda */}
          <section className="flex flex-col gap-1.5">
            <span className="font-display text-sm font-bold text-foreground">
              Prodotti ({totale})
            </span>
            <ul className="max-h-72 overflow-y-auto rounded-2xl bg-white ring-1 ring-line">
              {items.map((item, i) => (
                <RigaItem key={item.url} item={item} indice={i} />
              ))}
            </ul>
          </section>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur md:left-60">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3 lg:max-w-4xl">
            <button
              type="button"
              onClick={onEsci}
              className="flex h-12 items-center rounded-full px-4 font-display text-sm font-bold text-muted transition-colors hover:text-foreground"
            >
              Indietro
            </button>
            <button
              type="button"
              onClick={() => (modalita === "auto" ? void avviaAuto() : avviaRevisione())}
              disabled={daImportare === 0}
              className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-sea px-7 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
            >
              Avvia importazione ({daImportare})
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==== FASE LAVORA — modalita CON REVISIONE ==========================================
  if (fase === "lavora" && modalita === "revisione") {
    const posizione = Math.min(completati + 1, totale);
    if (bozzaCorrente && correnteIdx !== null) {
      return (
        <RevisioneBozza
          key={items[correnteIdx].url}
          bozza={bozzaCorrente}
          codiceFallback={items[correnteIdx].sku}
          categorie={categorieList}
          categoriaIniziale={categoriaId}
          soloOnlineIniziale={soloOnline}
          intestazione={
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="rounded-full bg-surface-2 px-3 py-1 font-display text-xs font-bold text-foreground">
                Prodotto {posizione} di {totale}
              </span>
              <button
                type="button"
                onClick={annulla}
                disabled={creandoItem}
                className="text-xs font-bold text-muted transition-colors hover:text-coral disabled:opacity-50"
              >
                Interrompi importazione
              </button>
            </div>
          }
          busy={creandoItem}
          progresso={progressoItem || "Creazione…"}
          azionePrimaria="Crea e continua"
          secondaria={{ label: "Salta", onClick: saltaRevisione }}
          onConferma={(dati) => void confermaRevisione(dati)}
        />
      );
    }
    // Analisi del prossimo prodotto in corso.
    return (
      <div className="mx-auto max-w-xl pb-28 lg:max-w-4xl">
        <BarraAvanzamento pct={pct} />
        <section className="mt-4 rounded-3xl bg-white px-6 py-10 text-center shadow-soft ring-1 ring-line">
          <Spinner className="mx-auto h-7 w-7 text-sea" />
          <h2 className="mt-3 font-display text-lg font-extrabold text-foreground">
            Prodotto {posizione} di {totale}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Scarico la scheda dal fornitore e preparo la bozza…
          </p>
          <button
            type="button"
            onClick={annulla}
            className="mt-5 inline-flex h-11 items-center rounded-full px-5 font-display text-sm font-bold text-muted ring-1 ring-line transition-colors hover:text-coral"
          >
            Interrompi
          </button>
        </section>
      </div>
    );
  }

  // ==== FASE LAVORA — modalita AUTOMATICA =============================================
  if (fase === "lavora") {
    return (
      <div className="mx-auto max-w-xl pb-28 lg:max-w-4xl">
        <div className="flex flex-col gap-4">
          <section className="rounded-3xl bg-white px-5 py-4 shadow-soft ring-1 ring-line">
            <div className="flex items-center justify-between gap-3">
              <p className="font-display text-base font-extrabold text-foreground">
                {pausa ? "In pausa" : "Importazione in corso…"}
              </p>
              <span className="font-display text-sm font-bold text-sea">
                {completati} / {totale}
              </span>
            </div>
            <BarraAvanzamento pct={pct} className="mt-3" />
            <p className="mt-2 text-xs text-muted">
              Puoi mettere in pausa o interrompere: quello già creato resta.
              Non chiudere questa pagina.
            </p>
          </section>

          <ul className="overflow-hidden rounded-2xl bg-white ring-1 ring-line">
            {items.map((item, i) => (
              <RigaItem key={item.url} item={item} indice={i} viva />
            ))}
          </ul>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur md:left-60">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3 lg:max-w-4xl">
            <button
              type="button"
              onClick={annulla}
              className="flex h-12 items-center rounded-full px-4 font-display text-sm font-bold text-muted transition-colors hover:text-coral"
            >
              Interrompi
            </button>
            <div className="flex items-center gap-3">
              <span className="truncate text-sm text-muted" aria-live="polite">
                {progressoItem}
              </span>
              <button
                type="button"
                onClick={togglePausa}
                className="flex h-12 shrink-0 items-center rounded-full bg-white px-6 font-display text-sm font-bold text-foreground ring-1 ring-line transition-all hover:-translate-y-0.5 hover:ring-lagoon"
              >
                {pausa ? "Riprendi" : "Pausa"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==== FASE RIEPILOGO ================================================================
  return (
    <div className="mx-auto max-w-xl pb-28 lg:max-w-4xl">
      <div className="flex flex-col gap-4">
        <section className="rounded-3xl bg-white px-6 py-8 text-center shadow-soft ring-1 ring-line">
          <span
            className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-2xl"
            aria-hidden="true"
          >
            {errori > 0 || daImportare > 0 ? "🧾" : "🎉"}
          </span>
          <h2 className="font-display text-lg font-extrabold text-foreground">
            {daImportare > 0 ? "Importazione interrotta" : "Importazione completata"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {creati === 1 ? "1 scheda creata" : `${creati} schede create`}
            {pubblicati > 0 ? `, di cui ${pubblicati} pubblicate` : ""}
            {pubblica ? "." : ": sono bozze, niente va in vendita da solo."}
          </p>

          <dl className="mx-auto mt-5 grid max-w-md grid-cols-2 gap-2 sm:grid-cols-4">
            <VoceRiepilogo n={creati} label="Create" cls="text-sea" />
            <VoceRiepilogo n={duplicati} label="Già presenti" cls="text-[#8a6500]" />
            <VoceRiepilogo n={saltati} label="Saltate" cls="text-muted" />
            <VoceRiepilogo n={errori} label="Errori" cls="text-coral" />
            {daImportare > 0 && (
              <VoceRiepilogo
                n={daImportare}
                label="Da importare"
                cls="text-foreground"
              />
            )}
          </dl>

          <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <Link
              href="/gestore/prodotti"
              className="inline-flex h-12 items-center rounded-full bg-sea px-7 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5"
            >
              Vai ai prodotti
            </Link>
            {errori > 0 && (
              <button
                type="button"
                onClick={() => riprendi(true)}
                className="inline-flex h-12 items-center rounded-full px-5 font-display text-sm font-bold text-sea ring-1 ring-line transition-colors hover:bg-surface-2"
              >
                Riprova gli errori ({errori})
              </button>
            )}
            {daImportare > 0 && (
              <button
                type="button"
                onClick={() => riprendi(false)}
                className="inline-flex h-12 items-center rounded-full px-5 font-display text-sm font-bold text-sea ring-1 ring-line transition-colors hover:bg-surface-2"
              >
                Continua ({daImportare} rimasti)
              </button>
            )}
            <button
              type="button"
              onClick={onEsci}
              className="inline-flex h-12 items-center rounded-full px-5 font-display text-sm font-bold text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              Nuova importazione
            </button>
          </div>
        </section>

        <ul className="overflow-hidden rounded-2xl bg-white ring-1 ring-line">
          {items.map((item, i) => (
            <RigaItem key={item.url} item={item} indice={i} conLink />
          ))}
        </ul>
      </div>
    </div>
  );
}

// --- Sotto-componenti ---------------------------------------------------------------

function BarraAvanzamento({
  pct,
  className = "",
}: {
  pct: number;
  className?: string;
}) {
  return (
    <div
      className={`h-2.5 w-full overflow-hidden rounded-full bg-surface-2 ${className}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-sea transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      className={`animate-spin ${className}`}
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.2-8.56" />
    </svg>
  );
}

function RigaItem({
  item,
  indice,
  viva = false,
  conLink = false,
}: {
  item: ItemImport;
  indice: number;
  /** Evidenzia la riga attiva (fase lavora). */
  viva?: boolean;
  /** Mostra il link alla scheda creata (fase riepilogo). */
  conLink?: boolean;
}) {
  const ui = STATO_UI[item.stato];
  const attiva =
    viva &&
    (item.stato === "analisi" ||
      item.stato === "creazione" ||
      item.stato === "foto");
  const label =
    item.stato === "foto" && item.fotoTot
      ? `Foto ${item.fotoOk ?? 0}/${item.fotoTot}…`
      : ui.label;
  return (
    <li
      className={[
        "flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0",
        attiva ? "bg-surface-2/60" : "",
      ].join(" ")}
    >
      <span className="w-7 shrink-0 text-right font-mono text-xs text-muted">
        {indice + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {item.nome ?? item.url}
        </p>
        <p className="truncate font-mono text-[11px] text-muted">
          {item.sku ?? "—"}
          {item.nota ? ` · ${item.nota}` : ""}
        </p>
      </div>
      {conLink && item.prodottoId && (
        <Link
          href={`/gestore/prodotti/${item.prodottoId}`}
          className="shrink-0 text-xs font-bold text-sea transition-colors hover:text-foreground"
        >
          Apri
        </Link>
      )}
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${ui.cls}`}
      >
        {ui.spin && <Spinner className="h-3 w-3" />}
        {label}
      </span>
    </li>
  );
}

function VoceRiepilogo({
  n,
  label,
  cls,
}: {
  n: number;
  label: string;
  cls: string;
}) {
  return (
    <div className="rounded-2xl bg-surface-2 px-3 py-2.5">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className={`font-display text-xl font-extrabold ${cls}`}>{n}</dd>
    </div>
  );
}

function CardModalita({
  attiva,
  onClick,
  emoji,
  titolo,
  descrizione,
}: {
  attiva: boolean;
  onClick: () => void;
  emoji: string;
  titolo: string;
  descrizione: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={attiva}
      className={[
        "flex items-start gap-3 rounded-2xl bg-white px-4 py-3 text-left transition-all",
        attiva
          ? "ring-2 ring-sea shadow-soft"
          : "ring-1 ring-line hover:-translate-y-0.5 hover:ring-lagoon",
      ].join(" ")}
    >
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-lg"
        aria-hidden="true"
      >
        {emoji}
      </span>
      <span className="min-w-0">
        <span className="block font-display text-sm font-extrabold text-foreground">
          {titolo}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted">
          {descrizione}
        </span>
      </span>
    </button>
  );
}

function OpzioneToggle({
  titolo,
  descrizione,
  acceso,
  onToggle,
}: {
  titolo: string;
  descrizione: string;
  acceso: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={acceso}
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-4 rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-line transition-all hover:ring-lagoon"
    >
      <span className="min-w-0">
        <span className="block font-display text-sm font-bold text-foreground">
          {titolo}
        </span>
        <span className="mt-0.5 block text-xs text-muted">{descrizione}</span>
      </span>
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          acceso ? "bg-sea" : "bg-line"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
            acceso ? "left-6" : "left-1"
          }`}
        />
      </span>
    </button>
  );
}
