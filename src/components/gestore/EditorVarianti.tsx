"use client";

// Editor varianti per colore × taglia.
// Il gestore SCEGLIE i colori (palette a campioni) e le taglie (scala S–6XL):
// la griglia di varianti (colore × taglia) viene generata in automatico, con
// SKU dedotto da baseSku (codice prodotto o slug) + colore + taglia. Il
// salvataggio fa il diff lato server,
// preservando id e giacenze delle combinazioni gia esistenti.
// In modalita "Scrivici per la disponibilita" le giacenze non si gestiscono
// (magazzino non in tempo reale): si configurano solo le opzioni disponibili.

import { useMemo, useState, useTransition } from "react";

import {
  salvaVariantiAction,
  type VarianteSalvata,
} from "@/lib/gestore/actions";
import { useToast } from "@/components/gestore/Toaster";
import ConfermaDialog from "@/components/gestore/ConfermaDialog";
import {
  COLORI,
  TAGLIE,
  coloreChiaro,
  coloreHex,
  ordinaTaglie,
  skuVariante,
} from "@/lib/catalogo";
import type { VarianteInput } from "@/lib/types";

/** Chiave stabile di una combinazione colore|taglia (vuoto = null). */
function comboKey(colore: string | null, taglia: string | null): string {
  return `${colore ?? ""}|${taglia ?? ""}`;
}

interface Esistente {
  id: string;
  stock: number;
}

export default function EditorVarianti({
  prodottoId,
  baseSku,
  varianti,
  suRichiesta,
}: {
  prodottoId: string;
  baseSku: string;
  varianti: VarianteSalvata[];
  suRichiesta: boolean;
}) {
  const { mostra } = useToast();
  const [pending, startTransition] = useTransition();

  // Stato selezione, derivato dalle varianti gia a DB.
  const [colori, setColori] = useState<string[]>(() => [
    ...new Set(varianti.map((v) => v.colore).filter((c): c is string => !!c)),
  ]);
  const [taglie, setTaglie] = useState<string[]>(() =>
    ordinaTaglie(varianti.map((v) => v.taglia).filter((t): t is string => !!t)),
  );
  // combo -> { id, stock } delle varianti gia a DB, per preservarle nel diff.
  const [esistenti, setEsistenti] = useState<Map<string, Esistente>>(
    () =>
      new Map(
        varianti.map((v) => [
          comboKey(v.colore, v.taglia),
          { id: v.id, stock: v.stock },
        ]),
      ),
  );
  const [confermaApri, setConfermaApri] = useState(false);

  function toggleColore(nome: string) {
    setColori((cs) =>
      cs.includes(nome) ? cs.filter((c) => c !== nome) : [...cs, nome],
    );
  }
  function toggleTaglia(t: string) {
    setTaglie((ts) =>
      ts.includes(t) ? ts.filter((x) => x !== t) : ordinaTaglie([...ts, t]),
    );
  }

  // Combinazioni desiderate. Solo colori -> taglia null; solo taglie -> colore
  // null; entrambi -> matrice; nessuno -> nessuna variante.
  const combos = useMemo(() => {
    if (colori.length === 0 && taglie.length === 0) return [];
    const cs: (string | null)[] = colori.length ? colori : [null];
    const ts: (string | null)[] = taglie.length ? taglie : [null];
    const out: { colore: string | null; taglia: string | null }[] = [];
    for (const c of cs) for (const t of ts) out.push({ colore: c, taglia: t });
    return out;
  }, [colori, taglie]);

  function payload(): VarianteInput[] {
    return combos.map(({ colore, taglia }) => {
      const ex = esistenti.get(comboKey(colore, taglia));
      return {
        id: ex?.id,
        colore,
        taglia,
        sku: skuVariante(baseSku, colore, taglia),
        stock: ex?.stock ?? 0,
      };
    });
  }

  // Varianti gia salvate che la nuova selezione NON copre piu -> da eliminare.
  function idsDaEliminare(): string[] {
    const tenuti = new Set(
      combos
        .map(({ colore, taglia }) => esistenti.get(comboKey(colore, taglia))?.id)
        .filter((id): id is string => !!id),
    );
    return [...esistenti.values()]
      .map((e) => e.id)
      .filter((id) => !tenuti.has(id));
  }

  function salva() {
    // Eliminare varianti gia salvate e distruttivo (CASCADE carrelli): conferma.
    if (idsDaEliminare().length > 0) {
      setConfermaApri(true);
      return;
    }
    eseguiSalva();
  }

  function eseguiSalva() {
    setConfermaApri(false);
    const dati = payload();
    startTransition(async () => {
      const esito = await salvaVariantiAction(prodottoId, dati);
      if (!esito.ok) {
        mostra(esito.error ?? "Impossibile salvare le varianti.", "errore");
        return;
      }
      if (esito.varianti) {
        setColori([
          ...new Set(
            esito.varianti.map((v) => v.colore).filter((c): c is string => !!c),
          ),
        ]);
        setTaglie(
          ordinaTaglie(
            esito.varianti.map((v) => v.taglia).filter((t): t is string => !!t),
          ),
        );
        setEsistenti(
          new Map(
            esito.varianti.map((v) => [
              comboKey(v.colore, v.taglia),
              { id: v.id, stock: v.stock },
            ]),
          ),
        );
      }
      mostra(
        esito.avviso ? `Varianti salvate. ${esito.avviso}` : "Varianti salvate.",
        "ok",
      );
    });
  }

  const nCombo = combos.length;

  return (
    <section className="mx-auto mt-8 max-w-xl">
      <div className="mb-3 flex items-center justify-between">
        <div>
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
              <path d="M4 7h16M4 12h16M4 17h10" />
            </svg>
            Disponibilità
          </span>
          <h2 className="font-display text-base font-extrabold text-foreground">
            Colori e taglie
          </h2>
        </div>
        <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-bold text-sea">
          {nCombo} {nCombo === 1 ? "variante" : "varianti"}
        </span>
      </div>

      {/* COLORI ------------------------------------------------------------ */}
      <fieldset className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-line">
        <legend className="px-1 font-display text-xs font-bold uppercase tracking-wide text-muted">
          Colori
        </legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {COLORI.map((c) => {
            const sel = colori.includes(c.nome);
            return (
              <button
                key={c.nome}
                type="button"
                aria-pressed={sel}
                onClick={() => toggleColore(c.nome)}
                className={[
                  "inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 font-display text-sm font-bold transition-all",
                  sel
                    ? "bg-sea text-white shadow-sea"
                    : "bg-white text-foreground ring-1 ring-line hover:ring-lagoon",
                ].join(" ")}
              >
                <span
                  aria-hidden="true"
                  className={[
                    "grid h-6 w-6 place-items-center rounded-full",
                    coloreChiaro(c.hex) ? "ring-1 ring-line" : "",
                  ].join(" ")}
                  style={{ backgroundColor: c.hex }}
                >
                  {sel && (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={coloreChiaro(c.hex) ? "#0b3a5b" : "#ffffff"}
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3.5 w-3.5"
                    >
                      <path d="m5 13 4 4L19 7" />
                    </svg>
                  )}
                </span>
                {c.nome}
              </button>
            );
          })}

          {/* Colori del prodotto fuori palette (es. dalla AI): mostrati come
              selezionati e rimovibili, cosi non restano "invisibili". */}
          {colori
            .filter(
              (c) =>
                !COLORI.some(
                  (p) => p.nome.toLowerCase() === c.toLowerCase(),
                ),
            )
            .map((c) => {
              const hex = coloreHex(c);
              return (
                <button
                  key={`extra-${c}`}
                  type="button"
                  aria-pressed={true}
                  onClick={() => toggleColore(c)}
                  title={`${c} (fuori palette)`}
                  className="inline-flex items-center gap-2 rounded-full bg-sea py-1.5 pl-1.5 pr-3 font-display text-sm font-bold text-white shadow-sea transition-all"
                >
                  <span
                    aria-hidden="true"
                    className={[
                      "grid h-6 w-6 place-items-center rounded-full",
                      coloreChiaro(hex) ? "ring-1 ring-line" : "",
                    ].join(" ")}
                    style={{ backgroundColor: hex }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={coloreChiaro(hex) ? "#0b3a5b" : "#ffffff"}
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3.5 w-3.5"
                    >
                      <path d="m5 13 4 4L19 7" />
                    </svg>
                  </span>
                  {c}
                </button>
              );
            })}
        </div>
      </fieldset>

      {/* TAGLIE ------------------------------------------------------------ */}
      <fieldset className="mt-3 rounded-2xl bg-white p-4 shadow-soft ring-1 ring-line">
        <div className="flex items-center justify-between px-1">
          <legend className="font-display text-xs font-bold uppercase tracking-wide text-muted">
            Taglie
          </legend>
          <div className="flex gap-3 text-xs font-bold">
            <button
              type="button"
              onClick={() => setTaglie([...TAGLIE])}
              className="text-sea transition-colors hover:text-lagoon"
            >
              Tutte
            </button>
            <button
              type="button"
              onClick={() => setTaglie([])}
              className="text-muted transition-colors hover:text-foreground"
            >
              Nessuna
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {TAGLIE.map((t) => {
            const sel = taglie.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={sel}
                onClick={() => toggleTaglia(t)}
                className={[
                  "h-11 min-w-[3rem] rounded-xl px-3 font-display text-sm font-bold transition-all",
                  sel
                    ? "bg-sea text-white shadow-sea"
                    : "bg-white text-foreground ring-1 ring-line hover:-translate-y-0.5 hover:ring-lagoon",
                ].join(" ")}
              >
                {t}
              </button>
            );
          })}
        </div>
        <p className="mt-2 px-1 text-xs text-muted">
          Scegli l&apos;intervallo (es. dalla M alla 3XL). Senza taglie il
          prodotto resta solo per colore.
        </p>
      </fieldset>

      {/* Riepilogo + salva ------------------------------------------------- */}
      <div className="mt-3 rounded-2xl bg-surface px-4 py-3 text-sm text-muted ring-1 ring-line">
        {nCombo === 0 ? (
          "Nessuna variante: scegli almeno un colore o una taglia."
        ) : (
          <>
            Genererà <strong className="text-foreground">{nCombo}</strong>{" "}
            {nCombo === 1 ? "variante" : "varianti"}
            {colori.length > 0 && taglie.length > 0
              ? ` (${colori.length} colori × ${taglie.length} taglie).`
              : "."}{" "}
            {suRichiesta
              ? "Le giacenze non si gestiscono in modalità “Scrivici per la disponibilità”."
              : null}
          </>
        )}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={salva}
          disabled={pending}
          className="flex h-12 items-center justify-center rounded-full bg-sea px-6 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
        >
          {pending ? "Salvataggio…" : "Salva varianti"}
        </button>
      </div>

      <ConfermaDialog
        aperto={confermaApri}
        titolo="Aggiornare le varianti?"
        messaggio={`${idsDaEliminare().length} variante/i non piu coperta/e dalla selezione verra/nno eliminata/e. Se sono in carrelli di clienti, quelle righe verranno svuotate.`}
        etichettaConferma="Salva"
        inCorso={pending}
        onConferma={eseguiSalva}
        onAnnulla={() => setConfermaApri(false)}
      />
    </section>
  );
}
