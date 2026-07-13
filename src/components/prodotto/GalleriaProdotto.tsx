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
// tutto schermo con appena mezzo centimetro di margine, frecce, contatore.
// Dentro: doppio tap per zoomare sul punto toccato, pinch per regolare la scala,
// pan a un dito quando zoomato, swipe a scala 1 per cambiare foto. Si chiude
// SOLO con Esc, la X o un tap sul bordo fuori dalla foto. Sulla foto inline lo
// swipe orizzontale cambia foto senza aprire l'overlay.

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { bloccaScrollBody } from "@/lib/scroll-lock";

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

// Zoom nella vista ingrandita: il doppio tap porta a 2.5x, il pinch fino a 4x.
const SCALA_DOPPIO_TAP = 2.5;
const SCALA_MAX = 4;

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
  const zoomRef = useRef<HTMLDivElement>(null);

  // Swipe sulla foto principale (stessa logica di FotoCard). La foto e un
  // button che apre lo zoom: dopo uno swipe il browser puo emettere un click
  // sintetico, che il flag fa ignorare.
  const tocco = useRef<{ x: number; y: number } | null>(null);
  const hoAppenaSwipato = useRef(false);

  // Miniatura attiva: ref per riportarla in vista quando l'indice cambia.
  const miniaturaAttivaRef = useRef<HTMLButtonElement>(null);

  // Trasformazione della foto nella vista ingrandita (origine al centro).
  // vistaRef tiene il valore aggiornato in modo sincrono per gli handler dei
  // gesti (setState e asincrono); gestoAttivo spegne la transition durante
  // pan/pinch cosi la foto segue il dito senza ritardo.
  const [vista, setVista] = useState({ scala: 1, x: 0, y: 0 });
  const [gestoAttivo, setGestoAttivo] = useState(false);
  const vistaRef = useRef(vista);
  const areaRef = useRef<HTMLDivElement>(null);
  const puntatori = useRef(new Map<number, { x: number; y: number }>());
  const gesto = useRef<{
    scala: number;
    x: number;
    y: number; // trasformazione a inizio gesto
    inizio: { x: number; y: number }; // posizione del dito (pan/tap/swipe)
    distanza0: number; // pinch: distanza iniziale tra le dita
    punto: { x: number; y: number }; // pinch: punto-foto sotto il centro delle dita
    pinch: boolean; // il gesto ha usato due dita: niente tap/swipe al rilascio
  } | null>(null);
  const ultimoTap = useRef<{ x: number; y: number; t: number } | null>(null);

  // Zoom di nuovo a 1x e gesto in corso dimenticato. Chiamato nei punti in cui
  // la foto mostrata cambia davvero (vai, apertura dell'overlay): il reset
  // viaggia nello stesso batch del cambio, senza un effect a posteriori.
  function azzeraZoom() {
    puntatori.current.clear();
    gesto.current = null;
    ultimoTap.current = null;
    vistaRef.current = { scala: 1, x: 0, y: 0 };
    setVista({ scala: 1, x: 0, y: 0 });
    setGestoAttivo(false);
  }

  function vai(delta: number) {
    if (!multipla) return;
    // Cambiando foto lo zoom riparte da 1x.
    azzeraZoom();
    const n = foto.length;
    onSelezionaFoto((idx + delta + n) % n);
  }

  function aggiornaVista(v: { scala: number; x: number; y: number }) {
    vistaRef.current = v;
    setVista(v);
  }

  // Coordinate rispetto al CENTRO dell'area ingrandita (origine della scala).
  function relativoAlCentro(clientX: number, clientY: number) {
    const r = areaRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
  }

  // Blocca la traslazione entro i bordi: la foto zoomata non "scappa" dall'area.
  function limita(scala: number, x: number, y: number) {
    const area = areaRef.current;
    const mx = area ? ((scala - 1) * area.clientWidth) / 2 : 0;
    const my = area ? ((scala - 1) * area.clientHeight) / 2 : 0;
    return {
      scala,
      x: Math.max(-mx, Math.min(mx, x)),
      y: Math.max(-my, Math.min(my, y)),
    };
  }

  function onPointerDownZoom(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    puntatori.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setGestoAttivo(true);
    if (puntatori.current.size === 2) {
      // Parte il pinch: fotografo scala/posizione e il punto-foto sotto il
      // centro delle due dita, che restera ancorato li durante il gesto.
      const [a, b] = [...puntatori.current.values()];
      const v = vistaRef.current;
      const centro = relativoAlCentro((a.x + b.x) / 2, (a.y + b.y) / 2);
      gesto.current = {
        ...v,
        inizio: { x: e.clientX, y: e.clientY },
        distanza0: Math.hypot(b.x - a.x, b.y - a.y),
        punto: { x: (centro.x - v.x) / v.scala, y: (centro.y - v.y) / v.scala },
        pinch: true,
      };
    } else if (puntatori.current.size === 1) {
      gesto.current = {
        ...vistaRef.current,
        inizio: { x: e.clientX, y: e.clientY },
        distanza0: 0,
        punto: { x: 0, y: 0 },
        pinch: false,
      };
    }
  }

  function onPointerMoveZoom(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesto.current;
    if (!g || !puntatori.current.has(e.pointerId)) return;
    puntatori.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (puntatori.current.size >= 2) {
      // Pinch: scala attorno al centro delle dita (che puo anche spostarsi).
      const [a, b] = [...puntatori.current.values()];
      const scala = Math.min(
        SCALA_MAX,
        Math.max(1, (g.scala * Math.hypot(b.x - a.x, b.y - a.y)) / g.distanza0),
      );
      const centro = relativoAlCentro((a.x + b.x) / 2, (a.y + b.y) / 2);
      aggiornaVista(
        limita(scala, centro.x - g.punto.x * scala, centro.y - g.punto.y * scala),
      );
    } else if (g.scala > 1) {
      // Pan a un dito quando zoomato.
      aggiornaVista(
        limita(g.scala, g.x + (e.clientX - g.inizio.x), g.y + (e.clientY - g.inizio.y)),
      );
    }
  }

  function onPointerUpZoom(e: React.PointerEvent<HTMLDivElement>) {
    if (!puntatori.current.delete(e.pointerId)) return;
    const g = gesto.current;
    if (puntatori.current.size === 1) {
      // Dal pinch resta un dito solo: riparte come pan dallo stato attuale.
      const [rimasto] = [...puntatori.current.values()];
      gesto.current = g && {
        ...vistaRef.current,
        inizio: rimasto,
        distanza0: 0,
        punto: { x: 0, y: 0 },
        pinch: true,
      };
      return;
    }
    if (puntatori.current.size > 0) return;
    setGestoAttivo(false);
    gesto.current = null;
    if (!g || g.pinch) return;
    const dx = e.clientX - g.inizio.x;
    const dy = e.clientY - g.inizio.y;
    if (Math.hypot(dx, dy) < 10) {
      // Tap fermo: se e il secondo entro 300ms e doppio tap -> zoom sul punto
      // toccato (o ritorno a 1x se gia zoomato). Il tap singolo non fa nulla:
      // la chiusura e riservata a X, Esc e bordo fuori dalla foto.
      const ora = Date.now();
      const prec = ultimoTap.current;
      ultimoTap.current = { x: e.clientX, y: e.clientY, t: ora };
      if (prec && ora - prec.t < 300 && Math.hypot(e.clientX - prec.x, e.clientY - prec.y) < 30) {
        ultimoTap.current = null;
        if (vistaRef.current.scala > 1) {
          aggiornaVista({ scala: 1, x: 0, y: 0 });
        } else {
          // Il punto toccato resta fermo sotto il dito: t = c * (1 - scala).
          const c = relativoAlCentro(e.clientX, e.clientY);
          aggiornaVista(
            limita(
              SCALA_DOPPIO_TAP,
              c.x * (1 - SCALA_DOPPIO_TAP),
              c.y * (1 - SCALA_DOPPIO_TAP),
            ),
          );
        }
      }
    } else if (g.scala === 1 && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      // Swipe orizzontale netto a scala 1: cambia foto (soglie di FotoCard).
      vai(dx < 0 ? 1 : -1);
    }
  }

  function onPointerCancelZoom(e: React.PointerEvent<HTMLDivElement>) {
    puntatori.current.delete(e.pointerId);
    if (puntatori.current.size === 1) {
      const [rimasto] = [...puntatori.current.values()];
      gesto.current = gesto.current && {
        ...vistaRef.current,
        inizio: rimasto,
        distanza0: 0,
        punto: { x: 0, y: 0 },
        pinch: true,
      };
    } else if (puntatori.current.size === 0) {
      gesto.current = null;
      setGestoAttivo(false);
    }
  }

  // La miniatura attiva segue l'indice: se e uscita dalla striscia la
  // riportiamo in vista (senza animazione per chi preferisce meno movimento).
  useEffect(() => {
    const riduci = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    miniaturaAttivaRef.current?.scrollIntoView({
      behavior: riduci ? "auto" : "smooth",
      inline: "nearest",
      block: "nearest",
    });
  }, [idx]);

  // Da ingrandita: Esc chiude, frecce navigano, scroll bloccato, focus spostato
  // dentro (pulsante Chiudi) e intrappolato (Tab), poi ripristinato in chiusura.
  useEffect(() => {
    if (!zoomAperto) return;
    const precedente = document.activeElement as HTMLElement | null;
    const contenitore = zoomRef.current;
    contenitore?.querySelector<HTMLButtonElement>("button")?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomAperto(false);
      else if (e.key === "ArrowLeft") vai(-1);
      else if (e.key === "ArrowRight") vai(1);
      else if (e.key === "Tab") {
        const f = Array.from(
          contenitore?.querySelectorAll<HTMLElement>("button") ?? [],
        );
        if (f.length === 0) return;
        const primo = f[0];
        const ultimo = f[f.length - 1];
        if (e.shiftKey && document.activeElement === primo) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primo.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    const sbloccaScroll = bloccaScrollBody();
    return () => {
      window.removeEventListener("keydown", onKey);
      sbloccaScroll();
      precedente?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- vai dipende solo da idx/foto
  }, [zoomAperto, idx, foto.length]);

  return (
    <div className="flex flex-col gap-3">
      {/* Foto principale */}
      <div
        className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl bg-white shadow-sea"
        onTouchStart={(e) => {
          hoAppenaSwipato.current = false;
          tocco.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
          };
        }}
        onTouchEnd={(e) => {
          const inizio = tocco.current;
          tocco.current = null;
          if (!inizio) return;
          const dx = e.changedTouches[0].clientX - inizio.x;
          const dy = e.changedTouches[0].clientY - inizio.y;
          // Swipe orizzontale netto (non uno scroll di pagina): cambia foto.
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            hoAppenaSwipato.current = true;
            vai(dx < 0 ? 1 : -1);
          }
        }}
      >
        {urlPrincipale ? (
          <button
            type="button"
            onClick={() => {
              // Il click sintetico dopo uno swipe non deve aprire lo zoom.
              if (hoAppenaSwipato.current) {
                hoAppenaSwipato.current = false;
                return;
              }
              // L'overlay parte sempre pulito, a 1x.
              azzeraZoom();
              setZoomAperto(true);
            }}
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
              className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-foreground shadow-soft backdrop-blur transition-transform hover:-translate-y-[calc(50%+2px)] active:scale-95"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => vai(1)}
              aria-label="Foto successiva"
              className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-foreground shadow-soft backdrop-blur transition-transform hover:-translate-y-[calc(50%+2px)] active:scale-95"
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
                ref={sel ? miniaturaAttivaRef : null}
                type="button"
                onClick={() => onSelezionaFoto(i)}
                aria-label={`Mostra ${f.etichetta}`}
                aria-pressed={sel}
                title={f.etichetta}
                className={[
                  "relative aspect-[3/4] w-16 shrink-0 snap-start overflow-hidden rounded-xl bg-white transition-all active:scale-95 sm:w-[4.5rem]",
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
          lo spazio lasciando solo ~mezzo centimetro di margine. Si chiude SOLO
          con Esc, la X o un tap sul bordo fuori dalla foto; sopra la foto i
          gesti zoomano/spostano (vedi handler onPointer* piu su). I controlli
          compensano le safe-area (viewportFit 'cover'). */}
      {zoomAperto && urlPrincipale && (
        <div
          ref={zoomRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Foto ingrandita — ${nome}`}
          className="fixed inset-0 z-[100] bg-white"
        >
          {/* Backdrop: chiude solo il tap sul bordo, fuori dall'area della foto. */}
          <div
            aria-hidden="true"
            onClick={() => setZoomAperto(false)}
            className="absolute inset-0 cursor-zoom-out"
          />

          {/* Area dei gesti: touch-none lascia a noi pinch/pan/doppio tap. */}
          <div
            ref={areaRef}
            onPointerDown={onPointerDownZoom}
            onPointerMove={onPointerMoveZoom}
            onPointerUp={onPointerUpZoom}
            onPointerCancel={onPointerCancelZoom}
            className="absolute inset-[0.5cm] touch-none select-none overflow-hidden"
          >
            <div
              className="absolute inset-0 will-change-transform"
              style={{
                transform: `translate3d(${vista.x}px, ${vista.y}px, 0) scale(${vista.scala})`,
                // Transition solo a gesto concluso (doppio tap): durante
                // pan/pinch la foto deve seguire il dito senza ritardo.
                transition: gestoAttivo ? "none" : "transform 0.2s ease-out",
              }}
            >
              <Image
                src={urlPrincipale}
                alt={principale ? `${nome} — ${principale.etichetta}` : nome}
                fill
                sizes="100vw"
                className="object-contain"
                quality={95}
                draggable={false}
                placeholder={blurPrincipale ? "blur" : PLACEHOLDER_GENERICO}
                blurDataURL={blurPrincipale ?? undefined}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setZoomAperto(false)}
            aria-label="Chiudi la foto ingrandita"
            className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-full bg-white/90 text-foreground shadow-soft ring-1 ring-line backdrop-blur transition-transform hover:scale-105 active:scale-95"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>

          {multipla && (
            <>
              <button
                type="button"
                onClick={() => vai(-1)}
                aria-label="Foto precedente"
                className="absolute left-[max(0.75rem,env(safe-area-inset-left))] top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-foreground shadow-soft ring-1 ring-line backdrop-blur transition-transform hover:scale-105 active:scale-95"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => vai(1)}
                aria-label="Foto successiva"
                className="absolute right-[max(0.75rem,env(safe-area-inset-right))] top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-foreground shadow-soft ring-1 ring-line backdrop-blur transition-transform hover:scale-105 active:scale-95"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
              <span className="absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-1/2 -translate-x-1/2 rounded-full bg-foreground/70 px-3 py-1.5 text-sm font-bold tabular-nums text-white backdrop-blur">
                {idx + 1}/{foto.length}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
