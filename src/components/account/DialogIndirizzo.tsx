"use client";

// Dialog modale di creazione/modifica indirizzo. Montato SOLO quando aperto
// (lo stato di useActionState riparte pulito a ogni apertura). Accessibilita
// via useDialogModale (focus trap, Esc, scroll lock), pattern ConfermaDialog:
// sheet dal basso su mobile, centrato da sm in su.

import { useActionState, useEffect, useRef } from "react";

import {
  salvaIndirizzoAction,
  type EsitoIndirizzi,
} from "@/lib/account/indirizzi-actions";
import { useDialogModale } from "@/components/useDialogModale";
import { Campo, Spinner, inputCls } from "@/components/gestore/ui";
import type { Indirizzo } from "@/lib/types";

export default function DialogIndirizzo({
  indirizzo,
  onChiudi,
  onSalvato,
}: {
  /** null = nuovo indirizzo. */
  indirizzo: Indirizzo | null;
  onChiudi: () => void;
  /** Riceve la rubrica aggiornata ritornata dall'action. */
  onSalvato: (indirizzi: Indirizzo[]) => void;
}) {
  const [stato, formAction, pending] = useActionState<EsitoIndirizzi, FormData>(
    salvaIndirizzoAction,
    { ok: false },
  );
  const pannelloRef = useRef<HTMLDivElement>(null);
  useDialogModale(true, pannelloRef, onChiudi);

  // Su ok: consegna la rubrica aggiornata e chiudi (il componente si smonta).
  useEffect(() => {
    if (stato.ok && stato.indirizzi) {
      onSalvato(stato.indirizzi);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stato]);

  const titolo = indirizzo ? "Modifica indirizzo" : "Nuovo indirizzo";
  // Valore iniziale di un campo: priorita ai valori appena inviati (ripristino
  // dopo un errore, React 19 azzera i campi non controllati), poi all'indirizzo
  // in modifica, infine vuoto.
  const val = (campo: keyof NonNullable<typeof stato.valori>): string =>
    stato.valori?.[campo] ?? (indirizzo?.[campo] as string | null) ?? "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 backdrop-blur-sm sm:items-center"
      onClick={onChiudi}
    >
      <div
        ref={pannelloRef}
        role="dialog"
        aria-modal="true"
        aria-label={titolo}
        tabIndex={-1}
        className="max-h-[90dvh] w-full max-w-lg animate-pop-in overflow-y-auto rounded-3xl bg-white p-6 shadow-soft outline-none ring-1 ring-line"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg font-extrabold text-foreground">
          {titolo}
        </h2>

        <form action={formAction} className="mt-5 flex flex-col gap-4">
          {indirizzo && <input type="hidden" name="id" value={indirizzo.id} />}

          <Campo
            label="Etichetta (facoltativa)"
            htmlFor="etichetta"
            hint="Es. Casa, Ufficio."
            errore={stato.errors?.etichetta}
          >
            <input
              id="etichetta"
              name="etichetta"
              type="text"
              maxLength={40}
              defaultValue={val("etichetta")}
              className={inputCls}
            />
          </Campo>

          <Campo
            label="Nome e cognome del destinatario"
            htmlFor="nome"
            errore={stato.errors?.nome}
          >
            <input
              id="nome"
              name="nome"
              type="text"
              autoComplete="name"
              autoCapitalize="words"
              required
              maxLength={200}
              defaultValue={val("nome")}
              className={inputCls}
            />
          </Campo>

          <Campo
            label="Via e numero civico"
            htmlFor="line1"
            errore={stato.errors?.line1}
          >
            <input
              id="line1"
              name="line1"
              type="text"
              autoComplete="address-line1"
              required
              maxLength={200}
              defaultValue={val("line1")}
              className={inputCls}
            />
          </Campo>

          <Campo
            label="Interno, scala, presso (facoltativo)"
            htmlFor="line2"
            errore={stato.errors?.line2}
          >
            <input
              id="line2"
              name="line2"
              type="text"
              autoComplete="address-line2"
              maxLength={200}
              defaultValue={val("line2")}
              className={inputCls}
            />
          </Campo>

          <div className="grid grid-cols-[110px_1fr] gap-3">
            <Campo label="CAP" htmlFor="cap" errore={stato.errors?.cap}>
              <input
                id="cap"
                name="cap"
                type="text"
                inputMode="numeric"
                autoComplete="postal-code"
                required
                maxLength={5}
                pattern="\d{5}"
                title="CAP di 5 cifre"
                defaultValue={val("cap")}
                className={inputCls}
              />
            </Campo>
            <Campo label="Città" htmlFor="citta" errore={stato.errors?.citta}>
              <input
                id="citta"
                name="citta"
                type="text"
                autoComplete="address-level2"
                required
                maxLength={120}
                defaultValue={val("citta")}
                className={inputCls}
              />
            </Campo>
          </div>

          <div className="grid grid-cols-[110px_1fr] gap-3">
            <Campo
              label="Provincia"
              htmlFor="provincia"
              errore={stato.errors?.provincia}
            >
              <input
                id="provincia"
                name="provincia"
                type="text"
                autoComplete="address-level1"
                required
                maxLength={2}
                pattern="[A-Za-z]{2}"
                title="Sigla provincia di 2 lettere (es. RN)"
                defaultValue={val("provincia")}
                className={`${inputCls} uppercase`}
              />
            </Campo>
            <Campo
              label="Telefono (facoltativo)"
              htmlFor="telefono"
              errore={stato.errors?.telefono}
            >
              <input
                id="telefono"
                name="telefono"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={40}
                defaultValue={val("telefono")}
                className={inputCls}
              />
            </Campo>
          </div>

          <p className="text-xs text-muted">
            Spediamo in tutta <strong>Italia</strong>.
          </p>

          {/* Riga intera cliccabile: min-h-11 (44px) + padding verticale. */}
          {!indirizzo?.predefinito && (
            <label className="flex min-h-11 items-center gap-2.5 py-1.5 text-sm text-foreground">
              <input
                type="checkbox"
                name="predefinito"
                className="h-5 w-5 accent-[var(--sea)]"
              />
              Usa come indirizzo predefinito
            </label>
          )}

          {stato.error && (
            <p role="alert" className="text-sm font-medium text-coral-ink">
              {stato.error}
            </p>
          )}

          <div className="mt-1 flex gap-2.5">
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
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-sea font-display text-sm font-bold text-white shadow-sea transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
            >
              {pending && <Spinner className="h-4 w-4" />}
              {pending ? "Salvataggio…" : "Salva indirizzo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
