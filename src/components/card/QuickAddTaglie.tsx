"use client";

// Quick add dalla card: bottone "+" che apre un pannellino con le taglie,
// senza aprire la scheda prodotto. Le varianti si caricano alla PRIMA apertura
// (Server Action, giacenze fresche); le taglie esaurite sono barrate.
//
// - UN solo colore (o nessuno): il tap sulla taglia aggiunge subito al
//   carrello (CartProvider: badge ottimistico + mini-cart che si apre).
// - PIU colori: la taglia da sola non basta a scegliere la variante, quindi
//   il tap porta alla scheda con la taglia gia preselezionata (?taglia=...).
// - Nessuna taglia (es. palloni, un colore): bottone unico "Aggiungi".
//
// Vive dentro il <Link> della card: ogni click ferma l'evento per non navigare.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useCarrello } from "@/components/cart/CartProvider";
import { variantiCard } from "@/lib/card-actions";
import { ordinaTaglie } from "@/lib/catalogo";
import type { Prodotto, Variante } from "@/lib/types";

export default function QuickAddTaglie({ prodotto }: { prodotto: Prodotto }) {
  const router = useRouter();
  const { aggiungi } = useCarrello();
  const [aperto, setAperto] = useState(false);
  const [varianti, setVarianti] = useState<Variante[] | null>(null);
  const [caricamento, setCaricamento] = useState(false);
  const [, startTransition] = useTransition();

  function ferma(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function apri(e: React.MouseEvent) {
    ferma(e);
    setAperto(true);
    if (varianti !== null || caricamento) return;
    setCaricamento(true);
    variantiCard(prodotto.id)
      .then(setVarianti)
      .catch(() => setVarianti([]))
      .finally(() => setCaricamento(false));
  }

  const elenco = varianti ?? [];
  const taglie = ordinaTaglie(
    elenco.map((v) => v.taglia).filter((t): t is string => !!t),
  );
  const colori = [
    ...new Set(elenco.map((v) => v.colore).filter((c): c is string => !!c)),
  ];
  const multiColore = colori.length > 1;

  /** Prima variante con stock per la taglia (colore unico: non e ambiguo). */
  function varianteConStock(taglia: string | null): Variante | null {
    return (
      elenco.find(
        (v) => (taglia === null || v.taglia === taglia) && v.stock > 0,
      ) ?? null
    );
  }

  function scegli(e: React.MouseEvent, taglia: string | null) {
    ferma(e);
    if (multiColore) {
      // La scelta del colore avviene nella scheda, taglia gia preselezionata.
      const qs = taglia ? `?taglia=${encodeURIComponent(taglia)}` : "";
      router.push(`/prodotti/${prodotto.slug}${qs}`);
      return;
    }
    const variante = varianteConStock(taglia);
    if (!variante) return;
    setAperto(false);
    startTransition(async () => {
      await aggiungi({ prodotto, variante, quantita: 1 });
    });
  }

  return (
    <>
      {/* Bottone "+": apre il pannello taglie. */}
      <button
        type="button"
        onClick={aperto ? (e) => { ferma(e); setAperto(false); } : apri}
        aria-expanded={aperto}
        aria-label={`Aggiungi ${prodotto.nome} al carrello — scegli la taglia`}
        title="Aggiungi rapido"
        // Visivamente 36px, ma con area di tocco ~48px (before invisibile) per
        // arrivare al minimo tattile di 44px senza appesantire la card.
        className="absolute bottom-2 right-2 z-20 grid h-9 w-9 place-items-center rounded-full bg-sea text-white shadow-sea transition-transform before:absolute before:-inset-1.5 before:content-[''] hover:scale-110 active:scale-95"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4.5 w-4.5 transition-transform ${aperto ? "rotate-45" : ""}`}
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {/* Pannello taglie. */}
      {aperto && (
        <div
          role="group"
          aria-label={`Taglie di ${prodotto.nome}`}
          onClick={ferma}
          className="animate-pop-in absolute inset-x-1.5 bottom-12 z-30 rounded-2xl bg-white/95 p-2.5 shadow-soft ring-1 ring-line backdrop-blur"
        >
          <p className="mb-2 px-0.5 font-display text-[11px] font-bold uppercase tracking-wide text-muted">
            {multiColore ? "Taglia — poi scegli il colore" : "Scegli la taglia"}
          </p>

          {caricamento ? (
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <span
                  key={i}
                  className="h-11 w-11 animate-pulse rounded-lg bg-surface-2"
                />
              ))}
            </div>
          ) : varianti && varianti.length === 0 ? (
            <p className="px-0.5 pb-1 text-xs text-muted">
              Apri la scheda per i dettagli.
            </p>
          ) : taglie.length === 0 ? (
            // Prodotto senza taglie (es. palloni): aggiunta diretta.
            <button
              type="button"
              disabled={!multiColore && !varianteConStock(null)}
              onClick={(e) => scegli(e, null)}
              className="flex h-10 w-full items-center justify-center rounded-xl bg-coral font-display text-sm font-bold text-white shadow-coral transition-transform hover:-translate-y-0.5 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Aggiungi al carrello
            </button>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {taglie.map((t) => {
                const disponibile = elenco.some(
                  (v) => v.taglia === t && v.stock > 0,
                );
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={!disponibile}
                    onClick={(e) => scegli(e, t)}
                    title={disponibile ? `Taglia ${t}` : `Taglia ${t} esaurita`}
                    className={[
                      "h-11 min-w-11 rounded-lg px-2 font-display text-sm font-bold transition-all",
                      disponibile
                        ? "bg-white text-foreground ring-2 ring-surface-2 hover:-translate-y-0.5 hover:ring-sea active:scale-95"
                        : "cursor-not-allowed text-muted line-through ring-2 ring-surface-2 opacity-60",
                    ].join(" ")}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
