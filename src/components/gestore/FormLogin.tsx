"use client";

// Form di login del gestore, in due passi:
//   1) email + password (Server Action loginGestore, useActionState);
//   2) se l'account ha un authenticator: codice TOTP a 6 cifre con auto-invio
//      alla sesta cifra (pattern GestiShop). Il codice viene provato su OGNI
//      authenticator verificato (es. il telefono di riserva): ognuno ha il suo
//      segreto, quindi challenge+verify si ripetono per fattore.
// La verify promuove la sessione ad aal2; refreshSession() scrive i cookie
// aggiornati che verranno letti da verifySession/RLS lato server.

import { useRouter } from "next/navigation";
import { useActionState, useMemo, useRef, useState } from "react";

import { loginGestore, type StatoLogin } from "@/lib/gestore/auth-actions";
import { createBrowserSupabase } from "@/lib/supabase/client";

export default function FormLogin({
  richiediSubitoCodice = false,
}: {
  /** true quando la pagina trova gia' una sessione a meta' (password ok, TOTP no). */
  richiediSubitoCodice?: boolean;
}) {
  const [stato, formAction, pending] = useActionState<StatoLogin, FormData>(
    loginGestore,
    undefined,
  );

  if (stato?.richiedeCodice || richiediSubitoCodice) {
    return <VerificaCodice />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-display font-bold text-foreground">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          className="h-12 rounded-2xl bg-white px-4 text-base text-foreground ring-1 ring-line"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-sm font-display font-bold text-foreground"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-12 rounded-2xl bg-white px-4 text-base text-foreground ring-1 ring-line"
        />
      </div>

      {stato?.error && (
        <p role="alert" className="text-sm font-medium text-coral-ink">
          {stato.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex h-12 items-center justify-center rounded-full bg-sea px-6 font-display font-bold text-white shadow-sea transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
      >
        {pending ? "Accesso in corso…" : "Accedi"}
      </button>

      <p className="text-center text-xs text-muted">
        Nessun accesso? Contatta l&apos;amministratore.
      </p>
    </form>
  );
}

// ── Passo 2: codice dell'authenticator ─────────────────────────────────────

function VerificaCodice() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const router = useRouter();
  const [codice, setCodice] = useState("");
  const [errore, setErrore] = useState("");
  const [verifica, setVerifica] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const verificaCodice = async (cod: string) => {
    if (verifica) return;
    setErrore("");
    setVerifica(true);
    try {
      const { data: fattori, error: lfErr } = await supabase.auth.mfa.listFactors();
      if (lfErr) throw lfErr;
      // data.totp = solo i fattori TOTP gia' verificati.
      const verificati = fattori?.totp ?? [];
      if (verificati.length === 0) {
        setErrore("Nessun authenticator configurato. Riprova ad accedere.");
        setVerifica(false);
        return;
      }
      let ok = false;
      for (const fattore of verificati) {
        try {
          const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({
            factorId: fattore.id,
          });
          if (chErr || !ch) continue;
          const { error: vErr } = await supabase.auth.mfa.verify({
            factorId: fattore.id,
            challengeId: ch.id,
            code: cod,
          });
          if (!vErr) {
            ok = true;
            break;
          }
        } catch {
          // questo authenticator non ha accettato il codice: prova il prossimo
        }
      }
      if (!ok) {
        // Campo pulito e a fuoco: la prossima sequenza di 6 cifre riparte
        // con l'auto-invio senza cancellare a mano.
        setErrore("Codice non valido. Riprova.");
        setCodice("");
        setVerifica(false);
        inputRef.current?.focus();
        return;
      }
      // Persiste il token aal2 nei cookie: li leggono verifySession e la RLS.
      await supabase.auth.refreshSession();
      router.push("/gestore/prodotti");
    } catch {
      setErrore("Errore di verifica. Riprova.");
      setCodice("");
      setVerifica(false);
      inputRef.current?.focus();
    }
  };

  const esci = async () => {
    await supabase.auth.signOut().catch(() => {});
    // Reload completo: azzera anche lo stato dell'action del passo 1.
    window.location.assign("/gestore/login");
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void verificaCodice(codice.trim());
      }}
      className="flex flex-col gap-4"
    >
      <div className="text-center">
        <p className="font-display text-base font-bold text-foreground">
          Codice di verifica
        </p>
        <p className="mt-1 text-sm text-muted">
          Inserisci il codice a 6 cifre della tua app authenticator.
        </p>
      </div>

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          name="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="000000"
          value={codice}
          aria-busy={verifica}
          aria-label="Codice a sei cifre"
          autoFocus
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCodice(v);
            // Auto-invio alla sesta cifra (digitata, incollata o da autofill):
            // niente pulsante da premere, come in GestiShop.
            if (v.length === 6) void verificaCodice(v);
          }}
          className="h-14 w-full rounded-2xl bg-white text-center font-display text-2xl font-bold tracking-[0.4em] text-foreground ring-1 ring-line"
        />
        {verifica && (
          <>
            <span
              aria-hidden="true"
              className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin rounded-full border-2 border-sea border-t-transparent"
            />
            <span className="sr-only" role="status">
              Verifica in corso…
            </span>
          </>
        )}
      </div>

      {errore && (
        <p role="alert" className="text-sm font-medium text-coral-ink">
          {errore}
        </p>
      )}

      <button
        type="button"
        onClick={esci}
        className="text-center text-xs font-medium text-muted underline-offset-2 hover:underline"
      >
        Esci e accedi con un altro account
      </button>
    </form>
  );
}
