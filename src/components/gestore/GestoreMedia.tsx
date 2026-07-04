"use client";

// Vista "Media" del gestore: TUTTE le foto del catalogo, raggruppate per
// prodotto. Per ogni foto: Modifica (apre l'editor condiviso) ed Elimina. Non e
// un DAM — le foto restano legate al prodotto; qui si sfoglia/rifinisce/pulisce.

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

import {
  rimuoviFotoGalleriaAction,
  type FotoGalleriaRow,
} from "@/lib/gestore/actions";
import { useToast } from "@/components/gestore/Toaster";
import ConfermaDialog from "@/components/gestore/ConfermaDialog";

// Editor caricato in lazy (Filerobot + konva pesano solo quando si apre).
const EditorImmagine = dynamic(
  () => import("@/components/gestore/EditorImmagine"),
  { ssr: false },
);

export interface FotoMedia {
  id: string;
  prodotto_id: string;
  colore: string | null;
  url: string;
  ordine: number;
}
export interface GruppoMedia {
  prodottoId: string;
  nome: string;
  slug: string;
  attivo: boolean;
  foto: FotoMedia[];
}

export default function GestoreMedia({
  gruppiIniziali,
}: {
  gruppiIniziali: GruppoMedia[];
}) {
  const { mostra } = useToast();
  const [gruppi, setGruppi] = useState<GruppoMedia[]>(gruppiIniziali);
  const [daModificare, setDaModificare] = useState<{
    prodottoId: string;
    foto: FotoMedia;
  } | null>(null);
  const [daEliminare, setDaEliminare] = useState<{
    prodottoId: string;
    fotoId: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const totale = gruppi.reduce((n, g) => n + g.foto.length, 0);

  // Riallinea un gruppo allo stato canonico ritornato dall'azione; i gruppi
  // rimasti senza foto spariscono.
  function applicaGalleria(prodottoId: string, foto: FotoGalleriaRow[]) {
    setGruppi((prev) =>
      prev
        .map((g) =>
          g.prodottoId === prodottoId
            ? {
                ...g,
                foto: foto.map((f) => ({
                  id: f.id,
                  prodotto_id: f.prodotto_id,
                  colore: f.colore,
                  url: f.url,
                  ordine: f.ordine,
                })),
              }
            : g,
        )
        .filter((g) => g.foto.length > 0),
    );
  }

  function eliminaConfermato() {
    const target = daEliminare;
    setDaEliminare(null);
    if (!target) return;
    startTransition(async () => {
      const esito = await rimuoviFotoGalleriaAction(
        target.prodottoId,
        target.fotoId,
      );
      if (!esito.ok) {
        mostra(esito.error ?? "Operazione non riuscita.", "errore");
        return;
      }
      if (esito.foto) applicaGalleria(target.prodottoId, esito.foto);
      mostra("Foto rimossa.", "ok");
    });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 lg:max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-extrabold text-foreground">
          Media
        </h1>
        <p className="text-sm text-muted">
          {totale > 0
            ? `${totale} foto in ${gruppi.length} ${gruppi.length === 1 ? "prodotto" : "prodotti"}. Modificale o rimuovile.`
            : "Tutte le foto del catalogo."}
        </p>
      </header>

      {gruppi.length === 0 ? (
        <div className="rounded-2xl bg-surface px-6 py-12 text-center ring-1 ring-dashed ring-line">
          <p className="font-display text-sm font-bold text-foreground">
            Ancora nessuna foto
          </p>
          <p className="mt-1 text-xs text-muted">
            Le foto compaiono qui quando le carichi nella scheda di un prodotto.
          </p>
        </div>
      ) : (
        gruppi.map((g) => (
          <section key={g.prodottoId} className="mb-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Link
                  href={`/gestore/prodotti/${g.prodottoId}`}
                  className="truncate font-display text-base font-bold text-foreground transition-colors hover:text-sea"
                >
                  {g.nome}
                </Link>
                {!g.attivo && (
                  <span className="shrink-0 rounded-full bg-sun/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-coral-ink">
                    Bozza
                  </span>
                )}
              </div>
              <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-sea">
                {g.foto.length}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {g.foto.map((f) => (
                <div
                  key={f.id}
                  className="overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-line"
                >
                  <div className="relative aspect-square bg-surface">
                    {/* eslint-disable-next-line @next/next/no-img-element -- url Storage */}
                    <img
                      src={f.url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    {f.colore && (
                      <span className="absolute left-1.5 top-1.5 rounded-full bg-foreground/70 px-2 py-0.5 text-[10px] font-bold text-white">
                        {f.colore}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-1 p-1.5">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        setDaModificare({ prodottoId: g.prodottoId, foto: f })
                      }
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-bold text-sea transition-colors hover:bg-surface-2 disabled:opacity-50"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                        <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                      Modifica
                    </button>
                    <button
                      type="button"
                      aria-label="Elimina foto"
                      disabled={pending}
                      onClick={() =>
                        setDaEliminare({
                          prodottoId: g.prodottoId,
                          fotoId: f.id,
                        })
                      }
                      className="grid h-8 w-8 place-items-center rounded-full text-coral transition-colors hover:bg-coral/10 disabled:opacity-50"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      <ConfermaDialog
        aperto={daEliminare !== null}
        titolo="Rimuovere la foto?"
        messaggio="La foto verra eliminata dalla galleria del prodotto. Potrai ricaricarla quando vuoi."
        etichettaConferma="Rimuovi"
        inCorso={pending}
        onConferma={eliminaConfermato}
        onAnnulla={() => setDaEliminare(null)}
      />

      {daModificare && (
        <EditorImmagine
          url={daModificare.foto.url}
          prodottoId={daModificare.prodottoId}
          fotoId={daModificare.foto.id}
          onChiudi={() => setDaModificare(null)}
          onSalvata={(foto) => applicaGalleria(daModificare.prodottoId, foto)}
        />
      )}
    </div>
  );
}
