"use client";

// Switch attivo/non-attivo di un prodotto, con aggiornamento ottimistico e
// revert (+ toast) se la Server Action fallisce.

import { useState, useTransition } from "react";

import { toggleAttivoAction } from "@/lib/gestore/actions";
import { useToast } from "@/components/gestore/Toaster";

export default function ToggleAttivo({
  id,
  attivo,
}: {
  id: string;
  attivo: boolean;
}) {
  const [on, setOn] = useState(attivo);
  const [pending, startTransition] = useTransition();
  const { mostra } = useToast();

  function toggle() {
    const nuovo = !on;
    setOn(nuovo); // ottimistico
    startTransition(async () => {
      const esito = await toggleAttivoAction(id, nuovo);
      if (!esito.ok) {
        setOn(!nuovo); // revert
        mostra(esito.error ?? "Impossibile aggiornare lo stato.", "errore");
      }
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? "Disattiva prodotto" : "Attiva prodotto"}
      onClick={toggle}
      disabled={pending}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        on ? "bg-foreground" : "bg-line",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-5 w-5 transform rounded-full bg-surface shadow transition-transform",
          on ? "translate-x-5" : "translate-x-0.5",
        ].join(" ")}
      />
    </button>
  );
}
