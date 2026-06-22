// Header del sito: wordmark "by Frody", navigazione minimale e link al carrello.
// Componente server-side puro (solo link), nessuno stato.

import Link from "next/link";

export default function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-surface-2 bg-background/85 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        {/* Wordmark: "by" blu mare, "Frody" con la F corallo (gestita da .wordmark). */}
        <Link href="/" aria-label="by Frody — vai alla home" className="group">
          <span className="wordmark text-2xl">
            <span className="wm-by">by</span>
            <span className="wm-frody">Frody</span>
          </span>
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
          </Link>
        </nav>
      </div>
    </header>
  );
}
