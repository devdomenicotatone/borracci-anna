"use client";

// Bottone flottante "torna su" del catalogo: con lo scorrimento infinito
// (~1800 prodotti) ricerca, filtri e ordinamento restano in cima e non c'era
// alcun modo rapido di risalire. Compare dopo ~2 viewport di scroll.
// Il listener aggiorna un booleano che cambia due volte in tutto lo scroll:
// React scarta i setState identici, non serve throttling.

import { useEffect, useState } from "react";

export default function TornaSu() {
  const [visibile, setVisibile] = useState(false);

  useEffect(() => {
    const aggiorna = () => {
      setVisibile(window.scrollY > window.innerHeight * 2);
    };
    // Stato iniziale: la pagina puo montare gia scrollata (back del browser
    // con ripristino della posizione).
    aggiorna();
    window.addEventListener("scroll", aggiorna, { passive: true });
    return () => {
      window.removeEventListener("scroll", aggiorna);
    };
  }, []);

  if (!visibile) return null;

  function tornaSu() {
    // Rispetta chi preferisce meno movimento: salto secco invece dell'animazione.
    const riduci = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: riduci ? "auto" : "smooth" });
  }

  return (
    // z-30: sopra la griglia, sotto i drawer (z-50) il cui overlay lo copre.
    // Il bottom compensa la safe-area (viewportFit cover, pattern del repo).
    <button
      type="button"
      onClick={tornaSu}
      aria-label="Torna all'inizio"
      className="animate-fade-in fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-30 grid h-12 w-12 place-items-center rounded-full bg-sea text-white shadow-sea transition-transform hover:-translate-y-0.5"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden="true"
      >
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
    </button>
  );
}
