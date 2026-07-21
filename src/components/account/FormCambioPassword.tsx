"use client";

// Card "Password": cambio password da loggato (riverifica dell'attuale).
// React 19 resetta i campi non controllati dopo l'action: su ok il form
// torna pulito e resta il messaggio di conferma.

import { useActionState } from "react";

import {
  cambiaPasswordAction,
  type StatoAuthCliente,
} from "@/lib/account/auth-actions";
import { Campo, Spinner } from "@/components/gestore/ui";
import InputPassword from "@/components/account/InputPassword";
import StatoInvio from "@/components/StatoInvio";

export default function FormCambioPassword() {
  const [stato, formAction, pending] = useActionState<StatoAuthCliente, FormData>(
    cambiaPasswordAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Campo label="Password attuale" htmlFor="attuale">
        <InputPassword
          id="attuale"
          name="attuale"
          autoComplete="current-password"
        />
      </Campo>

      <Campo
        label="Nuova password"
        htmlFor="nuova-password"
        hint="Almeno 8 caratteri."
        errore={stato?.errors?.password}
      >
        <InputPassword
          id="nuova-password"
          autoComplete="new-password"
          minLength={8}
        />
      </Campo>

      <Campo
        label="Ripeti la nuova password"
        htmlFor="conferma-password"
        errore={stato?.errors?.conferma}
      >
        <InputPassword
          id="conferma-password"
          name="conferma"
          autoComplete="new-password"
          minLength={8}
        />
      </Campo>

      {stato?.error && (
        <p role="alert" className="text-sm font-medium text-coral-ink">
          {stato.error}
        </p>
      )}
      {/* Esito: live region SEMPRE montata (sr-only quando vuota, per non
          lasciare un buco nel layout): montare l'elemento gia' pieno non viene
          annunciato in modo affidabile, l'inserimento del testo si'. */}
      <p
        role="status"
        className={stato?.ok ? "text-sm font-medium text-sea" : "sr-only"}
      >
        {stato?.ok ? "Password aggiornata." : ""}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="flex h-12 items-center justify-center gap-2 self-start rounded-full bg-sea px-6 font-display text-sm font-bold text-white shadow-sea transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
      >
        {pending && <Spinner className="h-4 w-4" />}
        {pending ? "Aggiornamento…" : "Aggiorna password"}
      </button>
      <StatoInvio
        attivo={pending}
        testo="Aggiornamento della password in corso"
      />
    </form>
  );
}
