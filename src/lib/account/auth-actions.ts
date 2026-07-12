"use server";

// Server Actions di autenticazione dell'area clienti (registrazione, login,
// recupero password, gestione credenziali, eliminazione account).
//
// Convenzioni (come lib/gestore/auth-actions.ts):
//   - firma (statoPrecedente, formData) => Stato per useActionState;
//   - redirect() SEMPRE fuori dai try/catch (lancia NEXT_REDIRECT);
//   - messaggi in italiano e NEUTRI dove serve anti-enumeration: registrazione,
//     recupero e reinvio rispondono sempre allo stesso modo, che l'email esista
//     o no (Supabase con "Confirm email" ON gia offusca gli account esistenti).

import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  sessioneDaLinkEmail,
  verificaSessioneCliente,
} from "@/lib/account/auth";
import { consentiRichiestaAuth } from "@/lib/account/rate-limit";
import { destinazioneSicura } from "@/lib/account/url-sicuro";

/** Stato dei form auth (useActionState): esito + errori per campo. */
export interface StatoAuthCliente {
  ok?: boolean;
  /** Esiti "neutri" (es. email inviata) da mostrare come conferma. */
  messaggio?: string;
  error?: string;
  /** Login con email non ancora confermata: il form mostra la CTA di reinvio. */
  emailNonVerificata?: boolean;
  errors?: {
    nome?: string;
    email?: string;
    password?: string;
    conferma?: string;
  };
  /**
   * Valori testuali (MAI la password) da ripristinare dopo un errore: React 19
   * azzera i campi non controllati dopo una form action, quindi vanno rimandati
   * indietro e riusati come defaultValue.
   */
  valori?: { nome?: string; email?: string };
}

const MESSAGGIO_NEUTRO_REGISTRAZIONE =
  "Se l'indirizzo non è già registrato, riceverai un'email per confermare l'account. Controlla anche lo spam.";
const MESSAGGIO_NEUTRO_RECUPERO =
  "Se esiste un account con questa email, riceverai a breve un link per reimpostare la password.";
const ERRORE_TROPPI_TENTATIVI =
  "Troppi tentativi di recente. Riprova tra qualche minuto.";

function emailValida(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/** Aggancio best-effort dello storico ordini (cintura e bretelle col trigger DB). */
async function agganciaOrdiniBestEffort(userId: string): Promise<void> {
  try {
    const admin = createAdminSupabase();
    await admin.rpc("aggancia_ordini_cliente", { p_user_id: userId });
  } catch {
    // Best effort: il trigger su auth.users ha gia fatto (o fara) il lavoro.
  }
}

/** Registrazione: signUp con verifica email obbligatoria (config Supabase). */
export async function registratiClienteAction(
  _stato: StatoAuthCliente,
  formData: FormData,
): Promise<StatoAuthCliente> {
  const nome = String(formData.get("nome") ?? "").trim().slice(0, 200);
  const email = String(formData.get("email") ?? "").trim().slice(0, 254);
  const password = String(formData.get("password") ?? "");

  const valori = { nome, email };
  const errors: NonNullable<StatoAuthCliente["errors"]> = {};
  if (!nome) errors.nome = "Inserisci nome e cognome.";
  if (!email || !emailValida(email)) errors.email = "Inserisci un'email valida.";
  if (password.length < 8) errors.password = "Almeno 8 caratteri.";
  if (password.length > 72) errors.password = "Massimo 72 caratteri.";
  if (Object.keys(errors).length > 0) return { errors, valori };

  const supabase = await createServerSupabase();
  if (!supabase) {
    return {
      error: "Registrazione non disponibile al momento. Riprova più tardi.",
      valori,
    };
  }

  if (!(await consentiRichiestaAuth("registrazione", email))) {
    return { error: ERRORE_TROPPI_TENTATIVI, valori };
  }

  // `nome` finisce in raw_user_meta_data: lo legge il trigger handle_new_cliente
  // per popolare public.clienti. Niente emailRedirectTo: il template Supabase
  // costruisce il link su {{ .SiteURL }}/api/auth/conferma (flusso token_hash).
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nome } },
  });
  if (error) {
    // Errori reali (rete/config). L'"utente gia registrato" NON passa di qui:
    // con le conferme attive Supabase risponde ok con identities vuote.
    console.error("[account] signUp fallita:", error.message);
    return { error: "Non è stato possibile completare la registrazione. Riprova." };
  }

  return { ok: true, messaggio: MESSAGGIO_NEUTRO_REGISTRAZIONE };
}

/** Login email+password. Su successo redirige a ?da= (validato) o /account. */
export async function loginClienteAction(
  _stato: StatoAuthCliente,
  formData: FormData,
): Promise<StatoAuthCliente> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const valori = { email };
  if (!email || !password) {
    return { error: "Inserisci email e password.", valori };
  }

  const supabase = await createServerSupabase();
  if (!supabase) return { error: "Accesso non disponibile al momento.", valori };

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    const codice = (error as { code?: string } | null)?.code;
    if (
      codice === "email_not_confirmed" ||
      /email not confirmed/i.test(error?.message ?? "")
    ) {
      return {
        emailNonVerificata: true,
        error: "Devi prima confermare la tua email: controlla la posta.",
        valori,
      };
    }
    return { error: "Credenziali non valide.", valori };
  }

  // Un GESTORE che entra dal form clienti va al suo pannello (requireGestore
  // fara le sue verifiche, MFA inclusa). L'uid arriva da signInWithPassword.
  const { data: profilo } = await supabase
    .from("profili")
    .select("id")
    .eq("id", data.user.id)
    .maybeSingle();

  // Cintura e bretelle col trigger DB: riaggancia eventuali ordini ospite
  // arrivati con questa email (index-scan parziale, quasi sempre 0 righe).
  if (!profilo) await agganciaOrdiniBestEffort(data.user.id);

  // redirect() lancia NEXT_REDIRECT: fuori da try/catch.
  if (profilo) redirect("/gestore");
  redirect(destinazioneSicura(formData.get("da")));
}

/** Logout del cliente. */
export async function logoutClienteAction(): Promise<void> {
  const supabase = await createServerSupabase();
  if (supabase) await supabase.auth.signOut();
  redirect("/");
}

/** Richiesta reset password: esito SEMPRE neutro (anti-enumeration). */
export async function recuperaPasswordAction(
  _stato: StatoAuthCliente,
  formData: FormData,
): Promise<StatoAuthCliente> {
  const email = String(formData.get("email") ?? "").trim().slice(0, 254);
  if (!email || !emailValida(email)) {
    return { errors: { email: "Inserisci un'email valida." }, valori: { email } };
  }

  const supabase = await createServerSupabase();
  if (!supabase) {
    return { error: "Servizio non disponibile al momento.", valori: { email } };
  }

  if (!(await consentiRichiestaAuth("recupero", email))) {
    return { error: ERRORE_TROPPI_TENTATIVI, valori: { email } };
  }

  // Il template "Reset password" porta a /api/auth/conferma?type=recovery.
  // L'esito e neutro anche su errore "utente inesistente".
  await supabase.auth.resetPasswordForEmail(email);
  return { ok: true, messaggio: MESSAGGIO_NEUTRO_RECUPERO };
}

/**
 * Nuova password dal link di recovery (la sessione esiste: l'ha creata
 * verifyOtp in /api/auth/conferma). Su successo redirige alla dashboard.
 */
export async function reimpostaPasswordAction(
  _stato: StatoAuthCliente,
  formData: FormData,
): Promise<StatoAuthCliente> {
  const password = String(formData.get("password") ?? "");
  const conferma = String(formData.get("conferma") ?? "");

  const errors: NonNullable<StatoAuthCliente["errors"]> = {};
  if (password.length < 8) errors.password = "Almeno 8 caratteri.";
  if (password.length > 72) errors.password = "Massimo 72 caratteri.";
  if (conferma !== password) errors.conferma = "Le password non coincidono.";
  if (Object.keys(errors).length > 0) return { errors };

  const supabase = await createServerSupabase();
  if (!supabase) return { error: "Servizio non disponibile al momento." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: "Link scaduto o già usato. Richiedi un nuovo link di recupero.",
    };
  }

  // La sessione DEVE provenire da un link email recente (verifyOtp), non da un
  // login normale: altrimenti chi trova una sessione aperta su un dispositivo
  // condiviso cambierebbe la password senza conoscere quella attuale,
  // aggirando la ri-verifica di cambiaPasswordAction.
  if (!(await sessioneDaLinkEmail(supabase))) {
    return {
      error: "Link scaduto o già usato. Richiedi un nuovo link di recupero.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: "Non è stato possibile aggiornare la password. Riprova." };
  }

  redirect("/account?password=aggiornata");
}

/** Cambio password da loggato: riverifica la password attuale. */
export async function cambiaPasswordAction(
  _stato: StatoAuthCliente,
  formData: FormData,
): Promise<StatoAuthCliente> {
  const sessione = await verificaSessioneCliente();
  if (!sessione) return { error: "Non autorizzato." };

  const attuale = String(formData.get("attuale") ?? "");
  const nuova = String(formData.get("password") ?? "");
  const conferma = String(formData.get("conferma") ?? "");

  if (!attuale) return { error: "Inserisci la password attuale." };
  const errors: NonNullable<StatoAuthCliente["errors"]> = {};
  if (nuova.length < 8) errors.password = "Almeno 8 caratteri.";
  if (nuova.length > 72) errors.password = "Massimo 72 caratteri.";
  if (conferma !== nuova) errors.conferma = "Le password non coincidono.";
  if (Object.keys(errors).length > 0) return { errors };

  // Riverifica della password attuale: evita che una sessione lasciata aperta
  // su un dispositivo condiviso permetta di cambiare la password.
  const { error: errVerifica } = await sessione.supabase.auth.signInWithPassword(
    { email: sessione.email, password: attuale },
  );
  if (errVerifica) return { error: "La password attuale non è corretta." };

  const { error } = await sessione.supabase.auth.updateUser({
    password: nuova,
  });
  if (error) {
    return { error: "Non è stato possibile aggiornare la password. Riprova." };
  }
  return { ok: true, messaggio: "Password aggiornata." };
}

/**
 * Cambio email da loggato ("secure email change" di Supabase: conferma su
 * entrambe le caselle). Alla conferma, il trigger on_auth_user_email_verificata
 * sincronizza clienti.email e aggancia gli ordini della nuova email.
 */
export async function cambiaEmailAction(
  _stato: StatoAuthCliente,
  formData: FormData,
): Promise<StatoAuthCliente> {
  const sessione = await verificaSessioneCliente();
  if (!sessione) return { error: "Non autorizzato." };

  const email = String(formData.get("email") ?? "").trim().slice(0, 254);
  if (!email || !emailValida(email)) {
    return { errors: { email: "Inserisci un'email valida." } };
  }
  if (email.toLowerCase() === sessione.email.toLowerCase()) {
    return { errors: { email: "È già la tua email attuale." } };
  }

  const { error } = await sessione.supabase.auth.updateUser({ email });
  if (error) {
    console.error("[account] cambio email fallito:", error.message);
    return { error: "Non è stato possibile avviare il cambio email. Riprova." };
  }
  return {
    ok: true,
    messaggio:
      "Ti abbiamo inviato un link di conferma sia alla nuova email sia a quella attuale: il cambio si completa dopo entrambe le conferme.",
  };
}

/** Reinvio dell'email di conferma (dopo un login con email non verificata). */
export async function reinviaConfermaAction(
  _stato: StatoAuthCliente,
  formData: FormData,
): Promise<StatoAuthCliente> {
  const email = String(formData.get("email") ?? "").trim().slice(0, 254);
  if (!email || !emailValida(email)) {
    return { errors: { email: "Inserisci un'email valida." } };
  }

  const supabase = await createServerSupabase();
  if (!supabase) return { error: "Servizio non disponibile al momento." };

  if (!(await consentiRichiestaAuth("reinvio_conferma", email))) {
    return { error: ERRORE_TROPPI_TENTATIVI };
  }

  await supabase.auth.resend({ type: "signup", email });
  return { ok: true, messaggio: MESSAGGIO_NEUTRO_REGISTRAZIONE };
}

/**
 * Eliminazione account self-service (GDPR), con riverifica password.
 * clienti/indirizzi/preferiti cadono in cascata; gli ordini restano nel
 * registro del negozio e tornano "ospite" (ordini.user_id -> NULL).
 */
export async function eliminaAccountAction(
  _stato: StatoAuthCliente,
  formData: FormData,
): Promise<StatoAuthCliente> {
  const sessione = await verificaSessioneCliente();
  if (!sessione) return { error: "Non autorizzato." };

  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Inserisci la tua password per confermare." };

  const { error: errVerifica } = await sessione.supabase.auth.signInWithPassword(
    { email: sessione.email, password },
  );
  if (errVerifica) return { error: "Password non corretta." };

  try {
    const admin = createAdminSupabase();
    const { error } = await admin.auth.admin.deleteUser(sessione.userId);
    if (error) {
      console.error("[account] eliminazione account fallita:", error.message);
      return { error: "Non è stato possibile eliminare l'account. Riprova." };
    }
  } catch {
    return { error: "Non è stato possibile eliminare l'account. Riprova." };
  }

  // L'utente non esiste piu: signOut best effort per pulire i cookie locali.
  try {
    await sessione.supabase.auth.signOut();
  } catch {
    // I token sono comunque invalidi: al prossimo getUser() risulta sloggato.
  }
  redirect("/?account=eliminato");
}
