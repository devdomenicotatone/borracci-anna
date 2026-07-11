"use client";

// Richiesta di reset password: esito SEMPRE neutro (anti-enumeration), quindi
// su ok il form lascia il posto al pannello "email inviata".

import { useActionState } from "react";

import {
  recuperaPasswordAction,
  type StatoAuthCliente,
} from "@/lib/account/auth-actions";
import { Campo, inputCls } from "@/components/gestore/ui";
import PannelloEmailInviata from "@/components/account/PannelloEmailInviata";

export default function FormPasswordDimenticata() {
  const [stato, formAction, pending] = useActionState<StatoAuthCliente, FormData>(
    recuperaPasswordAction,
    {},
  );

  if (stato?.ok) {
    return (
      <PannelloEmailInviata titolo="Controlla la posta">
        <p>{stato.messaggio}</p>
      </PannelloEmailInviata>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Campo label="Email" htmlFor="email" errore={stato?.errors?.email}>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          defaultValue={stato?.valori?.email ?? ""}
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
        className="flex h-12 items-center justify-center rounded-full bg-sea px-6 font-display font-bold text-white shadow-sea transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
      >
        {pending ? "Invio in corso…" : "Inviami il link di recupero"}
      </button>
    </form>
  );
}
