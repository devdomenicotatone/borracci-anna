"use client";

// Select gerarchico delle categorie (macro > figlie), condiviso dai flussi di
// import. Stessa resa del campo categoria di FormProdotto: optgroup per macro,
// voce "(tutto)" per assegnare la macro stessa.

import { useMemo } from "react";

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
  // Gerarchia a 2 livelli: macro (senza parent) con le loro figlie.
  const gruppi = useMemo(() => {
    const radici = categorie
      .filter((c) => !c.parent_id)
      .sort((a, b) => a.ordine - b.ordine || a.id.localeCompare(b.id));
    return radici.map((radice) => ({
      radice,
      figli: categorie
        .filter((c) => c.parent_id === radice.id)
        .sort((a, b) => a.ordine - b.ordine || a.id.localeCompare(b.id)),
    }));
  }, [categorie]);

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
        {gruppi.map(({ radice, figli }) =>
          figli.length === 0 ? (
            <option key={radice.id} value={radice.id}>
              {radice.nome}
            </option>
          ) : (
            <optgroup key={radice.id} label={radice.nome}>
              <option value={radice.id}>{radice.nome} (tutto)</option>
              {figli.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </optgroup>
          ),
        )}
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
