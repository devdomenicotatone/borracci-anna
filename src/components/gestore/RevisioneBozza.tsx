"use client";

// Form di revisione di una bozza d'import (fornitore Ingrosso BLT), condiviso
// dal flusso singolo (ImportaDaUrl) e dalla modalita "con revisione" del flusso
// massivo (ImportaBatch). Stato dei campi interno, inizializzato dalla bozza:
// il genitore monta il componente con una `key` per prodotto, cosi il cambio
// bozza riparte pulito senza effetti di sincronizzazione.

import { useMemo, useState } from "react";

import type { BozzaImport } from "@/lib/gestore/import-actions";
import CategoriaSelect from "@/components/gestore/CategoriaSelect";
import { useToast } from "@/components/gestore/Toaster";
import { formatPrezzo, parsePrezzoCents } from "@/lib/format";
import {
  COLORI,
  TAGLIE,
  coloreChiaro,
  coloreHex,
  dividiTagliePerPubblico,
} from "@/lib/catalogo";
import type { Categoria } from "@/lib/types";

const inputCls =
  "h-12 w-full rounded-2xl bg-white px-4 text-base text-foreground ring-1 ring-line outline-none transition-shadow";

// Chip taglia = scala del negozio (fonte unica src/lib/catalogo.ts); le taglie
// proposte dal server fuori scala (es. "8 anni") diventano chip extra.
const TAGLIE_CHIP: string[] = [...TAGLIE];

/** Dati confermati dal gestore, pronti per creaProdottoDaImportAction. */
export interface DatiRevisione {
  nome: string;
  codice: string | null;
  prezzoCents: number;
  descrizione: string;
  taglie: string[];
  /** Colore unico della scheda (dal fornitore o scelto qui); null = senza colore. */
  colore: string | null;
  /** Foto da importare, nell'ordine di selezione (la prima e la copertina). */
  fotoSel: string[];
  /** Categoria della scheda ADULTO (taglie lettere); null = nessuna. */
  categoriaAdulto: string | null;
  /** Categoria della scheda BAMBINO (taglie eta/numero, scheda separata); null = nessuna. */
  categoriaBambino: string | null;
  /** Articolo non presente in negozio: badge "Solo online" in vetrina. */
  soloOnline: boolean;
}

export default function RevisioneBozza({
  bozza,
  codiceFallback = null,
  categorie,
  categoriaAdultoIniziale = "",
  categoriaBambinoIniziale = "",
  soloOnlineIniziale = false,
  intestazione,
  busy,
  progresso,
  azionePrimaria,
  secondaria,
  onConferma,
}: {
  bozza: BozzaImport;
  /** Codice di riserva se la scheda non lo espone (es. SKU dalla card listing). */
  codiceFallback?: string | null;
  categorie: Categoria[];
  categoriaAdultoIniziale?: string;
  categoriaBambinoIniziale?: string;
  /** Preimpostazione del flag "Solo online" (es. dall'opzione del batch). */
  soloOnlineIniziale?: boolean;
  /** Riga di contesto sopra il form (es. "Prodotto 3 di 60"). */
  intestazione?: React.ReactNode;
  busy: boolean;
  /** Testo di stato nella barra azioni (es. "Foto 2 di 5…"). */
  progresso: string;
  /** Etichetta del bottone principale (es. "Crea bozza", "Crea e continua"). */
  azionePrimaria: string;
  /** Azione secondaria nella barra (es. Indietro / Salta). */
  secondaria?: { label: string; onClick: () => void };
  onConferma: (dati: DatiRevisione) => void;
}) {
  const { mostra } = useToast();

  const [nome, setNome] = useState(bozza.nome);
  const [codice, setCodice] = useState(bozza.codice ?? codiceFallback ?? "");
  const [prezzoInput, setPrezzoInput] = useState(
    (bozza.prezzoCents / 100).toFixed(2).replace(".", ","),
  );
  const [descrizione, setDescrizione] = useState(bozza.descrizione);
  const [fotoSel, setFotoSel] = useState<string[]>(bozza.foto);
  const [chips] = useState<string[]>(() => [
    ...TAGLIE_CHIP,
    ...bozza.taglie.filter((t) => !TAGLIE_CHIP.includes(t)),
  ]);
  const [taglie, setTaglie] = useState<string[]>(bozza.taglie);
  const [colore, setColore] = useState<string>(bozza.colore ?? "");
  // Opzioni colore = palette del negozio + eventuale colore rilevato fuori
  // palette (non lo perdiamo). Init lazy: la bozza e stabile per il mount.
  const [opzioniColore] = useState<string[]>(() => {
    const nomi = COLORI.map((c) => c.nome);
    const det = bozza.colore?.trim();
    return det && !nomi.some((n) => n.toLowerCase() === det.toLowerCase())
      ? [det, ...nomi]
      : nomi;
  });
  const [catAdulto, setCatAdulto] = useState(categoriaAdultoIniziale);
  const [catBambino, setCatBambino] = useState(categoriaBambinoIniziale);
  const [soloOnline, setSoloOnline] = useState(soloOnlineIniziale);

  const prezzoCents = useMemo(() => parsePrezzoCents(prezzoInput), [prezzoInput]);
  // Divisione taglie per pubblico: guida quali selettori categoria mostrare (un
  // prodotto misto uomo+bambino diventa due schede, una per pubblico).
  const split = useMemo(() => dividiTagliePerPubblico(taglie), [taglie]);

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

  function conferma() {
    if (!nome.trim() || prezzoCents === null || prezzoCents <= 0) {
      mostra("Servono almeno nome e prezzo validi.", "errore");
      return;
    }
    if (taglie.length === 0) {
      mostra("Seleziona almeno una taglia.", "errore");
      return;
    }
    onConferma({
      nome: nome.trim(),
      codice: codice.trim() || null,
      prezzoCents,
      descrizione,
      taglie,
      colore: colore.trim() || null,
      fotoSel,
      categoriaAdulto: catAdulto || null,
      categoriaBambino: catBambino || null,
      soloOnline,
    });
  }

  const confermabile =
    !busy &&
    nome.trim() !== "" &&
    prezzoCents !== null &&
    prezzoCents > 0 &&
    taglie.length > 0;

  return (
    <div className="mx-auto max-w-xl pb-28 lg:max-w-4xl">
      {intestazione}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:gap-x-8">
        {bozza.avvisi.length > 0 && (
          <div
            className="flex flex-col gap-1 rounded-2xl bg-sun/20 px-4 py-3 ring-1 ring-sun/50 lg:col-span-2"
            role="status"
          >
            {bozza.avvisi.map((a, i) => (
              <p key={i} className="text-sm font-medium text-[#8a6500]">
                {a}
              </p>
            ))}
          </div>
        )}

        {/* Foto: griglia con selezione; la prima selezionata e la copertina. */}
        <section className="lg:col-span-2">
          <span className="font-display text-sm font-bold text-foreground">
            Foto ({fotoSel.length} di {bozza.foto.length} selezionate)
          </span>
          {bozza.foto.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              Nessuna foto trovata sulla pagina del fornitore: potrai
              aggiungerle dalla scheda prodotto.
            </p>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap gap-2">
                {bozza.foto.map((u) => {
                  const sel = fotoSel.includes(u);
                  const copertina = sel && fotoSel[0] === u;
                  return (
                    <button
                      key={u}
                      type="button"
                      onClick={() => toggleFoto(u)}
                      aria-pressed={sel}
                      aria-label={sel ? "Escludi foto" : "Includi foto"}
                      disabled={busy}
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

        <Campo label="Nome" htmlFor="r-nome">
          <input
            id="r-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            disabled={busy}
            className={inputCls}
          />
        </Campo>

        <Campo
          label="Codice prodotto"
          htmlFor="r-codice"
          hint="Base degli SKU delle varianti."
        >
          <input
            id="r-codice"
            value={codice}
            onChange={(e) => setCodice(e.target.value)}
            spellCheck={false}
            autoCapitalize="characters"
            disabled={busy}
            className={`${inputCls} font-mono text-sm`}
          />
        </Campo>

        {/* Prezzo con badge sull'origine (come FormProdotto + badge). */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="r-prezzo"
              className="font-display text-sm font-bold text-foreground"
            >
              Prezzo
            </label>
            {bozza.fontePrezzo === "consigliato" ? (
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
              id="r-prezzo"
              value={prezzoInput}
              onChange={(e) => setPrezzoInput(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              disabled={busy}
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

        {/* Categorie: una per pubblico. Un prodotto misto (uomo+bambino)
            diventa due schede — le taglie lettera vanno all'adulto, quelle a
            eta/numero al bambino (scheda separata, codice -B). */}
        {split.adulto.length > 0 && (
          <Campo
            label={split.bambino.length > 0 ? "Categoria adulto" : "Categoria"}
            htmlFor="r-cat-adulto"
            hint={
              split.bambino.length > 0
                ? `Per le taglie ${split.adulto.join(", ")}.`
                : "Puoi cambiarla in ogni momento dalla scheda prodotto."
            }
          >
            <CategoriaSelect
              id="r-cat-adulto"
              categorie={categorie}
              value={catAdulto}
              onChange={setCatAdulto}
              disabled={busy}
            />
          </Campo>
        )}
        {split.bambino.length > 0 && (
          <Campo
            label={split.adulto.length > 0 ? "Categoria bambino" : "Categoria"}
            htmlFor="r-cat-bambino"
            hint={
              split.adulto.length > 0
                ? `Per le taglie ${split.bambino.join(", ")} — scheda separata (codice -B).`
                : "Puoi cambiarla in ogni momento dalla scheda prodotto."
            }
          >
            <CategoriaSelect
              id="r-cat-bambino"
              categorie={categorie}
              value={catBambino}
              onChange={setCatBambino}
              disabled={busy}
            />
          </Campo>
        )}

        {/* Solo online: articolo non presente in negozio (badge in vetrina). */}
        <button
          type="button"
          role="switch"
          aria-checked={soloOnline}
          onClick={() => setSoloOnline((v) => !v)}
          disabled={busy}
          className="flex w-full items-center justify-between gap-4 rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-line transition-all hover:ring-lagoon disabled:opacity-50"
        >
          <span className="min-w-0">
            <span className="block font-display text-sm font-bold text-foreground">
              Solo online
            </span>
            <span className="mt-0.5 block text-xs text-muted">
              Articolo non presente in negozio: in vetrina compare il badge
              &laquo;Solo online&raquo;.
            </span>
          </span>
          <span
            aria-hidden="true"
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
              soloOnline ? "bg-sea" : "bg-line"
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                soloOnline ? "left-6" : "left-1"
              }`}
            />
          </span>
        </button>

        {/* Colore: uno per scheda (rilevato dal fornitore), modificabile o
            azzerabile. Swatch + select della palette. */}
        <Campo
          label="Colore"
          htmlFor="r-colore"
          hint="Rilevato dal fornitore; le varianti avranno questo colore."
        >
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className={[
                "grid h-9 w-9 shrink-0 place-items-center rounded-full",
                !colore || coloreChiaro(coloreHex(colore))
                  ? "ring-1 ring-line"
                  : "",
              ].join(" ")}
              style={colore ? { backgroundColor: coloreHex(colore) } : undefined}
            >
              {!colore && <span className="text-xs font-bold text-muted">—</span>}
            </span>
            <div className="relative flex-1">
              <select
                id="r-colore"
                value={colore}
                onChange={(e) => setColore(e.target.value)}
                disabled={busy}
                className={`${inputCls} cursor-pointer appearance-none pr-10`}
              >
                <option value="">Nessun colore</option>
                {opzioniColore.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-muted">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </div>
          </div>
        </Campo>

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
                  disabled={busy}
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
          <Campo label="Descrizione" htmlFor="r-desc">
            <textarea
              id="r-desc"
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              rows={7}
              disabled={busy}
              className="min-h-40 w-full resize-y rounded-2xl bg-white px-4 py-3 text-base text-foreground ring-1 ring-line outline-none"
            />
          </Campo>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur md:left-60">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 lg:max-w-4xl">
          {secondaria ? (
            <button
              type="button"
              onClick={secondaria.onClick}
              disabled={busy}
              className="flex h-12 items-center rounded-full px-4 font-display text-sm font-bold text-muted transition-colors hover:text-foreground disabled:opacity-50"
            >
              {secondaria.label}
            </button>
          ) : (
            <span />
          )}
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate text-sm text-muted" aria-live="polite">
              {busy ? progresso : ""}
            </span>
            <button
              type="button"
              onClick={conferma}
              disabled={!confermabile}
              className="flex h-12 shrink-0 items-center rounded-full bg-sea px-7 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
            >
              {busy ? "Creazione…" : azionePrimaria}
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
