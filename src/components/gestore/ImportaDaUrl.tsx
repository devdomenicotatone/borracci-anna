"use client";

// Flusso "Importa da fornitore" (area gestore). Un solo campo URL che accetta:
//   - la pagina di UN prodotto ingrossoblt.com  -> revisione singola (come
//     prima) + scelta categoria, poi bozza + foto;
//   - una pagina CATEGORIA/LISTING              -> scansione di tutte le
//     pagine (25 card l'una), pre-check duplicati, e passaggio al flusso
//     massivo ImportaBatch (automatico o con revisione).
// Il riconoscimento e fatto dal server su pagina 1 (scansionaListingAction).

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";

import {
  analizzaUrlFornitoreAction,
  creaProdottoDaImportAction,
  importaFotoDaUrlAction,
  scansionaListingAction,
  verificaCodiciAction,
  type BozzaImport,
} from "@/lib/gestore/import-actions";
import {
  urlFornitoreValido,
  type VoceListingBlt,
} from "@/lib/gestore/fornitori/ingrossoblt";
import ImportaBatch from "@/components/gestore/ImportaBatch";
import RevisioneBozza, {
  type DatiRevisione,
} from "@/components/gestore/RevisioneBozza";
import { useToast } from "@/components/gestore/Toaster";
import { slugify } from "@/lib/gestore/slug";
import type { Categoria } from "@/lib/types";

const inputCls =
  "h-12 w-full rounded-2xl bg-white px-4 text-base text-foreground ring-1 ring-line outline-none transition-shadow";

// Tetto pagine listing lato client (allineato al server: 40 x 25 = 1000 card).
const MAX_PAGINE = 40;

interface DatiBatch {
  voci: VoceListingBlt[];
  codiciEsistenti: string[];
  totale: number | null;
}

export default function ImportaDaUrl({ categorie }: { categorie: Categoria[] }) {
  const { mostra } = useToast();

  const [fase, setFase] = useState<"input" | "revisione" | "fatto" | "batch">(
    "input",
  );
  const [url, setUrl] = useState("");
  const [msgAnalisi, setMsgAnalisi] = useState("");
  const [analizzando, startAnalisi] = useTransition();
  const [creando, startCrea] = useTransition();
  const [progresso, setProgresso] = useState("");

  // Flusso singolo: bozza in revisione, poi esito della creazione.
  const [bozza, setBozza] = useState<BozzaImport | null>(null);
  const [esito, setEsito] = useState<{
    id: string;
    fotoOk: number;
    fotoErr: number;
    avviso: string | null;
  } | null>(null);

  // Flusso massivo: dati raccolti dalla scansione.
  const [batch, setBatch] = useState<DatiBatch | null>(null);

  const urlOk = useMemo(() => urlFornitoreValido(url.trim()), [url]);

  function analizza() {
    const u = url.trim();
    if (!urlFornitoreValido(u)) return;
    startAnalisi(async () => {
      try {
        setMsgAnalisi("Controllo l'indirizzo…");
        const prima = await scansionaListingAction(u, 1);
        if (!prima.ok) {
          mostra(prima.error ?? "Analisi non riuscita.", "errore");
          return;
        }

        // --- Scheda singola: flusso classico ---------------------------------
        if (prima.tipo === "prodotto") {
          setMsgAnalisi("Scarico la pagina…");
          const timer = setTimeout(
            () => setMsgAnalisi("Preparo la scheda…"),
            6_000,
          );
          try {
            const r = await analizzaUrlFornitoreAction(u);
            if (!r.ok || !r.bozza) {
              mostra(r.error ?? "Analisi non riuscita.", "errore");
              return;
            }
            setBozza(r.bozza);
            setFase("revisione");
          } finally {
            clearTimeout(timer);
          }
          return;
        }

        // --- Listing: si raccolgono tutte le pagine --------------------------
        const visti = new Set<string>();
        const voci: VoceListingBlt[] = [];
        let totale = prima.totale ?? null;
        const aggiungi = (nuove: VoceListingBlt[] | undefined) => {
          let aggiunte = 0;
          for (const v of nuove ?? []) {
            if (visti.has(v.url)) continue;
            visti.add(v.url);
            voci.push(v);
            aggiunte++;
          }
          return aggiunte;
        };
        aggiungi(prima.voci);
        let fine = prima.fine === true;
        let pagina = 1;
        while (
          !fine &&
          pagina < MAX_PAGINE &&
          (totale === null || voci.length < totale)
        ) {
          pagina++;
          setMsgAnalisi(
            `Cerco i prodotti… pagina ${pagina} (${voci.length} trovati)`,
          );
          const r = await scansionaListingAction(u, pagina);
          if (!r.ok) {
            mostra(
              `Scansione interrotta alla pagina ${pagina}: ${r.error ?? "errore"}. Procedo con i ${voci.length} prodotti trovati.`,
              "errore",
            );
            break;
          }
          totale = totale ?? r.totale ?? null;
          const aggiunte = aggiungi(r.voci);
          // Pagina vuota o che ripete prodotti gia visti: il listing e finito.
          if (r.fine || aggiunte === 0) fine = true;
        }

        if (voci.length === 0) {
          mostra(
            "Nessun prodotto trovato a questo indirizzo: controlla che sia una pagina di categoria o di prodotto del fornitore.",
            "errore",
          );
          return;
        }

        // Pre-check duplicati sui codici delle card (best effort).
        setMsgAnalisi("Controllo i duplicati a catalogo…");
        let codiciEsistenti: string[] = [];
        const codici = voci
          .map((v) => v.sku)
          .filter((s): s is string => Boolean(s));
        if (codici.length > 0) {
          const vc = await verificaCodiciAction(codici);
          if (vc.ok) {
            codiciEsistenti = vc.esistenti ?? [];
          } else {
            mostra(
              "Controllo duplicati non riuscito: procedo comunque (i doppioni verranno bloccati alla creazione).",
              "errore",
            );
          }
        }

        setBatch({ voci, codiciEsistenti, totale });
        setFase("batch");
      } catch {
        mostra(
          "Analisi non riuscita: fornitore non raggiungibile o connessione lenta. Riprova.",
          "errore",
        );
      } finally {
        setMsgAnalisi("");
      }
    });
  }

  function creaSingolo(dati: DatiRevisione) {
    startCrea(async () => {
      try {
        // 1) Crea il prodotto bozza (attivo=false) con le varianti taglia.
        const r = await creaProdottoDaImportAction({
          nome: dati.nome,
          slug: slugify(dati.nome),
          codice: dati.codice,
          descrizione: dati.descrizione,
          prezzoCents: dati.prezzoCents,
          taglie: dati.taglie,
          categoriaId: dati.categoriaId,
          soloOnline: dati.soloOnline,
        });
        if (!r.ok || !r.prodottoId) {
          mostra(r.error ?? "Creazione non riuscita.", "errore");
          return;
        }
        // La bozza può nascere con un intoppo (es. varianti non salvate):
        // il server lo segnala con ok:true + error, come in GeneraDaFoto.
        const avvisoServer = r.error ?? null;

        // 2) Importa le foto selezionate una alla volta (ordine di selezione);
        //    un errore su una foto — anche di rete — non blocca le successive:
        //    da qui in poi la bozza ESISTE e si arriva sempre alla fase "fatto".
        let erroriFoto = 0;
        for (let i = 0; i < dati.fotoSel.length; i++) {
          setProgresso(`Foto ${i + 1} di ${dati.fotoSel.length}…`);
          try {
            const f = await importaFotoDaUrlAction(r.prodottoId, dati.fotoSel[i]);
            if (!f.ok) erroriFoto++;
          } catch {
            erroriFoto++;
          }
        }

        setEsito({
          id: r.prodottoId,
          fotoOk: dati.fotoSel.length - erroriFoto,
          fotoErr: erroriFoto,
          avviso: avvisoServer,
        });
        setFase("fatto");
        if (avvisoServer) {
          mostra(avvisoServer, "errore");
        } else if (erroriFoto > 0) {
          mostra(`Bozza creata, ma ${erroriFoto} foto non importate.`, "errore");
        } else {
          mostra("Bozza creata. Rivedi e pubblica.", "ok");
        }
      } catch {
        mostra("Creazione non riuscita: riprova.", "errore");
      } finally {
        setProgresso("");
      }
    });
  }

  function reset() {
    setFase("input");
    setUrl("");
    setEsito(null);
    setBozza(null);
    setBatch(null);
  }

  // ---- FASE BATCH -------------------------------------------------------------
  if (fase === "batch" && batch) {
    return (
      <ImportaBatch
        voci={batch.voci}
        codiciEsistenti={batch.codiciEsistenti}
        totaleDichiarato={batch.totale}
        urlSorgente={url.trim()}
        categorie={categorie}
        onEsci={reset}
      />
    );
  }

  // ---- FASE INPUT -----------------------------------------------------------
  if (fase === "input") {
    return (
      <div className="mx-auto max-w-xl pb-28 lg:max-w-4xl">
        <Campo
          label="Indirizzo del fornitore"
          htmlFor="i-url"
          hint="Incolla l'indirizzo di un prodotto oppure di un'intera categoria ingrossoblt.com: alle categorie pensiamo noi, scheda per scheda."
        >
          <input
            id="i-url"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (urlOk && !analizzando) analizza();
              }
            }}
            placeholder="https://www.ingrossoblt.com/…"
            spellCheck={false}
            autoCapitalize="none"
            disabled={analizzando}
            className={`${inputCls} font-mono text-sm`}
          />
        </Campo>
        {url.trim() !== "" && !urlOk && (
          <p className="mt-1.5 text-xs font-medium text-coral">
            L&apos;indirizzo non sembra una pagina ingrossoblt.com.
          </p>
        )}

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur md:left-60">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3 lg:max-w-4xl">
            <span className="truncate text-sm text-muted" aria-live="polite">
              {analizzando ? msgAnalisi : ""}
            </span>
            <button
              type="button"
              onClick={analizza}
              disabled={!urlOk || analizzando}
              className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-sea px-7 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
            >
              {analizzando ? "Analisi in corso…" : "Analizza"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- FASE FATTO (flusso singolo) --------------------------------------------
  if (fase === "fatto" && esito) {
    const fotoMsg =
      esito.fotoErr > 0
        ? `${esito.fotoOk} foto importate, ${esito.fotoErr} non importate: puoi aggiungerle dalla scheda.`
        : esito.fotoOk > 0
          ? `${esito.fotoOk === 1 ? "1 foto importata" : `${esito.fotoOk} foto importate`}.`
          : "Nessuna foto importata.";
    return (
      <div className="mx-auto max-w-xl pb-28 lg:max-w-4xl">
        <section className="rounded-3xl bg-white px-6 py-10 text-center shadow-soft ring-1 ring-line">
          <span
            className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-2xl"
            aria-hidden="true"
          >
            📦
          </span>
          <h2 className="font-display text-lg font-extrabold text-foreground">
            Bozza creata
          </h2>
          <p className="mt-1 text-sm text-muted">
            {fotoMsg} Il prodotto non è in vendita finché non lo pubblichi.
          </p>
          {esito.avviso && (
            <p className="mt-2 text-sm font-medium text-coral">{esito.avviso}</p>
          )}
          <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <Link
              href={`/gestore/prodotti/${esito.id}`}
              className="inline-flex h-12 items-center rounded-full bg-sea px-7 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5"
            >
              Rivedi e pubblica
            </Link>
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-12 items-center rounded-full px-5 font-display text-sm font-bold text-sea transition-colors hover:bg-surface-2"
            >
              Importa un altro
            </button>
          </div>
        </section>
      </div>
    );
  }

  // ---- FASE REVISIONE (flusso singolo) -----------------------------------------
  if (fase === "revisione" && bozza) {
    return (
      <RevisioneBozza
        bozza={bozza}
        categorie={categorie}
        busy={creando}
        progresso={progresso || "Creazione…"}
        azionePrimaria="Crea bozza"
        secondaria={{ label: "Indietro", onClick: () => setFase("input") }}
        onConferma={creaSingolo}
      />
    );
  }

  return null;
}

function Campo({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="font-display text-sm font-bold text-foreground"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
