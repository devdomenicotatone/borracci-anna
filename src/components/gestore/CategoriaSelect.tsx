"use client";

// Select gerarchico delle categorie (macro > figlie > nipoti), condiviso dai
// flussi di import. Stessa resa del campo categoria di FormProdotto: optgroup
// per macro, voce "(tutto)" per assegnare la categoria di raggruppamento.

import { useMemo } from "react";

import { gruppiCategorie } from "@/lib/categorie-albero";
import OpzioniCategorie from "@/components/gestore/OpzioniCategorie";
import type { Categoria } from "@/lib/types";

export default function CategoriaSelect({
  id,
  categorie,
  value,
  onChange,
  disabled,
}: {
  id: string;
  categorie: Categoria[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  // Gerarchia a 3 livelli: macro (senza parent) con figlie e nipoti.
  const gruppi = useMemo(() => gruppiCategorie(categorie), [categorie]);

  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-12 w-full appearance-none rounded-2xl bg-white px-4 pr-9 text-base text-foreground ring-1 ring-line outline-none transition-shadow disabled:opacity-50"
      >
        <option value="">Nessuna categoria</option>
        <OpzioniCategorie gruppi={gruppi} />
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-muted">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </div>
  );
}
