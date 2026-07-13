"use client";

// Form di registrazione clienti. Su successo NON si naviga: il form lascia il
// posto al pannello "Controlla la posta" (l'email di verifica e appena
// partita), con reinvio a countdown. L'email non finisce mai nell'URL.

import { useActionState, useState } from "react";

import {
  registratiClienteAction,
  type StatoAuthCliente,
} from "@/lib/account/auth-actions";
import { Campo, inputCls } from "@/components/gestore/ui";
import InputPassword from "@/components/account/InputPassword";
import PannelloEmailInviata from "@/components/account/PannelloEmailInviata";
import BottoneReinviaConferma from "@/components/account/BottoneReinviaConferma";

export default function FormRegistrazione() {
  const [stato, formAction, pending] = useActionState<StatoAuthCliente, FormData>(
    registratiClienteAction,
    {},
  );
  const [email, setEmail] = useState("");
  // React 19 azzera i campi non controllati dopo l'action: quando l'action
  // rimanda `valori.email` (errore), riallineo lo state usato dal pannello di
  // reinvio (pattern "adjust state during render", senza effect).
  const [emailRipristinata, setEmailRipristinata] = useState<string | undefined>();
  if (stato?.valori?.email !== emailRipristinata) {
    setEmailRipristinata(stato?.valori?.email);
    if (stato?.valori?.email) setEmail(stato.valori.email);
  }

  if (stato?.ok) {
    return (
      <div className="flex flex-col gap-5">
        <PannelloEmailInviata titolo="Controlla la posta">
          {/* Messaggio NEUTRO (anti-enumeration): non conferma se l'indirizzo
              esiste gia. Con "Confirm email" ON, Supabase non invia una nuova
              email agli account gia registrati. */}
          <p>
            {stato.messaggio ??
              "Se l'indirizzo non è già registrato, riceverai un'email per confermare l'account."}
          </p>
          <p className="mt-2">
            Alla conferma collegheremo anche gli ordini fatti in passato con
            questa email.
          </p>
        </PannelloEmailInviata>
        <BottoneReinviaConferma email={email} />
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Campo label="Nome e cognome" htmlFor="nome" errore={stato?.errors?.nome}>
        <input
          id="nome"
          name="nome"
          type="text"
          autoComplete="name"
          autoCapitalize="words"
          required
          maxLength={200}
          defaultValue={stato?.valori?.nome ?? ""}
          className={inputCls}
        />
      </Campo>

      <Campo label="Email" htmlFor="email" errore={stato?.errors?.email}>
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

      <Campo
        label="Password"
        htmlFor="password"
        hint="Almeno 8 caratteri."
        errore={stato?.errors?.password}
      >
        <InputPassword
          id="password"
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
        className="flex h-12 items-center justify-center rounded-full bg-coral px-6 font-display font-bold text-white shadow-coral transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
      >
        {pending ? "Creazione in corso…" : "Crea il tuo account"}
      </button>

      <p className="text-center text-xs text-muted">
        Usiamo la tua email solo per l&apos;account e gli ordini: niente spam.
      </p>
    </form>
  );
}
