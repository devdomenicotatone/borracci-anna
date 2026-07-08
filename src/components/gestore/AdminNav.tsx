"use client";

// Navigazione dell'area gestore, mobile-first:
//   - mobile: header sticky in alto + bottom-nav fissa in basso (safe-area);
//   - desktop (md+): sidebar fissa a sinistra con profilo e logout in fondo.

import Link from "next/link";
import { usePathname } from "next/navigation";

import Wordmark from "@/components/Wordmark";
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

function IconaOrdini({ className }: { className?: string }) {
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
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function IconaCategorie({ className }: { className?: string }) {
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
      <path d="M12 2 2 7l10 5 10-5-10-5z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </svg>
  );
}

function IconaVetrina({ className }: { className?: string }) {
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
      <path d="M3 9l1.6-5h14.8L21 9" />
      <path d="M4 9v11h16V9" />
      <path d="M4 9h16" />
      <path d="M9.5 20v-6h5v6" />
    </svg>
  );
}

function IconaMedia({ className }: { className?: string }) {
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
      <rect x="7" y="3" width="14" height="14" rx="2" />
      <circle cx="11.5" cy="7.5" r="1.4" />
      <path d="m7 13 3.5-3.2L15 17" />
      <path d="M3 7v12a2 2 0 0 0 2 2h12" />
    </svg>
  );
}

export default function AdminNav({
  nome,
  ruolo,
  ordiniDaConfermare = 0,
}: {
  nome: string | null;
  ruolo: string;
  /** Richieste in attesa: mostra un badge sulla voce Ordini. */
  ordiniDaConfermare?: number;
}) {
  const pathname = usePathname();
  const badgeOrdini = ordiniDaConfermare > 99 ? "99+" : String(ordiniDaConfermare);
  const suNuovo = pathname.startsWith("/gestore/prodotti/nuovo");
  const suProdotti = pathname.startsWith("/gestore/prodotti") && !suNuovo;
  const suVetrina = pathname.startsWith("/gestore/vetrina");
  const suCategorie = pathname.startsWith("/gestore/categorie");
  const suOrdini = pathname.startsWith("/gestore/ordini");
  const suMedia = pathname.startsWith("/gestore/media");
  // Sulle pagine di form (nuovo / modifica) la save-bar prende il fondo:
  // nascondiamo la bottom-nav mobile per non sovrapporle.
  const suFormProdotto = /^\/gestore\/prodotti\/.+/.test(pathname);

  return (
    <>
      {/* HEADER mobile */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-white/85 px-4 backdrop-blur md:hidden">
        <Link href="/gestore/prodotti" aria-label="Area gestore Anna Shop">
          <Wordmark
            className="text-xl"
            suffix="· gestore"
            suffixClassName="ml-1 text-sm font-medium text-muted"
          />
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
          {/* Sidebar stretta (w-60): il suffisso "· gestore" inline farebbe
              debordare il wordmark col sigillo, quindi l'etichetta ruolo va
              sotto come sotto-titolo — pattern da pannello admin. */}
          <Link
            href="/gestore/prodotti"
            aria-label="Area gestore Anna Shop"
            className="block"
          >
            <Wordmark onDark className="text-xl" />
            <p className="mt-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
              Area gestore
            </p>
          </Link>
        </div>
        <nav className="mt-6 flex flex-1 flex-col gap-1 px-4">
          <Link href="/gestore/prodotti" className={voceSidebar(suProdotti)}>
            <IconaProdotti className="h-5 w-5" />
            Prodotti
          </Link>
          <Link href="/gestore/vetrina" className={voceSidebar(suVetrina)}>
            <IconaVetrina className="h-5 w-5" />
            Vetrina
          </Link>
          <Link href="/gestore/categorie" className={voceSidebar(suCategorie)}>
            <IconaCategorie className="h-5 w-5" />
            Categorie
          </Link>
          <Link href="/gestore/ordini" className={voceSidebar(suOrdini)}>
            <IconaOrdini className="h-5 w-5" />
            Ordini
            {ordiniDaConfermare > 0 && (
              <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1.5 text-[11px] font-bold text-white">
                {badgeOrdini}
              </span>
            )}
          </Link>
          <Link href="/gestore/media" className={voceSidebar(suMedia)}>
            <IconaMedia className="h-5 w-5" />
            Media
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
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          <Link href="/gestore/prodotti" className={voceBottom(suProdotti)}>
            <IconaProdotti className="h-5 w-5" />
            <span>Prodotti</span>
          </Link>
          <Link href="/gestore/vetrina" className={voceBottom(suVetrina)}>
            <IconaVetrina className="h-5 w-5" />
            <span>Vetrina</span>
          </Link>
          <Link href="/gestore/categorie" className={voceBottom(suCategorie)}>
            <IconaCategorie className="h-5 w-5" />
            <span>Categorie</span>
          </Link>
          <Link href="/gestore/ordini" className={voceBottom(suOrdini)}>
            <span className="relative">
              <IconaOrdini className="h-5 w-5" />
              {ordiniDaConfermare > 0 && (
                <span className="absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-coral px-1 text-[10px] font-bold text-white">
                  {badgeOrdini}
                </span>
              )}
            </span>
            <span>Ordini</span>
          </Link>
          <Link href="/gestore/media" className={voceBottom(suMedia)}>
            <IconaMedia className="h-5 w-5" />
            <span>Media</span>
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
