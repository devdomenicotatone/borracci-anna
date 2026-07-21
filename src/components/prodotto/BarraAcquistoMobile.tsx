"use client";

// Barra d'acquisto fissa sul bordo inferiore, SOLO mobile (md:hidden): sulla
// PDP il bottone "Aggiungi al carrello" arriva dopo galleria, descrizione e
// selettori (oltre 1000px di scroll) e chi esplora i correlati perde la CTA.
// Qui prezzo e azione restano sempre a portata di pollice. Selezione (colore,
// taglia, quantita) e variante vivono in ProdottoDettaglio e arrivano gia
// risolte; con selezione incompleta il tap NON e morto: richiama i selettori
// (onSelezioneMancante). Esaurito/non disponibile: la barra mostra lo stato.

import { useEffect, useRef, useTransition } from "react";

import { useCarrello } from "@/components/cart/CartProvider";
import StatoInvio from "@/components/StatoInvio";
import { formatPrezzo } from "@/lib/format";
import type { Prodotto, Variante } from "@/lib/types";

export default function BarraAcquistoMobile({
  prodotto,
  variante,
  quantita,
  colore,
  taglia,
  suRichiesta,
  senzaVarianti,
  esaurito,
  onSelezioneMancante,
}: {
  prodotto: Prodotto;
  variante: Variante | null;
  /** Quantita CONDIVISA col blocco acquisto in pagina (stesso stato sollevato
   *  in ProdottoDettaglio: cappata allo stock solo in vendita diretta). */
  quantita: number;
  colore: string | null;
  taglia: string | null;
  suRichiesta: boolean;
  senzaVarianti: boolean;
  esaurito: boolean;
  /** Tap senza variante acquistabile: porta l'utente ai selettori. */
  onSelezioneMancante: () => void;
}) {
  const { aggiungi } = useCarrello();
  const [inCorso, startTransition] = useTransition();
  const barraRef = useRef<HTMLDivElement | null>(null);

  // La barra e fixed e coprirebbe il fondo pagina (correlati e footer, che
  // vivono FUORI da questo componente): si compensa con un padding sul body,
  // misurato sull'altezza reale (safe-area inclusa). Quando md:hidden la
  // nasconde offsetHeight vale 0, quindi il ResizeObserver azzera il padding
  // da solo su schermi larghi; allo smontaggio si ripulisce.
  useEffect(() => {
    const barra = barraRef.current;
    if (!barra) return;
    const compensa = () => {
      const altezza = barra.offsetHeight;
      document.body.style.paddingBottom = altezza > 0 ? `${altezza}px` : "";
      // scroll-padding-bottom: il browser deve fermare lo scroll-into-view del
      // focus PRIMA della barra fixed, o l'elemento focalizzato ci finisce
      // sotto (WCAG 2.4.11; il top e' coperto dallo scroll-padding-top globale).
      document.documentElement.style.scrollPaddingBottom =
        altezza > 0 ? `${altezza}px` : "";
    };
    compensa();
    const osservatore = new ResizeObserver(compensa);
    osservatore.observe(barra);
    return () => {
      osservatore.disconnect();
      document.body.style.paddingBottom = "";
      document.documentElement.style.scrollPaddingBottom = "";
    };
  }, []);

  // Non acquistabile in assoluto (nessuna selezione puo sbloccarlo): niente
  // bottone morto, la barra mostra lo stato. In "su richiesta" lo stock non
  // conta: blocca solo l'assenza totale di varianti.
  const bloccato = senzaVarianti || (!suRichiesta && esaurito);
  // Aggiungibile ADESSO con la selezione corrente.
  const pronta = suRichiesta ? !!variante : !!variante && variante.stock > 0;

  function handleTap() {
    const v = variante;
    if (!v || (!suRichiesta && v.stock <= 0)) {
      onSelezioneMancante();
      return;
    }
    startTransition(async () => {
      await aggiungi({ prodotto, variante: v, quantita });
    });
  }

  const selezione = [taglia ? `Taglia ${taglia}` : null, colore]
    .filter(Boolean)
    .join(" · ");
  const sottotitolo = bloccato
    ? null
    : pronta
      ? selezione || null
      : "Scegli colore e taglia";

  return (
    // Stessa struttura della barra del carrello: z-30 sotto drawer (z-50) e
    // toast (z-60), padding che compensa la safe-area inferiore.
    <div
      ref={barraRef}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur md:hidden"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-xl font-extrabold leading-tight text-sea">
            {formatPrezzo(prodotto.prezzo_cents, prodotto.valuta)}
          </p>
          {sottotitolo && (
            <p className="truncate text-xs text-muted">{sottotitolo}</p>
          )}
        </div>
        {bloccato ? (
          <span className="flex h-12 flex-none items-center rounded-full bg-surface px-5 font-display text-sm font-bold text-coral-ink ring-1 ring-coral/30">
            {senzaVarianti ? "Non disponibile" : "Esaurito"}
          </span>
        ) : (
          <button
            type="button"
            onClick={handleTap}
            disabled={inCorso}
            aria-disabled={!pronta}
            className="flex h-12 flex-none items-center justify-center rounded-full bg-coral-ink px-5 font-display font-bold text-white shadow-coral transition-transform active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:opacity-60"
          >
            {inCorso
              ? "Aggiunta in corso..."
              : suRichiesta
                ? "Aggiungi alla richiesta"
                : "Aggiungi al carrello"}
          </button>
        )}
      </div>
      <StatoInvio
        attivo={inCorso}
        testo={
          suRichiesta
            ? "Aggiunta alla richiesta in corso"
            : "Aggiunta al carrello in corso"
        }
      />
    </div>
  );
}
