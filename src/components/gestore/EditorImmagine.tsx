"use client";

// Editor immagini del gestore (modale full-screen). Avvolge Filerobot 5 (crop,
// raddrizza/ruota, luce/contrasto, filtri, watermark) e aggiunge la RIMOZIONE
// SFONDO via @imgly/background-removal (in-browser, gratis).
//
// Caricamento: questo componente e import-ato in modo lazy (next/dynamic,
// ssr:false) dal chiamante, quindi Filerobot + konva pesano solo quando si apre
// l'editor. @imgly viene caricato ancora piu tardi, solo al click "Rimuovi
// sfondo" (porta con se il runtime ONNX + scarica un modello la prima volta).
//
// Salvataggio: l'output di Filerobot e WebP q0.92 a risoluzione nativa
// (savingPixelRatio=1, niente upscale). Lo trasformiamo in File, rigeneriamo il
// blur LQIP e sostituiamo la foto in place via sostituisciFotoAction.

import { useEffect, useRef, useState } from "react";
import FilerobotImageEditor, {
  TABS,
  TOOLS,
} from "react-filerobot-image-editor";
import { StyleSheetManager } from "styled-components";
import isPropValid from "@emotion/is-prop-valid";

import { generaBlurDataUrl } from "@/lib/blur";
import { autoTrimmaImmagine } from "@/lib/trim";
import {
  sostituisciFotoAction,
  type FotoGalleriaRow,
} from "@/lib/gestore/actions";
import { useToast } from "@/components/gestore/Toaster";

// Filerobot (pensato per React 18 / styled-components v5) inoltra props camelCase
// non-standard agli elementi DOM: React 19 + styled-components v6 lo segnalano a
// raffica in console. Filtriamo: sugli elementi host inoltra solo attributi HTML
// validi; ai componenti (target non-string) lascia passare tutto.
function inoltraProp(prop: string, element: unknown): boolean {
  return typeof element === "string" ? isPropValid(prop) : true;
}

export default function EditorImmagine({
  url,
  prodottoId,
  fotoId,
  onChiudi,
  onSalvata,
}: {
  url: string;
  prodottoId: string;
  fotoId: string;
  onChiudi: () => void;
  onSalvata: (foto: FotoGalleriaRow[]) => void;
}) {
  const { mostra } = useToast();
  // Sorgente corrente dell'editor: parte dal master, cambia se si rimuove lo
  // sfondo (Filerobot ricarica grazie a resetOnSourceChange).
  const [sorgente, setSorgente] = useState(url);
  const [salvando, setSalvando] = useState(false);
  const [sfondo, setSfondo] = useState<{ fase: string; pct: number } | null>(
    null,
  );
  // Object URL creati per i risultati senza-sfondo: da revocare per non perderli
  // in memoria.
  const objectUrls = useRef<string[]>([]);

  useEffect(
    () => () => {
      for (const u of objectUrls.current) URL.revokeObjectURL(u);
    },
    [],
  );

  // Preview piu nitido su schermi retina; il salvataggio resta a pixelRatio 1.
  const previewRatio =
    typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

  async function rimuoviSfondo() {
    if (sfondo) return;
    setSfondo({ fase: "Preparazione…", pct: 0 });
    try {
      const { removeBackground } = await import("@imgly/background-removal");
      const blob = await removeBackground(sorgente, {
        // Modello pieno = massima qualita di ritaglio (download piu grande la
        // prima volta, poi resta in cache). Utile sui capi difficili: azzurro su
        // sfondo chiaro, manichino, sfondo del banco affollato.
        model: "isnet",
        output: { format: "image/png" }, // PNG: conserva la trasparenza
        progress: (key, current, total) => {
          const fase = key.startsWith("fetch")
            ? "Scaricamento modello…"
            : "Elaborazione…";
          setSfondo({
            fase,
            pct: total ? Math.round((current / total) * 100) : 0,
          });
        },
      });
      // Dopo la rimozione lo sfondo il capo galleggia in un rettangolo
      // trasparente: ritagliamo l'alone cosi torna centrato e pronto da salvare.
      const { blob: pulita } = await autoTrimmaImmagine(blob);
      const nuovo = URL.createObjectURL(pulita);
      objectUrls.current.push(nuovo);
      setSorgente(nuovo);
      mostra("Sfondo rimosso. Ora puoi rifinire e salvare.", "ok");
    } catch {
      mostra("Rimozione sfondo non riuscita. Riprova.", "errore");
    } finally {
      setSfondo(null);
    }
  }

  async function salva(saved: { imageBase64?: string }) {
    if (!saved.imageBase64 || salvando) return;
    setSalvando(true);
    try {
      const blob = await (await fetch(saved.imageBase64)).blob();
      const file = new File([blob], "foto.webp", { type: "image/webp" });
      const blur = (await generaBlurDataUrl(file)) ?? "";

      const fd = new FormData();
      fd.append("foto", file, "foto.webp");
      if (blur) fd.append("blur", blur);

      const esito = await sostituisciFotoAction(prodottoId, fotoId, fd);
      if (!esito.ok || !esito.foto) {
        mostra(esito.error ?? "Salvataggio non riuscito.", "errore");
        return;
      }
      onSalvata(esito.foto);
      mostra("Foto aggiornata.", "ok");
      onChiudi();
    } catch {
      mostra("Salvataggio non riuscito. Riprova.", "errore");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-foreground">
      <div className="flex shrink-0 items-center justify-between gap-3 bg-foreground px-4 py-2.5 text-white">
        <span className="font-display text-sm font-bold">Editor foto</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={rimuoviSfondo}
            disabled={sfondo !== null || salvando}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-bold text-white ring-1 ring-white/20 transition-colors hover:bg-white/20 disabled:opacity-50"
          >
            {sfondo ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                {sfondo.fase} {sfondo.pct > 0 ? `${sfondo.pct}%` : ""}
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                  <path d="M3 3h18v18H3z" strokeDasharray="3 3" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-3.6-3.6a2 2 0 0 0-2.8 0L7 19" />
                </svg>
                Rimuovi sfondo
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onChiudi}
            disabled={salvando}
            className="inline-flex h-9 items-center rounded-full px-4 text-sm font-bold text-white/80 transition-colors hover:text-white disabled:opacity-50"
          >
            Chiudi
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <StyleSheetManager shouldForwardProp={inoltraProp}>
          <FilerobotImageEditor
            source={sorgente}
            onSave={salva}
            onClose={onChiudi}
            onBeforeSave={() => false} // niente modale "salva come": salviamo noi
            resetOnSourceChange
            showBackButton={false}
            language="it"
            defaultSavedImageType="webp"
            defaultSavedImageQuality={0.92}
            savingPixelRatio={1} // niente upscale: risoluzione nativa del master
            previewPixelRatio={previewRatio}
            tabsIds={[TABS.ADJUST, TABS.FINETUNE, TABS.FILTERS, TABS.WATERMARK]}
            defaultTabId={TABS.ADJUST}
            defaultToolId={TOOLS.CROP}
          />
        </StyleSheetManager>
      </div>
    </div>
  );
}
