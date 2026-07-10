"use client";

// Mini-cart drawer (slide-over da destra).
// Si apre automaticamente dopo un add-to-cart riuscito (CartProvider.apriDrawer)
// e tiene l'utente nel flusso di navigazione invece di forzare il redirect alla
// pagina carrello (best practice anti-abbandono).
//
// Accessibilita: role="dialog" aria-modal, chiusura con ESC e click sull'overlay,
// scroll del body bloccato, focus spostato dentro al pannello e ripristinato in
// chiusura, Tab in trappola tra gli elementi focusabili del drawer.

import Link from "next/link";
import { useEffect, useRef } from "react";

import CartItem, { CheckoutButton } from "@/components/CartItem";
import FreeShippingBar from "@/components/cart/FreeShippingBar";
import { useCarrello } from "@/components/cart/CartProvider";
import { formatPrezzo } from "@/lib/format";
import { bloccaScrollBody } from "@/lib/scroll-lock";

export default function CartDrawer() {
  const { righe, count, subtotaleCents, valuta, drawerAperto, chiudiDrawer } =
    useCarrello();
  const pannelloRef = useRef<HTMLDivElement>(null);
  const elementoPrecedenteRef = useRef<HTMLElement | null>(null);

  // Apertura/chiusura: scroll-lock, focus, ESC e focus-trap.
  useEffect(() => {
    if (!drawerAperto) return;

    elementoPrecedenteRef.current = document.activeElement as HTMLElement | null;
    const sbloccaScroll = bloccaScrollBody();

    const pannello = pannelloRef.current;
    // Focus al primo elementi focusabile (di solito il bottone chiudi).
    const focusabili = () =>
      Array.from(
        pannello?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusabili()[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        chiudiDrawer();
        return;
      }
      if (e.key === "Tab") {
        const items = focusabili();
        if (items.length === 0) return;
        const primo = items[0];
        const ultimo = items[items.length - 1];
        const attivo = document.activeElement;
        if (e.shiftKey && attivo === primo) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && attivo === ultimo) {
          e.preventDefault();
          primo.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      sbloccaScroll();
      elementoPrecedenteRef.current?.focus?.();
    };
  }, [drawerAperto, chiudiDrawer]);

  if (!drawerAperto) return null;

  return (
    <div className="fixed inset-0 z-50" aria-hidden={false}>
      {/* Overlay */}
      <button
        type="button"
        aria-label="Chiudi il carrello"
        onClick={chiudiDrawer}
        className="animate-fade-in absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-[2px]"
      />

      {/* Pannello */}
      <div
        ref={pannelloRef}
        role="dialog"
        aria-modal="true"
        aria-label="Il tuo carrello"
        className="animate-drawer-in absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-background shadow-[0_0_60px_-15px_rgba(10,31,51,0.5)]"
      >
        {/* Intestazione */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-extrabold text-foreground">
            Il tuo carrello{" "}
            {count > 0 && (
              <span className="text-muted">
                ({count} {count === 1 ? "articolo" : "articoli"})
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={chiudiDrawer}
            aria-label="Chiudi"
            className="grid h-10 w-10 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {righe.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-3xl">
              🏖️
            </div>
            <p className="font-display text-base font-bold text-foreground">
              Il carrello è vuoto
            </p>
            <button
              type="button"
              onClick={chiudiDrawer}
              className="flex h-11 items-center justify-center rounded-full bg-coral px-6 font-display font-bold text-white shadow-coral transition-transform hover:-translate-y-0.5"
            >
              Scopri i prodotti
            </button>
          </div>
        ) : (
          <>
            {/* Righe + free shipping */}
            <div className="flex-1 overflow-y-auto px-5">
              <div className="py-4">
                <FreeShippingBar />
              </div>
              <ul className="divide-y divide-line">
                {righe.map((riga) => (
                  <CartItem key={riga.id} riga={riga} compatto />
                ))}
              </ul>
            </div>

            {/* Footer azioni */}
            <div className="border-t border-line bg-surface px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">Subtotale</span>
                <span className="font-display text-xl font-extrabold text-sea">
                  {formatPrezzo(subtotaleCents, valuta)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Spedizione e imposte calcolate al pagamento.
              </p>

              <div className="mt-4">
                {/* Carrello con articoli su richiesta: niente pagamento diretto,
                    si passa dal flusso richiesta (coerente con /carrello). */}
                {righe.some((r) => r.prodotto.disponibilita_su_richiesta) ? (
                  <Link
                    href="/carrello"
                    onClick={chiudiDrawer}
                    className="flex h-12 w-full items-center justify-center rounded-full bg-sea px-6 font-display font-bold text-white shadow-sea transition-transform hover:-translate-y-0.5"
                  >
                    Procedi con la richiesta
                  </Link>
                ) : (
                  <CheckoutButton />
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={chiudiDrawer}
                  className="flex h-11 items-center justify-center rounded-full bg-white px-4 font-display text-sm font-bold text-sea ring-2 ring-surface-2 transition-colors hover:bg-surface"
                >
                  Continua acquisti
                </button>
                <Link
                  href="/carrello"
                  onClick={chiudiDrawer}
                  className="flex h-11 items-center justify-center rounded-full bg-surface-2 px-4 font-display text-sm font-bold text-sea transition-colors hover:bg-line"
                >
                  Vai al carrello
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
