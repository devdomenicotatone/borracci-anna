"use client";

// Scorrimento infinito della griglia catalogo: una sentinella invisibile a
// fondo lista che, quando entra nel viewport (con ampio margine di preload),
// esegue la stessa navigazione solo-searchParams del link "Mostra altri".
// I children sono proprio quel link: resta come fallback senza JS/observer e
// per chi naviga da tastiera; durante il caricamento automatico si sostituisce
// con lo spinner, cosi non si accumulano click mentre arrivano le card.
// Si usa router.replace (non push): 40 blocchi caricati scorrendo non devono
// diventare 40 voci di cronologia da ripercorrere col tasto indietro.
//
// TETTO: dopo MAX_AUTO caricamenti automatici consecutivi la sentinella si
// mette in pausa e resta solo il bottone — senza pausa il footer sarebbe
// irraggiungibile con ~1800 prodotti. Il click sul bottone (intercettato in
// capture sul wrapper) azzera il conteggio e riattiva l'automatico.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

/** Blocchi caricati da soli tra un click e l'altro (~120 card). */
const MAX_AUTO = 5;

export default function CaricamentoAutomatico({
  pagina,
  urlPaginaSuccessiva,
  chiaveFiltri,
  children,
}: {
  /** Pagina corrente (1-based): riarma la sentinella quando cambia. */
  pagina: number;
  urlPaginaSuccessiva: string;
  /** Percorso + filtri SENZA pagina: quando cambia, il tetto riparte da zero. */
  chiaveFiltri: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [inCorso, startTransition] = useTransition();
  const sentinella = useRef<HTMLSpanElement>(null);
  // Ultima pagina richiesta: l'observer scatta a raffica durante lo scroll,
  // ma una sola navigazione per pagina deve partire.
  const richiesta = useRef(pagina);
  // Caricamenti automatici consecutivi dall'ultimo click (o cambio filtri).
  const autoConsecutivi = useRef(0);

  // Filtri o percorso nuovi = esplorazione nuova: il tetto riparte.
  useEffect(() => {
    autoConsecutivi.current = 0;
  }, [chiaveFiltri]);

  useEffect(() => {
    // Props nuove (pagina caricata, o filtri cambiati -> URL nuovo): si riarma.
    // Copre anche il tasto indietro, che riduce `pagina` senza rimontare.
    richiesta.current = pagina;

    const nodo = sentinella.current;
    if (!nodo || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (voci) => {
        if (!voci.some((v) => v.isIntersecting)) return;
        if (richiesta.current > pagina) return;
        if (autoConsecutivi.current >= MAX_AUTO) return;
        richiesta.current = pagina + 1;
        autoConsecutivi.current += 1;
        startTransition(() => {
          router.replace(urlPaginaSuccessiva, { scroll: false });
        });
      },
      // Parte ~una riga di card prima del fondo: il flusso non si interrompe.
      { rootMargin: "600px 0px" },
    );
    observer.observe(nodo);
    return () => observer.disconnect();
  }, [pagina, urlPaginaSuccessiva, router]);

  return (
    <>
      <span ref={sentinella} aria-hidden="true" />
      {inCorso ? (
        <span
          role="status"
          className="inline-flex h-12 items-center gap-2 px-7 font-display text-sm font-bold text-sea"
        >
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-sea border-t-transparent"
          />
          Carico…
        </span>
      ) : (
        // display:contents — il wrapper serve solo a intercettare il click sul
        // link (che e' un server component: non puo' avere onClick suo).
        <span
          className="contents"
          onClickCapture={() => {
            autoConsecutivi.current = 0;
          }}
        >
          {children}
        </span>
      )}
    </>
  );
}
