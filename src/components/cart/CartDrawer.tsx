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
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

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
  const pathname = usePathname();

  // true finche la entry fittizia spinta in cronologia all'apertura non e
  // stata consumata (dal back dell'utente o dalla chiusura esplicita).
  // Stesso schema di MenuMobile: il back di consumo avviene SOLO in modo
  // sincrono nel handler di chiusura esplicita, mai nella cleanup dell'effect
  // (in StrictMode la cleanup gira anche subito dopo il mount, e un back li
  // dentro richiuderebbe il drawer appena aperto).
  const entryDaConsumareRef = useRef(false);

  // Chiusura esplicita (X, overlay, ESC, "Continua acquisti"): consuma con un
  // back la entry fittizia, cosi il prossimo back del browser esce davvero
  // dalla pagina.
  const chiudi = useCallback(() => {
    chiudiDrawer();
    if (entryDaConsumareRef.current) {
      entryDaConsumareRef.current = false;
      window.history.back();
    }
  }, [chiudiDrawer]);

  // Chiusura per navigazione (tap su un link del drawer): la nuova route
  // finisce in cronologia SOPRA la entry fittizia, quindi qui niente back
  // (annullerebbe la navigazione appena chiesta); la entry residua e una copia
  // della pagina di partenza e un eventuale back la attraversa senza effetti
  // visibili.
  const chiudiPerNavigazione = useCallback(() => {
    entryDaConsumareRef.current = false;
    chiudiDrawer();
  }, [chiudiDrawer]);

  // Qualsiasi navigazione chiude il drawer: non deve restare aperto sopra la
  // nuova pagina. Il flag della entry fittizia viene azzerato dalla cleanup
  // dell'effect qui sotto (drawerAperto passa a false).
  useEffect(() => {
    chiudiDrawer();
  }, [pathname, chiudiDrawer]);

  // Entry fittizia in cronologia (stessa URL, quindi invisibile) finche il
  // drawer e aperto: il back di Android / il gesto indietro chiude il drawer
  // invece di lasciare la pagina.
  useEffect(() => {
    if (!drawerAperto) return;

    window.history.pushState({ cartDrawer: true }, "");
    entryDaConsumareRef.current = true;

    function onPopState() {
      // Il back ha gia consumato la entry: il flag evita che la chiusura
      // esplicita ne faccia un secondo (= due pagine indietro).
      entryDaConsumareRef.current = false;
      chiudiDrawer();
    }

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      // Drawer chiuso (o componente smontato): nessuna entry da tracciare.
      // Copre la chiusura per cambio pathname (effect qui sopra), dove nessun
      // handler azzera il flag. Niente back() qui: la chiusura esplicita lo fa
      // gia in modo sincrono in chiudi(), e un back in cleanup andrebbe in
      // race con la pushState della route chiesta dai link del drawer.
      entryDaConsumareRef.current = false;
    };
  }, [drawerAperto, chiudiDrawer]);

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
        chiudi();
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
  }, [drawerAperto, chiudi]);

  if (!drawerAperto) return null;

  // Composizione del carrello: guida il CTA del footer. Misto = entrambe le
  // nature presenti -> i due flussi (pagamento / richiesta) si completano
  // dalla pagina carrello, in sezioni separate.
  const nRichiesta = righe.filter(
    (r) => r.prodotto.disponibilita_su_richiesta,
  ).length;
  const misto = nRichiesta > 0 && nRichiesta < righe.length;

  return (
    <div className="fixed inset-0 z-50" aria-hidden={false}>
      {/* Overlay */}
      <button
        type="button"
        aria-label="Chiudi il carrello"
        onClick={chiudi}
        className="animate-fade-in absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-[2px]"
      />

      {/* Pannello */}
      <div
        ref={pannelloRef}
        role="dialog"
        aria-modal="true"
        aria-label="Il tuo carrello"
        className="animate-drawer-in absolute inset-y-0 right-0 flex w-[calc(100%-2.75rem)] max-w-md flex-col bg-background shadow-[0_0_60px_-15px_rgba(10,31,51,0.5)]"
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
            onClick={chiudi}
            aria-label="Chiudi"
            className="grid h-10 w-10 place-items-center rounded-full text-muted transition hover:bg-surface hover:text-foreground active:scale-95"
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
              onClick={chiudi}
              className="flex h-11 items-center justify-center rounded-full bg-coral px-6 font-display font-bold text-white shadow-coral transition-transform hover:-translate-y-0.5 active:scale-[.98]"
            >
              Scopri i prodotti
            </button>
          </div>
        ) : (
          <>
            {/* Righe + free shipping */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5">
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
                {/* CTA per natura del carrello: solo pronta consegna -> paga
                    subito; solo su richiesta -> flusso richiesta; MISTO -> i
                    due flussi sono separati e si completano dalla pagina
                    carrello (il drawer non li replica in miniatura). */}
                {nRichiesta === 0 ? (
                  <CheckoutButton />
                ) : misto ? (
                  <>
                    <p className="mb-3 text-xs text-muted">
                      Hai articoli{" "}
                      <span className="font-semibold text-foreground">
                        disponibili subito
                      </span>{" "}
                      e{" "}
                      <span className="font-semibold text-foreground">
                        su richiesta
                      </span>
                      : dal carrello li completi in due passaggi separati.
                    </p>
                    <Link
                      href="/carrello"
                      onClick={chiudiPerNavigazione}
                      className="flex h-12 w-full items-center justify-center rounded-full bg-sea px-6 font-display font-bold text-white shadow-sea transition-transform hover:-translate-y-0.5 active:scale-[.98]"
                    >
                      Vai al carrello
                    </Link>
                  </>
                ) : (
                  <Link
                    href="/carrello"
                    onClick={chiudiPerNavigazione}
                    className="flex h-12 w-full items-center justify-center rounded-full bg-sea px-6 font-display font-bold text-white shadow-sea transition-transform hover:-translate-y-0.5 active:scale-[.98]"
                  >
                    Procedi con la richiesta
                  </Link>
                )}
              </div>

              {/* Nel misto il primario e gia "Vai al carrello": doppiarlo qui
                  sotto sarebbe rumore, resta il solo "Continua acquisti". */}
              <div
                className={`mt-3 grid gap-3 ${misto ? "grid-cols-1" : "grid-cols-2"}`}
              >
                <button
                  type="button"
                  onClick={chiudi}
                  className="flex h-11 items-center justify-center rounded-full bg-white px-4 font-display text-sm font-bold text-sea ring-2 ring-surface-2 transition hover:bg-surface active:scale-[.98]"
                >
                  Continua acquisti
                </button>
                {!misto && (
                  <Link
                    href="/carrello"
                    onClick={chiudiPerNavigazione}
                    className="flex h-11 items-center justify-center rounded-full bg-surface-2 px-4 font-display text-sm font-bold text-sea transition hover:bg-line active:scale-[.98]"
                  >
                    Vai al carrello
                  </Link>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
