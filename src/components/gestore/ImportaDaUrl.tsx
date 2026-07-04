"use client";

// Flusso "Importa da fornitore" (area gestore).
// 1) INPUT: il gestore incolla l'URL di un prodotto ingrossoblt.com; il server
//    scarica la pagina e prepara una bozza (foto, prezzo, taglie, descrizione).
// 2) REVISIONE: foto selezionabili (la prima e la copertina), campi editabili,
//    badge sull'origine del prezzo, avvisi del server in banner.
// 3) CREAZIONE: crea il prodotto BOZZA (attivo=false), poi importa le foto
//    selezionate UNA ALLA VOLTA con progresso visibile.
// 4) FATTO: link "Rivedi e pubblica" alla scheda prodotto + reset.

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";

import {
  analizzaUrlFornitoreAction,
  creaProdottoDaImportAction,
  importaFotoDaUrlAction,
  type BozzaImport,
} from "@/lib/gestore/import-actions";
import { urlFornitoreValido } from "@/lib/gestore/fornitori/ingrossoblt";
import { useToast } from "@/components/gestore/Toaster";
import { slugify } from "@/lib/gestore/slug";
import { formatPrezzo, parsePrezzoCents } from "@/lib/format";
import { TAGLIE } from "@/lib/catalogo";

const inputCls =
  "h-12 w-full rounded-2xl bg-white px-4 text-base text-foreground ring-1 ring-line outline-none transition-shadow";

// Chip taglia = scala del negozio (S–6XL, fonte unica src/lib/catalogo.ts,
// la stessa dell'editor varianti); le taglie proposte dal server fuori scala
// (es. "8 anni") vengono aggiunte come chip extra.
const TAGLIE_CHIP: string[] = [...TAGLIE];

export default function ImportaDaUrl() {
  const { mostra } = useToast();

  const [fase, setFase] = useState<"input" | "revisione" | "fatto">("input");
  const [url, setUrl] = useState("");
  const [msgAnalisi, setMsgAnalisi] = useState("");
  const [analizzando, startAnalisi] = useTransition();
  const [creando, startCrea] = useTransition();
  const [progresso, setProgresso] = useState("");

  // Campi della bozza (fase revisione).
  const [nome, setNome] = useState("");
  const [codice, setCodice] = useState("");
  const [prezzoInput, setPrezzoInput] = useState("");
  const [fontePrezzo, setFontePrezzo] =
    useState<BozzaImport["fontePrezzo"]>("calcolato");
  const [descrizione, setDescrizione] = useState("");
  const [avvisi, setAvvisi] = useState<string[]>([]);
  const [foto, setFoto] = useState<string[]>([]);
  const [fotoSel, setFotoSel] = useState<string[]>([]); // ordine di selezione
  const [chips, setChips] = useState<string[]>(TAGLIE_CHIP);
  const [taglie, setTaglie] = useState<string[]>([]);

  // Esito della creazione (fase fatto). `avviso` è l'eventuale errore parziale
  // del server (bozza creata ma varianti non salvate): va mostrato, non ingoiato.
  const [esito, setEsito] = useState<{
    id: string;
    fotoOk: number;
    fotoErr: number;
    avviso: string | null;
  } | null>(null);

  const urlOk = useMemo(() => urlFornitoreValido(url.trim()), [url]);
  const prezzoCents = useMemo(() => parsePrezzoCents(prezzoInput), [prezzoInput]);

  function analizza() {
    const u = url.trim();
    if (!urlFornitoreValido(u)) return;
    startAnalisi(async () => {
      // Stati leggibili: prima il download, poi la preparazione della scheda
      // (la riscrittura della descrizione e la parte lenta).
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
        const b = r.bozza;
        setNome(b.nome);
        setCodice(b.codice ?? "");
        setPrezzoInput((b.prezzoCents / 100).toFixed(2).replace(".", ","));
        setFontePrezzo(b.fontePrezzo);
        setDescrizione(b.descrizione);
        setAvvisi(b.avvisi);
        setFoto(b.foto);
        setFotoSel(b.foto); // tutte selezionate, in ordine galleria
        setChips([
          ...TAGLIE_CHIP,
          ...b.taglie.filter((t) => !TAGLIE_CHIP.includes(t)),
        ]);
        setTaglie(b.taglie);
        setFase("revisione");
      } catch {
        mostra(
          "Analisi non riuscita: fornitore non raggiungibile o connessione lenta. Riprova.",
          "errore",
        );
      } finally {
        clearTimeout(timer);
        setMsgAnalisi("");
      }
    });
  }

  function toggleFoto(u: string) {
    setFotoSel((sel) =>
      sel.includes(u) ? sel.filter((x) => x !== u) : [...sel, u],
    );
  }

  function toggleTaglia(t: string) {
    setTaglie((sel) =>
      sel.includes(t)
        ? sel.filter((x) => x !== t)
        : chips.filter((c) => c === t || sel.includes(c)), // ordine dei chip
    );
  }

  function crea() {
    if (!nome.trim() || prezzoCents === null || prezzoCents <= 0) {
      mostra("Servono almeno nome e prezzo validi.", "errore");
      return;
    }
    if (taglie.length === 0) {
      mostra("Seleziona almeno una taglia.", "errore");
      return;
    }
    startCrea(async () => {
      try {
        // 1) Crea il prodotto bozza (attivo=false) con le varianti taglia.
        const r = await creaProdottoDaImportAction({
          nome: nome.trim(),
          slug: slugify(nome),
          codice: codice.trim() || null,
          descrizione,
          prezzoCents,
          taglie,
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
        for (let i = 0; i < fotoSel.length; i++) {
          setProgresso(`Foto ${i + 1} di ${fotoSel.length}…`);
          try {
            const f = await importaFotoDaUrlAction(r.prodottoId, fotoSel[i]);
            if (!f.ok) erroriFoto++;
          } catch {
            erroriFoto++;
          }
        }

        setEsito({
          id: r.prodottoId,
          fotoOk: fotoSel.length - erroriFoto,
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
    setNome("");
    setCodice("");
    setPrezzoInput("");
    setFontePrezzo("calcolato");
    setDescrizione("");
    setAvvisi([]);
    setFoto([]);
    setFotoSel([]);
    setChips(TAGLIE_CHIP);
    setTaglie([]);
  }

  // ---- FASE INPUT -----------------------------------------------------------
  if (fase === "input") {
    return (
      <div className="mx-auto max-w-xl pb-28 lg:max-w-4xl">
        <Campo
          label="Indirizzo del prodotto"
          htmlFor="i-url"
          hint="Incolla l'indirizzo di un prodotto ingrossoblt.com"
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
            L&apos;indirizzo non sembra un prodotto ingrossoblt.com.
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

  // ---- FASE FATTO -----------------------------------------------------------
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

  // ---- FASE REVISIONE ---------------------------------------------------------
  return (
    <div className="mx-auto max-w-xl pb-28 lg:max-w-4xl">
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:gap-x-8">
        {avvisi.length > 0 && (
          <div
            className="flex flex-col gap-1 rounded-2xl bg-sun/20 px-4 py-3 ring-1 ring-sun/50 lg:col-span-2"
            role="status"
          >
            {avvisi.map((a, i) => (
              <p key={i} className="text-sm font-medium text-[#8a6500]">
                {a}
              </p>
            ))}
          </div>
        )}

        {/* Foto: griglia con selezione; la prima selezionata e la copertina. */}
        <section className="lg:col-span-2">
          <span className="font-display text-sm font-bold text-foreground">
            Foto ({fotoSel.length} di {foto.length} selezionate)
          </span>
          {foto.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              Nessuna foto trovata sulla pagina del fornitore: potrai
              aggiungerle dalla scheda prodotto.
            </p>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap gap-2">
                {foto.map((u) => {
                  const sel = fotoSel.includes(u);
                  const copertina = sel && fotoSel[0] === u;
                  return (
                    <button
                      key={u}
                      type="button"
                      onClick={() => toggleFoto(u)}
                      aria-pressed={sel}
                      aria-label={sel ? "Escludi foto" : "Includi foto"}
                      disabled={creando}
                      className={[
                        "relative h-24 w-24 shrink-0 overflow-hidden rounded-xl transition-all",
                        sel
                          ? "ring-2 ring-sea"
                          : "opacity-55 ring-1 ring-line hover:opacity-80",
                      ].join(" ")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- anteprima dal sito del fornitore */}
                      <img
                        src={u}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                      <span
                        className={[
                          "absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full",
                          sel
                            ? "bg-sea text-white"
                            : "bg-white/85 text-transparent ring-1 ring-line",
                        ].join(" ")}
                        aria-hidden="true"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={3}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-3.5 w-3.5"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </span>
                      {copertina && (
                        <span className="absolute bottom-1 left-1 rounded-full bg-sea/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          copertina
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted">
                Tocca una foto per includerla o escluderla. Verranno importate
                nell&apos;ordine di selezione; la prima è la copertina.
              </p>
            </>
          )}
        </section>

        <Campo label="Nome" htmlFor="i-nome">
          <input
            id="i-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            disabled={creando}
            className={inputCls}
          />
        </Campo>

        <Campo
          label="Codice prodotto"
          htmlFor="i-codice"
          hint="Base degli SKU delle varianti."
        >
          <input
            id="i-codice"
            value={codice}
            onChange={(e) => setCodice(e.target.value)}
            spellCheck={false}
            autoCapitalize="characters"
            disabled={creando}
            className={`${inputCls} font-mono text-sm`}
          />
        </Campo>

        {/* Prezzo con badge sull'origine (come FormProdotto + badge). */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="i-prezzo"
              className="font-display text-sm font-bold text-foreground"
            >
              Prezzo
            </label>
            {fontePrezzo === "consigliato" ? (
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-bold text-sea">
                Consigliato dal fornitore
              </span>
            ) : (
              <span className="rounded-full bg-sun/30 px-2.5 py-0.5 text-xs font-bold text-[#8a6500]">
                Calcolato: (ingrosso+IVA)×3
              </span>
            )}
          </div>
          <div className="relative">
            <input
              id="i-prezzo"
              value={prezzoInput}
              onChange={(e) => setPrezzoInput(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              disabled={creando}
              className={`${inputCls} pr-9`}
            />
            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-muted">
              €
            </span>
          </div>
          <p className="text-xs text-muted">
            {prezzoCents !== null && prezzoCents > 0
              ? `= ${formatPrezzo(prezzoCents)}`
              : "Es. 29,99"}
          </p>
        </div>

        {/* Taglie: chip toggle, una variante per taglia. */}
        <div className="flex flex-col gap-1.5">
          <span className="font-display text-sm font-bold text-foreground">
            Taglie
          </span>
          <div className="flex flex-wrap gap-2">
            {chips.map((t) => {
              const sel = taglie.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={sel}
                  onClick={() => toggleTaglia(t)}
                  disabled={creando}
                  className={[
                    "h-11 min-w-[3rem] rounded-xl px-3 font-display text-sm font-bold transition-all",
                    sel
                      ? "bg-sea text-white shadow-sea"
                      : "bg-white text-foreground ring-1 ring-line hover:-translate-y-0.5 hover:ring-lagoon",
                  ].join(" ")}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted">
            Una variante per taglia, magazzino a zero: la bozza nasce in
            modalità &ldquo;Scrivici per la disponibilità&rdquo;.
          </p>
        </div>

        <div className="lg:col-span-2">
          <Campo label="Descrizione" htmlFor="i-desc">
            <textarea
              id="i-desc"
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              rows={7}
              disabled={creando}
              className="min-h-40 w-full resize-y rounded-2xl bg-white px-4 py-3 text-base text-foreground ring-1 ring-line outline-none"
            />
          </Campo>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur md:left-60">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 lg:max-w-4xl">
          <button
            type="button"
            onClick={() => setFase("input")}
            disabled={creando}
            className="flex h-12 items-center rounded-full px-4 font-display text-sm font-bold text-muted transition-colors hover:text-foreground disabled:opacity-50"
          >
            Indietro
          </button>
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate text-sm text-muted" aria-live="polite">
              {creando ? progresso : ""}
            </span>
            <button
              type="button"
              onClick={crea}
              disabled={
                creando ||
                !nome.trim() ||
                prezzoCents === null ||
                prezzoCents <= 0 ||
                taglie.length === 0
              }
              className="flex h-12 shrink-0 items-center rounded-full bg-sea px-7 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
            >
              {creando ? "Creazione…" : "Crea bozza"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
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
