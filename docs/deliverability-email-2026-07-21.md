# Deliverability email — SPF/DKIM/DMARC e uscita da Gmail consumer (2026-07-21)

**In una riga: il codice è PRONTO allo switch (trasporto SMTP generico via
env, testato end-to-end su entrambi i percorsi), ma SPF/DKIM/DMARC oggi sono
materialmente impossibili: la produzione gira su `borracci-anna.vercel.app`
e non esiste un dominio proprio.** Il dominio è il prerequisito dell'intero
cantiere (e interessa anche SEO/OG): acquisto e DNS sono azioni della
titolare/dello sviluppatore — qui sotto il runbook esatto, passo per passo.

## 1. Stato misurato (2026-07-21)

- **Produzione**: `borracci-anna.vercel.app` (robots/sitemap lo confermano);
  nessun dominio custom nel progetto Vercel.
- **Mittente attuale**: Gmail consumer con app password (`GMAIL_USER` /
  `GMAIL_APP_PASSWORD` su Vercel), From `Anna Shop <…@gmail.com>`.
- **Autenticazione oggi**: le email escono firmate da Google e passano
  SPF/DKIM/DMARC *come gmail.com* → il recapito di fatto è discreto, MA:
  - nessun controllo o reputazione propria (si eredita quella di Gmail);
  - ~500 destinatari/giorno di tetto consumer;
  - le app password sono un meccanismo in via di restrizione da parte di
    Google (2FA + revoche improvvise = fragilità operativa);
  - mittente `@gmail.com` non professionale per un negozio;
  - **A5 (audit legale)**: nessun DPA — l'account Gmail consumer non è
    pensato per uso commerciale; per le email transazionali di un e-commerce
    serve un fornitore con Data Processing Agreement (GDPR art. 28).
- **Perché serve un dominio**: SPF/DKIM/DMARC sono record DNS del *dominio
  mittente*. Su `vercel.app` non c'è accesso DNS (e non è un dominio nostro):
  finché non esiste un dominio del negozio non c'è nulla da configurare.

## 2. Decisione — matrice e raccomandazione

| Opzione | Costo | DPA | Note (verificate 2026-07) |
| --- | --- | --- | --- |
| **Brevo** (transazionale, SMTP relay) | **0 €** (free: 300 email/giorno, transazionali incluse, log illimitati) | ✅ incluso nei ToS (società UE, Parigi — GDPR nativo) | SMTP `smtp-relay.brevo.com`, drop-in con nodemailer; SPF/DKIM/DMARC pieni sul dominio |
| Resend (transazionale) | 0 € (free: 3.000/mese ma **cap 100/giorno**, 1 dominio, log 30 giorni) | ✅ DPA disponibile | DX ottima; il cap giornaliero è più stretto di Brevo per i picchi |
| Google Workspace Business Starter | ~7 €/mese | ✅ Data Processing Amendment | dà anche la **casella professionale** sulla propria @dominio (chiude B8); invio transazionale possibile ma con meno strumenti (niente webhook/bounce tracking) |

**Raccomandazione** (microimpresa, costo minimo, conformità piena):
1. **Dominio proprio** (es. `annashoprimini.it`) — prerequisito.
2. **Brevo free** per le email transazionali del sito (0 €/mese, DPA, DKIM
   sul dominio). Il codice è già pronto (vedi §4).
3. *Consigliata, non obbligatoria*: **Workspace** per la casella vera della
   titolare (`info@dominio`) — chiude anche B8 (contatto professionale con
   DPA in ricezione). In alternativa economica: email forwarding del
   registrar (gratis quasi ovunque) da `info@dominio` alla casella attuale.

I due piani free coprono ampiamente i volumi del negozio (ogni ordine ≈ 2-3
email); Brevo regge meglio i picchi (300/giorno vs 100/giorno).

## 3. Runbook (nell'ordine; [T] = azione titolare/sviluppatore)

1. **[T] Acquistare il dominio** e collegarlo a Vercel (Project → Settings →
   Domains). Aggiornare `NEXT_PUBLIC_SITE_URL` su Vercel → questo sblocca
   anche i residui SEO "da fare in produzione".
2. **[T] Creare l'account Brevo** (accettare i ToS che includono il DPA —
   conservare data/estremi per il registro dei trattamenti, chiusura A5),
   aggiungere il dominio in Senders & Domains e **copiare i record ESATTI
   che il pannello mostra** (i valori DKIM sono per-account: quelli sotto
   sono la forma attesa, non i valori).
3. **[T] Record DNS** presso il registrar:
   - SPF (TXT su `@`): `v=spf1 include:spf.brevo.com -all` — se in futuro
     manderà email anche Workspace: `v=spf1 include:_spf.google.com
     include:spf.brevo.com -all` (UN solo record SPF, mai due).
   - DKIM: i record (CNAME o TXT `mail._domainkey…`) esatti dal pannello Brevo.
   - DMARC (TXT su `_dmarc`), **a fasi**:
     - subito: `v=DMARC1; p=none; rua=mailto:<casella del negozio>; fo=1`
     - dopo 1–2 settimane di report tutti allineati: `p=quarantine`
     - a regime: `p=reject`
4. **[T] Env su Vercel** (Production + Preview) e redeploy:
   ```
   EMAIL_SMTP_HOST=smtp-relay.brevo.com
   EMAIL_SMTP_PORT=587
   EMAIL_SMTP_USER=<login SMTP dal pannello Brevo>
   EMAIL_SMTP_PASSWORD=<chiave SMTP dal pannello Brevo>
   EMAIL_FROM=ordini@<dominio>
   EMAIL_FROM_NAME=Anna Shop
   ```
   Le variabili `GMAIL_*` possono restare come fallback: il codice preferisce
   il provider quando le `EMAIL_*` sono complete.
5. **Test di accettazione** (prima di fidarsi):
   - un ordine di prova → l'email di conferma arriva; su Gmail "Mostra
     originale": SPF **pass**, DKIM **pass (dominio del negozio)**, DMARC
     **pass**;
   - invio a mail-tester.com → punteggio ≥ 9/10;
   - rispondere da una casella cliente → la risposta arriva alla casella del
     negozio (replyTo automatico, §4);
   - controllare su Brevo il pannello log/bounce.
6. **Dismissione Gmail**: dopo 1–2 settimane senza problemi, rimuovere le
   `GMAIL_*` da Vercel (il fallback sparisce e con lui l'ultimo pezzo di A5).

## 4. Cosa è già pronto nel codice (questa sessione)

`src/lib/email.ts` ora risolve il trasporto dalle env: **provider SMTP
generico** (le 6 variabili sopra — vale per Brevo, Resend, Postmark, SES,
Workspace relay…) con **fallback Gmail invariato** finché il provider non è
configurato. Porte gestite: 465 (TLS implicito) e 587 (STARTTLS forzato, mai
downgrade in chiaro). Sul percorso provider, se il chiamante non indica un
`replyTo`, le risposte vengono dirottate a `NEGOZIO.email` (il mittente
`ordini@dominio` di norma non ha una casella dietro; i clienti che
rispondono alla conferma d'ordine non devono finire nel vuoto).

Testato end-to-end in locale (webhook a firma finta → email di
segnalazione):
- percorso legacy (env attuali): invio riuscito, comportamento identico;
- percorso provider (env `EMAIL_SMTP_*` puntate su `smtp.gmail.com:587`):
  invio riuscito via STARTTLS con `EMAIL_FROM_NAME` personalizzato.

## 5. Limiti e note

- Il provider transazionale copre solo l'INVIO: la posta **in arrivo** su
  `@dominio` richiede Workspace (o il forwarding del registrar) — è la
  stessa decisione di B8 (sostituire la casella personale dello
  sviluppatore come contatto del negozio).
- Finché non c'è il dominio, restiamo su Gmail consumer: funziona, ma A5
  resta formalmente aperto (qui non c'è modo di chiuderlo senza le azioni
  [T] del runbook).
- Quando il dominio ci sarà, valutare anche `MX`/`autodiscover` solo se si
  attiva Workspace; per il solo invio transazionale NON servono record MX.
