"use client";

// Pannello ordini del gestore: filtro per stato + azioni (conferma / rifiuta /
// segna pagato) + link di pagamento da condividere col cliente. Lo stato si
// aggiorna in locale dopo ogni azione (le action revalidano anche il server).

import { useMemo, useState, useTransition } from "react";

import {
  confermaOrdineAction,
  annullaOrdineAction,
  segnaPagatoOrdineAction,
  type EsitoOrdine,
} from "@/lib/gestore/ordini-actions";
import { useToast } from "@/components/gestore/Toaster";
import { formatPrezzo } from "@/lib/format";
import type { StatoOrdine } from "@/lib/types";

interface RigaOrdine {
  nome_prodotto: string;
  taglia: string | null;
  colore: string | null;
  prezzo_cents: number;
  quantita: number;
}

export interface OrdineGestore {
  id: string;
  stato: StatoOrdine;
  totale_cents: number;
  costo_spedizione_cents: number | null;
  nome: string | null;
  email: string | null;
  telefono: string | null;
  note: string | null;
  token: string | null;
  confermato_il: string | null;
  creato_il: string;
  ordine_righe: RigaOrdine[] | null;
}

/** Converte un importo in euro digitato (es. "5,90" o "5.90") in centesimi. */
function euroToCents(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(",", ".").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

type Filtro = "in_attesa" | "confermato" | "pagato" | "annullato" | "tutti";

const FILTRI: { key: Filtro; label: string }[] = [
  { key: "in_attesa", label: "Da confermare" },
  { key: "confermato", label: "Confermati" },
  { key: "pagato", label: "Pagati" },
  { key: "annullato", label: "Annullati" },
  { key: "tutti", label: "Tutti" },
];

const CHIP: Record<StatoOrdine, { label: string; cls: string }> = {
  in_attesa: { label: "Da confermare", cls: "bg-sun/30 text-[#8a6500]" },
  confermato: { label: "Da pagare", cls: "bg-lagoon/15 text-sea" },
  pagato: { label: "Pagato", cls: "bg-sea/15 text-sea" },
  annullato: { label: "Annullato", cls: "bg-coral/15 text-coral" },
};

function dataIt(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ListaOrdini({ ordini }: { ordini: OrdineGestore[] }) {
  const { mostra } = useToast();
  const [lista, setLista] = useState<OrdineGestore[]>(ordini);
  const [filtro, setFiltro] = useState<Filtro>("in_attesa");
  const [pending, startTransition] = useTransition();
  // Costo spedizione (in euro, come digitato) per ordine in conferma. Default
  // 5,90 = tariffa Italia continentale; il gestore lo regola caso per caso.
  const [sped, setSped] = useState<Record<string, string>>({});
  const valoreSped = (id: string) => sped[id] ?? "5,90";

  const conteggi = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of lista) c[o.stato] = (c[o.stato] ?? 0) + 1;
    return c;
  }, [lista]);

  const visibili = useMemo(
    () => (filtro === "tutti" ? lista : lista.filter((o) => o.stato === filtro)),
    [lista, filtro],
  );

  function esegui(
    id: string,
    azione: (id: string) => Promise<EsitoOrdine>,
    nuovoStato: StatoOrdine,
    successo: string,
  ) {
    startTransition(async () => {
      const esito = await azione(id);
      if (!esito.ok) {
        mostra(esito.error ?? "Operazione non riuscita.", "errore");
        return;
      }
      setLista((l) =>
        l.map((o) => (o.id === id ? { ...o, stato: nuovoStato } : o)),
      );
      mostra(successo, "ok");
    });
  }

  function confermaConSpedizione(o: OrdineGestore) {
    const cents = euroToCents(valoreSped(o.id));
    if (cents === null || cents > 10_000) {
      mostra("Inserisci un costo di spedizione valido (0–100 €).", "errore");
      return;
    }
    startTransition(async () => {
      const esito = await confermaOrdineAction(o.id, cents);
      if (!esito.ok) {
        mostra(esito.error ?? "Operazione non riuscita.", "errore");
        return;
      }
      const merce = (o.ordine_righe ?? []).reduce(
        (acc, r) => acc + r.prezzo_cents * r.quantita,
        0,
      );
      setLista((l) =>
        l.map((x) =>
          x.id === o.id
            ? {
                ...x,
                stato: "confermato",
                costo_spedizione_cents: cents,
                totale_cents: merce + cents,
              }
            : x,
        ),
      );
      mostra("Disponibilità confermata.", "ok");
    });
  }

  async function copiaLink(token: string) {
    const url = `${window.location.origin}/ordine/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      mostra("Link di pagamento copiato.", "ok");
    } catch {
      mostra(url, "ok");
    }
  }

  return (
    <div className="mx-auto max-w-3xl lg:max-w-5xl">
      <div className="mb-5">
        <span className="inline-flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-lagoon">
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
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
          </svg>
          Richieste
        </span>
        <h1 className="font-display text-2xl font-extrabold text-foreground">
          Ordini
        </h1>
      </div>

      {/* Filtri */}
      <div className="mb-4 flex flex-wrap gap-1 rounded-full bg-surface-2 p-1 text-sm lg:w-fit">
        {FILTRI.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filtro === f.key}
            onClick={() => setFiltro(f.key)}
            className={[
              "flex-1 whitespace-nowrap rounded-full px-3 py-2 font-display font-bold transition-all lg:flex-none lg:px-5",
              filtro === f.key
                ? "bg-sea text-white shadow-sea"
                : "text-muted hover:text-foreground",
            ].join(" ")}
          >
            {f.label}
            {f.key !== "tutti" && conteggi[f.key] ? (
              <span className="ml-1.5 rounded-full bg-white/25 px-1.5 text-xs">
                {conteggi[f.key]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {visibili.length === 0 ? (
        <div className="rounded-3xl bg-surface px-6 py-12 text-center ring-1 ring-dashed ring-line">
          <p className="text-sm text-muted">Nessun ordine in questa vista.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {visibili.map((o) => {
            const righe = o.ordine_righe ?? [];
            const chip = CHIP[o.stato];
            return (
              <li
                key={o.id}
                className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-line lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-6"
              >
                {/* Zona sinistra: cliente, righe articoli, nota */}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-display text-sm font-bold text-foreground">
                        {o.nome ?? "Cliente"}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {o.email}
                        {o.telefono ? ` · ${o.telefono}` : ""}
                      </p>
                      <p className="text-xs text-muted">{dataIt(o.creato_il)}</p>
                    </div>
                    {/* Chip duplicato: qui sotto lg, nel rail a destra da lg in su */}
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold lg:hidden ${chip.cls}`}
                    >
                      {chip.label}
                    </span>
                  </div>

                  <ul className="mt-3 space-y-1 border-t border-line pt-3">
                    {righe.map((r, i) => {
                      const det = [
                        r.colore,
                        r.taglia ? `T. ${r.taglia}` : null,
                      ].filter(Boolean);
                      return (
                        <li
                          key={i}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <span className="min-w-0 truncate text-foreground">
                            {r.quantita}× {r.nome_prodotto}
                            {det.length > 0 && (
                              <span className="text-muted">
                                {" "}
                                ({det.join(", ")})
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted">
                            {formatPrezzo(r.prezzo_cents * r.quantita)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  {o.note && (
                    <p className="mt-2 rounded-xl bg-surface px-3 py-2 text-xs text-muted">
                      Nota: {o.note}
                    </p>
                  )}
                </div>

                {/* Footer mobile; da lg diventa il rail destro (chip, totale, azioni in basso) */}
                <div className="mt-3 flex items-center justify-between lg:mt-0 lg:flex-col lg:items-end lg:gap-3">
                  <span
                    className={`hidden rounded-full px-2.5 py-1 text-xs font-bold lg:inline-flex ${chip.cls}`}
                  >
                    {chip.label}
                  </span>

                  <div className="flex flex-col lg:items-end lg:text-right">
                    <span className="font-display text-sm font-bold tabular-nums text-sea">
                      {formatPrezzo(o.totale_cents)}
                    </span>
                    {o.costo_spedizione_cents != null && (
                      <span className="text-[11px] text-muted">
                        {o.costo_spedizione_cents > 0
                          ? `incl. spedizione ${formatPrezzo(o.costo_spedizione_cents)}`
                          : "spedizione gratuita"}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 lg:mt-auto lg:w-full lg:flex-col lg:items-end">
                    {o.stato === "in_attesa" && (
                      <>
                        <label className="inline-flex items-center gap-1.5 text-xs font-bold text-muted lg:w-full lg:justify-between">
                          Spedizione €
                          <input
                            type="text"
                            inputMode="decimal"
                            value={valoreSped(o.id)}
                            onChange={(e) =>
                              setSped((s) => ({ ...s, [o.id]: e.target.value }))
                            }
                            disabled={pending}
                            aria-label="Costo spedizione in euro"
                            className="w-16 rounded-full border border-line bg-white px-3 py-1.5 text-right tabular-nums text-foreground focus:border-sea focus:outline-none disabled:opacity-50"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            esegui(
                              o.id,
                              annullaOrdineAction,
                              "annullato",
                              "Ordine rifiutato.",
                            )
                          }
                          className="rounded-full px-3 py-2 text-xs font-bold text-coral transition-colors hover:bg-coral/10 disabled:opacity-50"
                        >
                          Rifiuta
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => confermaConSpedizione(o)}
                          className="rounded-full bg-sea px-4 py-2 text-xs font-bold text-white shadow-sea transition-all hover:-translate-y-0.5 disabled:opacity-50 lg:w-full"
                        >
                          Conferma disponibilità
                        </button>
                      </>
                    )}

                    {o.stato === "confermato" && (
                      <>
                        {o.token && (
                          <button
                            type="button"
                            onClick={() => copiaLink(o.token as string)}
                            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold text-sea ring-1 ring-line transition-colors hover:bg-surface lg:w-full lg:justify-center"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            >
                              <rect x="9" y="9" width="11" height="11" rx="2" />
                              <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                            </svg>
                            Copia link pagamento
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            esegui(
                              o.id,
                              segnaPagatoOrdineAction,
                              "pagato",
                              "Segnato come pagato.",
                            )
                          }
                          className="rounded-full bg-sea px-4 py-2 text-xs font-bold text-white shadow-sea transition-all hover:-translate-y-0.5 disabled:opacity-50 lg:w-full"
                        >
                          Segna pagato
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
