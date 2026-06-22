"use client";

// Form di login del gestore. useActionState gestisce stato (errore) e pending.
// La Server Action loginGestore redirige a /gestore/prodotti in caso di successo.

import { useActionState } from "react";

import { loginGestore, type StatoLogin } from "@/lib/gestore/auth-actions";

export default function FormLogin() {
  const [stato, formAction, pending] = useActionState<StatoLogin, FormData>(
    loginGestore,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-foreground">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          className="h-12 rounded-xl border border-line bg-surface px-4 text-base text-foreground outline-none transition-colors focus-visible:border-foreground"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-sm font-medium text-foreground"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-12 rounded-xl border border-line bg-surface px-4 text-base text-foreground outline-none transition-colors focus-visible:border-foreground"
        />
      </div>

      {stato?.error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {stato.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex h-12 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-colors hover:bg-foreground/85 disabled:opacity-50"
      >
        {pending ? "Accesso in corso…" : "Accedi"}
      </button>

      <p className="text-center text-xs text-muted">
        Nessun accesso? Contatta l&apos;amministratore.
      </p>
    </form>
  );
}
