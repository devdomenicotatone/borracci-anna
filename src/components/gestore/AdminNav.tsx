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
  <span className="wordmark text-xl">
    <span className="wm-by">by</span>
    <span className="wm-frody">Frody</span>
    <span className="ml-1 text-sm font-medium text-muted">· gestore</span>
  </span>
);

const WordmarkBianco = (
  <span className="wordmark text-xl text-white">
    <span className="wm-by !text-lagoon">by</span>
    <span className="wm-frody">Frody</span>
    <span className="ml-1 text-sm font-medium text-white/70">· gestore</span>
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
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-white/85 px-4 backdrop-blur md:hidden">
        <Link href="/gestore/prodotti" aria-label="Area gestore by Frody">
          {Wordmark}
        </Link>
        <form action={logoutGestore}>
          <button
            type="submit"
            className="rounded-full px-3 py-2 text-sm font-display font-bold text-sea transition-colors hover:bg-surface"
          >
            Esci
          </button>
        </form>
      </header>

      {/* SIDEBAR desktop */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-line bg-surface md:flex">
        {/* Topbar mare scura del gestionale */}
        <div className="bg-ink-gradient px-4 py-4">
          <Link
            href="/gestore/prodotti"
            aria-label="Area gestore by Frody"
            className="flex items-center gap-2"
          >
            <span
              className="h-2.5 w-2.5 flex-none rounded-full bg-coral shadow-[0_0_0_4px_rgba(255,92,92,0.25)]"
              aria-hidden="true"
            />
            {WordmarkBianco}
          </Link>
        </div>
        <nav className="mt-6 flex flex-1 flex-col gap-1 px-4">
          <Link href="/gestore/prodotti" className={voceSidebar(suProdotti)}>
            <IconaProdotti className="h-5 w-5" />
            Prodotti
          </Link>
          <Link href="/gestore/prodotti/nuovo" className={voceSidebar(suNuovo)}>
            <IconaPiu className="h-5 w-5" />
            Nuovo prodotto
          </Link>
        </nav>
        <div className="border-t border-line p-4">
          <div className="flex items-center gap-3">
            <span
              className="grid h-9 w-9 flex-none place-items-center rounded-full bg-gradient-to-br from-lagoon to-sea text-sm font-display font-bold text-white"
              aria-hidden="true"
            >
              {(nome ?? "Gestore").charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-display font-bold text-foreground">
                {nome ?? "Gestore"}
              </p>
              <p className="truncate text-xs capitalize text-muted">{ruolo}</p>
            </div>
          </div>
          <form action={logoutGestore} className="mt-3">
            <button
              type="submit"
              className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-muted transition-colors hover:bg-background hover:text-foreground"
            >
              Esci
            </button>
          </form>
        </div>
      </aside>

      {/* BOTTOM-NAV mobile (nascosta sulle pagine di form) */}
      {!suFormProdotto && (
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-2 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
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
    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-display font-bold transition-colors",
    attivo
      ? "bg-sea text-white shadow-sea"
      : "text-muted hover:bg-surface hover:text-foreground",
  ].join(" ");
}

function voceBottom(attivo: boolean): string {
  return [
    "flex h-16 flex-col items-center justify-center gap-1 text-xs font-display font-bold transition-colors",
    attivo ? "text-sea" : "text-muted",
  ].join(" ");
}
