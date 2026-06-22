// Header del sito: wordmark "by Frody", navigazione minimale e link al carrello.
// Componente server-side puro (solo link), nessuno stato.

import Link from "next/link";

export default function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        {/* Wordmark: "by" leggero, "Frody" marcato con F maiuscola — vibe firma. */}
        <Link href="/" aria-label="by Frody — vai alla home" className="group">
          <span className="wordmark text-2xl text-foreground">
            <span className="font-normal text-muted">by</span>
            <span className="ml-1 italic">
              <span className="text-[1.15em] font-bold">F</span>rody
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-6 text-sm">
          <Link
            href="/"
            className="text-muted transition-colors hover:text-foreground"
          >
            Vetrina
          </Link>
          <Link
            href="/carrello"
            className="inline-flex items-center gap-2 rounded-full border border-foreground bg-foreground px-4 py-1.5 font-medium text-background transition-colors hover:bg-transparent hover:text-foreground"
          >
            Carrello
          </Link>
        </nav>
      </div>
    </header>
  );
}
