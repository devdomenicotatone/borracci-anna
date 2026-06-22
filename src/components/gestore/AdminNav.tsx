"use client";

// Navigazione dell'area gestore, mobile-first:
//   - mobile: header sticky in alto + bottom-nav fissa in basso (safe-area);
//   - desktop (md+): sidebar fissa a sinistra con profilo e logout in fondo.

import Link from "next/link";
import { usePathname } from "next/navigation";

import { logoutGestore } from "@/lib/gestore/auth-actions";

function IconaProdotti({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 7v10l9 4 9-4V7" />
      <path d="M12 11v10" />
    </svg>
  );
}

function IconaPiu({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

const Wordmark = (
  <span className="wordmark text-xl text-foreground">
    <span className="font-normal text-muted">by</span>
    <span className="ml-1 italic">
      <span className="text-[1.15em] font-bold">F</span>rody
    </span>
    <span className="ml-1.5 align-middle text-xs font-normal not-italic text-muted">
      · gestore
    </span>
  </span>
);

export default function AdminNav({
  nome,
  ruolo,
}: {
  nome: string | null;
  ruolo: string;
}) {
  const pathname = usePathname();
  const suNuovo = pathname.startsWith("/gestore/prodotti/nuovo");
  const suProdotti = pathname.startsWith("/gestore/prodotti") && !suNuovo;
  // Sulle pagine di form (nuovo / modifica) la save-bar prende il fondo:
  // nascondiamo la bottom-nav mobile per non sovrapporle.
  const suFormProdotto = /^\/gestore\/prodotti\/.+/.test(pathname);

  return (
    <>
      {/* HEADER mobile */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-surface/85 px-4 backdrop-blur md:hidden">
        <Link href="/gestore/prodotti" aria-label="Area gestore by Frody">
          {Wordmark}
        </Link>
        <form action={logoutGestore}>
          <button
            type="submit"
            className="text-sm font-medium text-muted transition-colors hover:text-foreground"
          >
            Esci
          </button>
        </form>
      </header>

      {/* SIDEBAR desktop */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-line bg-surface px-4 py-5 md:flex">
        <Link
          href="/gestore/prodotti"
          aria-label="Area gestore by Frody"
          className="px-2"
        >
          {Wordmark}
        </Link>
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          <Link href="/gestore/prodotti" className={voceSidebar(suProdotti)}>
            <IconaProdotti className="h-5 w-5" />
            Prodotti
          </Link>
          <Link href="/gestore/prodotti/nuovo" className={voceSidebar(suNuovo)}>
            <IconaPiu className="h-5 w-5" />
            Nuovo prodotto
          </Link>
        </nav>
        <div className="border-t border-line pt-4">
          <p className="px-2 text-sm font-medium text-foreground">
            {nome ?? "Gestore"}
          </p>
          <p className="px-2 text-xs capitalize text-muted">{ruolo}</p>
          <form action={logoutGestore} className="mt-2">
            <button
              type="submit"
              className="w-full rounded-lg px-2 py-2 text-left text-sm text-muted transition-colors hover:bg-background hover:text-foreground"
            >
              Esci
            </button>
          </form>
        </div>
      </aside>

      {/* BOTTOM-NAV mobile (nascosta sulle pagine di form) */}
      {!suFormProdotto && (
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-2 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          <Link href="/gestore/prodotti" className={voceBottom(suProdotti)}>
            <IconaProdotti className="h-5 w-5" />
            <span>Prodotti</span>
          </Link>
          <Link href="/gestore/prodotti/nuovo" className={voceBottom(suNuovo)}>
            <IconaPiu className="h-5 w-5" />
            <span>Nuovo</span>
          </Link>
        </nav>
      )}
    </>
  );
}

function voceSidebar(attivo: boolean): string {
  return [
    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
    attivo
      ? "bg-foreground text-background"
      : "text-muted hover:bg-background hover:text-foreground",
  ].join(" ");
}

function voceBottom(attivo: boolean): string {
  return [
    "flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
    attivo ? "text-foreground" : "text-muted",
  ].join(" ");
}
