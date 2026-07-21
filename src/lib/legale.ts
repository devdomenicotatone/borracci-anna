// Riferimenti legali condivisi (audit conformita 2026-07-14, finding C1-C4).
// UNICO punto di verita per: percorsi delle pagine legali (footer, form, email,
// checkout Stripe) e blocco informativo obbligatorio delle email di conferma
// ordine ex art. 51 co. 7 Cod. Consumo. Importabile sia lato server sia client.

import { NEGOZIO } from "@/lib/negozio";

export const PERCORSO_CONDIZIONI = "/condizioni-di-vendita";
export const PERCORSO_RECESSO = "/recesso";
export const PERCORSO_PRIVACY = "/privacy";

/**
 * Blocco informativo per le email transazionali di conferma ordine: recesso
 * (termini + rinvio al modulo tipo), garanzia legale, condizioni di vendita e
 * identita/recapiti del venditore. La conferma del contratto su supporto
 * durevole deve contenere queste informazioni (art. 51 co. 7 Cod. Consumo):
 * va accodato al corpo testo PRIMA della firma.
 *
 * I chiamanti (webhook, conferma gestore) derivano siteUrl con `?? ""`: se
 * l'env manca NON emettiamo mai percorsi relativi nudi ("/recesso") in
 * un'email — degradiamo al nome della pagina sul sito e logghiamo l'anomalia,
 * cosi il corredo informativo resta sensato e il problema non passa in silenzio.
 */
export function noteLegaliEmail(siteUrl: string): string {
  const base = siteUrl.trim().replace(/\/+$/, "");
  if (!base) {
    console.warn(
      "[legale] NEXT_PUBLIC_SITE_URL assente: email di conferma senza link assoluti alle pagine legali",
    );
  }
  const rinvioModulo = base
    ? `anche col modulo tipo che trovi qui: ${base}${PERCORSO_RECESSO}`
    : 'anche col modulo tipo della pagina "Diritto di recesso" del sito';
  const rigaCondizioni = base
    ? `Condizioni di vendita: ${base}${PERCORSO_CONDIZIONI}`
    : 'Condizioni di vendita: pagina "Condizioni di vendita" del sito';
  const rigaPrivacy = base
    ? `Informativa privacy: ${base}${PERCORSO_PRIVACY}`
    : 'Informativa privacy: pagina "Privacy e cookie" del sito';
  return [
    "— Informazioni sul tuo acquisto —",
    "",
    "Diritto di recesso: hai 14 giorni dalla consegna per cambiare idea, " +
      `senza indicare il motivo. Basta scriverci a ${NEGOZIO.email} (o alla ` +
      `PEC ${NEGOZIO.pec}), ${rinvioModulo}. Ti rimborsiamo entro 14 giorni ` +
      "dalla comunicazione; i costi di restituzione sono a tuo carico.",
    "",
    "Garanzia legale: ogni prodotto è coperto dalla garanzia legale di " +
      "conformità di 24 mesi dalla consegna (artt. 128 e ss. Codice del " +
      "Consumo). Se qualcosa non va, scrivici e sistemiamo.",
    "",
    rigaCondizioni,
    rigaPrivacy,
    "",
    `Venditore: ${NEGOZIO.insegna} di ${NEGOZIO.ragioneSociale} — ` +
      `${NEGOZIO.indirizzoCompleto} — P.IVA ${NEGOZIO.partitaIva}`,
    "Assistenza e reclami: " +
      `${NEGOZIO.email}${NEGOZIO.telefono ? ` · ${NEGOZIO.telefono}` : ""}`,
  ].join("\n");
}

/**
 * Riga di recapiti per le email di stato SENZA blocco legale completo
 * (ricezione richiesta, annullo): email, telefono e WhatsApp in chiaro — i
 * client di posta li rendono cliccabili (finding B9 audit conformita). Le
 * email con noteLegaliEmail hanno gia i recapiti nella riga "Assistenza e
 * reclami".
 */
export function rigaContattiEmail(): string {
  return (
    `Per qualsiasi domanda: ${NEGOZIO.email}` +
    (NEGOZIO.telefono ? ` · tel. ${NEGOZIO.telefono}` : "") +
    (NEGOZIO.whatsapp ? ` · WhatsApp https://wa.me/${NEGOZIO.whatsapp}` : "")
  );
}

/**
 * Messaggio mostrato da Stripe Checkout sopra il bottone di pagamento
 * (custom_text.submit, max 1200 caratteri, markdown limitato: i link sono
 * supportati). Rende le condizioni opponibili: il cliente le ha davanti
 * nell'istante in cui conclude il contratto. Non usiamo consent_collection
 * (richiederebbe l'URL dei termini configurato nella dashboard Stripe:
 * una dipendenza esterna che, se assente, farebbe fallire la sessione).
 */
export function testoCondizioniCheckout(siteUrl: string): string {
  return (
    `Confermando il pagamento concludi l'ordine con ${NEGOZIO.insegna} di ` +
    `${NEGOZIO.ragioneSociale} e accetti le ` +
    `[Condizioni di vendita](${siteUrl}${PERCORSO_CONDIZIONI}), incluso il ` +
    `[diritto di recesso di 14 giorni](${siteUrl}${PERCORSO_RECESSO}). ` +
    `Prezzi IVA inclusa. Dati trattati secondo l'` +
    `[Informativa privacy](${siteUrl}${PERCORSO_PRIVACY}).`
  );
}
