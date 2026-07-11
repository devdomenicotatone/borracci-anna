"use client";

// Navigazione dell'area account: card verticale sticky su desktop, riga di
// pill scrollabile su mobile. La voce attiva segue il pathname; "Esci" e un
// form che invoca la Server Action di logout.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { logoutClienteAction } from "@/lib/account/auth-actions";

interface Voce {
  href: string;
  label: string;
  /** true = attiva solo su match esatto (la dashboard). */
  esatta?: boolean;
  icona: ReactNode;
}

const ICONA_CLS = "h-[18px] w-[18px] shrink-0";
const SVG = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const VOCI: Voce[] = [
  {
    href: "/account",
    label: "Panoramica",
    esatta: true,
    icona: (
      <svg {...SVG} className={ICONA_CLS}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/account/ordini",
    label: "Ordini",
    icona: (
      <svg {...SVG} className={ICONA_CLS}>
        <path d="m7.5 4.27 9 5.15" />
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5" />
        <path d="M12 22V12" />
      </svg>
    ),
  },
  {
    href: "/account/indirizzi",
    label: "Indirizzi",
    icona: (
      <svg {...SVG} className={ICONA_CLS}>
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    href: "/preferiti",
    label: "Preferiti",
    icona: (
      <svg {...SVG} className={ICONA_CLS}>
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </svg>
    ),
  },
  {
    href: "/account/profilo",
    label: "Profilo",
    icona: (
      <svg {...SVG} className={ICONA_CLS}>
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

function attiva(voce: Voce, pathname: string): boolean {
  return voce.esatta
    ? pathname === voce.href
    : pathname === voce.href || pathname.startsWith(`${voce.href}/`);
}

export default function AccountNav() {
  const pathname = usePathname();

  const voci = VOCI.map((voce) => {
    const on = attiva(voce, pathname);
    return (
      <Link
        key={voce.href}
        href={voce.href}
        aria-current={on ? "page" : undefined}
        className={`flex shrink-0 items-center gap-3 rounded-2xl px-4 py-3 font-display text-sm font-bold transition-colors ${
          on
            ? "bg-sea/10 text-sea"
            : "text-muted hover:bg-surface hover:text-foreground"
        }`}
      >
        {voce.icona}
        {voce.label}
      </Link>
    );
  });

  return (
    <nav aria-label="Il tuo account">
      {/* Mobile: pill orizzontali scrollabili */}
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:hidden">
        {voci}
      </div>
      {/* Desktop: card verticale sticky con "Esci" in coda */}
      <div className="hidden lg:block">
        <div className="sticky top-24 flex flex-col gap-1 self-start rounded-3xl bg-white p-2 shadow-soft ring-1 ring-line">
          {voci}
          <form action={logoutClienteAction} className="mt-1 border-t border-line pt-1">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left font-display text-sm font-bold text-coral-ink transition-colors hover:bg-coral/10"
            >
              <svg {...SVG} className={ICONA_CLS}>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="m16 17 5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
              Esci
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
