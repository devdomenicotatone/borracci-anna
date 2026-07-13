"use client";

// Vista "Media" del gestore: TUTTE le foto del catalogo, raggruppate per
// prodotto. Per ogni foto: Modifica (apre l'editor condiviso) ed Elimina. Non e
// un DAM — le foto restano legate al prodotto; qui si sfoglia/rifinisce/pulisce.

import { useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";

import {
  rimuoviFotoGalleriaAction,
  sostituisciFotoAction,
  type FotoGalleriaRow,
} from "@/lib/gestore/actions";
import { useToast } from "@/components/gestore/Toaster";
import ConfermaDialog from "@/components/gestore/ConfermaDialog";
import { Spinner } from "@/components/gestore/ui";
import { generaBlurDataUrl } from "@/lib/blur";
import { autoTrimmaImmagine } from "@/lib/trim";

// Editor caricato in lazy (Filerobot + konva pesano solo quando si apre).
const EditorImmagine = dynamic(
  () => import("@/components/gestore/EditorImmagine"),
  { ssr: false },
);

// Foto montate per blocco con "Mostra altri": i gruppi non vengono mai
// spezzati, quindi il blocco reale puo superare di poco questa soglia.
const FOTO_PER_BLOCCO = 60;

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
  // Ripulitura batch dei bordi: chiede conferma, poi mostra il progresso.
  const [chiediRipulitura, setChiediRipulitura] = useState(false);
  const [ripulitura, setRipulitura] = useState<{
    fatte: number;
    totale: number;
    ritagliate: number;
  } | null>(null);

  const totale = gruppi.reduce((n, g) => n + g.foto.length, 0);
  const occupato = pending || ripulitura !== null;

  // Paginazione client-side: con ~1840 prodotti montare tutte le miniature in
  // un colpo satura rete e memoria (soprattutto da telefono). Si mostrano
  // gruppi interi finche il budget foto del blocco non e esaurito; le azioni
  // batch (es. ripulitura bordi) lavorano comunque sull'intero `gruppi`.
  const [limiteFoto, setLimiteFoto] = useState(FOTO_PER_BLOCCO);
  const gruppiVisibili = useMemo(() => {
    const out: GruppoMedia[] = [];
    let conteggio = 0;
    for (const g of gruppi) {
      if (out.length > 0 && conteggio >= limiteFoto) break;
      out.push(g);
      conteggio += g.foto.length;
    }
    return out;
  }, [gruppi, limiteFoto]);
  const fotoVisibili = gruppiVisibili.reduce((n, g) => n + g.foto.length, 0);

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

  // Ripulitura di massa: scarica ogni foto, ritaglia i bordi uniformi (stessa
  // logica dell'ingestione, lib/trim.ts) e ricarica solo quelle effettivamente
  // ritagliate. Idempotente: rilanciarla sulle foto gia pulite non fa nulla.
  // In sequenza: piu lento ma non stressa Storage ne fa saltare le giacenze RLS.
  async function ripulisciBordi() {
    setChiediRipulitura(false);
    const tutte = gruppi.flatMap((g) =>
      g.foto.map((foto) => ({ prodottoId: g.prodottoId, foto })),
    );
    if (tutte.length === 0) return;

    setRipulitura({ fatte: 0, totale: tutte.length, ritagliate: 0 });
    let ritagliate = 0;
    let errori = 0;
    for (let i = 0; i < tutte.length; i++) {
      const { prodottoId, foto } = tutte[i];
      try {
        const resp = await fetch(foto.url);
        const blob = resp.ok ? await resp.blob() : null;
        if (blob) {
          const esito = await autoTrimmaImmagine(blob);
          if (esito.ritagliata) {
            const blur = (await generaBlurDataUrl(esito.blob)) ?? "";
            const fd = new FormData();
            fd.append("foto", esito.blob, "foto.webp");
            if (blur) fd.append("blur", blur);
            const r = await sostituisciFotoAction(prodottoId, foto.id, fd);
            if (r.ok) {
              ritagliate++;
              if (r.foto) applicaGalleria(prodottoId, r.foto);
            } else {
              errori++;
            }
          }
        } else {
          errori++;
        }
      } catch {
        errori++;
      }
      setRipulitura({ fatte: i + 1, totale: tutte.length, ritagliate });
    }

    setRipulitura(null);
    mostra(
      ritagliate > 0
        ? `Ritagliate ${ritagliate} foto${errori ? `, ${errori} non riuscite` : ""}.`
        : errori
          ? `Nessuna foto ritagliata (${errori} non riuscite).`
          : "Le foto erano gia tutte a posto.",
      errori && !ritagliate ? "errore" : "ok",
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 lg:max-w-6xl">
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-foreground">
              Media
            </h1>
            <p className="text-sm text-muted">
              {totale > 0
                ? `${totale} foto in ${gruppi.length} ${gruppi.length === 1 ? "prodotto" : "prodotti"}. Modificale o rimuovile.`
                : "Tutte le foto del catalogo."}
            </p>
          </div>
          {totale > 0 && (
            <button
              type="button"
              onClick={() => setChiediRipulitura(true)}
              disabled={occupato}
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-sea px-4 py-2 font-display text-sm font-bold text-white shadow-sea transition-colors hover:bg-sea/90 disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M3 3h18v18H3z" strokeDasharray="3 3" />
                <path d="m8 12 3 3 5-6" />
              </svg>
              Ripulisci bordi bianchi
            </button>
          )}
        </div>

        {ripulitura && (
          <div className="mt-4 rounded-2xl bg-surface px-4 py-3 ring-1 ring-line">
            <div className="flex items-center justify-between gap-3 text-sm font-bold text-foreground">
              <span className="inline-flex items-center gap-2">
                <Spinner className="h-3.5 w-3.5 text-sea" />
                Ripulisco le foto… {ripulitura.fatte}/{ripulitura.totale}
              </span>
              <span className="text-sea">
                {ripulitura.ritagliate} ritagliate
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-sea transition-all"
                style={{
                  width: `${Math.round((ripulitura.fatte / ripulitura.totale) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}
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
        <>
          {gruppiVisibili.map((g) => (
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
                      {/* Miniatura via optimizer di Next (lazy, ~200px):
                          mai il master pieno usato come thumbnail. */}
                      <Image
                        src={f.url}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 220px"
                        quality={75}
                        loading="lazy"
                        className="object-cover"
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
                        disabled={occupato}
                        onClick={() =>
                          setDaModificare({
                            prodottoId: g.prodottoId,
                            foto: f,
                          })
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
                        disabled={occupato}
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
          ))}

          {/* Il limite riparte da cio che e gia in vista: i gruppi interi
              possono sforare il blocco e un semplice +60 resterebbe muto. */}
          {fotoVisibili < totale && (
            <div className="mt-2 flex flex-col items-center gap-2">
              <p className="text-sm tabular-nums text-muted">
                Hai visto {fotoVisibili} foto di {totale}
              </p>
              <button
                type="button"
                onClick={() => setLimiteFoto(fotoVisibili + FOTO_PER_BLOCCO)}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 font-display text-sm font-bold text-sea ring-2 ring-sea transition-all hover:-translate-y-0.5 hover:bg-surface"
              >
                Mostra altri
              </button>
            </div>
          )}
        </>
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

      <ConfermaDialog
        aperto={chiediRipulitura}
        titolo="Ripulire i bordi delle foto?"
        messaggio="Analizzo tutte le foto del catalogo e ritaglio i bordi bianchi o trasparenti, cosi il capo riempie il riquadro. Le foto gia a posto non vengono toccate; potrai comunque rifinire ogni singola foto dall'editor."
        etichettaConferma="Ripulisci"
        inCorso={false}
        onConferma={ripulisciBordi}
        onAnnulla={() => setChiediRipulitura(false)}
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
