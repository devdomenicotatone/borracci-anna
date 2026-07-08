"use client";

// Gestione degli authenticator TOTP (verifica in due passaggi) — adattamento
// del meccanismo di GestiShop: enroll con QR + chiave manuale, verifica del
// primo codice con auto-invio alla sesta cifra, piu' dispositivi per account
// (il codice al login viene provato su ciascuno), rimozione con conferma.
// Tutte le chiamate MFA parlano con GoTrue dal browser; refreshSession()
// dopo la verifica persiste il token aal2 nei cookie letti dal server.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Factor } from "@supabase/supabase-js";

import { useToast } from "@/components/gestore/Toaster";
import { createBrowserSupabase } from "@/lib/supabase/client";

interface VistaFattore {
  id: string;
  nome: string;
  creatoIl: string;
}

interface Registrazione {
  factorId: string;
  /** Data URI dell'immagine SVG del QR, generata da Supabase. */
  qr: string;
  secret: string;
}

function IconaScudo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2 4 5.5V11c0 5 3.4 9.2 8 10.5 4.6-1.3 8-5.5 8-10.5V5.5L12 2z" />
      <path d="m8.8 11.8 2.3 2.3 4.1-4.6" />
    </svg>
  );
}

export default function GestioneAuthenticator() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const { mostra } = useToast();
  const [fattori, setFattori] = useState<VistaFattore[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [registrazione, setRegistrazione] = useState<Registrazione | null>(null);
  const [codice, setCodice] = useState("");
  const [occupato, setOccupato] = useState(false);
  const [errore, setErrore] = useState("");
  // Conferma di rimozione in-page (niente window.confirm, alieno nella PWA).
  const [daRimuovere, setDaRimuovere] = useState<VistaFattore | null>(null);
  const codiceRef = useRef<HTMLInputElement>(null);

  const caricaFattori = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      mostra("Impossibile leggere gli authenticator.", "errore");
      setCaricamento(false);
      return;
    }
    // data.totp contiene SOLO i fattori verificati (gli "unverified" — tentativi
    // interrotti — stanno in data.all e vengono ripuliti al prossimo enroll).
    setFattori(
      (data?.totp ?? []).map((f: Factor) => ({
        id: f.id,
        nome: f.friendly_name ?? "Authenticator",
        creatoIl: f.created_at,
      })),
    );
    setCaricamento(false);
  }, [supabase, mostra]);

  useEffect(() => {
    // Fetch async: il setState avviene dopo l'await, non in modo sincrono.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void caricaFattori();
  }, [caricaFattori]);

  const attiva = fattori.length > 0;

  // Supabase impone friendly_name univoco per utente.
  const nomeUnivoco = () => {
    const usati = new Set(fattori.map((f) => f.nome));
    let nome = "Authenticator";
    let i = 2;
    while (usati.has(nome)) nome = `Authenticator ${i++}`;
    return nome;
  };

  const avviaRegistrazione = async () => {
    setErrore("");
    setOccupato(true);
    try {
      // Ripulisce i fattori rimasti "unverified" da tentativi interrotti
      // (visibili solo in data.all): si accumulano e i friendly_name collidono.
      const { data: pre } = await supabase.auth.mfa.listFactors();
      for (const f of pre?.all ?? []) {
        if (f.factor_type === "totp" && f.status === "unverified") {
          await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
        }
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        // issuer = etichetta nell'app authenticator (senza, sarebbe l'host).
        issuer: "Anna Gestore",
        friendlyName: nomeUnivoco(),
      });
      if (error || !data) throw error ?? new Error("enroll vuoto");
      setRegistrazione({
        factorId: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
      });
      setCodice("");
    } catch {
      setErrore("Impossibile avviare la configurazione. Riprova.");
    } finally {
      setOccupato(false);
    }
  };

  const verificaRegistrazione = async (cod: string) => {
    if (!registrazione || occupato) return;
    setErrore("");
    setOccupato(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({
        factorId: registrazione.factorId,
      });
      if (chErr || !ch) throw chErr ?? new Error("challenge vuota");
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: registrazione.factorId,
        challengeId: ch.id,
        code: cod,
      });
      if (vErr) {
        setErrore("Codice non valido. Controlla l'orario del telefono e riprova.");
        setCodice("");
        codiceRef.current?.focus();
        return;
      }
      // La sessione e' appena salita ad aal2: i cookie aggiornati servono a
      // verifySession/RLS (dal prossimo accesso il codice sara' richiesto).
      await supabase.auth.refreshSession();
      setRegistrazione(null);
      setCodice("");
      mostra("Authenticator attivo: al prossimo accesso servira' il codice.", "ok");
      await caricaFattori();
    } catch {
      setErrore("Errore di verifica. Riprova.");
      setCodice("");
      codiceRef.current?.focus();
    } finally {
      setOccupato(false);
    }
  };

  const annullaRegistrazione = async () => {
    if (registrazione) {
      await supabase.auth.mfa
        .unenroll({ factorId: registrazione.factorId })
        .catch(() => {});
    }
    setRegistrazione(null);
    setCodice("");
    setErrore("");
  };

  const confermaRimozione = async () => {
    if (occupato || !daRimuovere) return;
    setOccupato(true);
    const { error } = await supabase.auth.mfa.unenroll({
      factorId: daRimuovere.id,
    });
    if (error) {
      mostra("Impossibile rimuovere l'authenticator. Riprova.", "errore");
    } else {
      mostra("Authenticator rimosso.", "ok");
      await caricaFattori();
    }
    setOccupato(false);
    setDaRimuovere(null);
  };

  if (caricamento) {
    return (
      <div className="h-24 animate-pulse rounded-3xl border border-line bg-surface" />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stato complessivo */}
      <div
        className={`flex items-start gap-3 rounded-3xl border p-5 ${
          attiva
            ? "border-sea/30 bg-sea/5"
            : "border-dashed border-line bg-surface"
        }`}
      >
        <span
          className={`grid h-10 w-10 flex-none place-items-center rounded-full ${
            attiva ? "bg-sea text-white" : "bg-surface-2 text-muted"
          }`}
        >
          <IconaScudo className="h-5 w-5" />
        </span>
        <div>
          <p className="font-display text-sm font-bold text-foreground">
            {attiva
              ? "Verifica in due passaggi attiva"
              : "Verifica in due passaggi non attiva"}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {attiva
              ? "All'accesso, dopo la password, viene chiesto il codice della tua app authenticator."
              : "Aggiungi un'app authenticator (Google Authenticator, Authy, 1Password…) per proteggere l'area gestore con un secondo fattore."}
          </p>
        </div>
      </div>

      {/* Authenticator configurati */}
      {fattori.length > 0 && (
        <div className="rounded-3xl border border-line bg-white p-5">
          <h2 className="font-display text-sm font-bold text-foreground">
            Authenticator configurati
          </h2>
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {fattori.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {f.nome}
                  </p>
                  <p className="text-xs text-muted">
                    Attivo dal {new Date(f.creatoIl).toLocaleDateString("it-IT")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDaRimuovere(f)}
                  disabled={occupato}
                  className="rounded-full px-3 py-1.5 text-xs font-display font-bold text-coral-ink transition-colors hover:bg-coral/10 disabled:opacity-50"
                >
                  Rimuovi
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Registrazione nuovo authenticator */}
      {registrazione ? (
        <div className="rounded-3xl border border-line bg-white p-5">
          <h2 className="font-display text-sm font-bold text-foreground">
            Configura il nuovo authenticator
          </h2>
          <ol className="mt-2 list-inside list-decimal text-sm text-muted">
            <li>Apri l&apos;app authenticator sul telefono.</li>
            <li>Inquadra il QR (o inserisci la chiave manuale).</li>
            <li>Digita qui il codice a 6 cifre mostrato dall&apos;app.</li>
          </ol>
          <div className="mt-4 flex justify-center rounded-2xl bg-white p-3 ring-1 ring-line">
            {/* qr e' un data URI SVG di Supabase: <img> diretto, senza optimizer */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={registrazione.qr}
              alt="QR code per l'app authenticator"
              width={190}
              height={190}
            />
          </div>
          <p className="mt-3 text-center text-xs text-muted">
            Chiave manuale:{" "}
            <code className="select-all break-all font-mono text-[11px] text-foreground">
              {registrazione.secret}
            </code>
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void verificaRegistrazione(codice.trim());
            }}
            className="mt-4 flex flex-col gap-3"
          >
            <div className="relative">
              <input
                ref={codiceRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={codice}
                aria-busy={occupato}
                aria-label="Codice a sei cifre"
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setCodice(v);
                  // Auto-invio alla sesta cifra, come al login.
                  if (v.length === 6) void verificaRegistrazione(v);
                }}
                className="h-12 w-full rounded-2xl bg-white text-center font-display text-xl font-bold tracking-[0.4em] text-foreground ring-1 ring-line"
              />
              {occupato && (
                <span
                  aria-hidden="true"
                  className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-sea border-t-transparent"
                />
              )}
            </div>
            {errore && (
              <p role="alert" className="text-sm font-medium text-coral-ink">
                {errore}
              </p>
            )}
            <button
              type="button"
              onClick={annullaRegistrazione}
              disabled={occupato}
              className="text-center text-xs font-medium text-muted underline-offset-2 hover:underline disabled:opacity-50"
            >
              Annulla configurazione
            </button>
          </form>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={avviaRegistrazione}
            disabled={occupato}
            className="inline-flex h-11 items-center rounded-full bg-sea px-6 font-display text-sm font-bold text-white shadow-sea transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
          >
            {fattori.length > 0
              ? "Aggiungi un altro authenticator"
              : "Aggiungi authenticator"}
          </button>
          {errore && (
            <p role="alert" className="mt-2 text-sm font-medium text-coral-ink">
              {errore}
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-muted">
        Suggerimento: configura <strong>due</strong> authenticator su
        dispositivi diversi. Se ne perdi uno, l&apos;altro ti fa rientrare.
      </p>

      {/* Conferma rimozione */}
      {daRimuovere && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Rimuovi authenticator"
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 px-5"
          onClick={(e) => {
            if (e.target === e.currentTarget && !occupato) setDaRimuovere(null);
          }}
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-soft">
            <p className="font-display text-base font-bold text-foreground">
              Rimuovere «{daRimuovere.nome}»?
            </p>
            <p className="mt-1 text-sm text-muted">
              {fattori.length <= 1
                ? "È l'ultimo authenticator: senza, l'accesso tornerà a chiedere solo la password."
                : "Il codice di questo dispositivo non sarà più accettato all'accesso."}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setDaRimuovere(null)}
                disabled={occupato}
                className="h-11 flex-1 rounded-full bg-surface font-display text-sm font-bold text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={confermaRimozione}
                disabled={occupato}
                className="h-11 flex-1 rounded-full bg-coral-ink font-display text-sm font-bold text-white shadow-coral transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
              >
                {occupato ? "Rimuovo…" : "Rimuovi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
