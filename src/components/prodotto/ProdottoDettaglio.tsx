"use client";

// Area interattiva della pagina prodotto (PDP): galleria a sinistra + dettagli
// e acquisto a destra. Selezione a DUE dimensioni: COLORE (campioni) e TAGLIA
// (chip S–6XL). Scegliere un colore cambia la foto; cliccare una foto seleziona
// il colore. In modalita "su richiesta" il blocco acquisto diventa un contatto
// ("Scrivici per la disponibilita"); altrimenti carrello con giacenze.

import { useMemo, useState } from "react";

import BloccoAcquisto from "@/components/prodotto/BloccoAcquisto";
import BloccoRichiesta from "@/components/prodotto/BloccoRichiesta";
import GalleriaProdotto, {
  type FotoGalleria,
} from "@/components/prodotto/GalleriaProdotto";
import { formatPrezzo } from "@/lib/format";
import { COLORI, coloreChiaro, coloreHex, ordinaTaglie } from "@/lib/catalogo";
import type { ProdottoConVarianti, ProdottoFoto } from "@/lib/types";

/** Indice palette di un colore (sconosciuti in fondo), per un ordine stabile. */
function ordineColore(nome: string): number {
  const i = COLORI.findIndex((c) => c.nome.toLowerCase() === nome.toLowerCase());
  return i === -1 ? COLORI.length : i;
}

export default function ProdottoDettaglio({
  prodotto,
  foto,
  suRichiesta,
  soloOnline = false,
}: {
  prodotto: ProdottoConVarianti;
  foto: ProdottoFoto[];
  suRichiesta: boolean;
  /** Articolo non presente in negozio: mostra il badge "Solo online". */
  soloOnline?: boolean;
}) {
  const varianti = prodotto.varianti;

  // Dimensioni disponibili, ricavate dalle varianti.
  // ORDINE COLORI = ordine in cui i colori compaiono nella GALLERIA (posizione
  // della loro prima foto). Cosi i campioni seguono sempre le foto: se cambi la
  // copertina o riordini la galleria, l'ordine dei colori si aggiorna da solo,
  // senza dover toccare nulla. I colori senza foto finiscono in fondo, ordinati
  // per palette (tie-break stabile).
  const colori = useMemo(() => {
    const distinti = [
      ...new Set(varianti.map((v) => v.colore).filter((c): c is string => !!c)),
    ];
    const posFoto = new Map<string, number>();
    foto.forEach((f, i) => {
      if (f.colore && !posFoto.has(f.colore)) posFoto.set(f.colore, i);
    });
    const SENZA_FOTO = Number.MAX_SAFE_INTEGER;
    return distinti.sort(
      (a, b) =>
        (posFoto.get(a) ?? SENZA_FOTO) - (posFoto.get(b) ?? SENZA_FOTO) ||
        ordineColore(a) - ordineColore(b),
    );
  }, [varianti, foto]);
  const taglie = useMemo(
    () =>
      ordinaTaglie(
        varianti.map((v) => v.taglia).filter((t): t is string => !!t),
      ),
    [varianti],
  );

  const coloreHaStock = (c: string | null) =>
    varianti.some((v) => v.colore === c && v.stock > 0);
  const tagliaHaStock = (c: string | null, t: string | null) =>
    varianti.some(
      (v) =>
        (colori.length === 0 || v.colore === c) &&
        v.taglia === t &&
        v.stock > 0,
    );

  // Selezione iniziale: primo colore (con stock se vendita diretta) + prima
  // taglia coerente.
  const coloreIniziale = (): string | null => {
    if (colori.length === 0) return null;
    if (suRichiesta) return colori[0];
    return colori.find((c) => coloreHaStock(c)) ?? colori[0];
  };
  const tagliaPer = (c: string | null): string | null => {
    if (taglie.length === 0) return null;
    if (suRichiesta) return taglie[0];
    return taglie.find((t) => tagliaHaStock(c, t)) ?? taglie[0];
  };

  const [coloreSel, setColoreSel] = useState<string | null>(coloreIniziale);
  const [tagliaSel, setTagliaSel] = useState<string | null>(() =>
    tagliaPer(coloreIniziale()),
  );

  // Galleria: ogni foto etichettata col suo colore.
  const fotoGalleria: FotoGalleria[] = useMemo(
    () =>
      foto.map((f, i) => ({
        id: f.id,
        url: f.url,
        etichetta: f.colore ?? `Foto ${i + 1}`,
        blurDataUrl: f.blur_data_url,
      })),
    [foto],
  );

  const idxFotoColore = (c: string | null) =>
    c ? foto.findIndex((f) => f.colore === c) : -1;

  const [attivaIdx, setAttivaIdx] = useState<number>(() => {
    const i = idxFotoColore(coloreIniziale());
    return i >= 0 ? i : 0;
  });

  // Adatta la taglia scelta quando cambia il colore (in vendita diretta tiene
  // conto delle giacenze del nuovo colore).
  function adattaTaglia(c: string | null): string | null {
    if (taglie.length === 0) return null;
    if (suRichiesta) {
      return tagliaSel && taglie.includes(tagliaSel) ? tagliaSel : taglie[0];
    }
    if (tagliaSel && tagliaHaStock(c, tagliaSel)) return tagliaSel;
    return taglie.find((t) => tagliaHaStock(c, t)) ?? taglie[0];
  }

  function selezionaColore(c: string) {
    setColoreSel(c);
    setTagliaSel(adattaTaglia(c));
    const i = idxFotoColore(c);
    if (i >= 0) setAttivaIdx(i);
  }

  function selezionaFoto(i: number) {
    setAttivaIdx(i);
    const c = foto[i]?.colore ?? null;
    if (c && colori.includes(c) && (suRichiesta || coloreHaStock(c))) {
      setColoreSel(c);
      setTagliaSel(adattaTaglia(c));
    }
  }

  const varianteScelta =
    varianti.find(
      (v) =>
        (colori.length === 0 || v.colore === coloreSel) &&
        (taglie.length === 0 || v.taglia === tagliaSel),
    ) ?? null;

  const senzaVarianti = varianti.length === 0;
  const esaurito = !senzaVarianti && varianti.every((v) => v.stock <= 0);

  return (
    <div className="grid grid-cols-1 items-start gap-10 md:grid-cols-[1.15fr_1fr]">
      {/* Galleria */}
      <GalleriaProdotto
        foto={fotoGalleria}
        attivaIdx={attivaIdx}
        onSelezionaFoto={selezionaFoto}
        nome={prodotto.nome}
        fallbackUrl={prodotto.immagine_url}
      />

      {/* Dettagli e acquisto */}
      <div className="flex flex-col md:sticky md:top-6">
        <span className="mb-2 inline-flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-sea">
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
            <circle cx="12" cy="12" r="3.4" />
          </svg>
          Dettaglio prodotto
        </span>

        <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          {prodotto.nome}
        </h1>

        <p className="mt-3 font-display text-3xl font-extrabold text-coral">
          {formatPrezzo(prodotto.prezzo_cents, prodotto.valuta)}
        </p>

        {soloOnline ? (
          <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-sea/10 px-3 py-1.5 font-display text-xs font-bold text-sea ring-1 ring-sea/25">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
            </svg>
            Solo online — spedizione a casa o ritiro in negozio
          </span>
        ) : (
          <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-lagoon/10 px-3 py-1.5 font-display text-xs font-bold text-lagoon ring-1 ring-lagoon/25">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            Disponibile anche in negozio — vieni a trovarci
          </span>
        )}

        {prodotto.descrizione && (
          <p className="mt-6 max-w-prose whitespace-pre-line leading-relaxed text-muted">
            {prodotto.descrizione}
          </p>
        )}

        {/* Selettore COLORE */}
        {colori.length > 0 && (
          <fieldset className="mt-8">
            <legend className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-muted">
              Colore
              {coloreSel && (
                <span className="ml-2 font-bold normal-case tracking-normal text-foreground">
                  {coloreSel}
                </span>
              )}
            </legend>
            <div className="flex flex-wrap gap-3">
              {colori.map((c) => {
                const hex = coloreHex(c);
                const esaurita = !suRichiesta && !coloreHaStock(c);
                const sel = c === coloreSel;
                return (
                  <button
                    key={c}
                    type="button"
                    disabled={esaurita}
                    aria-pressed={sel}
                    aria-label={c}
                    title={esaurita ? `${c} (esaurito)` : c}
                    onClick={() => selezionaColore(c)}
                    className={[
                      "relative grid h-11 w-11 place-items-center rounded-full transition-all",
                      sel
                        ? "ring-2 ring-sea ring-offset-2"
                        : "ring-1 ring-line hover:-translate-y-0.5",
                      esaurita ? "cursor-not-allowed opacity-40" : "",
                      coloreChiaro(hex) && !sel ? "ring-line" : "",
                    ].join(" ")}
                    style={{ backgroundColor: hex }}
                  >
                    {sel && (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={coloreChiaro(hex) ? "#0b3a5b" : "#ffffff"}
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-5 w-5"
                        aria-hidden="true"
                      >
                        <path d="m5 13 4 4L19 7" />
                      </svg>
                    )}
                    {esaurita && (
                      <span
                        aria-hidden="true"
                        className="absolute h-[2px] w-9 rotate-45 rounded bg-coral"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {/* Selettore TAGLIA */}
        {taglie.length > 0 && (
          <fieldset className="mt-6">
            <legend className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-muted">
              Taglia
              {tagliaSel && (
                <span className="ml-2 font-bold normal-case tracking-normal text-foreground">
                  {tagliaSel}
                </span>
              )}
            </legend>
            <div className="flex flex-wrap gap-2.5">
              {taglie.map((t) => {
                const esaurita = !suRichiesta && !tagliaHaStock(coloreSel, t);
                const sel = t === tagliaSel;
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={esaurita}
                    aria-pressed={sel}
                    onClick={() => setTagliaSel(t)}
                    title={esaurita ? "Esaurita" : t}
                    className={[
                      "h-[50px] min-w-[50px] rounded-xl px-3 font-display font-bold transition-all",
                      esaurita
                        ? "cursor-not-allowed text-muted line-through ring-2 ring-surface-2 [background:repeating-linear-gradient(45deg,#fff,#fff_6px,#f1f5f8_6px,#f1f5f8_12px)]"
                        : sel
                          ? "bg-sea text-white shadow-sea"
                          : "bg-white text-foreground ring-2 ring-surface-2 hover:-translate-y-0.5 hover:ring-lagoon",
                    ].join(" ")}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {/* Blocco acquisto / contatto */}
        <div className="mt-8">
          {suRichiesta ? (
            <BloccoRichiesta
              prodotto={prodotto}
              variante={varianteScelta}
              colore={coloreSel}
              taglia={tagliaSel}
            />
          ) : senzaVarianti ? (
            <p className="rounded-2xl bg-surface px-4 py-3 text-sm text-muted ring-1 ring-line">
              Nessuna variante disponibile per questo prodotto.
            </p>
          ) : esaurito ? (
            <p className="rounded-2xl bg-surface px-4 py-3 text-sm font-semibold text-coral-ink ring-1 ring-coral/30">
              Prodotto esaurito.
            </p>
          ) : (
            <BloccoAcquisto prodotto={prodotto} variante={varianteScelta} />
          )}
        </div>

        <p className="mt-8 font-mono text-xs text-muted">
          SKU prodotto: {prodotto.codice ?? prodotto.slug}
        </p>
      </div>
    </div>
  );
}
