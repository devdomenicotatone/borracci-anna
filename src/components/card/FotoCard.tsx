"use client";

// Mini-carosello foto della card prodotto, in due pezzi che condividono lo
// stato via context:
//   - <SwipeFoto> (wrapper): in ProductCard avvolge TUTTO il contenuto della
//     card, Link overlay compreso. I gestori touch vivono qui: i tocchi che
//     atterrano sul Link (che copre la card, z-10) risalgono in bubbling fino
//     al wrapper, cosi lo swipe cambia foto anche su mobile dove le frecce
//     sono nascoste — senza rubare al tap la navigazione.
//   - <FotoCard> (default): la pila di foto nel layer immagine, con frecce
//     (desktop, su hover) e pallini indicatore in basso; le frecce fermano
//     l'evento (preventDefault/stopPropagation) per non navigare.
//
// Le foto oltre la prima si montano SOLO alla prima visualizzazione (set
// `visti`): niente download extra per chi non interagisce — con 24+ card a
// pagina e la regola, non l'eccezione.

import Image from "next/image";
import { createContext, useContext, useRef, useState } from "react";

interface CaroselloValue {
  /** Indice della foto attualmente visibile. */
  idx: number;
  /** Indici gia mostrati almeno una volta (gli altri non si montano). */
  visti: Set<number>;
  /** Scorre di `delta` foto, con wrap-around. */
  vai: (delta: number) => void;
}

const CaroselloContext = createContext<CaroselloValue | null>(null);

function useCarosello(): CaroselloValue {
  const ctx = useContext(CaroselloContext);
  if (!ctx) {
    throw new Error("FotoCard deve essere usato dentro <SwipeFoto>.");
  }
  return ctx;
}

/**
 * Stato del carosello + superficie di swipe. Deve CONTENERE sia <FotoCard>
 * sia il <Link> overlay della card: solo cosi i touch intercettati dal Link
 * arrivano (in bubbling) ai gestori qui sotto. Il div non e posizionato ne
 * stilizzato, quindi non altera layout, stacking o ancoraggio del Link.
 */
export function SwipeFoto({
  nFoto,
  children,
}: {
  /** Numero totale di foto del carosello. Almeno 2. */
  nFoto: number;
  children: React.ReactNode;
}) {
  const [idx, setIdx] = useState(0);
  const [visti, setVisti] = useState<Set<number>>(() => new Set([0]));
  const tocco = useRef<{ x: number; y: number } | null>(null);

  function vai(delta: number) {
    setIdx((corrente) => {
      const prossimo = (corrente + delta + nFoto) % nFoto;
      setVisti((v) => (v.has(prossimo) ? v : new Set(v).add(prossimo)));
      return prossimo;
    });
  }

  return (
    <CaroselloContext.Provider value={{ idx, visti, vai }}>
      <div
        onTouchStart={(e) => {
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
            // Il tocco e partito dal Link overlay: annulla il click sintetico
            // che alcuni browser farebbero seguire, o lo swipe navigherebbe.
            if (e.cancelable) e.preventDefault();
            vai(dx < 0 ? 1 : -1);
          }
        }}
      >
        {children}
      </div>
    </CaroselloContext.Provider>
  );
}

export default function FotoCard({
  urls,
  nome,
  priorita,
}: {
  /** Foto in ordine (copertina per prima), gia deduplicate. Almeno 2. */
  urls: string[];
  nome: string;
  /** "alta" (o true) = prima foto eager + fetchPriority high (candidate LCP,
   *  prime 2 card su mobile); "eager" = eager senza high (card 3-4, above the
   *  fold su desktop ma in competizione di banda con la LCP su mobile). */
  priorita: boolean | "alta" | "eager";
}) {
  const { idx, visti, vai } = useCarosello();
  const prioritaAlta = priorita === true || priorita === "alta";
  const prioritaEager = prioritaAlta || priorita === "eager";

  return (
    <div className="absolute inset-0">
      {/* Pila di foto: si monta solo cio che e stato visto, crossfade CSS. */}
      {urls.map((url, i) =>
        visti.has(i) ? (
          <Image
            key={url}
            src={url}
            alt={i === 0 ? nome : `${nome} — foto ${i + 1}`}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            quality={75}
            loading={prioritaEager && i === 0 ? "eager" : "lazy"}
            fetchPriority={prioritaAlta && i === 0 ? "high" : "auto"}
            className={[
              // transition su opacita (crossfade) E transform (scala su hover,
              // come la card statica).
              "object-contain p-3 transition-[opacity,transform] duration-200 group-hover:scale-[1.04]",
              i === idx ? "opacity-100" : "opacity-0",
            ].join(" ")}
          />
        ) : null,
      )}

      {/* Frecce: nascoste su mobile (si scorre con lo swipe), su desktop
          compaiono all'hover della card o al focus da tastiera. */}
      <button
        type="button"
        aria-label="Foto precedente"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          vai(-1);
        }}
        className="absolute left-1.5 top-1/2 z-20 hidden h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-foreground opacity-0 shadow-soft ring-1 ring-line backdrop-blur transition focus-visible:opacity-100 group-hover:opacity-100 active:scale-95 sm:grid"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Foto successiva"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          vai(1);
        }}
        className="absolute right-1.5 top-1/2 z-20 hidden h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-foreground opacity-0 shadow-soft ring-1 ring-line backdrop-blur transition focus-visible:opacity-100 group-hover:opacity-100 active:scale-95 sm:grid"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>

      {/* Pallini indicatore. */}
      <span
        aria-hidden="true"
        className="absolute bottom-1.5 left-1/2 z-20 flex -translate-x-1/2 gap-1"
      >
        {urls.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === idx ? "w-4 bg-sea" : "w-1.5 bg-foreground/25"
            }`}
          />
        ))}
      </span>
      <span className="sr-only" aria-live="polite">
        Foto {idx + 1} di {urls.length}
      </span>
    </div>
  );
}
