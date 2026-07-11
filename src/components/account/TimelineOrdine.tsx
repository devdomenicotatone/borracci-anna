// Mini-timeline degli stati del flusso richiesta: Richiesta → Confermato →
// Pagato. Per gli annullati una riga singola; per gli ordini nati gia pagati
// (acquisto diretto) NON va montata (la decide il chiamante).

import type { StatoOrdine } from "@/lib/types";

const PASSI = ["Richiesta", "Confermato", "Pagato"] as const;

function indicePasso(stato: StatoOrdine): number {
  switch (stato) {
    case "in_attesa":
      return 0;
    case "confermato":
      return 1;
    case "pagato":
      return 2;
    default:
      return -1;
  }
}

export default function TimelineOrdine({ stato }: { stato: StatoOrdine }) {
  if (stato === "annullato") {
    return (
      <p className="text-sm font-medium text-coral-ink">
        Richiesta annullata.
      </p>
    );
  }
  const corrente = indicePasso(stato);

  return (
    <ol className="flex items-center gap-0" aria-label="Avanzamento ordine">
      {PASSI.map((passo, i) => {
        const completato = i < corrente;
        const attivo = i === corrente;
        return (
          <li
            key={passo}
            aria-current={attivo ? "step" : undefined}
            className="flex items-center"
          >
            {i > 0 && (
              <span
                aria-hidden="true"
                className={`h-0.5 w-8 sm:w-12 ${completato || attivo ? "bg-sea" : "bg-line"}`}
              />
            )}
            <span className="flex items-center gap-1.5 px-1.5">
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 rounded-full ${
                  completato
                    ? "bg-sea"
                    : attivo
                      ? "animate-pop bg-lagoon"
                      : "bg-line"
                }`}
              />
              <span
                className={`text-xs font-bold ${
                  completato || attivo ? "text-foreground" : "text-muted"
                }`}
              >
                {passo}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
