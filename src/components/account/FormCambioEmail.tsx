"use client";

// Card "Email": avvia il cambio email ("secure email change" di Supabase:
// conferma su ENTRAMBE le caselle). Alla conferma finale, il trigger DB
// sincronizza clienti.email e aggancia gli ordini della nuova email.

import { useActionState, useEffect, useRef } from "react";

import {
  cambiaEmailAction,
  type StatoAuthCliente,
} from "@/lib/account/auth-actions";
import { Campo, Spinner, inputCls } from "@/components/gestore/ui";
import StatoInvio from "@/components/StatoInvio";

export default function FormCambioEmail() {
  const [stato, formAction, pending] = useActionState<StatoAuthCliente, FormData>(
    cambiaEmailAction,
    {},
  );

  // Su ok il form SPARISCE e resta solo il messaggio: senza spostare il focus
  // cadrebbe sul body e gli screen reader non annuncerebbero nulla. Stesso
  // pattern di PannelloEmailInviata: focus sul messaggio al montaggio.
  const messaggioRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (stato?.ok) messaggioRef.current?.focus();
  }, [stato?.ok]);

  if (stato?.ok) {
    return (
      <p
        ref={messaggioRef}
        tabIndex={-1}
        className="text-sm leading-relaxed text-muted outline-none"
      >
        {stato.messaggio}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Campo
        label="Nuova email"
        htmlFor="nuova-email"
        hint="Riceverai un link di conferma a entrambi gli indirizzi."
        errore={stato?.errors?.email}
      >
        <input
          id="nuova-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          className={inputCls}
        />
      </Campo>

      {stato?.error && (
        <p role="alert" className="text-sm font-medium text-coral-ink">
          {stato.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex h-12 items-center justify-center gap-2 self-start rounded-full bg-sea px-6 font-display text-sm font-bold text-white shadow-sea transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
      >
        {pending && <Spinner className="h-4 w-4" />}
        {pending ? "Invio in corso…" : "Cambia email"}
      </button>
      <StatoInvio attivo={pending} />
    </form>
  );
}
