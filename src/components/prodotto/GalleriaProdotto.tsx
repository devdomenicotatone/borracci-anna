"use client";

// Galleria foto prodotto (vetrina) — mobile-first.
// Foto principale grande + striscia di miniature scorrevole. Frecce e contatore
// quando c'e piu di una foto. L'indice attivo e controllato dall'esterno
// (ProdottoDettaglio) cosi resta sincronizzato col selettore colore.

import Image from "next/image";

export interface FotoGalleria {
  id: string;
  url: string;
  /** Etichetta leggibile (di solito il colore della variante). */
  etichetta: string;
  /** LQIP (~16px data URL) per il blur-up di next/image. null/assente = generico. */
  blurDataUrl?: string | null;
}

// Placeholder neutro per le foto senza un blur salvato (caricate prima della
// feature): una sfumatura morbida nei toni del brand, meglio di un box vuoto.
// E una costante (stessa stringa per tutte), quindi costo per-immagine nullo.
const PLACEHOLDER_GENERICO = ("data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'>" +
      "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>" +
      "<stop offset='0%' stop-color='#eef5f8'/>" +
      "<stop offset='100%' stop-color='#d7e6ee'/>" +
      "</linearGradient></defs>" +
      "<rect width='40' height='40' fill='url(#g)'/></svg>",
  )) as `data:image/${string}`;

export default function GalleriaProdotto({
  foto,
  attivaIdx,
  onSelezionaFoto,
  nome,
  fallbackUrl,
}: {
  foto: FotoGalleria[];
  attivaIdx: number;
  onSelezionaFoto: (idx: number) => void;
  nome: string;
  fallbackUrl: string | null;
}) {
  const haGalleria = foto.length > 0;
  const idx = Math.min(Math.max(0, attivaIdx), Math.max(0, foto.length - 1));
  const principale = haGalleria ? foto[idx] : null;
  const urlPrincipale = principale?.url ?? fallbackUrl;
  const blurPrincipale = principale?.blurDataUrl ?? null;
  const multipla = foto.length > 1;

  function vai(delta: number) {
    if (!multipla) return;
    const n = foto.length;
    onSelezionaFoto((idx + delta + n) % n);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Foto principale */}
      <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-surface shadow-sea">
        {urlPrincipale ? (
          <Image
            src={urlPrincipale}
            alt={principale ? `${nome} — ${principale.etichetta}` : nome}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
            // Foto LCP della PDP: caricala subito e con priorita alta. In Next 16
            // `priority` e deprecato -> loading="eager" + fetchPriority="high".
            loading="eager"
            fetchPriority="high"
            placeholder={blurPrincipale ? "blur" : PLACEHOLDER_GENERICO}
            blurDataURL={blurPrincipale ?? undefined}
          />
        ) : (
          <div className="tile-cyan dots-overlay flex h-full w-full items-center justify-center">
            <svg
              className="w-2/5 text-white drop-shadow-[0_6px_12px_rgba(0,40,70,0.25)]"
              viewBox="0 0 100 100"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M32 18 L18 28 L24 40 L31 35 L31 84 L69 84 L69 35 L76 40 L82 28 L68 18 C64 24 56 26 50 26 C44 26 36 24 32 18 Z" />
            </svg>
          </div>
        )}

        {multipla && (
          <>
            <button
              type="button"
              onClick={() => vai(-1)}
              aria-label="Foto precedente"
              className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-foreground shadow-soft backdrop-blur transition-transform hover:-translate-y-[calc(50%+2px)]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => vai(1)}
              aria-label="Foto successiva"
              className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-foreground shadow-soft backdrop-blur transition-transform hover:-translate-y-[calc(50%+2px)]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <span className="absolute bottom-3 right-3 rounded-full bg-foreground/70 px-2.5 py-1 text-xs font-bold tabular-nums text-white backdrop-blur">
              {idx + 1}/{foto.length}
            </span>
          </>
        )}
      </div>

      {/* Striscia miniature */}
      {multipla && (
        <div className="-mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {foto.map((f, i) => {
            const sel = i === idx;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onSelezionaFoto(i)}
                aria-label={`Mostra ${f.etichetta}`}
                aria-pressed={sel}
                title={f.etichetta}
                className={[
                  "relative aspect-square w-16 shrink-0 snap-start overflow-hidden rounded-xl transition-all sm:w-[4.5rem]",
                  sel
                    ? "ring-2 ring-sea"
                    : "opacity-70 ring-1 ring-line hover:-translate-y-0.5 hover:opacity-100",
                ].join(" ")}
              >
                <Image
                  src={f.url}
                  alt={f.etichetta}
                  fill
                  sizes="80px"
                  className="object-cover"
                  placeholder={f.blurDataUrl ? "blur" : PLACEHOLDER_GENERICO}
                  blurDataURL={f.blurDataUrl ?? undefined}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
