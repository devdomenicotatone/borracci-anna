"use client";

// Modulo "Invia richiesta": al posto del pagamento immediato, il cliente lascia
// i suoi contatti e invia una richiesta (ordine in_attesa). Niente incasso ora:
// il negozio conferma la disponibilità e poi il cliente paga da /ordine/[token].

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useCarrello } from "@/components/cart/CartProvider";
import { inviaRichiestaAction, type StatoRichiesta } from "@/lib/ordini";

const inputCls =
  "h-12 w-full rounded-2xl bg-white px-4 text-base text-foreground ring-1 ring-line outline-none transition-shadow";

/** Errore sentinella: l'action non ha risposto entro il tetto di tempo. */
class ErroreTimeout extends Error {}

/**
 * Esegue la promise con un tetto di `ms`: oltre, rigetta con ErroreTimeout.
 * Le server action non accettano un AbortSignal come fetch: la richiesta in
 * volo non viene annullata, ma la UI si sblocca comunque (stesso effetto
 * dell'AbortController in CheckoutButton, CartItem.tsx).
 */
function conTimeout<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ErroreTimeout()), ms);
    promessa.then(
      (valore) => {
        clearTimeout(timer);
        resolve(valore);
      },
      (motivo) => {
        clearTimeout(timer);
        reject(motivo);
      },
    );
  });
}

/** Dati del cliente loggato per il prefill (campi comunque modificabili). */
export interface PrefillRichiesta {
  nome: string;
  email: string;
}

export default function ModuloRichiesta({
  prefill,
}: {
  prefill?: PrefillRichiesta | null;
}) {
  const router = useRouter();
  const { svuota } = useCarrello();
  const [stato, setStato] = useState<StatoRichiesta>({});
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const esito = await conTimeout(
          inviaRichiestaAction({}, formData),
          15000,
        );
        if (esito.token) {
          // Ordine creato: svuota il carrello (client + server) e vai allo
          // stato. Se lo svuotamento fallisce (rete), non bloccare: l'ordine
          // esiste già e /ordine/[token] è comunque la destinazione giusta.
          try {
            await svuota();
          } catch {
            // ignorato: solo il carrello resta da ripulire, niente di bloccante.
          }
          router.push(`/ordine/${esito.token}`);
          return;
        }
        setStato(esito);
      } catch (err) {
        // Rete caduta o timeout: niente error boundary, si mostra il messaggio
        // sopra il bottone (role="alert") e si lascia riprovare.
        setStato({
          error:
            err instanceof ErroreTimeout
              ? "L'invio sta impiegando troppo tempo. Riprova."
              : "Si è verificato un problema. Riprova.",
        });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="r-nome"
          className="font-display text-sm font-bold text-foreground"
        >
          Nome e cognome
        </label>
        <input
          id="r-nome"
          name="nome"
          required
          autoComplete="name"
          autoCapitalize="words"
          defaultValue={prefill?.nome ?? ""}
          aria-invalid={stato.errors?.nome ? true : undefined}
          aria-describedby={stato.errors?.nome ? "r-nome-errore" : undefined}
          className={inputCls}
        />
        {stato.errors?.nome && (
          <p
            id="r-nome-errore"
            role="alert"
            className="text-sm font-bold text-coral-ink"
          >
            {stato.errors.nome}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="r-email"
          className="font-display text-sm font-bold text-foreground"
        >
          Email
        </label>
        <input
          id="r-email"
          name="email"
          type="email"
          inputMode="email"
          required
          autoComplete="email"
          defaultValue={prefill?.email ?? ""}
          aria-invalid={stato.errors?.email ? true : undefined}
          aria-describedby={stato.errors?.email ? "r-email-errore" : undefined}
          className={inputCls}
        />
        {stato.errors?.email && (
          <p
            id="r-email-errore"
            role="alert"
            className="text-sm font-bold text-coral-ink"
          >
            {stato.errors.email}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="r-telefono"
          className="font-display text-sm font-bold text-foreground"
        >
          Telefono{" "}
          <span className="font-normal text-muted">(consigliato)</span>
        </label>
        <input
          id="r-telefono"
          name="telefono"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          className={inputCls}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="r-note"
          className="font-display text-sm font-bold text-foreground"
        >
          Note <span className="font-normal text-muted">(facoltative)</span>
        </label>
        <textarea
          id="r-note"
          name="note"
          rows={2}
          placeholder="Richieste particolari, orari per il ritiro…"
          className="min-h-20 w-full resize-y rounded-2xl bg-white px-4 py-3 text-base text-foreground ring-1 ring-line outline-none transition-shadow"
        />
      </div>

      {stato.error && (
        <p
          role="alert"
          className="rounded-2xl bg-coral/10 px-4 py-3 text-sm font-bold text-coral-ink"
        >
          {stato.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-coral px-6 font-display font-bold text-white shadow-coral transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
      >
        {pending ? "Invio in corso…" : "Invia richiesta"}
      </button>
    </form>
  );
}
