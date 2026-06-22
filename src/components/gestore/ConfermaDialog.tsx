"use client";

// Dialog di conferma per azioni distruttive (elimina prodotto, rimuovi foto).
// Componente controllato: la visibilita e gestita dal chiamante via `aperto`.

export default function ConfermaDialog({
  aperto,
  titolo,
  messaggio,
  etichettaConferma = "Elimina",
  inCorso = false,
  onConferma,
  onAnnulla,
}: {
  aperto: boolean;
  titolo: string;
  messaggio: string;
  etichettaConferma?: string;
  inCorso?: boolean;
  onConferma: () => void;
  onAnnulla: () => void;
}) {
  if (!aperto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 sm:items-center"
      onClick={onAnnulla}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titolo}
        className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-foreground">{titolo}</h2>
        <p className="mt-1.5 text-sm text-muted">{messaggio}</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onAnnulla}
            disabled={inCorso}
            className="h-11 flex-1 rounded-full border border-line text-sm font-medium text-foreground transition-colors hover:bg-background disabled:opacity-50"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={onConferma}
            disabled={inCorso}
            className="h-11 flex-1 rounded-full bg-red-700 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:opacity-50"
          >
            {inCorso ? "Attendi…" : etichettaConferma}
          </button>
        </div>
      </div>
    </div>
  );
}
