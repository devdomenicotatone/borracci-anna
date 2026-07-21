"use client";

// Gestione della VETRINA (home a fasce). Elenco di sezioni riordinabili
// (drag/tastiera), ognuna espandibile in un editor per tipo; le fasce "a mano"
// hanno un sotto-editor per pinnare e ordinare i prodotti. Stato locale
// `sezioni` (fonte unica) riallineato al canonico che ogni action ritorna —
// stesso pattern di GestoreCategorie (`applica`): su errore niente revert, il
// prossimo canonico corregge.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";

import {
  creaSezioneAction,
  salvaSezioneAction,
  eliminaSezioneAction,
  toggleVisibileSezioneAction,
  riordinaSezioniAction,
  cercaProdottiVetrinaAction,
  aggiungiProdottoSezioneAction,
  rimuoviProdottoSezioneAction,
  riordinaProdottiSezioneAction,
  caricaSfondoVetrinaAction,
} from "@/lib/gestore/vetrina-actions";
import type { EsitoVetrina, VetrinaSezioneAdmin } from "@/lib/gestore/vetrina";
import { useToast } from "@/components/gestore/Toaster";
import CategoriaSelect from "@/components/gestore/CategoriaSelect";
import { Campo, ChevronSelect, inputCls } from "@/components/gestore/ui";
import {
  useSortableList,
  type ContestoRiga,
} from "@/components/gestore/useSortableList";
import { formatPrezzo } from "@/lib/format";
import {
  TIPI_SEZIONE_VETRINA,
  type Categoria,
  type ConfigVetrina,
  type Prodotto,
  type RegolaProdottiAuto,
  type TipoSezioneVetrina,
} from "@/lib/types";

const TIPO_META: Record<
  TipoSezioneVetrina,
  { emoji: string; label: string; descr: string }
> = {
  hero: {
    emoji: "🌊",
    label: "Testata",
    descr: "Striscione in cima con titolo e pulsanti",
  },
  banner: {
    emoji: "🏷️",
    label: "Banner",
    descr: "Striscia promozionale con testo e pulsante",
  },
  categorie: {
    emoji: "🗂️",
    label: "Scorciatoie categorie",
    descr: "Le tessere verso le categorie del negozio",
  },
  prodotti_manuale: {
    emoji: "⭐",
    label: "Prodotti scelti a mano",
    descr: "Scegli e ordini tu i capi in vetrina",
  },
  prodotti_auto: {
    emoji: "⚡",
    label: "Prodotti automatici",
    descr: "Si riempie da sola con una regola",
  },
};

const REGOLA_LABEL: Record<RegolaProdottiAuto, string> = {
  novita: "Ultimi arrivi",
  categoria: "Una categoria",
  solo_online: "Solo online",
};

const TONI: { v: string; label: string }[] = [
  { v: "deep", label: "Blu mare" },
  { v: "coral", label: "Corallo" },
  { v: "cyan", label: "Azzurro" },
  { v: "sunset", label: "Tramonto" },
  { v: "sun", label: "Giallo" },
  { v: "cyan-soft", label: "Azzurro tenue" },
];

export default function GestoreVetrina({
  sezioniIniziali,
  categorie,
}: {
  sezioniIniziali: VetrinaSezioneAdmin[];
  categorie: Categoria[];
}) {
  const { mostra } = useToast();
  const [sezioni, setSezioni] = useState<VetrinaSezioneAdmin[]>(sezioniIniziali);
  const [pending, startTransition] = useTransition();
  const [espansa, setEspansa] = useState<string | null>(null);
  const [menuNuova, setMenuNuova] = useState(false);
  const [annuncio, setAnnuncio] = useState("");
  const occupato = pending;

  function applica(azione: () => Promise<EsitoVetrina>, successo?: string) {
    startTransition(async () => {
      const esito = await azione();
      // Applica il canonico anche su errore: riallinea l'ottimistico del
      // riordino quando fallisce a meta.
      if (esito.sezioni) setSezioni(esito.sezioni);
      if (!esito.ok) {
        mostra(esito.error ?? "Operazione non riuscita.", "errore");
        return;
      }
      if (successo) mostra(successo, "ok");
    });
  }

  function committaRiordino(ids: string[]) {
    // Ottimistico: riassegno `ordine` e riordino subito.
    setSezioni((prev) => {
      const perId = new Map(prev.map((s) => [s.id, s]));
      return ids
        .map((id, i) => {
          const s = perId.get(id);
          return s ? { ...s, ordine: i } : null;
        })
        .filter((s): s is VetrinaSezioneAdmin => s !== null);
    });
    applica(() => riordinaSezioniAction(ids));
  }

  function annunciaSpostamento(
    s: VetrinaSezioneAdmin,
    indice: number,
    totale: number,
  ) {
    setAnnuncio(
      `${TIPO_META[s.tipo].label} spostata in posizione ${indice + 1} di ${totale}.`,
    );
  }

  const { ordine, registraRiga, contestoRiga } = useSortableList(
    sezioni,
    committaRiordino,
    occupato,
    annunciaSpostamento,
  );

  function creaSezione(tipo: TipoSezioneVetrina) {
    setMenuNuova(false);
    applica(() => creaSezioneAction(tipo), "Sezione aggiunta (nascosta).");
  }

  function toggleVisibile(s: VetrinaSezioneAdmin) {
    applica(() => toggleVisibileSezioneAction(s.id, !s.visibile));
  }

  function elimina(id: string) {
    if (espansa === id) setEspansa(null);
    applica(() => eliminaSezioneAction(id), "Sezione eliminata.");
  }

  const nessuna = ordine.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <p aria-live="polite" className="sr-only">
        {annuncio}
      </p>

      {nessuna ? (
        <div className="rounded-3xl border border-dashed border-line bg-surface px-6 py-12 text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-xl">
            🪟
          </span>
          <p className="font-display text-base font-bold text-foreground">
            La vetrina è vuota
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Aggiungi la prima fascia: una testata, le scorciatoie alle categorie
            o un carosello di prodotti.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {ordine.map((sezione, i) => {
            const ctx = contestoRiga(sezione, i);
            return (
              <li
                key={sezione.id}
                ref={(el) => registraRiga(sezione.id, el)}
                className={`overflow-hidden rounded-3xl bg-white shadow-soft ring-1 transition-shadow ${
                  ctx.inTrascinamento ? "ring-2 ring-sea" : "ring-line"
                }`}
              >
                <RigaSezione
                  sezione={sezione}
                  ctx={ctx}
                  espansa={espansa === sezione.id}
                  occupato={occupato}
                  onToggleEspansa={() =>
                    setEspansa((v) => (v === sezione.id ? null : sezione.id))
                  }
                  onToggleVisibile={() => toggleVisibile(sezione)}
                  onElimina={() => elimina(sezione.id)}
                />
                {espansa === sezione.id && (
                  <EditorSezione
                    key={sezione.id}
                    sezione={sezione}
                    categorie={categorie}
                    occupato={occupato}
                    onSalva={(dati) =>
                      applica(
                        () => salvaSezioneAction(sezione.id, dati),
                        "Sezione salvata.",
                      )
                    }
                    onAggiungiProdotto={(prodottoId) =>
                      applica(() =>
                        aggiungiProdottoSezioneAction(sezione.id, prodottoId),
                      )
                    }
                    onRimuoviProdotto={(prodottoId) =>
                      applica(() =>
                        rimuoviProdottoSezioneAction(sezione.id, prodottoId),
                      )
                    }
                    onRiordinaProdotti={(ids) =>
                      applica(() =>
                        riordinaProdottiSezioneAction(sezione.id, ids),
                      )
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Aggiungi sezione */}
      {menuNuova ? (
        <div className="rounded-3xl bg-white p-3 shadow-soft ring-1 ring-line">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="font-display text-sm font-bold text-foreground">
              Che fascia vuoi aggiungere?
            </span>
            <button
              type="button"
              onClick={() => setMenuNuova(false)}
              className="text-xs font-bold text-muted hover:text-foreground"
            >
              Annulla
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {TIPI_SEZIONE_VETRINA.map((tipo) => (
              <button
                key={tipo}
                type="button"
                disabled={occupato}
                onClick={() => creaSezione(tipo)}
                className="flex items-start gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-left ring-1 ring-line transition-all hover:-translate-y-0.5 hover:ring-lagoon disabled:opacity-50"
              >
                <span className="text-xl" aria-hidden="true">
                  {TIPO_META[tipo].emoji}
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-sm font-bold text-foreground">
                    {TIPO_META[tipo].label}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {TIPO_META[tipo].descr}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setMenuNuova(true)}
          disabled={occupato}
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-sea px-6 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5 disabled:opacity-50"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Aggiungi una fascia
        </button>
      )}
    </div>
  );
}

// --- Riga sezione (card collassata) -------------------------------------------

function RigaSezione({
  sezione,
  ctx,
  espansa,
  occupato,
  onToggleEspansa,
  onToggleVisibile,
  onElimina,
}: {
  sezione: VetrinaSezioneAdmin;
  ctx: ContestoRiga;
  espansa: boolean;
  occupato: boolean;
  onToggleEspansa: () => void;
  onToggleVisibile: () => void;
  onElimina: () => void;
}) {
  const [confermaElimina, setConfermaElimina] = useState(false);
  const meta = TIPO_META[sezione.tipo];

  return (
    <div className="flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
      {/* Handle di trascinamento */}
      <button
        type="button"
        {...ctx.handleProps}
        disabled={occupato}
        aria-label="Trascina per riordinare"
        className="flex h-9 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground active:cursor-grabbing disabled:opacity-40"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <circle cx="9" cy="6" r="1.6" />
          <circle cx="15" cy="6" r="1.6" />
          <circle cx="9" cy="12" r="1.6" />
          <circle cx="15" cy="12" r="1.6" />
          <circle cx="9" cy="18" r="1.6" />
          <circle cx="15" cy="18" r="1.6" />
        </svg>
      </button>

      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-lg"
        aria-hidden="true"
      >
        {meta.emoji}
      </span>

      <button
        type="button"
        onClick={onToggleEspansa}
        className="min-w-0 flex-1 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="truncate font-display text-sm font-bold text-foreground">
            {sezione.titolo || meta.label}
          </span>
          {!sezione.visibile && (
            <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
              Nascosta
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted">
          {meta.label}
          {sezione.tipo === "prodotti_manuale"
            ? ` · ${sezione.prodotti.length} prodotti`
            : ""}
        </span>
      </button>

      {/* Mostra/nascondi */}
      <button
        type="button"
        onClick={onToggleVisibile}
        disabled={occupato}
        aria-label={sezione.visibile ? "Nascondi la fascia" : "Mostra la fascia"}
        title={sezione.visibile ? "Visibile in vetrina" : "Nascosta"}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors disabled:opacity-40 ${
          sezione.visibile
            ? "text-sea hover:bg-surface-2"
            : "text-muted hover:bg-surface-2"
        }`}
      >
        {sezione.visibile ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
            <path d="M3 3l18 18M10.6 10.7a3 3 0 004.2 4.2M9.9 5.2A9.5 9.5 0 0112 5c6.5 0 10 7 10 7a15 15 0 01-3.3 4M6.6 6.6A15 15 0 002 12s3.5 7 10 7a9.6 9.6 0 003.4-.6" />
          </svg>
        )}
      </button>

      {/* Modifica */}
      <button
        type="button"
        onClick={onToggleEspansa}
        aria-label={espansa ? "Chiudi l'editor" : "Modifica la fascia"}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors hover:bg-surface-2 ${
          espansa ? "text-sea" : "text-muted"
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
        </svg>
      </button>

      {/* Elimina (conferma inline a 2 step) */}
      {confermaElimina ? (
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onElimina}
            disabled={occupato}
            className="rounded-lg bg-coral/10 px-2.5 py-1.5 text-xs font-bold text-coral disabled:opacity-50"
          >
            Elimina
          </button>
          <button
            type="button"
            onClick={() => setConfermaElimina(false)}
            className="rounded-lg px-2 py-1.5 text-xs font-bold text-muted hover:text-foreground"
          >
            No
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfermaElimina(true)}
          aria-label="Elimina la fascia"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-coral/10 hover:text-coral"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
            <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
          </svg>
        </button>
      )}
    </div>
  );
}

// --- Editor di una sezione (per tipo) -----------------------------------------

interface DatiSalva {
  titolo: string;
  sottotitolo: string;
  config: ConfigVetrina;
}

function EditorSezione({
  sezione,
  categorie,
  occupato,
  onSalva,
  onAggiungiProdotto,
  onRimuoviProdotto,
  onRiordinaProdotti,
}: {
  sezione: VetrinaSezioneAdmin;
  categorie: Categoria[];
  occupato: boolean;
  onSalva: (dati: DatiSalva) => void;
  onAggiungiProdotto: (prodottoId: string) => void;
  onRimuoviProdotto: (prodottoId: string) => void;
  onRiordinaProdotti: (ids: string[]) => void;
}) {
  const c = sezione.config;
  const [titolo, setTitolo] = useState(sezione.titolo ?? "");
  const [sottotitolo, setSottotitolo] = useState(sezione.sottotitolo ?? "");
  const [occhiello, setOcchiello] = useState(c.occhiello ?? "");
  // hero
  const [ctaPL, setCtaPL] = useState(c.ctaPrimariaLabel ?? "");
  const [ctaPH, setCtaPH] = useState(c.ctaPrimariaHref ?? "");
  const [ctaSL, setCtaSL] = useState(c.ctaSecondariaLabel ?? "");
  const [ctaSH, setCtaSH] = useState(c.ctaSecondariaHref ?? "");
  const [stickerAlto, setStickerAlto] = useState(c.stickerAlto ?? "");
  const [stickerBasso, setStickerBasso] = useState(c.stickerBasso ?? "");
  const [immagineUrl, setImmagineUrl] = useState(c.immagineUrl ?? "");
  // banner
  const [testoBanner, setTestoBanner] = useState(c.testo ?? "");
  const [ctaLabel, setCtaLabel] = useState(c.ctaLabel ?? "");
  const [ctaHref, setCtaHref] = useState(c.ctaHref ?? "");
  const [tono, setTono] = useState(c.tono ?? "deep");
  // prodotti
  const [regola, setRegola] = useState<RegolaProdottiAuto>(c.regola ?? "novita");
  const [categoriaId, setCategoriaId] = useState(c.categoriaId ?? "");
  const [limite, setLimite] = useState<number>(c.limite ?? 12);

  function salva() {
    const config: ConfigVetrina = { occhiello };
    if (sezione.tipo === "hero") {
      Object.assign(config, {
        ctaPrimariaLabel: ctaPL,
        ctaPrimariaHref: ctaPH,
        ctaSecondariaLabel: ctaSL,
        ctaSecondariaHref: ctaSH,
        stickerAlto,
        stickerBasso,
        immagineUrl,
      });
    } else if (sezione.tipo === "banner") {
      Object.assign(config, {
        testo: testoBanner,
        ctaLabel,
        ctaHref,
        tono,
        immagineUrl,
      });
    } else if (sezione.tipo === "prodotti_auto") {
      Object.assign(config, { regola, categoriaId, limite });
    } else if (sezione.tipo === "prodotti_manuale") {
      Object.assign(config, { limite });
    }
    onSalva({ titolo, sottotitolo, config });
  }

  const conSottotitolo =
    sezione.tipo === "hero" ||
    sezione.tipo === "prodotti_auto" ||
    sezione.tipo === "prodotti_manuale";

  return (
    <div className="border-t border-line bg-surface-2/40 px-4 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Occhiello" hint="La scritta piccola sopra il titolo.">
          <input
            value={occhiello}
            onChange={(e) => setOcchiello(e.target.value)}
            disabled={occupato}
            placeholder="Es. Fresche di stagione"
            className={inputCls}
          />
        </Campo>
        <Campo label="Titolo">
          <input
            value={titolo}
            onChange={(e) => setTitolo(e.target.value)}
            disabled={occupato}
            className={inputCls}
          />
        </Campo>

        {conSottotitolo && (
          <div className="sm:col-span-2">
            <Campo label="Sottotitolo">
              <input
                value={sottotitolo}
                onChange={(e) => setSottotitolo(e.target.value)}
                disabled={occupato}
                className={inputCls}
              />
            </Campo>
          </div>
        )}

        {sezione.tipo === "hero" && (
          <>
            <Campo label="Pulsante principale — testo">
              <input value={ctaPL} onChange={(e) => setCtaPL(e.target.value)} disabled={occupato} placeholder="Scopri la collezione" className={inputCls} />
            </Campo>
            <Campo label="Pulsante principale — link">
              <input value={ctaPH} onChange={(e) => setCtaPH(e.target.value)} disabled={occupato} placeholder="/prodotti" className={inputCls} />
            </Campo>
            <Campo label="Pulsante secondario — testo">
              <input value={ctaSL} onChange={(e) => setCtaSL(e.target.value)} disabled={occupato} placeholder="Vieni a trovarci" className={inputCls} />
            </Campo>
            <Campo label="Pulsante secondario — link">
              <input value={ctaSH} onChange={(e) => setCtaSH(e.target.value)} disabled={occupato} placeholder="/vieni-a-trovarci" className={inputCls} />
            </Campo>
            <Campo label="Adesivo in alto" hint="Piccola etichetta ruotata (opzionale).">
              <input value={stickerAlto} onChange={(e) => setStickerAlto(e.target.value)} disabled={occupato} placeholder="Estate 2026" className={inputCls} />
            </Campo>
            <Campo label="Adesivo in basso">
              <input value={stickerBasso} onChange={(e) => setStickerBasso(e.target.value)} disabled={occupato} placeholder="☀ Rimini beach" className={inputCls} />
            </Campo>
            <div className="sm:col-span-2">
              <CampoSfondo
                valore={immagineUrl}
                imposta={setImmagineUrl}
                occupato={occupato}
                hintVuoto="Opzionale: se non carichi nulla resta il gradiente mare."
              />
            </div>
          </>
        )}

        {sezione.tipo === "banner" && (
          <>
            <div className="sm:col-span-2">
              <Campo label="Testo">
                <input value={testoBanner} onChange={(e) => setTestoBanner(e.target.value)} disabled={occupato} placeholder="Spedizione gratis sopra i 50€" className={inputCls} />
              </Campo>
            </div>
            <Campo label="Pulsante — testo">
              <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} disabled={occupato} placeholder="Scopri" className={inputCls} />
            </Campo>
            <Campo label="Pulsante — link">
              <input value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} disabled={occupato} placeholder="/prodotti" className={inputCls} />
            </Campo>
            <Campo label="Colore">
              <div className="relative">
                <select value={tono} onChange={(e) => setTono(e.target.value)} disabled={occupato} className={`${inputCls} cursor-pointer appearance-none pr-10`}>
                  {TONI.map((t) => (
                    <option key={t.v} value={t.v}>{t.label}</option>
                  ))}
                </select>
                <ChevronSelect />
              </div>
            </Campo>
            <CampoSfondo
              valore={immagineUrl}
              imposta={setImmagineUrl}
              occupato={occupato}
              hintVuoto="Opzionale: se non carichi nulla resta il colore scelto."
            />
          </>
        )}

        {sezione.tipo === "categorie" && (
          <p className="text-xs text-muted sm:col-span-2">
            Le tessere si generano da sole dalle tue categorie principali.
            Gestisci quali e in che ordine dalla pagina{" "}
            <span className="font-bold text-foreground">Categorie</span>.
          </p>
        )}

        {sezione.tipo === "prodotti_auto" && (
          <>
            <Campo label="Come si riempie">
              <div className="relative">
                <select
                  value={regola}
                  onChange={(e) => setRegola(e.target.value as RegolaProdottiAuto)}
                  disabled={occupato}
                  className={`${inputCls} cursor-pointer appearance-none pr-10`}
                >
                  {(Object.keys(REGOLA_LABEL) as RegolaProdottiAuto[]).map((r) => (
                    <option key={r} value={r}>{REGOLA_LABEL[r]}</option>
                  ))}
                </select>
                <ChevronSelect />
              </div>
            </Campo>
            <Campo label="Quanti prodotti">
              <input
                type="number"
                min={1}
                max={24}
                value={limite}
                onChange={(e) => setLimite(Number(e.target.value))}
                disabled={occupato}
                className={inputCls}
              />
            </Campo>
            {regola === "categoria" && (
              <div className="sm:col-span-2">
                <Campo label="Quale categoria">
                  <CategoriaSelect
                    id={`cat-${sezione.id}`}
                    categorie={categorie}
                    value={categoriaId}
                    onChange={setCategoriaId}
                    disabled={occupato}
                  />
                </Campo>
              </div>
            )}
          </>
        )}

        {sezione.tipo === "prodotti_manuale" && (
          <Campo label="Quanti prodotti al massimo">
            <input
              type="number"
              min={1}
              max={24}
              value={limite}
              onChange={(e) => setLimite(Number(e.target.value))}
              disabled={occupato}
              className={inputCls}
            />
          </Campo>
        )}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={salva}
          disabled={occupato}
          className="inline-flex h-11 items-center rounded-full bg-sea px-6 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5 disabled:opacity-50"
        >
          Salva
        </button>
      </div>

      {sezione.tipo === "prodotti_manuale" && (
        <EditorProdottiPinnati
          pinnati={sezione.prodotti}
          occupato={occupato}
          onAggiungi={onAggiungiProdotto}
          onRimuovi={onRimuoviProdotto}
          onRiordina={onRiordinaProdotti}
        />
      )}
    </div>
  );
}

// --- Immagine di sfondo hero/banner (B5: solo dal bucket del sito) ------------

/**
 * Campo "Immagine di sfondo" SENZA URL a mano libera (finding B5): l'immagine
 * parte dal computer del gestore, viene convertita in WebP dal client (stessa
 * normalizzazione della galleria prodotto: master nitido, l'unica perdita
 * lossy resta quella di next/image al serve) e caricata nel bucket "vetrina".
 * L'URL che finisce in config e per costruzione del sito, quindi supera la
 * validazione del salvataggio. La libreria di compressione si scarica al
 * primo uso (import dinamico): il bundle del pannello resta invariato.
 */
function CampoSfondo({
  valore,
  imposta,
  occupato,
  hintVuoto,
}: {
  valore: string;
  imposta: (v: string) => void;
  occupato: boolean;
  hintVuoto: string;
}) {
  const { mostra } = useToast();
  const inputFileRef = useRef<HTMLInputElement>(null);
  const [caricando, setCaricando] = useState(false);
  const bloccato = occupato || caricando;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      mostra("Scegli un file immagine.", "errore");
      return;
    }
    setCaricando(true);
    try {
      const { default: imageCompression } = await import(
        "browser-image-compression"
      );
      const compressa = await imageCompression(file, {
        maxWidthOrHeight: 2560,
        maxSizeMB: 8,
        initialQuality: 0.92,
        fileType: "image/webp",
        useWebWorker: true,
      });
      const fd = new FormData();
      fd.append("sfondo", compressa, "sfondo.webp");
      const esito = await caricaSfondoVetrinaAction(fd);
      if (!esito.ok || !esito.url) {
        mostra(esito.error ?? "Caricamento non riuscito. Riprova.", "errore");
        return;
      }
      imposta(esito.url);
      mostra("Immagine caricata: ora premi Salva.", "ok");
    } catch {
      mostra("Caricamento non riuscito. Riprova.", "errore");
    } finally {
      setCaricando(false);
    }
  }

  return (
    <Campo
      label="Immagine di sfondo"
      hint={
        valore
          ? "Premi Salva per rendere effettiva la modifica."
          : `${hintVuoto} Le immagini restano sul sito: niente link esterni.`
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        {valore && (
          <Image
            src={valore}
            alt="Anteprima dello sfondo"
            width={80}
            height={48}
            className="h-12 w-20 rounded-lg object-cover ring-1 ring-line"
          />
        )}
        <button
          type="button"
          onClick={() => inputFileRef.current?.click()}
          disabled={bloccato}
          className="inline-flex h-11 items-center rounded-full bg-white px-5 font-display text-sm font-bold text-sea ring-1 ring-line-strong transition-all hover:-translate-y-0.5 disabled:opacity-50"
        >
          {caricando
            ? "Caricamento…"
            : valore
              ? "Sostituisci immagine"
              : "Carica immagine"}
        </button>
        {valore && (
          <button
            type="button"
            onClick={() => imposta("")}
            disabled={bloccato}
            className="rounded-lg bg-coral/10 px-2.5 py-1.5 text-xs font-bold text-coral disabled:opacity-50"
          >
            Togli
          </button>
        )}
        <input
          ref={inputFileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFile}
        />
      </div>
    </Campo>
  );
}

// --- Prodotti pinnati di una fascia "a mano" ----------------------------------

function EditorProdottiPinnati({
  pinnati,
  occupato,
  onAggiungi,
  onRimuovi,
  onRiordina,
}: {
  pinnati: Prodotto[];
  occupato: boolean;
  onAggiungi: (prodottoId: string) => void;
  onRimuovi: (prodottoId: string) => void;
  onRiordina: (ids: string[]) => void;
}) {
  const [ricerca, setRicerca] = useState("");
  // Esito dell'ultima ricerca, legato alla query che l'ha prodotto: se `q`
  // corrente differisce la ricerca e in corso (debounce o rete) — lo stato di
  // caricamento e DERIVATO, niente setState sincrono nell'effetto.
  const [esitoRicerca, setEsitoRicerca] = useState<{
    q: string;
    prodotti: Prodotto[];
    errore: boolean;
  } | null>(null);
  const q = ricerca.trim();
  // Incrementato dal bottone Riprova: rientra nelle deps dell'effetto e fa
  // ripartire la ricerca anche a query invariata (es. dopo un errore di rete).
  const [tentativo, setTentativo] = useState(0);

  // Chiave stabile (ordinamento incluso) degli id gia pinnati: passati alla
  // action per escluderli A MONTE del limit — filtrarli dopo lascerebbe pochi
  // o zero suggerimenti quando i primi match sono tutti gia in fascia.
  const chiaveEsclusi = useMemo(
    () =>
      pinnati
        .map((p) => p.id)
        .sort()
        .join(","),
    [pinnati],
  );

  // Ricerca on-demand con debounce (~300ms, come il filtro di ListaProdotti):
  // la pagina non serializza piu il catalogo intero, la Server Action torna al
  // massimo una decina di match dal DB. Il flag `annullata` scarta le risposte
  // arrivate dopo un nuovo input (mai risultati stantii sopra i freschi).
  useEffect(() => {
    if (q === "") return;
    let annullata = false;
    const esclusi = chiaveEsclusi === "" ? [] : chiaveEsclusi.split(",");
    const timer = setTimeout(async () => {
      try {
        const esito = await cercaProdottiVetrinaAction(q, esclusi);
        if (annullata) return;
        setEsitoRicerca({
          q,
          prodotti: esito.ok ? (esito.prodotti ?? []) : [],
          errore: !esito.ok,
        });
      } catch {
        if (!annullata) setEsitoRicerca({ q, prodotti: [], errore: true });
      }
    }, 300);
    return () => {
      annullata = true;
      clearTimeout(timer);
    };
  }, [q, chiaveEsclusi, tentativo]);

  const idsPinnati = useMemo(
    () => new Set(pinnati.map((p) => p.id)),
    [pinnati],
  );

  const { ordine, registraRiga, contestoRiga } = useSortableList(
    pinnati,
    onRiordina,
    occupato,
  );

  // I gia pinnati spariscono dai risultati (e ricompaiono appena rimossi).
  const risultati = useMemo(
    () => (esitoRicerca?.prodotti ?? []).filter((p) => !idsPinnati.has(p.id)),
    [esitoRicerca, idsPinnati],
  );

  const inCaricamento = q !== "" && esitoRicerca?.q !== q;

  return (
    <div className="mt-4 rounded-2xl bg-white p-3 ring-1 ring-line">
      <span className="font-display text-sm font-bold text-foreground">
        Prodotti in questa fascia
      </span>

      {/* Lista pinnati riordinabile */}
      {ordine.length === 0 ? (
        <p className="mt-1 text-xs text-muted">
          Nessun prodotto ancora. Cercali qui sotto e aggiungili.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {ordine.map((p, i) => {
            const ctx = contestoRiga(p, i);
            return (
              <li
                key={p.id}
                ref={(el) => registraRiga(p.id, el)}
                className={`flex items-center gap-2 rounded-xl bg-surface-2 px-2 py-1.5 ${
                  ctx.inTrascinamento ? "ring-2 ring-sea" : ""
                }`}
              >
                <button
                  type="button"
                  {...ctx.handleProps}
                  disabled={occupato}
                  aria-label="Trascina per riordinare"
                  className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted hover:text-foreground active:cursor-grabbing disabled:opacity-40"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                    <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
                    <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
                    <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
                  </svg>
                </button>
                <MiniFoto prodotto={p} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {p.nome}
                  </span>
                  <span className="block text-xs text-muted">
                    {formatPrezzo(p.prezzo_cents, p.valuta)}
                    {p.attivo === false ? " · nascosto" : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onRimuovi(p.id)}
                  disabled={occupato}
                  aria-label={`Togli ${p.nome}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-coral/10 hover:text-coral disabled:opacity-40"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Ricerca + aggiungi */}
      <div className="mt-3">
        <input
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
          disabled={occupato}
          placeholder="Cerca un prodotto da aggiungere…"
          className={`${inputCls} h-10`}
        />
        {q !== "" && (
          <ul className="mt-1.5 flex flex-col gap-1">
            {inCaricamento ? (
              <li className="px-2 py-1.5 text-xs text-muted">
                Cerco nel catalogo…
              </li>
            ) : esitoRicerca?.errore ? (
              <li className="flex items-center gap-2 px-2 py-1.5 text-xs text-coral">
                Ricerca non riuscita.
                <button
                  type="button"
                  onClick={() => {
                    // Azzera l'esito cosi lo stato torna "in caricamento" e
                    // riparte la ricerca con la stessa query.
                    setEsitoRicerca(null);
                    setTentativo((t) => t + 1);
                  }}
                  className="inline-flex min-h-8 items-center rounded-full px-2 font-bold text-sea underline underline-offset-2 active:scale-95"
                >
                  Riprova
                </button>
              </li>
            ) : risultati.length === 0 ? (
              <li className="px-2 py-1.5 text-xs text-muted">
                Nessun prodotto trovato.
              </li>
            ) : (
              risultati.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onAggiungi(p.id)}
                    disabled={occupato}
                    className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-40"
                  >
                    <MiniFoto prodotto={p} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {p.nome}
                      </span>
                      <span className="block text-xs text-muted">
                        {formatPrezzo(p.prezzo_cents, p.valuta)}
                      </span>
                    </span>
                    <span className="shrink-0 text-sea" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-5 w-5">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

// --- Helper -------------------------------------------------------------------

function MiniFoto({ prodotto }: { prodotto: Prodotto }) {
  if (!prodotto.immagine_url) {
    return (
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-xs font-bold text-muted"
        aria-hidden="true"
      >
        {prodotto.nome.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <Image
      src={prodotto.immagine_url}
      alt=""
      width={36}
      height={36}
      className="h-9 w-9 shrink-0 rounded-lg object-cover"
    />
  );
}

