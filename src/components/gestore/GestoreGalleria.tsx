"use client";

// Gestione galleria foto del prodotto (area gestore).
// - carica piu foto (compressione/conversione WebP lato client, come l'uploader);
// - riordina (su/giu); la PRIMA foto e la copertina (immagine_url), sincronizzata
//   lato server ad ogni mutazione;
// - associa ogni foto a una variante colore;
// - elimina (con conferma).
// Ogni azione ritorna lo stato canonico della galleria, con cui riallineiamo.

import { useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import imageCompression from "browser-image-compression";

import { generaBlurDataUrl } from "@/lib/blur";

import {
  aggiungiFotoGalleriaAction,
  rimuoviFotoGalleriaAction,
  riordinaFotoGalleriaAction,
  associaColoreFotoAction,
  type FotoGalleriaRow,
} from "@/lib/gestore/actions";
import { useToast } from "@/components/gestore/Toaster";
import ConfermaDialog from "@/components/gestore/ConfermaDialog";
import { coloreChiaro, coloreHex } from "@/lib/catalogo";

// Editor immagini caricato in lazy: Filerobot + konva pesano solo quando si apre
// l'editor, non su questa pagina. Client-only (usa il canvas del browser).
const EditorImmagine = dynamic(
  () => import("@/components/gestore/EditorImmagine"),
  { ssr: false },
);

export default function GestoreGalleria({
  prodottoId,
  colori,
  fotoIniziali,
}: {
  prodottoId: string;
  colori: string[];
  fotoIniziali: FotoGalleriaRow[];
}) {
  const { mostra } = useToast();
  const [righe, setRighe] = useState<FotoGalleriaRow[]>(fotoIniziali);
  const [caricando, setCaricando] = useState(false);
  const [pending, startTransition] = useTransition();
  const [daEliminare, setDaEliminare] = useState<string | null>(null);
  const [daModificare, setDaModificare] = useState<FotoGalleriaRow | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setCaricando(true);
    let ultimo: FotoGalleriaRow[] | null = null;
    let errori = 0;
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        errori++;
        continue;
      }
      try {
        const compressa = await imageCompression(file, {
          // NORMALIZZA, non comprimere: l'unica perdita lossy del pipeline deve
          // essere quella finale di next/image (AVIF/WebP al serve). Qui teniamo un
          // MASTER nitido — 2560px (margine per ritagliare nell'editor; la vetrina
          // serve comunque <=1600px) a qualita 0.92, con tetto MB alto cosi la
          // qualita non viene abbassata per centrare una taglia.
          maxWidthOrHeight: 2560,
          maxSizeMB: 8,
          initialQuality: 0.92,
          fileType: "image/webp",
          useWebWorker: true,
        });
        const blur = await generaBlurDataUrl(compressa);
        const fd = new FormData();
        fd.append("foto", compressa, "foto.webp");
        if (blur) fd.append("blur", blur);
        const esito = await aggiungiFotoGalleriaAction(prodottoId, fd);
        if (!esito.ok || !esito.foto) {
          errori++;
        } else {
          ultimo = esito.foto;
        }
      } catch {
        errori++;
      }
    }
    if (ultimo) setRighe(ultimo);
    setCaricando(false);
    if (errori > 0) {
      mostra(
        ultimo
          ? `Alcune foto non sono state caricate (${errori}).`
          : "Impossibile caricare le foto.",
        "errore",
      );
    } else {
      mostra(files.length === 1 ? "Foto aggiunta." : "Foto aggiunte.", "ok");
    }
  }

  function applica(
    azione: () => Promise<{ ok: boolean; error?: string; foto?: FotoGalleriaRow[] }>,
    successo?: string,
  ) {
    startTransition(async () => {
      const esito = await azione();
      if (!esito.ok) {
        mostra(esito.error ?? "Operazione non riuscita.", "errore");
        return;
      }
      if (esito.foto) setRighe(esito.foto);
      if (successo) mostra(successo, "ok");
    });
  }

  function muovi(index: number, delta: number) {
    const j = index + delta;
    if (j < 0 || j >= righe.length) return;
    const nuovo = [...righe];
    [nuovo[index], nuovo[j]] = [nuovo[j], nuovo[index]];
    setRighe(nuovo); // ottimistico
    applica(() =>
      riordinaFotoGalleriaAction(
        prodottoId,
        nuovo.map((f) => f.id),
      ),
    );
  }

  function rendiCopertina(index: number) {
    if (index === 0) return;
    const nuovo = [...righe];
    const [f] = nuovo.splice(index, 1);
    nuovo.unshift(f);
    setRighe(nuovo);
    applica(
      () =>
        riordinaFotoGalleriaAction(
          prodottoId,
          nuovo.map((x) => x.id),
        ),
      "Copertina aggiornata.",
    );
  }

  function cambiaColore(fotoId: string, colore: string) {
    applica(() => associaColoreFotoAction(prodottoId, fotoId, colore || null));
  }

  function eliminaConfermato() {
    const id = daEliminare;
    setDaEliminare(null);
    if (!id) return;
    applica(() => rimuoviFotoGalleriaAction(prodottoId, id), "Foto rimossa.");
  }

  const occupato = caricando || pending;

  return (
    <section className="mx-auto mt-8 max-w-xl lg:max-w-5xl">
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
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="9" cy="11" r="2" />
              <path d="m21 16-4-4-7 7" />
            </svg>
            Galleria
          </span>
          <h2 className="font-display text-base font-extrabold text-foreground">
            Foto del prodotto
          </h2>
        </div>
        <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-bold text-sea">
          {righe.length} {righe.length === 1 ? "foto" : "foto"}
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onFile}
        className="hidden"
      />

      {righe.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={occupato}
          className="flex w-full flex-col items-center gap-2 rounded-2xl bg-surface px-6 py-10 text-center ring-1 ring-dashed ring-line transition-colors hover:bg-surface-2 disabled:opacity-50"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-sea shadow-soft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
              <path d="M12 16V4m0 0L8 8m4-4 4 4M4 20h16" />
            </svg>
          </span>
          <span className="font-display text-sm font-bold text-foreground">
            {caricando ? "Caricamento…" : "Aggiungi foto"}
          </span>
          <span className="text-xs text-muted">
            Puoi selezionarne piu di una. La prima sara la copertina.
          </span>
        </button>
      ) : (
        <>
          {/* Lista ordinabile con frecce su/giu: resta a colonna singola anche
              a lg (le frecce devono corrispondere al movimento visivo); la
              riga usa la larghezza disponendosi in orizzontale. */}
          <ul className="flex flex-col gap-3">
            {righe.map((f, i) => (
              <li
                key={f.id}
                className="flex gap-3 rounded-2xl bg-white p-3 shadow-soft ring-1 ring-line"
              >
                <div className="relative aspect-square w-20 shrink-0 overflow-hidden rounded-xl bg-surface ring-1 ring-line">
                  {/* eslint-disable-next-line @next/next/no-img-element -- url Storage */}
                  <img src={f.url} alt="" className="h-full w-full object-cover" />
                  {i === 0 && (
                    <span className="absolute left-1 top-1 rounded-full bg-sea px-2 py-0.5 text-[10px] font-bold text-white shadow-sea">
                      Copertina
                    </span>
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 lg:flex-row lg:items-center lg:gap-6">
                  <label className="flex flex-col gap-1 lg:w-80 lg:flex-none">
                    <span className="font-display text-xs font-bold uppercase tracking-wide text-muted">
                      Colore
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={[
                          "h-7 w-7 shrink-0 rounded-full",
                          f.colore
                            ? coloreChiaro(coloreHex(f.colore))
                              ? "ring-1 ring-line"
                              : ""
                            : "ring-1 ring-dashed ring-line",
                        ].join(" ")}
                        style={
                          f.colore
                            ? { backgroundColor: coloreHex(f.colore) }
                            : undefined
                        }
                      />
                      <select
                        value={f.colore ?? ""}
                        onChange={(e) => cambiaColore(f.id, e.target.value)}
                        disabled={occupato}
                        className="h-10 w-full rounded-xl bg-white px-3 text-sm text-foreground ring-1 ring-line outline-none disabled:opacity-50"
                      >
                        <option value="">Nessun colore</option>
                        {f.colore && !colori.includes(f.colore) && (
                          <option value={f.colore}>{f.colore}</option>
                        )}
                        {colori.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label="Sposta su"
                      disabled={occupato || i === 0}
                      onClick={() => muovi(i, -1)}
                      className="grid h-9 w-9 place-items-center rounded-full bg-white text-sea ring-1 ring-line transition-colors hover:bg-surface disabled:opacity-40"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                        <path d="m18 15-6-6-6 6" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label="Sposta giu"
                      disabled={occupato || i === righe.length - 1}
                      onClick={() => muovi(i, 1)}
                      className="grid h-9 w-9 place-items-center rounded-full bg-white text-sea ring-1 ring-line transition-colors hover:bg-surface disabled:opacity-40"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    {i !== 0 && (
                      <button
                        type="button"
                        disabled={occupato}
                        onClick={() => rendiCopertina(i)}
                        className="rounded-full px-2.5 py-1.5 text-xs font-bold text-sea transition-colors hover:bg-surface-2 disabled:opacity-50"
                      >
                        Rendi copertina
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={occupato}
                      onClick={() => setDaModificare(f)}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-bold text-sea transition-colors hover:bg-surface-2 disabled:opacity-50"
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
                      onClick={() => setDaEliminare(f.id)}
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-bold text-coral transition-colors hover:bg-coral/10 disabled:opacity-50"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      </svg>
                      Elimina
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={occupato}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-5 font-display text-sm font-bold text-sea ring-2 ring-sea transition-all hover:-translate-y-0.5 hover:bg-surface disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50 lg:mx-auto lg:w-fit lg:px-8"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M12 16V4m0 0L8 8m4-4 4 4M4 20h16" />
            </svg>
            {caricando ? "Caricamento…" : "Aggiungi altre foto"}
          </button>
        </>
      )}

      <p className="mt-2 text-xs text-muted">
        JPG/PNG/WebP, ottimizzate automaticamente. La prima foto e la copertina;
        associa un colore per mostrarla quando il cliente sceglie quel colore.
      </p>

      <ConfermaDialog
        aperto={daEliminare !== null}
        titolo="Rimuovere la foto?"
        messaggio="La foto verra eliminata dalla galleria. Potrai ricaricarla quando vuoi."
        etichettaConferma="Rimuovi"
        inCorso={pending}
        onConferma={eliminaConfermato}
        onAnnulla={() => setDaEliminare(null)}
      />

      {daModificare && (
        <EditorImmagine
          url={daModificare.url}
          prodottoId={prodottoId}
          fotoId={daModificare.id}
          onChiudi={() => setDaModificare(null)}
          onSalvata={(foto) => setRighe(foto)}
        />
      )}
    </section>
  );
}
