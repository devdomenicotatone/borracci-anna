"use client";

// Rubrica indirizzi: grid di card + card "Aggiungi" tratteggiata. Le mutazioni
// ritornano SEMPRE la rubrica aggiornata (idioma EsitoCarrello): lo stato
// locale si riallinea senza router.refresh().

import { useEffect, useRef, useState, useTransition } from "react";

import {
  eliminaIndirizzoAction,
  impostaPredefinitoAction,
} from "@/lib/account/indirizzi-actions";
import DialogIndirizzo from "@/components/account/DialogIndirizzo";
import ConfermaDialog from "@/components/gestore/ConfermaDialog";
import { useToast } from "@/components/Toaster";
import type { Indirizzo } from "@/lib/types";

export default function RubricaIndirizzi({
  iniziali,
}: {
  iniziali: Indirizzo[];
}) {
  const [indirizzi, setIndirizzi] = useState(iniziali);
  // Dialog di modifica: undefined = chiuso, null = nuovo, Indirizzo = modifica.
  const [inModifica, setInModifica] = useState<Indirizzo | null | undefined>(
    undefined,
  );
  const [daEliminare, setDaEliminare] = useState<Indirizzo | null>(null);
  const [inCorso, startTransition] = useTransition();
  const { mostra } = useToast();

  // WCAG 2.4.3: alla chiusura il dialog di conferma ripristina il focus
  // sull'elemento che l'aveva aperto — ma dopo un'eliminazione riuscita quel
  // bottone "Elimina" sta sulla card appena rimossa dal DOM: il ripristino e
  // un no-op e il focus cade sul body. Si sposta quindi esplicitamente sul
  // superstite piu sensato, la card/bottone "Aggiungi indirizzo" (montata in
  // entrambi i rami: grid e stato vuoto). L'effect gira DOPO il cleanup di
  // useDialogModale nello stesso commit, quindi vince sul suo ripristino.
  const refAggiungi = useRef<HTMLButtonElement>(null);
  // Flag in ref (non state): l'effect sotto scatta sul cambio di `indirizzi`
  // — stesso commit del cleanup del dialog, quindi il nostro focus vince sul
  // suo ripristino no-op — senza setState sincrono dentro l'effect.
  const focusSuAggiungiRef = useRef(false);
  useEffect(() => {
    if (!focusSuAggiungiRef.current) return;
    focusSuAggiungiRef.current = false;
    refAggiungi.current?.focus();
  }, [indirizzi]);

  const elimina = () => {
    if (!daEliminare) return;
    startTransition(async () => {
      const esito = await eliminaIndirizzoAction(daEliminare.id);
      if (esito.ok && esito.indirizzi) {
        focusSuAggiungiRef.current = true;
        setIndirizzi(esito.indirizzi);
        mostra("Indirizzo eliminato", "ok");
      } else {
        mostra(esito.error ?? "Eliminazione non riuscita", "errore");
      }
      setDaEliminare(null);
    });
  };

  const impostaPredefinito = (id: string) => {
    startTransition(async () => {
      const esito = await impostaPredefinitoAction(id);
      if (esito.ok && esito.indirizzi) {
        setIndirizzi(esito.indirizzi);
        mostra("Indirizzo predefinito aggiornato", "ok");
      } else {
        mostra(esito.error ?? "Operazione non riuscita", "errore");
      }
    });
  };

  return (
    <>
      {indirizzi.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-line bg-surface px-6 py-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-white text-sea shadow-soft">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-7 w-7"
              aria-hidden="true"
            >
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </span>
          <div>
            <p className="font-display text-lg font-extrabold text-foreground">
              Nessun indirizzo salvato
            </p>
            <p className="mt-1 text-sm text-muted">
              Salvane uno per compilare il checkout in un attimo.
            </p>
          </div>
          <button
            type="button"
            ref={refAggiungi}
            onClick={() => setInModifica(null)}
            className="flex h-12 items-center justify-center rounded-full bg-sea px-6 font-display font-bold text-white shadow-sea transition hover:-translate-y-0.5"
          >
            Aggiungi indirizzo
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {indirizzi.map((ind) => (
            <div
              key={ind.id}
              className="flex animate-pop-in flex-col rounded-3xl bg-white p-5 shadow-soft ring-1 ring-line"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-sm font-bold text-foreground">
                  {ind.etichetta ?? "Indirizzo"}
                </p>
                {ind.predefinito && (
                  <span className="rounded-full bg-sea/15 px-2.5 py-0.5 text-xs font-bold text-sea-ink">
                    Predefinito
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-foreground">{ind.nome}</p>
              <p className="text-sm text-muted">
                {ind.line1}
                {ind.line2 ? `, ${ind.line2}` : ""}
                <br />
                {ind.cap} {ind.citta} ({ind.provincia})
              </p>
              {ind.telefono && (
                <p className="text-sm text-muted">Tel. {ind.telefono}</p>
              )}

              {!ind.predefinito && (
                <button
                  type="button"
                  onClick={() => impostaPredefinito(ind.id)}
                  disabled={inCorso}
                  className="mt-3 self-start text-sm font-bold text-sea underline-offset-2 transition-colors hover:underline disabled:opacity-50"
                >
                  Usa come predefinito
                </button>
              )}

              <div className="mt-auto flex gap-4 border-t border-line pt-3 text-sm font-bold">
                <button
                  type="button"
                  onClick={() => setInModifica(ind)}
                  className="text-foreground underline-offset-2 hover:underline"
                >
                  Modifica
                </button>
                <button
                  type="button"
                  onClick={() => setDaEliminare(ind)}
                  className="text-coral-ink underline-offset-2 hover:underline"
                >
                  Elimina
                </button>
              </div>
            </div>
          ))}

          {/* Card "Aggiungi" */}
          <button
            type="button"
            ref={refAggiungi}
            onClick={() => setInModifica(null)}
            className="grid min-h-40 place-items-center rounded-3xl border border-dashed border-line bg-surface text-muted transition hover:bg-surface-2 hover:text-foreground"
          >
            <span className="flex flex-col items-center gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-xl font-bold text-sea shadow-soft">
                +
              </span>
              <span className="font-display text-sm font-bold">
                Aggiungi indirizzo
              </span>
            </span>
          </button>
        </div>
      )}

      {inModifica !== undefined && (
        <DialogIndirizzo
          indirizzo={inModifica}
          onChiudi={() => setInModifica(undefined)}
          onSalvato={(aggiornati) => {
            setIndirizzi(aggiornati);
            setInModifica(undefined);
            mostra("Indirizzo salvato", "ok");
          }}
        />
      )}

      <ConfermaDialog
        aperto={daEliminare != null}
        titolo="Eliminare questo indirizzo?"
        messaggio={
          daEliminare
            ? `${daEliminare.line1}, ${daEliminare.citta} (${daEliminare.provincia})`
            : ""
        }
        etichettaConferma="Elimina"
        inCorso={inCorso}
        onConferma={elimina}
        onAnnulla={() => setDaEliminare(null)}
      />
    </>
  );
}
