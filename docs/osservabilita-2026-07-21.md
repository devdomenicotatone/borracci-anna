# Osservabilità — alert su webhook Stripe, sync giacenze, email di conferma (2026-07-21)

**In una riga: i tre guasti silenziosi del negozio (ordine pagato non
registrato, giacenze non aggiornate, conferma d'ordine non inviata) ora
producono un'email di allarme alla casella del negozio, un segnale visibile
nel pannello gestore, o entrambi.** Include la chiusura del finding **M11**
dell'audit legale (flag `email_conferma_inviata` sull'ordine + segnalazione).

Contesto: microimpresa senza stack di monitoring esterno. Il canale d'allarme
è l'email (via `inviaEmail`, lo stesso SMTP delle notifiche ordine) più i
banner/badge del pannello gestore, che NON dipendono dall'SMTP. Ogni
segnalazione finisce comunque nei log Vercel con prefisso `[osservabilita]`.

---

## 1. Il canale: `segnalaProblema()` (src/lib/osservabilita.ts)

- Email a `NEGOZIO.email` con oggetto `⚠️ Avviso tecnico — <titolo>`.
- **Mai throw**: una segnalazione fallita non aggrava mai il guasto che
  segnala (il webhook risponde comunque a Stripe).
- **Dedup su DB** (riusa `rate_limit_eventi`, bucket `azione='alert'`): la
  stessa `chiave` non genera più di un'email per finestra. Finestra massima
  24h (la pulizia periodica di rate-limit-ip.ts cancella le righe più
  vecchie di un giorno). Il dedup si registra SOLO a invio riuscito: se
  l'SMTP è giù, la prossima occorrenza riprova.
- Fail-open sul dedup (tabella assente/DB giù → si invia comunque).

## 2. Alert attivi

| Guasto | Chiave dedup | Finestra | Cosa dice |
| --- | --- | --- | --- |
| Webhook: finalizzazione ordine PAGATO fallita | `webhook-fin:<session>` | 24h | pagamento incassato ma ordine non sul sito; Stripe ritenta; se si ripete → Dashboard Stripe → Payments |
| Webhook: firma non valida (header presente) | `webhook-firma` | 24h | probabile `STRIPE_WEBHOOK_SECRET` ruotato/sbagliato; un caso isolato = chiamata estranea |
| Webhook: pulizia sessione scaduta fallita | `webhook-exp:<session>` | 24h | nessun pagamento coinvolto; se si ripete, problema DB |
| Sync giacenze BLT fallito (run reale) | `sync-giacenze` | **20h** | vetrina con giacenze vecchie; cause tipiche (credenziali BLT, sito fornitore, formato CSV). 20h e NON 24: il cron è ogni 24h esatte, una finestra pari sopprimerebbe l'avviso del giorno dopo |
| Email di un ordine pagato non partite (cliente e/o titolare) | `email-ordine:<session>` | 24h | ordine regolarmente pagato; chi contattare e perché (un solo avviso per ordine: se l'SMTP è giù non ha senso tempestare) |

Il webhook ha ora `maxDuration = 60` (prima 30): copre il caso peggiore
"SMTP giù" (notifiche in timeout + email di segnalazione, dopo la risposta
a Stripe via `after()`).

## 3. Segnali nel pannello gestore (indipendenti dall'SMTP)

- **Banner sync giacenze** (lista prodotti): oltre ai casi esistenti
  (riuscito/fallito), nuovo stato **"fermo da oltre un giorno"** quando
  l'ultimo run — riuscito o no — è più vecchio di **30h** (un giro saltato
  + margine per il drift dei cron Hobby). È l'unico segnale possibile per un
  **cron morto**: un runner che non parte non può inviare email.
- **Badge "Email conferma non partita"** (pannello ordini, stile ambra):
  sugli ordini `pagato` con `email_conferma_inviata = false`.

## 4. M11 — flag `email_conferma_inviata` (audit legale, CHIUSO)

Migration `20260721120000_ordine_email_conferma.sql` (applicata e
verificata sul DB di produzione):

- `ordini.email_conferma_inviata`: `true` = SMTP ha accettato la conferma
  al cliente (art. 51 co. 7 Cod. Consumo); `false` = invio tentato e
  fallito, oppure sessione Stripe senza email cliente (conferma non
  recapitabile: da gestire a mano); `null` = non applicabile (ordini
  pre-migration, pagamenti manuali in negozio, ordini non pagati).
- `ordini.email_conferma_il`: momento dell'invio riuscito.

Scrive solo il webhook (`registraEsitoEmailConferma`, client admin fresco
dentro `after()`). La pagina ordini del gestore legge il flag con una
**query separata e protetta**: il pannello non si rompe mai, nemmeno se il
codice arriva prima della migration (deploy order libero, pattern del repo).
La tabella `ordini` era vuota al momento del rollout (pre-lancio): nessun
backfill necessario.

## 5. Ledger migrazioni CLI: RIALLINEATO

Contestualmente è stato eseguito il riallineamento una-tantum documentato
nell'audit di integrità (2026-07-20): `supabase migration repair --status
applied` delle 31 migration applicate a mano dal SQL Editor, poi `db push`
della sola `20260721120000` (dry-run verificato prima: elencava SOLO
quella). **Da oggi `npx supabase db push` torna utilizzabile per le
prossime migration** — niente più SQL Editor a mano.

## 6. Limiti noti (scelte esplicite)

- **Cron morto** → solo banner (30h), nessuna email possibile: il runner
  che non parte non può segnalarsi. Un check esterno (uptime monitor,
  cron-job.org sul endpoint con secret) resta un'opzione futura se il
  negozio crescerà.
- **SMTP completamente giù** → gli alert email falliscono con lui: restano
  i log Vercel (`[osservabilita]`) e i segnali a pannello (flag/banner), che
  passano dal DB. La robustezza del canale email è il cantiere 3
  (deliverability: SPF/DKIM/DMARC, provider transazionale, A5).
- **Alert push/SMS**: fuori scala per una microimpresa; non previsti.
- Il flag M11 copre l'email di conferma del flusso webhook (contratto
  concluso online). Le email del flusso su richiesta hanno già la
  segnalazione sincrona in UI (`avviso` nelle action del gestore).

## 7. Come provare

- **Firma non valida**: `POST /api/stripe/webhook` con header
  `stripe-signature: t=1,v1=finta` → 400 + email "firma non valida" (una
  sola per 24h) + riga `alert` in `rate_limit_eventi`.
- **Sync fallito**: `GET /api/cron/sync-catalogo` con `Authorization:
  Bearer <CRON_SECRET>` e credenziali BLT rotte in env → 500 + email.
- **Flag M11**: ordine di test pagato con Stripe CLI → su
  `ordini.email_conferma_inviata` compare `true` (o `false` + badge se si
  spegne `GMAIL_APP_PASSWORD`).
