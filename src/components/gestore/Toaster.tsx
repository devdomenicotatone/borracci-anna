"use client";

// Toaster dell'area gestore: context + contenitore aria-live.
// useToast().mostra(messaggio, "ok" | "errore") da qualunque client component.

import {
  createContext,
  useCallback,
  useContext,
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

  const mostra = useCallback((messaggio: string, tipo: TipoToast = "ok") => {
    const id = (counter.current += 1);
    setToasts((t) => [...t, { id, tipo, messaggio }]);
    // Auto-dismiss dopo 3,5s.
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ mostra }}>
      {children}
      {/* Sopra la bottom-nav su mobile (bottom-20), in basso su desktop. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tipo === "errore" ? "alert" : "status"}
            className={[
              "pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-2xl px-4 py-3 font-display text-sm font-bold text-white",
              t.tipo === "errore"
                ? "bg-coral shadow-coral"
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
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
