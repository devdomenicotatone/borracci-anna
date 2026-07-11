// Route di atterraggio dei link email di Supabase Auth (flusso token_hash):
// conferma registrazione, recovery password, conferma cambio email.
// I template nel dashboard puntano a:
//   {{ .SiteURL }}/api/auth/conferma?token_hash={{ .TokenHash }}&type=<tipo>
//
// Sta sotto /api (fuori dal matcher del proxy): verifyOtp non ha bisogno del
// refresh sessione e scrive da se i cookie (i route handler possono farlo via
// cookies() di next/headers, gia cablato in createServerSupabase).

import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPI_VALIDI: readonly EmailOtpType[] = [
  "email",
  "signup",
  "recovery",
  "email_change",
];

/** Atterraggio post-verifica per tipo di link. */
function destinazionePerTipo(type: EmailOtpType): string {
  switch (type) {
    case "recovery":
      return "/reimposta-password";
    case "email_change":
      return "/account/profilo?email=aggiornata";
    default:
      // Conferma registrazione: la dashboard mostra il banner "email
      // verificata" (l'aggancio ordini l'ha gia fatto il trigger DB).
      return "/account?verificata=1";
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const linkScaduto = () =>
    NextResponse.redirect(new URL("/accedi?errore=link-scaduto", request.nextUrl));

  if (!tokenHash || !type || !TIPI_VALIDI.includes(type)) return linkScaduto();

  const supabase = await createServerSupabase();
  if (!supabase) return linkScaduto();

  // verifyOtp consuma il token e crea la sessione (cookie sulla risposta).
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });
  if (error) return linkScaduto();

  return NextResponse.redirect(
    new URL(destinazionePerTipo(type), request.nextUrl),
  );
}
