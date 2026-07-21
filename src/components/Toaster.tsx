"use client";

// Toaster condiviso (vetrina + area gestore): context + contenitore aria-live.
// useToast().mostra(messaggio, "ok" | "errore") da qualunque client component.
// Storicamente viveva in components/gestore/Toaster.tsx, che ora ne fa il re-export.

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type TipoToast = "ok" | "errore";

interface Toast {
  id: number;
  tipo: TipoToast;
  messaggio: string;
}

interface ToastContextValue {
  mostra: (messaggio: string, tipo?: TipoToast) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast deve essere usato dentro <ToasterProvider>.");
  }
  return ctx;
}

export function ToasterProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  // Id dei timeout di auto-dismiss ancora attivi, per ripulirli allo smontaggio.
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  // Solo nell'area gestore esiste una bottom-nav mobile (AdminNav) da scavalcare.
  const pathname = usePathname();
  const inGestore = pathname.startsWith("/gestore");

  const mostra = useCallback((messaggio: string, tipo: TipoToast = "ok") => {
    const id = (counter.current += 1);
    setToasts((t) => [...t, { id, tipo, messaggio }]);
    // Gli errori NON si auto-chiudono (WCAG 2.2.1): per il checkout il toast
    // e l'unico canale del messaggio (anche testi lunghi dal server) e un
    // timer fisso non basta a leggerli. Restano finche l'utente non li chiude
    // col bottone/tap gia presente sul toast.
    if (tipo === "errore") return;
    // Auto-dismiss dei toast informativi: base 3,5s + 50ms per ogni carattere
    // oltre i 40, cosi anche i testi lunghi restano leggibili (oltre alla
    // chiusura manuale al tap).
    const durata = 3500 + Math.max(0, messaggio.length - 40) * 50;
    const timer = setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
      timers.current.delete(timer);
    }, durata);
    timers.current.add(timer);
  }, []);

  // Chiusura anticipata al tap sul toast; l'eventuale timeout residuo che
  // scatterà più tardi filtra un id ormai assente ed è innocuo.
  const rimuovi = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  // Cleanup: cancella i timeout pendenti allo smontaggio del provider.
  useEffect(() => {
    const attivi = timers.current;
    return () => {
      attivi.forEach(clearTimeout);
    };
  }, []);

  return (
    <ToastContext.Provider value={{ mostra }}>
      {children}
      {/* Su mobile: nel gestore sopra la bottom-nav (AdminNav, h-16 + safe-area),
          in vetrina (che non ha bottom-nav) appena sopra il fondo. Desktop: bottom-6. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className={[
          "pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6",
          inGestore
            ? "bottom-[calc(env(safe-area-inset-bottom)+5rem)]"
            : "bottom-[calc(env(safe-area-inset-bottom)+1rem)]",
        ].join(" ")}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tipo === "errore" ? "alert" : "status"}
            className={[
              "pointer-events-auto relative flex max-w-sm items-center gap-2.5 rounded-2xl px-4 py-3 font-display text-sm font-bold text-white",
              // coral-ink e non coral: col testo bianco il coral pieno si
              // ferma a 3.03:1, l'ink (#d62828) regge l'AA (WCAG 1.4.3).
              t.tipo === "errore"
                ? "bg-coral-ink shadow-coral"
                : "bg-sea shadow-sea",
            ].join(" ")}
          >
            <span
              aria-hidden="true"
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/20"
            >
              {t.tipo === "errore" ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  className="h-3 w-3"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3 w-3"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </span>
            {t.messaggio}
            {/* Tap/Invio ovunque sul toast per chiuderlo senza aspettare il
                timer; per gli errori (senza auto-dismiss) e l'unica chiusura. */}
            <button
              type="button"
              aria-label="Chiudi la notifica"
              onClick={() => rimuovi(t.id)}
              className="absolute inset-0 rounded-2xl"
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
