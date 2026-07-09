"use client";

// Galleria foto prodotto (vetrina) — mobile-first.
// Foto principale grande + striscia di miniature scorrevole. Frecce e contatore
// quando c'e piu di una foto. L'indice attivo e controllato dall'esterno
// (ProdottoDettaglio) cosi resta sincronizzato col selettore colore.
//
// Le foto entrano gia ritagliate ai bordi uniformi (vedi lib/trim.ts). Qui le
// mostriamo con object-contain su fondo bianco + un filo di padding: il capo si
// vede SEMPRE per intero (niente lati tagliati, es. il logo "Made in Italy" negli
// angoli) con un margine di respiro uniforme, invece di riempire il riquadro con
// un object-cover che ne mangiava i bordi.
//
// Un click/tap sulla foto principale apre la vista INGRANDITA: overlay bianco a
// tutto schermo con appena mezzo centimetro di margine, frecce, contatore,
// chiusura con Esc / click ovunque.

import Image from "next/image";
import { useEffect, useState } from "react";

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

  // Vista ingrandita a tutto schermo, aperta col click sulla foto principale.
  const [zoomAperto, setZoomAperto] = useState(false);

  function vai(delta: number) {
    if (!multipla) return;
    const n = foto.length;
    onSelezionaFoto((idx + delta + n) % n);
  }

  // Da ingrandita: Esc chiude, frecce navigano, scroll della pagina bloccato.
  useEffect(() => {
    if (!zoomAperto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomAperto(false);
      else if (e.key === "ArrowLeft") vai(-1);
      else if (e.key === "ArrowRight") vai(1);
    };
    window.addEventListener("keydown", onKey);
    const overflowPrima = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflowPrima;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- vai dipende solo da idx/foto
  }, [zoomAperto, idx, foto.length]);

  return (
    <div className="flex flex-col gap-3">
      {/* Foto principale */}
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl bg-white shadow-sea">
        {urlPrincipale ? (
          <button
            type="button"
            onClick={() => setZoomAperto(true)}
            aria-label="Ingrandisci la foto"
            title="Ingrandisci la foto"
            className="absolute inset-0 cursor-zoom-in"
          >
            <Image
              src={urlPrincipale}
              alt={principale ? `${nome} — ${principale.etichetta}` : nome}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-contain p-5 sm:p-6"
              // Foto grande della scheda: quality alta cosi l'ottimizzazione non
              // somma una seconda perdita visibile sopra la foto gia caricata.
              quality={90}
              // Foto LCP della PDP: caricala subito e con priorita alta. In Next 16
              // `priority` e deprecato -> loading="eager" + fetchPriority="high".
              loading="eager"
              fetchPriority="high"
              placeholder={blurPrincipale ? "blur" : PLACEHOLDER_GENERICO}
              blurDataURL={blurPrincipale ?? undefined}
            />
            <span
              aria-hidden="true"
              className="absolute bottom-3 left-3 grid h-10 w-10 place-items-center rounded-full bg-white/85 text-foreground shadow-soft backdrop-blur"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3M8 11h6M11 8v6" />
              </svg>
            </span>
          </button>
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
                  "relative aspect-[3/4] w-16 shrink-0 snap-start overflow-hidden rounded-xl bg-white transition-all sm:w-[4.5rem]",
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
                  className="object-contain p-1"
                  placeholder={f.blurDataUrl ? "blur" : PLACEHOLDER_GENERICO}
                  blurDataURL={f.blurDataUrl ?? undefined}
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Vista ingrandita: overlay bianco a tutto schermo, la foto occupa tutto
          lo spazio lasciando solo ~mezzo centimetro di margine. Click ovunque
          (o Esc, o la X) per chiudere; frecce per scorrere le altre foto. */}
      {zoomAperto && urlPrincipale && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Foto ingrandita — ${nome}`}
          onClick={() => setZoomAperto(false)}
          className="fixed inset-0 z-[100] bg-white"
        >
          <div className="absolute inset-[0.5cm] cursor-zoom-out">
            <Image
              src={urlPrincipale}
              alt={principale ? `${nome} — ${principale.etichetta}` : nome}
              fill
              sizes="100vw"
              className="object-contain"
              quality={95}
              placeholder={blurPrincipale ? "blur" : PLACEHOLDER_GENERICO}
              blurDataURL={blurPrincipale ?? undefined}
            />
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setZoomAperto(false);
            }}
            aria-label="Chiudi la foto ingrandita"
            className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/90 text-foreground shadow-soft ring-1 ring-line backdrop-blur transition-transform hover:scale-105"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>

          {multipla && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  vai(-1);
                }}
                aria-label="Foto precedente"
                className="absolute left-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-foreground shadow-soft ring-1 ring-line backdrop-blur transition-transform hover:scale-105"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  vai(1);
                }}
                aria-label="Foto successiva"
                className="absolute right-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-foreground shadow-soft ring-1 ring-line backdrop-blur transition-transform hover:scale-105"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
              <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-foreground/70 px-3 py-1.5 text-sm font-bold tabular-nums text-white backdrop-blur">
                {idx + 1}/{foto.length}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
