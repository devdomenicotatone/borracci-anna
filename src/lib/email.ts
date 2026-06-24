// Invio email transazionali via Gmail SMTP (app password), come gestishop.
// SOLO server: credenziali da env (mai NEXT_PUBLIC). A Borracci Anna serve solo
// l'invio (niente IMAP/lettura), quindi qui c'e un singolo helper.
//
// Config (.env.local + Vercel):
//   GMAIL_USER=indirizzo@gmail.com
//   GMAIL_APP_PASSWORD=<app password 16 caratteri>   (2FA attiva + IMAP/SMTP)
// Host/porta hanno default Gmail; override con GMAIL_SMTP_HOST / GMAIL_SMTP_PORT.

import nodemailer from "nodemailer";

const SMTP_HOST = process.env.GMAIL_SMTP_HOST ?? "smtp.gmail.com";
const SMTP_PORT = Number(process.env.GMAIL_SMTP_PORT ?? 465);

export interface EmailInput {
  to: string;
  subject: string;
  text: string;
  /** Indirizzo a cui rispondere (es. l'email del cliente per il gestore). */
  replyTo?: string;
}

/**
 * Invia un'email. Best effort: ritorna false (senza lanciare) se la casella non
 * e configurata o l'invio fallisce, cosi il flusso ordini non si rompe per via
 * di un problema email.
 */
export async function inviaEmail(input: EmailInput): Promise<boolean> {
  const user = process.env.GMAIL_USER;
  // Le app password Google sono 16 lettere: gli spazi sono solo visivi.
  const pass = (process.env.GMAIL_APP_PASSWORD ?? "").replace(/\s+/g, "");
  if (!user || !pass) return false;

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true,
    auth: { user, pass },
    // Timeout espliciti: l'invio e awaited dentro Server Actions (conferma
    // ordine / invia richiesta). Senza questi, uno stallo SMTP terrebbe bloccata
    // l'azione fino al timeout della funzione serverless (default nodemailer ~10m).
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
  });
  try {
    await transporter.sendMail({
      from: `Anna Shop <${user}>`,
      to: input.to,
      replyTo: input.replyTo,
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
