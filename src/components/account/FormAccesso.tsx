"use client";

// Form di accesso clienti (email + password), pattern useActionState come
// FormLogin del gestore. Se l'email non e ancora verificata mostra, SOTTO il
// form (mai annidato), il box con la CTA di reinvio conferma.

import Link from "next/link";
import { useActionState, useState } from "react";

import {
  loginClienteAction,
  type StatoAuthCliente,
} from "@/lib/account/auth-actions";
import { Campo, inputCls } from "@/components/gestore/ui";
import InputPassword from "@/components/account/InputPassword";
import BottoneReinviaConferma from "@/components/account/BottoneReinviaConferma";

export default function FormAccesso({
  da,
  erroreIniziale,
}: {
  /** Destinazione post-login (dal proxy: /accedi?da=...), validata dal server. */
  da?: string;
  /** Banner da querystring (es. link email scaduto). */
  erroreIniziale?: string;
}) {
  const [stato, formAction, pending] = useActionState<StatoAuthCliente, FormData>(
    loginClienteAction,
    {},
  );
  // Serve al box di reinvio conferma (il campo email e non controllato).
  const [email, setEmail] = useState("");

  return (
    <div className="flex flex-col gap-4">
      {erroreIniziale === "link-scaduto" && (
        <p
          role="alert"
          className="rounded-2xl bg-sun/15 px-4 py-3 text-sm text-sun-ink ring-1 ring-sun/40"
        >
          Quel link non è più valido (scaduto o già usato). Accedi, oppure
          richiedi un nuovo link qui sotto.
        </p>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        {da && <input type="hidden" name="da" value={da} />}
        <Campo label="Email" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            defaultValue={stato?.valori?.email ?? ""}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </Campo>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <label
              htmlFor="password"
              className="font-display text-sm font-bold text-foreground"
            >
              Password
            </label>
            <Link
              href="/password-dimenticata"
              className="text-xs font-medium text-sea underline-offset-2 hover:underline"
            >
              Password dimenticata?
            </Link>
          </div>
          <InputPassword id="password" autoComplete="current-password" />
        </div>

        {stato?.error && !stato.emailNonVerificata && (
          <p role="alert" className="text-sm font-medium text-coral-ink">
            {stato.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="flex h-12 items-center justify-center rounded-full bg-sea px-6 font-display font-bold text-white shadow-sea transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {pending ? "Accesso in corso…" : "Accedi"}
        </button>
      </form>

      {stato?.emailNonVerificata && (
        <div className="flex flex-col gap-3 rounded-2xl bg-sun/15 px-4 py-4 ring-1 ring-sun/40">
          <p role="alert" className="text-sm text-sun-ink">
            {stato.error}
          </p>
          <BottoneReinviaConferma email={email} />
        </div>
      )}
    </div>
  );
}
