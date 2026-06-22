"use client";

// Caricamento foto prodotto, ottimizzato per il telefono.
// Il selettore nativo offre fotocamera o galleria; l'immagine viene SEMPRE
// compressa e convertita in WebP lato client (risolve HEIC iPhone e il limite
// di 5MB del bucket) prima dell'invio alla Server Action.

import { useRef, useState, useTransition } from "react";
import imageCompression from "browser-image-compression";

import { caricaFotoAction, rimuoviFotoAction } from "@/lib/gestore/actions";
import { useToast } from "@/components/gestore/Toaster";
import ConfermaDialog from "@/components/gestore/ConfermaDialog";

export default function UploaderFoto({
  prodottoId,
  urlIniziale,
}: {
  prodottoId: string;
  urlIniziale: string | null;
}) {
  const { mostra } = useToast();
  const [url, setUrl] = useState<string | null>(urlIniziale);
  const [anteprima, setAnteprima] = useState<string | null>(null);
  const [caricando, setCaricando] = useState(false);
  const [confermaApri, setConfermaApri] = useState(false);
  const [rimuovendo, startRimozione] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // consente di riselezionare lo stesso file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      mostra("Seleziona un'immagine.", "errore");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setAnteprima(previewUrl);
    setCaricando(true);
    try {
      const compressa = await imageCompression(file, {
        maxWidthOrHeight: 1600,
        maxSizeMB: 1,
        fileType: "image/webp",
        useWebWorker: true,
      });
      const fd = new FormData();
      fd.append("foto", compressa, "cover.webp");

      const esito = await caricaFotoAction(prodottoId, fd);
      if (esito.error) {
        mostra(esito.error, "errore");
        setAnteprima(null);
      } else if (esito.url) {
        setUrl(esito.url);
        setAnteprima(null);
        mostra("Foto aggiornata.", "ok");
      }
    } catch {
      mostra("Impossibile elaborare l'immagine.", "errore");
      setAnteprima(null);
    } finally {
      setCaricando(false);
      URL.revokeObjectURL(previewUrl);
    }
  }

  function rimuovi() {
    startRimozione(async () => {
      const esito = await rimuoviFotoAction(prodottoId);
      if (!esito.ok) {
        mostra(esito.error ?? "Impossibile rimuovere la foto.", "errore");
      } else {
        setUrl(null);
        mostra("Foto rimossa.", "ok");
      }
      setConfermaApri(false);
    });
  }

  const mostrato = anteprima ?? url;

  return (
    <section className="mx-auto mt-8 max-w-xl">
      <span className="mb-2 inline-flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-lagoon">
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
        Foto
      </span>
      <h2 className="mb-3 font-display text-base font-extrabold text-foreground">
        Foto del prodotto
      </h2>
      <div className="flex items-start gap-4">
        <div className="relative aspect-[3/3.4] w-32 shrink-0 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
          {mostrato ? (
            // eslint-disable-next-line @next/next/no-img-element -- url Storage / blob locale
            <img
              src={mostrato}
              alt="Anteprima prodotto"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="tile-cyan-soft grid h-full w-full place-items-center text-white">
              <svg
                viewBox="0 0 100 100"
                fill="currentColor"
                aria-hidden="true"
                className="w-2/5 drop-shadow-[0_6px_12px_rgba(0,40,70,0.25)]"
              >
                <path d="M32 18 L18 28 L24 40 L31 35 L31 84 L69 84 L69 35 L76 40 L82 28 L68 18 C64 24 56 26 50 26 C44 26 36 24 32 18 Z" />
              </svg>
            </div>
          )}
          {caricando && (
            <div className="absolute inset-0 flex items-center justify-center bg-sea/40 font-display text-xs font-bold text-white backdrop-blur-sm">
              Caricamento…
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={onFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={caricando}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-sea px-5 font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
          >
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
              <path d="M12 16V4m0 0L8 8m4-4 4 4M4 20h16" />
            </svg>
            {url ? "Sostituisci foto" : "Carica foto"}
          </button>
          {url && (
            <button
              type="button"
              onClick={() => setConfermaApri(true)}
              disabled={caricando}
              className="flex h-12 items-center justify-center rounded-full bg-white px-5 font-display text-sm font-bold text-coral ring-2 ring-coral/30 transition-all hover:-translate-y-0.5 hover:bg-coral/10 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
            >
              Rimuovi
            </button>
          )}
          <p className="max-w-44 text-xs text-muted">
            JPG, PNG o WebP. L&apos;immagine viene ottimizzata automaticamente.
          </p>
        </div>
      </div>

      <ConfermaDialog
        aperto={confermaApri}
        titolo="Rimuovere la foto?"
        messaggio="La foto verra eliminata dal prodotto. Potrai caricarne un'altra quando vuoi."
        etichettaConferma="Rimuovi"
        inCorso={rimuovendo}
        onConferma={rimuovi}
        onAnnulla={() => setConfermaApri(false)}
      />
    </section>
  );
}
