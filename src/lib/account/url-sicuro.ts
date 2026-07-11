// Helper puri (non Server Action) dell'area account. Vivono FUORI dai file
// "use server", dove ogni export deve essere una funzione async.

/**
 * Solo path relativi interni: niente open-redirect via ?da=.
 * Blocca `//` e `/\`: i browser normalizzano il backslash a `/`, quindi
 * `/\evil.com` diventerebbe `//evil.com` (URL scheme-relative -> host esterno).
 */
export function destinazioneSicura(da: unknown): string {
  const p = typeof da === "string" ? da : "";
  return /^\/(?![/\\])/.test(p) ? p : "/account";
}
