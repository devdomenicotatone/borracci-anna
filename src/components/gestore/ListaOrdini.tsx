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
import ConfermaDialog from "@/components/gestore/ConfermaDialog";
import { useToast } from "@/components/gestore/Toaster";
import { formatPrezzo } from "@/lib/format";
import { statoSpedizione } from "@/lib/spedizione";
import type { StatoOrdine } from "@/lib/types";

interface RigaOrdine {
  id: string;
  nome_prodotto: string;
  taglia: string | null;
  colore: string | null;
  prezzo_cents: number;
  quantita: number;
  immagine_url: string | null;
  rimossa_il: string | null;
  rimossa_motivo: string | null;
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

// Motivi preset per una riga non disponibile (contratto condiviso).
const MOTIVI_PRESET = [
  "Taglia esaurita",
  "Colore esaurito",
  "Prodotto esaurito",
  "Altro",
] as const;

/** Bozza client-side di rimozione riga: preset scelto + testo libero se "Altro". */
interface RimozioneDraft {
  preset: string;
  altro: string;
}

/** Motivo effettivo da inviare: preset, o testo libero (cap 200), mai vuoto. */
function motivoDaDraft(d: RimozioneDraft): string {
  const testo = d.preset === "Altro" ? d.altro.trim().slice(0, 200) : d.preset;
  return testo || "Non disponibile";
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
  annullato: { label: "Annullato", cls: "bg-coral/15 text-coral-ink" },
};

function dataIt(iso: string): string {
  // timeZone fissa: senza, l'output dipende dal fuso del runtime (server UTC vs
  // browser CEST) e la stringa renderizzata in SSR differisce da quella del
  // client -> hydration mismatch. Fissando Europe/Rome e' deterministica e
  // mostra l'ora locale corretta.
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  });
}

export default function ListaOrdini({ ordini }: { ordini: OrdineGestore[] }) {
  const { mostra } = useToast();
  const [lista, setLista] = useState<OrdineGestore[]>(ordini);
  const [filtro, setFiltro] = useState<Filtro>("in_attesa");
  const [pending, startTransition] = useTransition();
  // Costo spedizione (in euro, come digitato) per ordine in conferma. Il default
  // rispetta la soglia di spedizione gratuita promessa nel carrello: 0 se la
  // merce la supera, altrimenti 5,90 (tariffa Italia continentale). Il gestore
  // lo regola comunque caso per caso.
  const [sped, setSped] = useState<Record<string, string>>({});
  const merceAttivaCents = (o: OrdineGestore) =>
    (o.ordine_righe ?? []).reduce(
      (acc, r) => (r.rimossa_il ? acc : acc + r.prezzo_cents * r.quantita),
      0,
    );
  const spedDefault = (o: OrdineGestore) =>
    statoSpedizione(merceAttivaCents(o)).raggiunta ? "0,00" : "5,90";
  const valoreSped = (o: OrdineGestore) => sped[o.id] ?? spedDefault(o);
  // Rimozioni in bozza per la conferma parziale: solo client-side fino al
  // submit, indicizzate per ordine e poi per riga.
  const [rimozioni, setRimozioni] = useState<
    Record<string, Record<string, RimozioneDraft>>
  >({});
  // Ordine per cui è aperto il dialog di conferma parziale.
  const [dialogoId, setDialogoId] = useState<string | null>(null);
  // Ordine per cui è aperto il dialog di conferma del rifiuto (azione distruttiva).
  const [rifiutaId, setRifiutaId] = useState<string | null>(null);

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

  /** Attiva/disattiva la rimozione di una riga (bozza locale). */
  function toggleRimozione(ordineId: string, rigaId: string) {
    setRimozioni((s) => {
      const perOrdine = { ...(s[ordineId] ?? {}) };
      if (perOrdine[rigaId]) delete perOrdine[rigaId];
      else perOrdine[rigaId] = { preset: MOTIVI_PRESET[0], altro: "" };
      return { ...s, [ordineId]: perOrdine };
    });
  }

  function aggiornaRimozione(
    ordineId: string,
    rigaId: string,
    patch: Partial<RimozioneDraft>,
  ) {
    setRimozioni((s) => {
      const bozza = s[ordineId]?.[rigaId];
      if (!bozza) return s;
      return {
        ...s,
        [ordineId]: { ...s[ordineId], [rigaId]: { ...bozza, ...patch } },
      };
    });
  }

  /** Valida la spedizione e, se ci sono rimozioni, chiede conferma via dialog. */
  function avviaConferma(o: OrdineGestore) {
    const cents = euroToCents(valoreSped(o));
    if (cents === null || cents > 10_000) {
      mostra("Inserisci un costo di spedizione valido (0–100 €).", "errore");
      return;
    }
    const bozze = rimozioni[o.id] ?? {};
    const righe = o.ordine_righe ?? [];
    const numRimosse = righe.filter((r) => bozze[r.id]).length;
    // Tutte rimosse: il bottone è già disabilitato, guardia difensiva.
    if (righe.length > 0 && numRimosse === righe.length) return;
    if (numRimosse > 0) {
      setDialogoId(o.id);
      return;
    }
    inviaConferma(o);
  }

  function inviaConferma(o: OrdineGestore) {
    const cents = euroToCents(valoreSped(o));
    if (cents === null || cents > 10_000) {
      mostra("Inserisci un costo di spedizione valido (0–100 €).", "errore");
      return;
    }
    const bozze = rimozioni[o.id] ?? {};
    const righe = o.ordine_righe ?? [];
    const daRimuovere = righe
      .filter((r) => bozze[r.id])
      .map((r) => ({ rigaId: r.id, motivo: motivoDaDraft(bozze[r.id]) }));
    startTransition(async () => {
      const esito = await confermaOrdineAction(o.id, cents, daRimuovere);
      if (!esito.ok) {
        mostra(esito.error ?? "Operazione non riuscita.", "errore");
        return;
      }
      const motivi = new Map(daRimuovere.map((p) => [p.rigaId, p.motivo]));
      const adesso = new Date().toISOString();
      const merce = righe.reduce(
        (acc, r) =>
          motivi.has(r.id) ? acc : acc + r.prezzo_cents * r.quantita,
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
                ordine_righe: (x.ordine_righe ?? []).map((r) =>
                  motivi.has(r.id)
                    ? {
                        ...r,
                        rimossa_il: adesso,
                        rimossa_motivo: motivi.get(r.id) ?? "Non disponibile",
                      }
                    : r,
                ),
              }
            : x,
        ),
      );
      setRimozioni((s) => {
        const copia = { ...s };
        delete copia[o.id];
        return copia;
      });
      setDialogoId(null);
      mostra(
        daRimuovere.length > 0
          ? "Disponibilità confermata (parziale)."
          : "Disponibilità confermata.",
        "ok",
      );
    });
  }

  // Ordine target del dialog di conferma parziale e conteggio rimozioni.
  const ordineDialogo = lista.find((x) => x.id === dialogoId) ?? null;
  const numRimosseDialogo = ordineDialogo
    ? (ordineDialogo.ordine_righe ?? []).filter(
        (r) => (rimozioni[ordineDialogo.id] ?? {})[r.id],
      ).length
    : 0;

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
        <span className="inline-flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-sea">
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

      {/* Filtri: su mobile fila scrollabile (niente a-capo dentro il rounded-full),
          da lg torna larghezza contenuto senza scroll. -mx/px per il bleed ai bordi. */}
      <div className="-mx-4 mb-4 flex flex-nowrap gap-1 overflow-x-auto rounded-full bg-surface-2 px-4 py-1 text-sm lg:mx-0 lg:w-fit lg:flex-wrap lg:px-1">
        {FILTRI.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filtro === f.key}
            onClick={() => setFiltro(f.key)}
            className={[
              "shrink-0 whitespace-nowrap rounded-full px-3 py-2 font-display font-bold transition-all lg:px-5",
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
            // Bozze di rimozione (solo per ordini in attesa) e totale live.
            const bozze = o.stato === "in_attesa" ? (rimozioni[o.id] ?? {}) : {};
            const numRimosse = righe.filter((r) => bozze[r.id]).length;
            const numAttive = righe.length - numRimosse;
            const tutteRimosse = righe.length > 0 && numAttive === 0;
            const parziale = numRimosse > 0 && !tutteRimosse;
            const totaleMostrato =
              o.stato === "in_attesa"
                ? righe.reduce(
                    (acc, r) =>
                      bozze[r.id] ? acc : acc + r.prezzo_cents * r.quantita,
                    0,
                  ) + (euroToCents(valoreSped(o)) ?? 0)
                : o.totale_cents;
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

                  <ul className="mt-3 space-y-2 border-t border-line pt-3">
                    {righe.map((r) => {
                      const det = [
                        r.colore,
                        r.taglia ? `T. ${r.taglia}` : null,
                      ].filter(Boolean);
                      // In attesa la rimozione è la bozza locale; negli altri
                      // stati fa fede lo snapshot a DB (sola lettura).
                      const bozza = bozze[r.id];
                      const rimossa =
                        o.stato === "in_attesa" ? Boolean(bozza) : r.rimossa_il != null;
                      return (
                        <li key={r.id} className="flex items-center gap-3 text-sm">
                          <MiniaturaRiga url={r.immagine_url} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <span
                                className={[
                                  "min-w-0 truncate text-foreground",
                                  rimossa ? "line-through opacity-60" : "",
                                ].join(" ")}
                              >
                                {r.quantita}× {r.nome_prodotto}
                                {det.length > 0 && (
                                  <span className="text-muted">
                                    {" "}
                                    ({det.join(", ")})
                                  </span>
                                )}
                              </span>
                              <span
                                className={[
                                  "shrink-0 tabular-nums text-muted",
                                  rimossa ? "line-through opacity-60" : "",
                                ].join(" ")}
                              >
                                {formatPrezzo(r.prezzo_cents * r.quantita)}
                              </span>
                            </div>

                            {/* Motivo a DB, sola lettura (confermato/pagato/annullato) */}
                            {o.stato !== "in_attesa" && rimossa && (
                              <p className="text-xs text-coral-ink">
                                {r.rimossa_motivo ?? "Non disponibile"}
                              </p>
                            )}

                            {/* Conferma parziale: toggle + motivo (bozza locale) */}
                            {o.stato === "in_attesa" &&
                              (bozza ? (
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <select
                                    value={bozza.preset}
                                    onChange={(e) =>
                                      aggiornaRimozione(o.id, r.id, {
                                        preset: e.target.value,
                                      })
                                    }
                                    disabled={pending}
                                    aria-label="Motivo non disponibilità"
                                    className="rounded-full border border-line bg-white px-2.5 py-1 text-xs text-foreground focus:border-sea focus:outline-none disabled:opacity-50"
                                  >
                                    {MOTIVI_PRESET.map((m) => (
                                      <option key={m} value={m}>
                                        {m}
                                      </option>
                                    ))}
                                  </select>
                                  {bozza.preset === "Altro" && (
                                    <input
                                      type="text"
                                      value={bozza.altro}
                                      maxLength={200}
                                      placeholder="Motivo"
                                      onChange={(e) =>
                                        aggiornaRimozione(o.id, r.id, {
                                          altro: e.target.value,
                                        })
                                      }
                                      disabled={pending}
                                      aria-label="Motivo personalizzato"
                                      className="w-36 rounded-full border border-line bg-white px-2.5 py-1 text-xs text-foreground focus:border-sea focus:outline-none disabled:opacity-50"
                                    />
                                  )}
                                  <button
                                    type="button"
                                    disabled={pending}
                                    onClick={() => toggleRimozione(o.id, r.id)}
                                    className="rounded-full px-2 py-1 text-xs font-bold text-sea transition-colors hover:bg-sea/10 disabled:opacity-50"
                                  >
                                    Ripristina
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() => toggleRimozione(o.id, r.id)}
                                  className="-ml-2 rounded-full px-2 py-1 text-xs font-bold text-coral-ink transition-colors hover:bg-coral/10 disabled:opacity-50"
                                >
                                  Non disponibile
                                </button>
                              ))}
                          </div>
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
                      {formatPrezzo(totaleMostrato)}
                    </span>
                    {parziale && (
                      <span className="text-[11px] text-muted">
                        {numAttive} di {righe.length} articoli
                      </span>
                    )}
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
                            value={valoreSped(o)}
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
                          onClick={() => setRifiutaId(o.id)}
                          className="rounded-full px-3 py-2 text-xs font-bold text-coral-ink transition-colors hover:bg-coral/10 disabled:opacity-50"
                        >
                          Rifiuta
                        </button>
                        <button
                          type="button"
                          disabled={pending || tutteRimosse}
                          onClick={() => avviaConferma(o)}
                          className="rounded-full bg-sea px-4 py-2 text-xs font-bold text-white shadow-sea transition-all hover:-translate-y-0.5 disabled:opacity-50 lg:w-full"
                        >
                          {parziale
                            ? `Conferma parziale (${numAttive} di ${righe.length})`
                            : "Conferma disponibilità"}
                        </button>
                        {tutteRimosse && (
                          <p className="w-full text-right text-[11px] font-bold text-coral-ink">
                            Nessun articolo disponibile: usa Rifiuta.
                          </p>
                        )}
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

      {/* Conferma parziale: dialog prima del submit con rimozioni */}
      {ordineDialogo && (
        <ConfermaDialog
          aperto
          titolo="Conferma parziale"
          messaggio={
            numRimosseDialogo === 1
              ? "Confermi senza 1 articolo? Il cliente lo vedrà sbarrato col motivo e non lo pagherà."
              : `Confermi senza ${numRimosseDialogo} articoli? Il cliente li vedrà sbarrati col motivo e non li pagherà.`
          }
          etichettaConferma="Conferma"
          inCorso={pending}
          onConferma={() => inviaConferma(ordineDialogo)}
          onAnnulla={() => setDialogoId(null)}
        />
      )}

      {/* Rifiuto ordine: conferma prima di annullare (azione non reversibile) */}
      {rifiutaId && (
        <ConfermaDialog
          aperto
          titolo="Rifiutare la richiesta?"
          messaggio="L'ordine verrà annullato: il cliente vedrà lo stato «annullato» e non potrà più pagarlo. L'azione non è reversibile."
          etichettaConferma="Rifiuta ordine"
          inCorso={pending}
          onConferma={() => {
            const id = rifiutaId;
            setRifiutaId(null);
            esegui(id, annullaOrdineAction, "annullato", "Ordine rifiutato.");
          }}
          onAnnulla={() => setRifiutaId(null)}
        />
      )}
    </div>
  );
}

/** Miniatura della riga d'ordine: snapshot foto o tile con icona maglietta. */
function MiniaturaRiga({ url }: { url: string | null }) {
  const cls =
    "h-10 w-10 shrink-0 rounded-lg ring-1 ring-line lg:h-12 lg:w-12";
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- snapshot da Storage
      <img
        src={url}
        alt=""
        loading="lazy"
        className={`${cls} bg-surface object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${cls} tile-cyan grid place-items-center text-white`}
    >
      <svg viewBox="0 0 100 100" fill="currentColor" className="w-1/2">
        <path d="M32 18 L18 28 L24 40 L31 35 L31 84 L69 84 L69 35 L76 40 L82 28 L68 18 C64 24 56 26 50 26 C44 26 36 24 32 18 Z" />
      </svg>
    </span>
  );
}
