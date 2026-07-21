"use client";

// Zona rossa del profilo: eliminazione account self-service (GDPR) con
// conferma via password. Dialog montato solo quando aperto; su successo
// l'action fa signOut + redirect alla home.

import { useActionState, useRef, useState } from "react";

import {
  eliminaAccountAction,
  type StatoAuthCliente,
} from "@/lib/account/auth-actions";
import { useDialogModale } from "@/components/useDialogModale";
import { Campo, Spinner } from "@/components/gestore/ui";
import InputPassword from "@/components/account/InputPassword";
import StatoInvio from "@/components/StatoInvio";

function PannelloEliminazione({ onChiudi }: { onChiudi: () => void }) {
  const [stato, formAction, pending] = useActionState<StatoAuthCliente, FormData>(
    eliminaAccountAction,
    {},
  );
  const pannelloRef = useRef<HTMLDivElement>(null);
  useDialogModale(true, pannelloRef, onChiudi);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 backdrop-blur-sm sm:items-center"
      onClick={onChiudi}
    >
      <div
        ref={pannelloRef}
        role="dialog"
        aria-modal="true"
        aria-label="Elimina account"
        tabIndex={-1}
        className="w-full max-w-sm animate-pop-in rounded-3xl bg-white p-6 shadow-soft outline-none ring-1 ring-line"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg font-extrabold text-foreground">
          Eliminare l&apos;account?
        </h2>
        <p className="mt-2 text-sm text-muted">
          Accesso, indirizzi e preferiti verranno eliminati definitivamente.
          Gli ordini già fatti restano nel registro del negozio, senza più il
          collegamento al tuo account. L&apos;operazione non si può annullare.
        </p>

        <form action={formAction} className="mt-5 flex flex-col gap-4">
          <Campo label="Conferma con la tua password" htmlFor="elimina-password">
            <InputPassword
              id="elimina-password"
              autoComplete="current-password"
            />
          </Campo>

          {stato?.error && (
            <p role="alert" className="text-sm font-medium text-coral-ink">
              {stato.error}
            </p>
          )}

          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onChiudi}
              disabled={pending}
              className="h-12 flex-1 rounded-full bg-white text-sm font-bold text-muted ring-2 ring-surface-2 transition-all hover:bg-surface hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-coral-ink font-display text-sm font-bold text-white shadow-coral transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
            >
              {pending && <Spinner className="h-4 w-4" />}
              {pending ? "Eliminazione…" : "Elimina account"}
            </button>
          </div>
          <StatoInvio
            attivo={pending}
            testo="Eliminazione dell'account in corso"
          />
        </form>
      </div>
    </div>
  );
}

export default function DialogEliminaAccount() {
  const [aperto, setAperto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAperto(true)}
        className="self-start rounded-full px-5 py-2.5 font-display text-sm font-bold text-coral-ink ring-2 ring-coral/30 transition hover:bg-coral/10"
      >
        Elimina account
      </button>
      {aperto && <PannelloEliminazione onChiudi={() => setAperto(false)} />}
    </>
  );
}
