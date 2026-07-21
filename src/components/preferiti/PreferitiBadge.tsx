"use client";

// Badge contatore dei preferiti, vive dentro il Link cuore dell'Header.
// Stesso pattern del CartBadge: `key={count}` rimonta lo span cosi il "pop"
// si ripete a ogni salvataggio. Legge lo store localStorage (client-only:
// lato server rende 0, il numero compare all'idratazione).

import { usePreferiti } from "@/lib/preferiti-client";

export default function PreferitiBadge() {
  const count = usePreferiti().length;

  return (
    <>
      {count > 0 && (
        <span
          key={count}
          aria-hidden="true"
          className="animate-pop absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-coral-ink px-1 font-display text-[11px] font-bold leading-none text-white shadow-coral ring-2 ring-background"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
      <span className="sr-only" aria-live="polite">
        {count === 0
          ? "Nessun preferito"
          : `${count} ${count === 1 ? "preferito" : "preferiti"}`}
      </span>
    </>
  );
}
