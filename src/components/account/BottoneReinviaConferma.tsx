"use client";

// Bottone "Reinvia email di verifica" con countdown anti-spam di 60s dopo
// l'invio. Form separato (mai annidato in un altro form): lo montano il
// pannello "Controlla la posta" post-registrazione e il box del login con
// email non ancora confermata.

import { useActionState, useEffect, useState } from "react";

import {
  reinviaConfermaAction,
  type StatoAuthCliente,
} from "@/lib/account/auth-actions";
import { Spinner } from "@/components/gestore/ui";
import StatoInvio from "@/components/StatoInvio";

export default function BottoneReinviaConferma({ email }: { email: string }) {
  const [stato, formAction, pending] = useActionState<StatoAuthCliente, FormData>(
    reinviaConfermaAction,
    {},
  );
  const [attesa, setAttesa] = useState(0);

  // Al reinvio riuscito parte la finestra di 60s: aggiustamento di stato
  // durante il render (pattern React "adjust state when props change"),
  // confrontando l'identita dell'esito per farlo UNA volta per invio.
  const [ultimoEsito, setUltimoEsito] = useState<StatoAuthCliente | null>(null);
  if (stato !== ultimoEsito) {
    setUltimoEsito(stato);
    if (stato?.ok) setAttesa(60);
  }

  useEffect(() => {
    if (attesa <= 0) return;
    const t = setTimeout(() => setAttesa((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [attesa]);

  return (
    <form action={formAction} className="flex flex-col items-center gap-2">
      <input type="hidden" name="email" value={email} />
      <button
        type="submit"
        disabled={pending || attesa > 0}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 font-display text-sm font-bold text-sea ring-2 ring-sea/30 transition hover:bg-sea/5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending && <Spinner className="h-4 w-4" />}
        {attesa > 0 ? `Reinvia tra ${attesa}s` : "Reinvia email di verifica"}
      </button>
      <StatoInvio attivo={pending} testo="Reinvio dell'email in corso" />
      {/* Esito: live region SEMPRE montata (sr-only quando vuota, per non
          lasciare un buco nel layout): montare l'elemento gia' pieno non viene
          annunciato in modo affidabile, l'inserimento del testo si'. */}
      <p
        role="status"
        className={stato?.ok && attesa > 0 ? "text-xs text-muted" : "sr-only"}
      >
        {stato?.ok && attesa > 0
          ? "Email inviata di nuovo: controlla la posta (anche lo spam)."
          : ""}
      </p>
      {stato?.error && (
        <p role="alert" className="text-xs font-medium text-coral-ink">
          {stato.error}
        </p>
      )}
    </form>
  );
}
