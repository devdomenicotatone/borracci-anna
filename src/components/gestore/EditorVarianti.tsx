"use client";

// Editor inline delle varianti (taglia, colore, SKU, stock).
// Lo SKU viene suggerito da slug+taglia+colore finche non lo si modifica a mano.
// Il salvataggio fa il diff lato server; al ritorno riallinea lo stato col DB.
// Prima di eliminare varianti GIA salvate viene chiesta conferma (CASCADE).

import { useRef, useState, useTransition } from "react";

import {
  salvaVariantiAction,
  type VarianteSalvata,
} from "@/lib/gestore/actions";
import { useToast } from "@/components/gestore/Toaster";
import ConfermaDialog from "@/components/gestore/ConfermaDialog";
import { slugify } from "@/lib/gestore/slug";
import type { VarianteInput } from "@/lib/types";

interface RigaVar {
  key: string;
  id?: string;
  taglia: string;
  colore: string;
  sku: string;
  skuAuto: boolean;
  stock: number;
}

const inputMini =
  "h-11 w-full rounded-xl bg-white px-3 text-sm text-foreground ring-1 ring-line outline-none transition-shadow";
const stepBtn =
  "grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-lg font-bold text-sea ring-2 ring-surface-2 transition-colors hover:bg-surface";

function daDb(v: VarianteSalvata): RigaVar {
  return {
    key: `db-${v.id}`,
    id: v.id,
    taglia: v.taglia ?? "",
    colore: v.colore ?? "",
    sku: v.sku,
    skuAuto: false,
    stock: v.stock,
  };
}

export default function EditorVarianti({
  prodottoId,
  slugProdotto,
  varianti,
}: {
  prodottoId: string;
  slugProdotto: string;
  varianti: VarianteSalvata[];
}) {
  const { mostra } = useToast();
  const [pending, startTransition] = useTransition();
  const keyRef = useRef(0);
  const [righe, setRighe] = useState<RigaVar[]>(() => varianti.map(daDb));
  const [confermaApri, setConfermaApri] = useState(false);
  // Ids attualmente persistiti a DB (aggiornato dopo ogni salvataggio).
  const idsDbRef = useRef<Set<string>>(new Set(varianti.map((v) => v.id)));

  function suggerisciSku(taglia: string, colore: string): string {
    return slugify([slugProdotto, taglia, colore].filter(Boolean).join("-"));
  }

  function aggiorna(key: string, patch: Partial<RigaVar>) {
    setRighe((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if (
          next.skuAuto &&
          (patch.taglia !== undefined || patch.colore !== undefined)
        ) {
          next.sku = suggerisciSku(next.taglia, next.colore);
        }
        return next;
      }),
    );
  }

  function aggiungi() {
    keyRef.current += 1;
    setRighe((rs) => [
      ...rs,
      {
        key: `new-${keyRef.current}`,
        taglia: "",
        colore: "",
        sku: "",
        skuAuto: true,
        stock: 0,
      },
    ]);
  }

  function rimuovi(key: string) {
    setRighe((rs) => rs.filter((r) => r.key !== key));
  }

  // Validazione client: SKU presenti e univoci (feedback senza round-trip).
  function valida(): string | null {
    if (righe.some((r) => !r.sku.trim())) {
      return "Ogni variante deve avere uno SKU.";
    }
    const skus = righe.map((r) => r.sku.trim());
    if (new Set(skus).size !== skus.length) {
      return "Ci sono SKU duplicati tra le varianti.";
    }
    return null;
  }

  // Varianti salvate (con id) che sono state rimosse dal form.
  function idsRimossi(): string[] {
    return [...idsDbRef.current].filter(
      (id) => !righe.some((r) => r.id === id),
    );
  }

  function salva() {
    const errore = valida();
    if (errore) {
      mostra(errore, "errore");
      return;
    }
    // Eliminare varianti gia salvate e distruttivo (CASCADE carrelli): conferma.
    if (idsRimossi().length > 0) {
      setConfermaApri(true);
      return;
    }
    eseguiSalva();
  }

  function eseguiSalva() {
    setConfermaApri(false);
    const payload: VarianteInput[] = righe.map((r) => ({
      id: r.id,
      taglia: r.taglia.trim() || null,
      colore: r.colore.trim() || null,
      sku: r.sku.trim(),
      stock: r.stock,
    }));
    startTransition(async () => {
      const esito = await salvaVariantiAction(prodottoId, payload);
      if (!esito.ok) {
        mostra(esito.error ?? "Impossibile salvare le varianti.", "errore");
        return;
      }
      if (esito.varianti) {
        setRighe(esito.varianti.map(daDb));
        idsDbRef.current = new Set(esito.varianti.map((v) => v.id));
      }
      mostra(
        esito.avviso
          ? `Varianti salvate. ${esito.avviso}`
          : "Varianti salvate.",
        "ok",
      );
    });
  }

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
            Varianti e disponibilita
          </h2>
        </div>
        <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-bold text-sea">
          {righe.length} {righe.length === 1 ? "variante" : "varianti"}
        </span>
      </div>

      {righe.length === 0 ? (
        <div className="rounded-2xl bg-surface px-6 py-8 text-center ring-1 ring-dashed ring-line">
          <p className="text-sm text-muted">
            Nessuna variante. Aggiungine una (es. taglia + stock).
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {righe.map((r) => (
            <li key={r.key} className="rounded-2xl bg-white p-3.5 shadow-soft ring-1 ring-line">
              <div className="grid grid-cols-2 gap-2">
                <CampoMini label="Taglia">
                  <input
                    value={r.taglia}
                    onChange={(e) => aggiorna(r.key, { taglia: e.target.value })}
                    placeholder="S, M, L…"
                    className={inputMini}
                  />
                </CampoMini>
                <CampoMini label="Colore">
                  <input
                    value={r.colore}
                    onChange={(e) => aggiorna(r.key, { colore: e.target.value })}
                    placeholder="Bianco…"
                    className={inputMini}
                  />
                </CampoMini>
                <CampoMini label="SKU">
                  <input
                    value={r.sku}
                    onChange={(e) =>
                      aggiorna(r.key, { sku: e.target.value, skuAuto: false })
                    }
                    spellCheck={false}
                    autoCapitalize="none"
                    className={`${inputMini} font-mono`}
                  />
                </CampoMini>
                <CampoMini label="Stock">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Diminuisci stock"
                      onClick={() =>
                        aggiorna(r.key, { stock: Math.max(0, r.stock - 1) })
                      }
                      className={stepBtn}
                    >
                      -
                    </button>
                    <input
                      inputMode="numeric"
                      value={r.stock}
                      onChange={(e) => {
                        const n = Number.parseInt(e.target.value, 10);
                        aggiorna(r.key, {
                          stock: Number.isNaN(n) ? 0 : Math.max(0, n),
                        });
                      }}
                      className={`${inputMini} text-center`}
                    />
                    <button
                      type="button"
                      aria-label="Aumenta stock"
                      onClick={() => aggiorna(r.key, { stock: r.stock + 1 })}
                      className={stepBtn}
                    >
                      +
                    </button>
                  </div>
                </CampoMini>
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => rimuovi(r.key)}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-bold text-coral transition-colors hover:bg-coral/10"
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
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  </svg>
                  Rimuovi
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={aggiungi}
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-white px-5 font-display text-sm font-bold text-sea ring-2 ring-sea transition-all hover:-translate-y-0.5 hover:bg-surface"
        >
          + Aggiungi variante
        </button>
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
        titolo="Eliminare le varianti rimosse?"
        messaggio={`${idsRimossi().length} variante/i gia salvata/e verra/nno eliminata/e. Se sono in carrelli di clienti, quelle righe verranno svuotate.`}
        etichettaConferma="Salva ed elimina"
        inCorso={pending}
        onConferma={eseguiSalva}
        onAnnulla={() => setConfermaApri(false)}
      />
    </section>
  );
}

function CampoMini({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-display text-xs font-bold uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </div>
  );
}
