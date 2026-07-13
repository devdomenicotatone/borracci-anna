"use client";

// Cuoricino "salva nei preferiti": bottone tondo riusato dalla card in griglia
// e dalla scheda prodotto. Stato letto/scritto nello store localStorage (vedi
// lib/preferiti-client): pieno corallo = salvato. Dentro la card vive sopra un
// <Link>: preventDefault/stopPropagation cosi il tap non apre la scheda.
// Visivamente 36px, ma con area di tocco 44px (before invisibile, come
// QuickAddTaglie): -inset-1 e non di più, per non coprire il Link della card.
// Il before richiede un bottone posizionato: absolute nella card (via
// className), relative nella PDP.

import { togglePreferito, usePreferiti } from "@/lib/preferiti-client";

export default function CuorePreferito({
  prodottoId,
  nome,
  className = "",
}: {
  prodottoId: string;
  nome: string;
  /** Classi extra per il posizionamento (es. assoluto dentro la card). */
  className?: string;
}) {
  const preferiti = usePreferiti();
  const attivo = preferiti.includes(prodottoId);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePreferito(prodottoId);
      }}
      aria-pressed={attivo}
      aria-label={
        attivo ? `Togli ${nome} dai preferiti` : `Salva ${nome} nei preferiti`
      }
      title={attivo ? "Togli dai preferiti" : "Salva nei preferiti"}
      className={[
        "grid h-9 w-9 place-items-center rounded-full bg-white/90 shadow-soft ring-1 ring-line backdrop-blur transition-transform before:absolute before:-inset-1 before:content-[''] hover:scale-110",
        attivo ? "text-coral" : "text-foreground/70",
        className,
      ].join(" ")}
    >
      {/* key = stato: rimonta l'icona a ogni toggle cosi il "pop" si ripete. */}
      <svg
        key={attivo ? "pieno" : "vuoto"}
        viewBox="0 0 24 24"
        fill={attivo ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-[18px] w-[18px] ${attivo ? "animate-pop" : ""}`}
        aria-hidden="true"
      >
        <path d="M12 20.7S4.6 16 2.8 11.6C1.5 8.6 3.2 5.3 6.4 4.9c2-.3 3.8.7 4.7 2.2h1.8c.9-1.5 2.7-2.5 4.7-2.2 3.2.4 4.9 3.7 3.6 6.7C19.4 16 12 20.7 12 20.7Z" />
      </svg>
    </button>
  );
}
