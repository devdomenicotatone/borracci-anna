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
      <h2 className="mb-3 text-base font-semibold text-foreground">Foto</h2>
      <div className="flex items-start gap-4">
        <div className="relative aspect-[4/5] w-32 shrink-0 overflow-hidden rounded-xl border border-line bg-surface">
          {mostrato ? (
            // eslint-disable-next-line @next/next/no-img-element -- url Storage / blob locale
            <img
              src={mostrato}
              alt="Anteprima prodotto"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-[repeating-linear-gradient(45deg,var(--surface),var(--surface)_10px,var(--background)_10px,var(--background)_20px)]" />
          )}
          {caricando && (
            <div className="absolute inset-0 flex items-center justify-center bg-foreground/30 text-xs font-medium text-background">
              Caricamento…
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
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
            className="flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-foreground/85 disabled:opacity-40"
          >
            {url ? "Sostituisci foto" : "Carica foto"}
          </button>
          {url && (
            <button
              type="button"
              onClick={() => setConfermaApri(true)}
              disabled={caricando}
              className="flex h-11 items-center justify-center rounded-full border border-line px-5 text-sm font-medium text-muted transition-colors hover:text-red-700 disabled:opacity-40"
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
