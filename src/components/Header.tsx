// Header del sito: wordmark "Anna Shop", navigazione minimale e link al carrello.
// Server component: il badge contatore (CartBadge) e un figlio client che legge
// il CartProvider e si aggiorna in tempo reale a ogni add/rimuovi.

import Link from "next/link";

import CartBadge from "@/components/cart/CartBadge";
import Wordmark from "@/components/Wordmark";

export default function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-surface-2 bg-background/85 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        {/* Wordmark "Onda Sole": sigillo + "Anna" corallo / "Shop" blu.
            Il sole "sorge" all'hover grazie a .group su questo Link. */}
        <Link href="/" aria-label="Anna Shop — vai alla home" className="group">
          <Wordmark className="text-2xl" />
        </Link>

        <nav
          className="flex items-center gap-2 sm:gap-3"
          aria-label="Navigazione principale"
        >
          <Link
            href="/"
            className="hidden rounded-full px-3 py-2 font-display text-base font-semibold text-foreground transition-colors hover:text-sea sm:inline-flex"
          >
            Vetrina
          </Link>
          <Link
            href="/vieni-a-trovarci"
            className="hidden rounded-full px-3 py-2 font-display text-base font-semibold text-foreground transition-colors hover:text-sea sm:inline-flex"
          >
            Vieni a trovarci
          </Link>

          {/* Carrello: icon-btn tondo (tap target 44px) con badge corallo. */}
          <Link
            href="/carrello"
            aria-label="Carrello"
            className="relative grid h-11 w-11 place-items-center rounded-full bg-surface text-foreground transition duration-200 hover:-translate-y-0.5 hover:bg-surface-2"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="9" cy="20" r="1.4" />
              <circle cx="18" cy="20" r="1.4" />
              <path d="M2.5 3h2l2.3 12.2a1.6 1.6 0 0 0 1.6 1.3h8.5a1.6 1.6 0 0 0 1.6-1.3L21 7H6" />
            </svg>
            <CartBadge />
          </Link>
        </nav>
      </div>
    </header>
  );
}
