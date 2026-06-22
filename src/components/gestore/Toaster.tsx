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
              "pointer-events-auto max-w-sm rounded-full px-4 py-2.5 text-sm font-medium shadow-lg",
              t.tipo === "errore"
                ? "bg-red-700 text-white"
                : "bg-foreground text-background",
            ].join(" ")}
          >
            {t.messaggio}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
