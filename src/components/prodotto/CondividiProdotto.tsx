"use client";

// Pannello "Condividi" del prodotto: condivisione nativa del telefono (con la
// FOTO, dove supportata), copia link, WhatsApp ed email.
//
// Due varianti d'innesto, con una differenza voluta di contenuto:
//   - "pill"  (default): bottone testuale con popover ancorato. Usato nella PDP.
//              In testa mostra la MINI-ANTEPRIMA (foto + nome + prezzo) di cio
//              che si sta per mandare: al cliente il QR non serviva (e gia sulla
//              pagina col suo dispositivo) ed era ingombrante.
//   - "icona": bottoncino tondo che apre una MODALE centrata (portale su body).
//              Serve nella lista gestore, dove il contenitore ha overflow-hidden
//              e un popover ancorato verrebbe tagliato. QUI resta il QR
//              scaricabile: il gestore lo stampa per il negozio.
//
// Il QR e la libreria `qrcode` sono caricati LAZY alla prima apertura della
// modale gestore (import dinamico), cosi non entrano nel bundle iniziale.

import Image from "next/image";
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

/** Estensione file da MIME, per dare un nome sensato al file condiviso. */
function estensione(mime: string): string {
  if (mime.includes("webp")) return "webp";
  if (mime.includes("png")) return "png";
  return "jpg";
}

// Elementi tabbabili dentro il pannello: per il focus iniziale e il focus-trap.
const FOCUSABILI =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function CondividiProdotto({
  slug,
  nome,
  immagine = null,
  prezzo = null,
  variante = "pill",
}: {
  slug: string;
  nome: string;
  /** Foto del prodotto: inclusa nella condivisione nativa dove supportata. */
  immagine?: string | null;
  /** Prezzo gia formattato (es. "19,00 €"): arricchisce il testo condiviso. */
  prezzo?: string | null;
  variante?: "pill" | "icona";
}) {
  const [aperto, setAperto] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [qrErrore, setQrErrore] = useState(false);
  const [copia, setCopia] = useState<"idle" | "ok" | "errore">("idle");
  const contenitore = useRef<HTMLDivElement>(null);
  const pannelloRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  // Esc + focus-trap + focus-return + scroll-lock (modale) + click-esterno (pill).
  useEffect(() => {
    if (!aperto) return;
    const trigger = triggerRef.current;
    const cont = contenitore.current;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAperto(false);
        return;
      }
      // Focus-trap: solo nella MODALE (icona), che blocca la pagina. Nel popover
      // non-modale il Tab deve poter uscire — e uscendo lo chiude (vedi focusout).
      if (e.key !== "Tab" || variante !== "icona") return;
      const p = pannelloRef.current;
      if (!p) return;
      const focusabili = [...p.querySelectorAll<HTMLElement>(FOCUSABILI)];
      if (focusabili.length === 0) return;
      const primo = focusabili[0];
      const ultimo = focusabili[focusabili.length - 1];
      if (e.shiftKey && document.activeElement === primo) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primo.focus();
      }
    }
    document.addEventListener("keydown", onKey);

    // Popover (pill): niente trap. Si chiude al click fuori e quando il focus
    // esce (Tab-out), cosi non resta aperto orfano dietro la navigazione.
    let onClick: ((e: MouseEvent) => void) | undefined;
    let onFocusOut: ((e: FocusEvent) => void) | undefined;
    if (variante === "pill" && cont) {
      onClick = (e: MouseEvent) => {
        if (!cont.contains(e.target as Node)) setAperto(false);
      };
      document.addEventListener("mousedown", onClick);
      onFocusOut = (e: FocusEvent) => {
        if (!cont.contains(e.relatedTarget as Node | null)) setAperto(false);
      };
      cont.addEventListener("focusout", onFocusOut);
    }

    // La modale copre la pagina: blocca lo scroll dietro finche e aperta.
    const overflowPrec = document.body.style.overflow;
    if (variante === "icona") document.body.style.overflow = "hidden";

    // Sposta il focus dentro il pannello, gia montato a questo punto: l'effect
    // gira dopo il commit (portale della modale incluso). Sincrono, senza rAF,
    // cosi funziona anche quando la tab non e in primo piano.
    const p = pannelloRef.current;
    const primoFocus = p?.querySelector<HTMLElement>(FOCUSABILI);
    (primoFocus ?? p)?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      if (onClick) document.removeEventListener("mousedown", onClick);
      if (onFocusOut) cont?.removeEventListener("focusout", onFocusOut);
      if (variante === "icona") document.body.style.overflow = overflowPrec;
      // Riporta il focus al trigger: chi naviga da tastiera non lo perde.
      trigger?.focus();
    };
  }, [aperto, variante]);

  // Apre il pannello; solo la modale gestore genera il QR alla prima apertura
  // (import dinamico di `qrcode`): in vetrina il QR non c'e piu.
  async function apri() {
    setAperto(true);
    if (variante !== "icona" || qr || qrErrore) return;
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

  const url = risolviUrl();
  // Testo brandizzato col prezzo: anteprima piu invogliante di nome+link secco.
  const frase = `Guarda ${nome}${prezzo ? ` a ${prezzo}` : ""} su Anna Shop`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(`${frase}\n${url}`)}`;
  const mailHref = `mailto:?subject=${encodeURIComponent(nome)}&body=${encodeURIComponent(`${frase}\n${url}`)}`;

  async function condividiNativo() {
    const base: ShareData = { title: nome, text: frase, url };
    try {
      // Prova a includere la foto: WhatsApp/Instagram la mostrano in anteprima.
      // Se non e recuperabile o non condivisibile, ripiega sul solo link.
      if (immagine && typeof navigator.canShare === "function") {
        try {
          const resp = await fetch(immagine);
          if (resp.ok) {
            const blob = await resp.blob();
            const file = new File([blob], `${slug}.${estensione(blob.type)}`, {
              type: blob.type,
            });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({ ...base, files: [file] });
              setAperto(false);
              return;
            }
          }
        } catch {
          // foto non recuperabile: procede con la condivisione del solo link
        }
      }
      await navigator.share(base);
      setAperto(false);
    } catch {
      // condivisione annullata dall'utente: nessuna azione
    }
  }

  async function copiaLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopia("ok");
      // Lascia leggere il "copiato", poi chiudi.
      window.setTimeout(() => setAperto(false), 900);
    } catch {
      // clipboard non disponibile: segnala e lascia gli altri canali (WA/email)
      setCopia("errore");
      window.setTimeout(() => setCopia("idle"), 2500);
    }
  }

  // Blocco QR: SOLO nella modale gestore (scarica/stampa per il negozio).
  const bloccoQr = (
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
  );

  // Mini-anteprima di cio che si sta per mandare: foto + nome + prezzo.
  // Sostituisce il QR nel popover della vetrina.
  const anteprima = (
    <div className="flex items-center gap-3 rounded-2xl bg-surface p-2.5 ring-1 ring-line">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-line">
        {immagine ? (
          <Image
            src={immagine}
            alt={nome}
            fill
            sizes="56px"
            className="object-contain p-1"
          />
        ) : (
          <svg
            viewBox="0 0 100 100"
            fill="currentColor"
            aria-hidden="true"
            className="absolute inset-0 m-auto h-8 w-8 text-line"
          >
            <path d="M32 18 L18 28 L24 40 L31 35 L31 84 L69 84 L69 35 L76 40 L82 28 L68 18 C64 24 56 26 50 26 C44 26 36 24 32 18 Z" />
          </svg>
        )}
      </div>
      <div className="min-w-0">
        <p className="line-clamp-2 font-display text-sm font-bold leading-snug text-foreground">
          {nome}
        </p>
        {prezzo && (
          <p className="mt-0.5 font-display text-sm font-extrabold text-coral">
            {prezzo}
          </p>
        )}
      </div>
    </div>
  );

  // Canali di condivisione, comuni a popover e modale.
  const azioni = (
    <div className="flex flex-col gap-1">
        {nativoOk && (
          <button type="button" onClick={condividiNativo} className={RIGA_AZIONE}>
            <IconaShare className="h-4 w-4 text-sea" />
            Condividi…
          </button>
        )}

        <button
          type="button"
          onClick={copiaLink}
          className={RIGA_AZIONE}
          aria-live="polite"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-4 w-4 ${copia === "errore" ? "text-coral" : "text-sea"}`}
            aria-hidden="true"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {copia === "ok"
            ? "Link copiato!"
            : copia === "errore"
              ? "Copia non riuscita"
              : "Copia link"}
        </button>

        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setAperto(false)}
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

        <a href={mailHref} onClick={() => setAperto(false)} className={RIGA_AZIONE}>
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
  );

  // --- Variante "icona": trigger tondo + modale centrata (portale) -----------
  if (variante === "icona") {
    return (
      <>
        <button
          ref={triggerRef}
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
              className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
              onClick={() => setAperto(false)}
            >
              <div
                ref={pannelloRef}
                role="dialog"
                aria-modal="true"
                aria-label={`Condividi ${nome}`}
                tabIndex={-1}
                onClick={(e) => e.stopPropagation()}
                className="animate-pop-in w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl outline-none ring-1 ring-line"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-xs font-bold uppercase tracking-wide text-sea">
                      Condividi / QR
                    </p>
                    <p className="truncate font-display text-sm font-bold text-foreground">
                      {nome}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAperto(false)}
                    aria-label="Chiudi"
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
                {bloccoQr}
                <div className="my-3 h-px bg-line" />
                {azioni}
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
        ref={triggerRef}
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
          ref={pannelloRef}
          role="dialog"
          aria-label="Condividi questo prodotto"
          tabIndex={-1}
          className="animate-pop-in absolute right-0 top-full z-30 mt-2 w-72 origin-top-right rounded-2xl bg-white p-4 text-left shadow-xl outline-none ring-1 ring-line"
        >
          {anteprima}
          <div className="my-3 h-px bg-line" />
          {azioni}
        </div>
      )}
    </div>
  );
}
