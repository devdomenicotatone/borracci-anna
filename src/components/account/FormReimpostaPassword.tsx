"use client";

// Nuova password dal link di recovery. La sessione esiste gia (creata da
// verifyOtp in /api/auth/conferma): su successo l'action redirige a
// /account?password=aggiornata.

import { useActionState } from "react";

import {
  reimpostaPasswordAction,
  type StatoAuthCliente,
} from "@/lib/account/auth-actions";
import { Campo } from "@/components/gestore/ui";
import InputPassword from "@/components/account/InputPassword";
import StatoInvio from "@/components/StatoInvio";

export default function FormReimpostaPassword() {
  const [stato, formAction, pending] = useActionState<StatoAuthCliente, FormData>(
    reimpostaPasswordAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Campo
        label="Nuova password"
        htmlFor="password"
        hint="Almeno 8 caratteri."
        errore={stato?.errors?.password}
      >
        <InputPassword id="password" autoComplete="new-password" minLength={8} />
      </Campo>

      <Campo
        label="Ripeti la nuova password"
        htmlFor="conferma"
        errore={stato?.errors?.conferma}
      >
        <InputPassword
          id="conferma"
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

      <button
        type="submit"
        disabled={pending}
        className="flex h-12 items-center justify-center rounded-full bg-sea px-6 font-display font-bold text-white shadow-sea transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
      >
        {pending ? "Salvataggio…" : "Salva la nuova password"}
      </button>
      <StatoInvio
        attivo={pending}
        testo="Salvataggio della nuova password in corso"
      />
    </form>
  );
}
