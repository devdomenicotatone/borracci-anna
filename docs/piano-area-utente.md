# Area utente (clienti) — architettura e configurazione

Area account per i clienti della vetrina: registrazione/login email+password,
storico ordini, rubrica indirizzi, preferiti sincronizzati, eliminazione
account. **Il guest checkout resta intatto**: si compra senza registrazione
esattamente come prima, sia con l'acquisto diretto Stripe sia col flusso
richiesta.

## Architettura in breve

| Tema | Scelta |
|---|---|
| Clienti | Tabella **`public.clienti`** (id = auth.users.id), provisioning dal trigger `on_auth_user_created_cliente`. `profili` resta la whitelist gestori: `is_gestore()` e `handle_new_user` NON sono stati toccati. |
| Aggancio ordini | Tutto a livello DB: `ordini.user_id` (nullable) + trigger `trg_ordini_assegna_cliente` (BEFORE INSERT: email **verificata** → user_id) + trigger `on_auth_user_email_verificata` (verifica/cambio email → RPC `aggancia_ordini_cliente`, idempotente) + riaggancio best effort al login. Il webhook Stripe e `finalizza_ordine_pagato` sono invariati. |
| Numero ordine | `ordini.numero` progressivo (sequence, backfill cronologico dal #1001), mostrato in area utente e su `/ordine/[token]`. |
| Lettura "i miei ordini" | RLS (`ordini_select_proprio`, `ordine_righe_select_proprio`) + client di sessione, dietro il DAL `requireCliente()` (`src/lib/account/auth.ts`). Scritture: solo service role, come prima. |
| Stripe | `clienti.stripe_customer_id` + `stripe_customer_ambiente` ('test'/'live'), customer creato **lazy al primo checkout** (`src/lib/account/stripe-cliente.ts`). Nel checkout da loggato: `customer` + `customer_update` (email bloccata su quella dell'account, indirizzo prefillato). Ospite: session identica a prima. |
| Preferiti | localStorage resta lo store UI; per i loggati la tabella `preferiti` e la copia d'autorita: union al primo login, pull ai load successivi, replica debounced a ogni modifica, azzeramento del dispositivo al logout (`SincronizzaPreferiti`). |
| Sicurezza | Doppia barriera (guard nel layout + verifica sessione in OGNI action), RLS own-row su clienti/indirizzi/preferiti, grant di colonna su `clienti` (dal client si scrive solo `nome`), rate limit auth DB-backed (`auth_richieste`: 3/h per email, 10/h per IP), messaggi anti-enumeration, cap DB 10 indirizzi / 500 preferiti. |

Route: `/accedi`, `/registrati`, `/password-dimenticata`, `/reimposta-password`
(pubbliche, noindex) · `/account` con `ordini`, `ordini/[id]`, `indirizzi`,
`profilo` (guard nel layout + redirect ottimistico del proxy) ·
`/api/auth/conferma` (atterraggio dei link email, flusso token_hash).

## Checklist configurazione Supabase (dashboard) — DA FARE PRIMA DEL GO-LIVE

Migration da applicare (SQL Editor o `supabase db push`), in ordine:

1. `supabase/migrations/20260711170000_area_clienti.sql`
2. `supabase/migrations/20260711180000_ordini_clienti.sql`

Sono idempotenti e **inerti finché nessuno si registra**: sicure prima del
deploy dell'app.

### Authentication → Sign In / Providers (Email)

- **Confirm email: ON** (obbligatorio: tutto l'aggancio ordini presuppone
  email verificate).
- **Secure email change: ON** (default): il cambio email chiede conferma su
  entrambe le caselle.
- Minimum password length: **8**.
- Leaked password protection (HaveIBeenPwned): ON se disponibile sul piano.

### Authentication → Emails → SMTP Settings (SMTP custom)

Senza SMTP custom Supabase manda ~2 email/ora: inutilizzabile.

- Host `smtp.gmail.com`, porta `465`.
- Username = `GMAIL_USER`, password = la **stessa app password** di
  `src/lib/email.ts`.
- Sender name: `Anna Shop`, sender email = `GMAIL_USER`.
- Dopo l'attivazione: **Auth → Rate Limits → alzare il limite email** (es.
  30/h). Nota: la casella Gmail ora serve sia le email ordini sia quelle di
  auth (~500 invii/giorno in totale).

### Authentication → Emails → Templates (in italiano)

Corpo pronto da incollare in `supabase/templates/` (conferma-registrazione.html,
reimposta-password.html, cambio-email.html). I link usano il flusso
**token_hash** verso `/api/auth/conferma`:

- **Confirm signup** — oggetto: `Conferma il tuo account — Anna Shop`; link:
  `{{ .SiteURL }}/api/auth/conferma?token_hash={{ .TokenHash }}&type=email`
- **Reset password** — oggetto: `Reimposta la password — Anna Shop`; link:
  `{{ .SiteURL }}/api/auth/conferma?token_hash={{ .TokenHash }}&type=recovery`
- **Change email address** — oggetto: `Conferma la nuova email — Anna Shop`;
  link:
  `{{ .SiteURL }}/api/auth/conferma?token_hash={{ .TokenHash }}&type=email_change`

### Authentication → URL Configuration

- **Site URL** = `NEXT_PUBLIC_SITE_URL` di produzione.
- Additional Redirect URLs: `http://localhost:3000/**` (sviluppo).

Nessuna variabile d'ambiente nuova per l'app.

## Note operative

- Un gestore NON può avere un account cliente con la stessa email
  (`auth.users` è unica per email): per provare l'area clienti usare un'email
  personale diversa.
- Eliminazione account: cascata su clienti/indirizzi/preferiti; gli ordini
  restano (`ordini.user_id → NULL`, dato contabile).
- Ambienti Stripe: al passaggio test↔live il customer viene ricreato in
  automatico (colonna `stripe_customer_ambiente`); i pagamenti ospite fatti
  prima della registrazione restano senza customer, lo storico unificato lato
  cliente è garantito da `ordini.user_id`.
- Test end-to-end con webhook locale:
  `stripe listen --forward-to localhost:3000/api/stripe/webhook` + carta
  `4242 4242 4242 4242`.

## Possibili evoluzioni (fuori scope v1)

OAuth Google · CAPTCHA Turnstile su signup/reset (supporto nativo Supabase)
· merge carrello cross-device · numero ordine nelle email transazionali e nel
pannello gestore · provider email transazionale dedicato.
