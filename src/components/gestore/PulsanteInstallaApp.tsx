"use client";

// Pulsante "Installa come app" dell'area gestore. Chrome/Edge emettono
// `beforeinstallprompt` quando la pagina ha un manifest installabile e l'app
// NON e' gia' installata: il pulsante quindi appare solo quando ha senso e
// sparisce da solo dopo l'installazione, dentro l'app stessa e sui browser
// senza supporto (iOS/Firefox: li' resta la via manuale del browser).
// Montato due volte in AdminNav (sidebar desktop + header mobile): ogni
// istanza cattura il proprio riferimento all'evento, ma i breakpoint ne
// mostrano una sola per volta.

import { useEffect, useRef, useState } from "react";

// L'evento non e' nei tipi DOM standard (spec incubator, solo Chromium).
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

function IconaInstalla({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="m8 11 4 4 4-4" />
      <path d="M4 21h16" />
    </svg>
  );
}

export default function PulsanteInstallaApp({
  variante,
}: {
  /** "sidebar": voce testuale a tutta larghezza; "compatta": icona per l'header mobile. */
  variante: "sidebar" | "compatta";
}) {
  const evento = useRef<BeforeInstallPromptEvent | null>(null);
  const [installabile, setInstallabile] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // Sospende il mini-prompt automatico di Chrome: decide il pulsante.
      e.preventDefault();
      evento.current = e as BeforeInstallPromptEvent;
      setInstallabile(true);
    };
    const onInstallata = () => {
      evento.current = null;
      setInstallabile(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstallata);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstallata);
    };
  }, []);

  if (!installabile) return null;

  const installa = async () => {
    const e = evento.current;
    if (!e) return;
    // prompt() e' consumabile UNA volta: il pulsante si nasconde subito; se
    // l'utente rifiuta, Chrome rilancera' beforeinstallprompt piu' avanti e
    // il pulsante ricomparira'.
    evento.current = null;
    setInstallabile(false);
    await e.prompt();
    await e.userChoice;
  };

  if (variante === "compatta") {
    return (
      <button
        type="button"
        onClick={installa}
        aria-label="Installa l'app gestore"
        title="Installa l'app gestore"
        className="grid h-9 w-9 place-items-center rounded-full text-sea transition-colors hover:bg-surface"
      >
        <IconaInstalla className="h-5 w-5" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={installa}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-muted transition-colors hover:bg-background hover:text-foreground"
    >
      <IconaInstalla className="h-5 w-5" />
      Installa come app
    </button>
  );
}
