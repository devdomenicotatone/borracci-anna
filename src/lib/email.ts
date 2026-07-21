// Invio email transazionali via SMTP. SOLO server: credenziali da env (mai
// NEXT_PUBLIC). A Borracci Anna serve solo l'invio (niente IMAP/lettura),
// quindi qui c'e un singolo helper.
//
// Due trasporti, scelti dalle env (vedi docs/deliverability-email-2026-07-21.md):
//
//   1) PROVIDER SMTP generico — il percorso "a norma" (SPF/DKIM/DMARC sul
//      dominio del negozio, DPA del provider; chiude A5 dell'audit legale).
//      Si attiva impostando TUTTE queste env (Vercel + .env.local):
//        EMAIL_SMTP_HOST      es. smtp-relay.brevo.com
//        EMAIL_SMTP_PORT      587 (STARTTLS) o 465 (TLS implicito); default 587
//        EMAIL_SMTP_USER      login SMTP del provider
//        EMAIL_SMTP_PASSWORD  chiave SMTP del provider
//        EMAIL_FROM           mittente, es. ordini@<dominio del negozio>
//        EMAIL_FROM_NAME      facoltativo, default "Anna Shop"
//      Su questo percorso, se il chiamante non indica un replyTo, le risposte
//      vengono dirottate alla casella del negozio (NEGOZIO.email): il mittente
//      del provider (es. ordini@dominio) di norma non e una casella presidiata.
//
//   2) FALLBACK legacy: Gmail consumer con app password (A5: senza DPA, da
//      dismettere quando il provider sara attivo — il fallback resta per non
//      rompere nulla nel frattempo).
//        GMAIL_USER=indirizzo@gmail.com
//        GMAIL_APP_PASSWORD=<app password 16 caratteri> (2FA attiva + SMTP)
//      Host/porta hanno default Gmail; override con GMAIL_SMTP_HOST/PORT.
//      Comportamento INVARIATO rispetto a prima (stesso from, nessun replyTo
//      implicito).

import nodemailer from "nodemailer";

import { NEGOZIO } from "@/lib/negozio";

export interface EmailInput {
  to: string;
  subject: string;
  text: string;
  /** Indirizzo a cui rispondere (es. l'email del cliente per il gestore). */
  replyTo?: string;
}

/** Configurazione SMTP risolta dalle env; null se nessun trasporto e configurato. */
interface ConfigSmtp {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** Indirizzo mittente (l'header From usa questo + EMAIL_FROM_NAME). */
  from: string;
  /** true se il trasporto e il provider (percorso 1), per il replyTo implicito. */
  provider: boolean;
}

/**
 * Risolve il trasporto: provider se configurato per intero, altrimenti Gmail
 * legacy, altrimenti null (invio disabilitato, inviaEmail ritorna false).
 * Env lette qui dentro e non a livello di modulo (regola del build: nessun
 * process.env all'import, come nel webhook).
 */
function configSmtp(): ConfigSmtp | null {
  const host = (process.env.EMAIL_SMTP_HOST ?? "").trim();
  const user = (process.env.EMAIL_SMTP_USER ?? "").trim();
  const pass = (process.env.EMAIL_SMTP_PASSWORD ?? "").trim();
  const from = (process.env.EMAIL_FROM ?? "").trim();
  if (host && user && pass && from) {
    return {
      host,
      port: Number(process.env.EMAIL_SMTP_PORT ?? 587),
      user,
      pass,
      from,
      provider: true,
    };
  }

  const gmailUser = (process.env.GMAIL_USER ?? "").trim();
  // Le app password Google sono 16 lettere: gli spazi sono solo visivi.
  const gmailPass = (process.env.GMAIL_APP_PASSWORD ?? "").replace(/\s+/g, "");
  if (gmailUser && gmailPass) {
    return {
      host: process.env.GMAIL_SMTP_HOST ?? "smtp.gmail.com",
      port: Number(process.env.GMAIL_SMTP_PORT ?? 465),
      user: gmailUser,
      pass: gmailPass,
      from: gmailUser,
      provider: false,
    };
  }

  return null;
}

/**
 * Invia un'email. Best effort: ritorna false (senza lanciare) se nessuna
 * casella e configurata o l'invio fallisce, cosi il flusso ordini non si rompe
 * per via di un problema email.
 */
export async function inviaEmail(input: EmailInput): Promise<boolean> {
  const cfg = configSmtp();
  if (!cfg) return false;

  const fromName = (process.env.EMAIL_FROM_NAME ?? "").trim() || "Anna Shop";
  // Sul percorso provider le risposte dei clienti devono arrivare in negozio
  // anche senza replyTo esplicito (il mittente e tipo noreply@/ordini@, spesso
  // senza casella dietro). Sul legacy niente default: il from E' la casella.
  const replyTo =
    input.replyTo ??
    (cfg.provider && cfg.from.toLowerCase() !== NEGOZIO.email.toLowerCase()
      ? NEGOZIO.email
      : undefined);

  const secure = cfg.port === 465;
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    // 465 = TLS implicito; 587 = STARTTLS obbligatorio (mai downgrade in chiaro).
    secure,
    requireTLS: !secure,
    auth: { user: cfg.user, pass: cfg.pass },
    // Timeout espliciti: l'invio e awaited dentro Server Actions (conferma
    // ordine / invia richiesta). Senza questi, uno stallo SMTP terrebbe bloccata
    // l'azione fino al timeout della funzione serverless (default nodemailer ~10m).
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
  });
  try {
    await transporter.sendMail({
      from: `${fromName} <${cfg.from}>`,
      to: input.to,
      replyTo,
      subject: input.subject,
      text: input.text,
    });
    return true;
  } catch {
    return false;
  } finally {
    transporter.close();
  }
}
