// Guscio comune delle pagine legali (condizioni, recesso, privacy): hero
// compatto nello stile della vetrina + colonna di lettura stretta. Server
// Component puro; i testi vivono nelle rispettive route.

import type { ReactNode } from "react";

/** Classe canonica dei link testuali dentro i testi legali. */
export const linkLegale =
  "font-semibold text-sea underline-offset-2 transition-colors hover:text-lagoon hover:underline";

export function PaginaLegale({
  occhiello,
  titolo,
  sottotitolo,
  aggiornata,
  children,
}: {
  /** Etichetta della pill nell'hero (es. "Documenti legali"). */
  occhiello: string;
  titolo: string;
  sottotitolo: string;
  /** Data leggibile dell'ultimo aggiornamento (es. "21 luglio 2026"). */
  aggiornata: string;
  children: ReactNode;
}) {
  return (
    // <div>, non <main>: il layout vetrina fornisce gia il landmark
    // <main id="contenuto"> e annidarne un secondo e markup non valido
    // (stessa convenzione di GuscioAuth).
    <div>
      {/* ===== Hero compatto (stesso linguaggio di /vieni-a-trovarci) ===== */}
      <section className="bg-sea-gradient relative isolate overflow-hidden text-white">
        <span
          aria-hidden="true"
          className="dots-overlay absolute inset-0 -z-10 opacity-50 [-webkit-mask-image:linear-gradient(180deg,#000_0%,transparent_70%)] [mask-image:linear-gradient(180deg,#000_0%,transparent_70%)]"
        />
        <div className="mx-auto max-w-3xl px-5 pb-16 pt-10 sm:pb-20 sm:pt-14">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-medium ring-1 ring-white/35 backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-sun shadow-[0_0_0_4px_rgba(255,210,63,.35)]" />
            {occhiello}
          </span>
          <h1 className="mt-4 font-display text-[clamp(1.8rem,6vw,2.8rem)] font-extrabold leading-[1.08] [text-shadow:0_6px_24px_rgba(0,57,99,.35)]">
            {titolo}
          </h1>
          <p className="mt-3 max-w-[52ch] text-base text-white/95">
            {sottotitolo}
          </p>
          <p className="mt-3 text-sm text-white/80">
            Ultimo aggiornamento: {aggiornata}
          </p>
        </div>

        {/* Onda bianca in fondo all'hero. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -bottom-px leading-[0]"
        >
          <svg
            viewBox="0 0 1440 120"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
            className="block h-auto w-full"
          >
            <path
              fill="var(--background)"
              d="M0,64 C180,110 360,110 540,80 C720,50 900,8 1080,16 C1260,24 1380,72 1440,88 L1440,120 L0,120 Z"
            />
          </svg>
        </div>
      </section>

      {/* ===== Corpo: colonna di lettura ===== */}
      <section className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <div className="space-y-9 text-[15px] leading-relaxed text-foreground/85 sm:text-base">
          {children}
        </div>
      </section>
    </div>
  );
}

export function SezioneLegale({
  titolo,
  children,
}: {
  titolo: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-extrabold text-foreground sm:text-2xl">
        {titolo}
      </h2>
      {children}
    </section>
  );
}
