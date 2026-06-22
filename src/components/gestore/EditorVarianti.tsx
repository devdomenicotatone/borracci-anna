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
  "h-11 w-full rounded-lg border border-line bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-foreground";
const stepBtn =
  "flex h-11 w-9 shrink-0 items-center justify-center rounded-lg border border-line text-lg text-foreground transition-colors hover:bg-background";

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
        <h2 className="text-base font-semibold text-foreground">
          Varianti e disponibilita
        </h2>
        <span className="text-xs text-muted">
          {righe.length} {righe.length === 1 ? "variante" : "varianti"}
        </span>
      </div>

      {righe.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-8 text-center">
          <p className="text-sm text-muted">
            Nessuna variante. Aggiungine una (es. taglia + stock).
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {righe.map((r) => (
            <li key={r.key} className="rounded-xl border border-line bg-surface p-3">
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
                  className="text-xs font-medium text-muted transition-colors hover:text-red-700"
                >
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
          className="flex h-11 items-center justify-center rounded-full border border-dashed border-line px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface"
        >
          + Aggiungi variante
        </button>
        <button
          type="button"
          onClick={salva}
          disabled={pending}
          className="flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-colors hover:bg-foreground/85 disabled:opacity-40"
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
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </div>
  );
}
