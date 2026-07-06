"use client";

// Pannello "Condividi" del prodotto: QR scaricabile/stampabile + condivisione
// nativa del telefono, copia link, WhatsApp ed email. Rende disponibile ai
// clienti (e al gestore) cio che il browser fa dalla barra indirizzi.
//
// Due varianti d'innesto, stesso contenuto:
//   - "pill"  (default): bottone testuale con popover ancorato. Usato nella PDP.
//   - "icona": bottoncino tondo che apre una MODALE centrata (portale su body).
//              Serve nella lista gestore, dove il contenitore ha overflow-hidden
//              e un popover ancorato verrebbe tagliato.
//
// Il QR e la libreria `qrcode` sono caricati LAZY alla prima apertura (import
// dinamico), cosi non entrano nel bundle iniziale.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Classe condivisa delle righe-azione (icona + etichetta).
const RIGA_AZIONE =
  "flex items-center gap-2.5 rounded-xl px-3 py-2 text-left font-display text-sm font-semibold text-foreground transition-colors hover:bg-surface";

/** Icona "condividi" (nodi), usata sia nel trigger sia nell'azione nativa. */
function IconaShare({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}

export default function CondividiProdotto({
  slug,
  nome,
  variante = "pill",
}: {
  slug: string;
  nome: string;
  variante?: "pill" | "icona";
}) {
  const [aperto, setAperto] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [qrErrore, setQrErrore] = useState(false);
  const [copiato, setCopiato] = useState(false);
  const contenitore = useRef<HTMLDivElement>(null);

  // URL canonico del prodotto, risolto su richiesta. In produzione la base
  // arriva da NEXT_PUBLIC_SITE_URL (inline lato client); in anteprima locale,
  // dove non e configurato, si usa l'origin del browser. Popover/modale sono
  // client-only (compaiono dopo il click), quindi qui `window` c'e sempre.
  function risolviUrl(): string {
    const base = process.env.NEXT_PUBLIC_SITE_URL || "";
    if (base) return `${base.replace(/\/+$/, "")}/prodotti/${slug}`;
    if (typeof window !== "undefined") {
      return `${window.location.origin}/prodotti/${slug}`;
    }
    return `/prodotti/${slug}`;
  }

  // Condivisione nativa (sheet di sistema): presente soprattutto su mobile.
  // Calcolata al render: e usata solo dentro il pannello aperto, quindi
  // `navigator` e definito e non c'e mismatch di idratazione.
  const nativoOk = typeof navigator !== "undefined" && !!navigator.share;

  // Chiusura con Esc (sempre) e, nella variante popover, con click esterno. La
  // modale gestisce il click fuori tramite l'overlay.
  useEffect(() => {
    if (!aperto) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAperto(false);
    }
    document.addEventListener("keydown", onKey);
    let onClick: ((e: MouseEvent) => void) | undefined;
    if (variante === "pill") {
      onClick = (e: MouseEvent) => {
        if (
          contenitore.current &&
          !contenitore.current.contains(e.target as Node)
        ) {
          setAperto(false);
        }
      };
      document.addEventListener("mousedown", onClick);
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      if (onClick) document.removeEventListener("mousedown", onClick);
    };
  }, [aperto, variante]);

  // Apre e genera il QR alla prima apertura (import dinamico di `qrcode`).
  async function apri() {
    setAperto(true);
    if (qr || qrErrore) return;
    try {
      const QRCode = (await import("qrcode")).default;
      const dataUrl = await QRCode.toDataURL(risolviUrl(), {
        margin: 2, // zona di rispetto: piu affidabile in scansione/stampa
        errorCorrectionLevel: "Q",
        width: 640,
        color: { dark: "#0a1f33", light: "#ffffff" }, // navy brand su bianco
      });
      setQr(dataUrl);
    } catch {
      setQrErrore(true);
    }
  }

  function scaricaQr() {
    if (!qr) return;
    const a = document.createElement("a");
    a.href = qr;
    a.download = `qr-${slug}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function condividiNativo() {
    try {
      await navigator.share({ title: nome, text: nome, url: risolviUrl() });
      setAperto(false);
    } catch {
      // condivisione annullata dall'utente: nessuna azione
    }
  }

  async function copiaLink() {
    try {
      await navigator.clipboard.writeText(risolviUrl());
      setCopiato(true);
      window.setTimeout(() => setCopiato(false), 2000);
    } catch {
      // clipboard non disponibile: restano gli altri canali (WhatsApp/email)
    }
  }

  const url = risolviUrl();
  const waHref = `https://wa.me/?text=${encodeURIComponent(`${nome} ${url}`)}`;
  const mailHref = `mailto:?subject=${encodeURIComponent(nome)}&body=${encodeURIComponent(`${nome}\n${url}`)}`;

  // Contenuto condiviso da popover e modale: QR + canali di condivisione.
  const pannello = (
    <>
      <div className="flex flex-col items-center">
        <div className="grid h-40 w-40 place-items-center rounded-xl bg-white ring-1 ring-line">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL locale, next/image non adatto
            <img
              src={qr}
              alt={`Codice QR del prodotto ${nome}`}
              className="h-36 w-36"
            />
          ) : qrErrore ? (
            <span className="px-3 text-center text-xs text-muted">
              QR non disponibile
            </span>
          ) : (
            <span className="text-xs text-muted">Genero il QR…</span>
          )}
        </div>
        <p className="mt-2 text-center text-xs text-muted">
          Inquadra col telefono per aprire questa pagina
        </p>
        <button
          type="button"
          onClick={scaricaQr}
          disabled={!qr}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-display text-xs font-bold text-sea ring-1 ring-sea/25 transition-colors hover:bg-sea/10 disabled:cursor-not-allowed disabled:opacity-40"
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
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          Scarica QR
        </button>
      </div>

      <div className="my-3 h-px bg-line" />

      <div className="flex flex-col gap-1">
        {nativoOk && (
          <button type="button" onClick={condividiNativo} className={RIGA_AZIONE}>
            <IconaShare className="h-4 w-4 text-sea" />
            Condividi…
          </button>
        )}

        <button type="button" onClick={copiaLink} className={RIGA_AZIONE}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 text-sea"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {copiato ? "Link copiato!" : "Copia link"}
        </button>

        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className={RIGA_AZIONE}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 text-sea"
            aria-hidden="true"
          >
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
          </svg>
          WhatsApp
        </a>

        <a href={mailHref} className={RIGA_AZIONE}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 text-sea"
            aria-hidden="true"
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 6-10 7L2 6" />
          </svg>
          Email
        </a>
      </div>
    </>
  );

  // --- Variante "icona": trigger tondo + modale centrata (portale) -----------
  if (variante === "icona") {
    return (
      <>
        <button
          type="button"
          onClick={() => (aperto ? setAperto(false) : apri())}
          aria-haspopup="dialog"
          aria-expanded={aperto}
          title="Condividi / QR"
          aria-label={`Condividi ${nome}`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted ring-1 ring-line transition-colors hover:text-sea hover:ring-sea"
        >
          <IconaShare />
        </button>

        {aperto &&
          createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
              onClick={() => setAperto(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`Condividi ${nome}`}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl ring-1 ring-line"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-xs font-bold uppercase tracking-wide text-sea">
                      Condividi
                    </p>
                    <p className="truncate font-display text-sm font-bold text-foreground">
                      {nome}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAperto(false)}
                    aria-label="Chiudi"
                    autoFocus
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                      aria-hidden="true"
                    >
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {pannello}
              </div>
            </div>,
            document.body,
          )}
      </>
    );
  }

  // --- Variante "pill" (default): popover ancorato -----------------------------
  return (
    <div ref={contenitore} className="relative">
      <button
        type="button"
        onClick={() => (aperto ? setAperto(false) : apri())}
        aria-haspopup="dialog"
        aria-expanded={aperto}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-display text-xs font-bold text-sea ring-1 ring-sea/25 transition-colors hover:bg-sea/10"
      >
        <IconaShare />
        Condividi
      </button>

      {aperto && (
        <div
          role="dialog"
          aria-label="Condividi questo prodotto"
          className="absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl bg-white p-4 text-left shadow-xl ring-1 ring-line"
        >
          {pannello}
        </div>
      )}
    </div>
  );
}
