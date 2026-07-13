"use client";

// Card "Dati personali": aggiorna il nome del cliente.

import { useActionState, useEffect, useRef } from "react";

import {
  aggiornaProfiloAction,
  type EsitoProfilo,
} from "@/lib/account/profilo-actions";
import { Campo, Spinner, inputCls } from "@/components/gestore/ui";
import { useToast } from "@/components/Toaster";

export default function FormProfilo({ nome }: { nome: string | null }) {
  const [stato, formAction, pending] = useActionState<EsitoProfilo, FormData>(
    aggiornaProfiloAction,
    {},
  );
  const { mostra } = useToast();

  // Toast una sola volta per esito (lo stato persiste tra i render).
  const ultimoEsito = useRef<EsitoProfilo | null>(null);
  useEffect(() => {
    if (stato !== ultimoEsito.current) {
      ultimoEsito.current = stato;
      if (stato.ok) mostra("Dati aggiornati", "ok");
    }
  }, [stato, mostra]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Campo
        label="Nome e cognome"
        htmlFor="profilo-nome"
        errore={stato.errors?.nome}
      >
        <input
          id="profilo-nome"
          name="nome"
          type="text"
          autoComplete="name"
          autoCapitalize="words"
          required
          maxLength={200}
          defaultValue={nome ?? ""}
          className={inputCls}
        />
      </Campo>

      {stato.error && (
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
        {pending ? "Salvataggio…" : "Salva modifiche"}
      </button>
    </form>
  );
}
