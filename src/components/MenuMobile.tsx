"use client";

// Menu di navigazione mobile (hamburger nell'header): drawer da sinistra con
// le pagine principali e l'albero categorie (macro + figlie e nipoti indentate).
// Stessa accessibilita dei drawer esistenti: dialog modale, ESC, overlay,
// scroll-lock, focus trap, focus ripristinato. Si chiude a ogni navigazione.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { GruppoCategorie } from "@/lib/categorie-albero";
import Wordmark from "@/components/Wordmark";

export default function MenuMobile({ gruppi }: { gruppi: GruppoCategorie[] }) {
  const [aperto, setAperto] = useState(false);
  const pannelloRef = useRef<HTMLDivElement>(null);
  const elementoPrecedenteRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!aperto) return;

    elementoPrecedenteRef.current = document.activeElement as HTMLElement | null;
    const overflowPrecedente = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const pannello = pannelloRef.current;
    const focusabili = () =>
      Array.from(
        pannello?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusabili()[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setAperto(false);
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
      document.body.style.overflow = overflowPrecedente;
      elementoPrecedenteRef.current?.focus?.();
    };
  }, [aperto]);

  const chiudi = () => setAperto(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAperto(true)}
        aria-label="Apri il menu"
        aria-haspopup="dialog"
        className="grid h-11 w-11 place-items-center rounded-full bg-surface text-foreground transition duration-200 hover:-translate-y-0.5 hover:bg-surface-2 sm:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {/* Portal su <body>: l'header ha un backdrop-filter, che lo rende
          containing block per i figli position:fixed. Renderizzato inline, il
          drawer resterebbe intrappolato nei 64px dell'header invece di coprire
          il viewport. Il portal lo sgancia direttamente al body (come il
          CartDrawer, che vive gia fuori dall'header nel layout). */}
      {aperto &&
        createPortal(
          <div className="fixed inset-0 z-50 sm:hidden">
            {/* Overlay */}
            <button
              type="button"
              aria-label="Chiudi il menu"
              onClick={chiudi}
              className="animate-fade-in absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-[2px]"
            />

            {/* Pannello (da sinistra) */}
            <div
              ref={pannelloRef}
              role="dialog"
              aria-modal="true"
              aria-label="Menu di navigazione"
              className="animate-drawer-in-left absolute inset-y-0 left-0 flex w-full max-w-xs flex-col bg-background shadow-[0_0_60px_-15px_rgba(10,31,51,0.5)]"
            >
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <Wordmark className="text-xl" />
                <button
                  type="button"
                  onClick={chiudi}
                  aria-label="Chiudi"
                  className="grid h-10 w-10 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <nav
                aria-label="Navigazione principale"
                className="flex-1 overflow-y-auto px-3 py-4"
              >
                <Link
                  href="/"
                  onClick={chiudi}
                  className="block rounded-2xl px-4 py-3 font-display text-base font-bold text-foreground transition-colors hover:bg-surface"
                >
                  Vetrina
                </Link>

                {gruppi.map(({ radice, figlie }) => (
                  <div key={radice.id} className="mt-1">
                    <Link
                      href={`/categoria/${radice.slug}`}
                      onClick={chiudi}
                      className="block rounded-2xl px-4 py-3 font-display text-base font-bold text-foreground transition-colors hover:bg-surface"
                    >
                      {radice.nome}
                    </Link>
                    {figlie.length > 0 && (
                      <div className="ml-4 border-l-2 border-surface-2 pl-1">
                        {figlie.map(({ figlia, nipoti }) => (
                          <div key={figlia.id}>
                            <Link
                              href={`/categoria/${figlia.slug}`}
                              onClick={chiudi}
                              className="block rounded-xl px-4 py-2.5 text-[15px] font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
                            >
                              {figlia.nome}
                            </Link>
                            {nipoti.length > 0 && (
                              <div className="ml-4 border-l-2 border-surface-2 pl-1">
                                {nipoti.map((n) => (
                                  <Link
                                    key={n.id}
                                    href={`/categoria/${n.slug}`}
                                    onClick={chiudi}
                                    className="block rounded-xl px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
                                  >
                                    {n.nome}
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                <Link
                  href="/vieni-a-trovarci"
                  onClick={chiudi}
                  className="mt-1 block rounded-2xl px-4 py-3 font-display text-base font-bold text-foreground transition-colors hover:bg-surface"
                >
                  Vieni a trovarci
                </Link>
              </nav>

              <div className="border-t border-line bg-surface px-5 py-4">
                <Link
                  href="/carrello"
                  onClick={chiudi}
                  className="flex h-12 items-center justify-center rounded-full bg-sea font-display text-sm font-bold text-white shadow-sea transition-transform hover:-translate-y-0.5"
                >
                  Vai al carrello
                </Link>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
