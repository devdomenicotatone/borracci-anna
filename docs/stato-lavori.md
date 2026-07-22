# Stato lavori — documento vivo (canonico)

> **Ultimo aggiornamento: 2026-07-21.** Questo file è la fonte di verità
> portabile su cosa è fatto, cosa resta e cosa spetta alla titolare: viaggia
> col repo, a differenza della memoria locale dell'assistente. **Va
> aggiornato a fine di ogni sessione di lavoro.**

## Come riprendere il lavoro (nuovo PC o nuova chat)

1. `git clone` / `git pull`.
2. Su una macchina NUOVA servono anche (non sono nel repo):
   - `.env.local` (secrets: Supabase, Stripe, Gmail, BLT, cron… — trasferirla
     in modo sicuro dalla macchina attuale);
   - CLI Supabase autenticata e linkata (`npx supabase login`, progetto
     `ozbsslebqtzslfpqpwyz`) per le migration via `db push`;
   - CLI Vercel autenticata (`npx vercel login`) solo se servono env/deploy.
3. Incollare in chat il prompt di ripartenza qui sotto (o semplicemente:
   *"allinea la repo e leggi docs/stato-lavori.md, poi prosegui col primo
   punto aperto"*).

### Prompt di ripartenza (aggiornato al 2026-07-21)

```
Prima di tutto allinea la repo locale con GitHub (git pull) e leggi
docs/stato-lavori.md (stato canonico: fatto / da fare / promemoria).

CONTESTO. E-commerce "Anna Shop di Borracci Anna" (microimpresa, Rimini,
spedizioni solo Italia, Stripe Checkout, due flussi: diretto e su
richiesta). Next.js 16 CUSTOM: leggi AGENTS.md e le guide in
node_modules/next/dist/docs/ prima di scrivere codice. I 5 cantieri
principali e gli audit (legale critici, integrità, sicurezza, mobile,
a11y AA, SEO tecnico, performance, osservabilità, igiene) sono CHIUSI:
non rifarli, non regredirli (report in docs/). Pattern vincolanti: vedi
"Note operative" in docs/stato-lavori.md.

LAVORO RIMASTO:
1. SEO in produzione (SOLO dopo che esiste il dominio).
B7 (storicizzazione prezzi Omnibus) solo se si vorranno annunciare sconti.
Tutto il resto del lavoro tecnico e' CHIUSO: restano le azioni della
titolare (vedi PROMEMORIA in docs/stato-lavori.md).

A fine sessione: tsc + eslint (A ZERO) + next build puliti, verifica sul
server locale (porta 3000: prima controlla cosa risponde), commit e push,
AGGIORNA docs/stato-lavori.md e ristampa l'elenco aggiornato.
```

## Cantieri principali — 5/5 CHIUSI (tutti su main)

| # | Cantiere | Commit | Report | Esito in breve |
| --- | --- | --- | --- | --- |
| 1 | Performance bundle | `388498b` | audit-performance-bundle-2026-07-21.md | sospetti smentiti dalla misura, bundle già sani; baseline + 3 script di misura in `scripts/` |
| 2 | Osservabilità | `efcbf10` | osservabilita-2026-07-21.md | alert email con dedup su webhook Stripe e sync BLT, banner "cron fermo", M11 chiuso (flag email_conferma) |
| 3 | Deliverability email | `2095c46` | deliverability-email-2026-07-21.md | trasporto SMTP provider-ready via env (testato sui 2 percorsi); BLOCCO esterno: manca il dominio |
| 4 | Dipendenze e igiene | `f9afdfc` | igiene-dipendenze-2026-07-21.md | eslint a ZERO, vulnerabilità 0, server-only dichiarata; falsi positivi depcheck documentati |
| 5 | UX desktop | `5c74fa6` | audit-ux-desktop-2026-07-21.md | CTA PDP sopra la piega, 5 colonne a xl, carrello a norma (M1/M2/M3+B6 chiusi) |

Sessione extra residui legali: `9de3761` — **M12 chiuso** (composizione
strutturata, backfill 1785/1842), **M13 pronto lato codice** (mancano i
dati del fabbricante dalla titolare). Report:
residui-legali-m12-m13-2026-07-21.md.

Sessione M10+B9 (21/07 sera): `18bd936` — **M10 e B9 CHIUSI** (migration
20260721200000 applicata e verificata la sera stessa).
Token pubblico anche per gli ordini direct-buy (RPC — firma/lock/
idempotenza invariati), "Ordine #N" + link /ordine/[token] nelle email di
conferma e nella pagina di successo, blocco recapiti cliccabili (email con
oggetto precompilato, telefono, WhatsApp) su /ordine/[token], recapiti in
chiaro nelle email di ricezione/annullo.
Bonus: via i `<main>` annidati da /ordine/[token] e /checkout/successo.
Verifica visiva di /ordine/[token] con dati reali ancora da fare (DB senza
ordini): basta una richiesta di prova dal sito.

Sessione B5 (21/07 notte): `744ce03` — **B5 chiuso lato codice**. Sfondi
hero/banner SOLO dal bucket del sito o path relativi (fonte unica
src/lib/vetrina-sfondi.ts): rifiuto al salvataggio con errore chiaro +
guardia al rendering per i legacy (host esterni mai renderizzati). Nel
pannello via il campo "incolla link": bottone "Carica immagine" (WebP
client-side come la galleria, import dinamico), anteprima e "Togli".
Bucket Storage dedicato `vetrina` (migration 20260721210000, applicata e
verificata la notte stessa). Nessuna fascia a DB aveva immagini: zero
retrocompatibilita da gestire. Da provare a mano nel pannello: caricare
uno sfondo su una fascia e salvarla (primo giro reale del bottone).

Sessione barra bulk (22/07 notte): `c3e3e4a` — fix grafico alla barra
azioni in blocco di /gestore/prodotti: la select categorie (bianca su
fondo scuro) collassava a "scheggia" nella riga nowrap e la barra fixed
copriva le ultime righe della lista. Ora select ghost scura con min-width
reale, wrap ordinato quando manca spazio, barra centrata sulla colonna
dei contenuti (non sul viewport) e distanziale in fondo alla lista.
Verificata con pagina di anteprima temporanea (poi rimossa) a 1600/1024/
375px, stati Assegna/Rimuovi e conferma eliminazione inclusi.

Audit precedenti (tutti chiusi, report in docs/): conformità legale
(critici C1-C4), integrità ordini/magazzino, sicurezza, mobile, a11y
WCAG 2.2 AA, SEO tecnico.

## Stato database (al 2026-07-21, sera)

- Ledger migration **riallineato**: le migration si applicano con
  `npx supabase db push` (SEMPRE `--dry-run` prima). Ultima applicata:
  `20260721210000_bucket_sfondi_vetrina` (21/07 notte, verificata: remoto
  up to date, bucket presente con settaggi giusti). Niente in sospeso.
- CLI Supabase ora autenticata e linkata ANCHE sul Mac (oltre che sul PC
  Windows). Nota: il push "vero" va lanciato dal terminale dalla titolare
  (il classificatore permessi dell'assistente blocca le scritture sul DB
  di produzione); dry-run e migration list li fa l'assistente.
- Backfill dati eseguiti: `composizione` su 1785 prodotti (21/07).
- Tabella `ordini` vuota al 21/07 sera (pre-lancio): nessun backfill ordini.

## Residui aperti (in ordine consigliato)

**Legali** (docs/audit-conformita-legale-2026-07-14.md):
- ~~M10 + B9~~ **chiusi il 21/07** (`18bd936`, migration applicata).
- ~~B5~~ **chiuso il 21/07** (`744ce03`, migration applicata).
- **B7**: storicizzazione prezzi Omnibus — SOLO se si annunceranno sconti.
- **M13-dati**: solo azione titolare (vedi promemoria).
- **A5**: solo azioni titolare (dominio + provider email, runbook pronto).

**A11y e UX minori — TUTTI CHIUSI il 21/07** (`c65cc47`):
- ~~`<main>` annidati~~: uniformate anche le ultime tre pagine
  (vieni-a-trovarci, checkout/annullato, not-found) — la vetrina non ha
  piu landmark doppi.
- ~~Chip "Da pagare" gestore~~: text-lagoon-ink (AA), come il chip cliente.
- ~~Pannello "Tutti i temi"~~: bottone su desktop (>12 temi) che apre i
  chip in griglia multi-riga; si richiude alla scelta. Mobile invariato.
- ~~Cap campo ricerca~~: md:max-w-2xl.
- ~~FreeShippingBar carrello misto~~: era GIA a posto (sistemata con le
  sezioni separate del carrello, `cd92576`): conta solo la parte in pronta
  consegna. Solo verifica, nessuna modifica.

**SEO — richiedono la PRODUZIONE con dominio** (docs/audit-seo-2026-07-21.md):
- peso card OG prodotto (se >~600KB → og:image = JPEG originale);
- Rich Results Test su una PDP + verifica Search Console.

## PROMEMORIA TITOLARE (azioni NON eseguibili dall'assistente)

1. **Acquistare il dominio del negozio** e collegarlo a Vercel — prerequisito
   di deliverability (A5) e dei residui SEO. Runbook completo:
   docs/deliverability-email-2026-07-21.md.
   **Stato al 22/07 pomeriggio: DOMINIO ATTIVO E COLLEGATO ✅**
   - **`annashoprimini.it`** registrato al Registro .it (stato [ok]),
     intestato a Borracci Anna con sede Rimini, rinnovo automatico ON,
     offerta "Dominio con email" (5 caselle da 1 GB per il futuro info@).
     Account Aruba storico della P.IVA recuperato (username 11684238).
   - **DNS su Aruba (INVARIATI i nameserver)**: record A `@` →
     76.76.21.21 (Vercel); `www` segue l'apex via CNAME preesistente.
     Record `mail`/`mx`/SPF Aruba INTATTI (servono per le caselle email).
   - Dominio + www agganciati al progetto Vercel via CLI (autenticata sul
     Mac, utente domenicotatonedev-8873); verifica Vercel superata,
     certificato SSL in emissione automatica al momento della scrittura.
   - **`NEXT_PUBLIC_SITE_URL` (Production) → https://annashoprimini.it**,
     deploy eseguito e VERIFICATO il 22/07: https 200 su apex e www,
     certificati emessi (rinnovo automatico), robots/sitemap col dominio
     nuovo. Il vecchio borracci-anna.vercel.app resta attivo (i canonical
     puntano al dominio: nessun problema SEO).
   - **PROSSIMI PASSI (in ordine)**:
     1) opzionale (cosmesi): in dashboard Vercel impostare i redirect
        www → apex e vercel.app → dominio;
     2) creare `info@annashoprimini.it` dal pannello Aruba → chiude B8
        (sostituire NEGOZIO.email in src/lib/negozio.ts + template
        Supabase Auth in dashboard);
     3) Brevo + SPF/DKIM/DMARC come da runbook. ⚠️ SPF: esiste gia'
        `v=spf1 include:_spf.aruba.it ~all` su Aruba → gli include di
        Brevo vanno UNITI in quell'UNICO record, mai due record SPF;
     4) residui SEO in produzione (audit-seo-2026-07-21.md);
     5) opzionale: aggiornare l'endpoint webhook nella dashboard Stripe
        al nuovo dominio (il vecchio borracci-anna.vercel.app resta
        comunque attivo, quindi NON e' urgente).
2. Creare l'account **Brevo** (o Workspace), accettare il DPA, configurare i
   record DNS e le env `EMAIL_*` su Vercel come da runbook; poi dismettere
   le `GMAIL_*`.
3. **Chiedere a Ingrosso BLT conferma dei dati del fabbricante** (email in
   preparazione dalla titolare). Dal sito ingrossoblt.com (21/07) risulta:
   BLT Distribution s.r.l. — Via O. Scavino 4, 47891 Rovereta, Repubblica
   di San Marino — tel +378 0549 980377 — web@ingrossoblt.com.
   ⚠️ San Marino e' FUORI dall'UE: ai fini GPSR va chiesto anche chi e' il
   **responsabile UE** dei loro prodotti (e segnalare al legale del punto 6
   la questione importatore: chi porta in UE merce di fabbricante extra-UE
   puo' avere obblighi propri). Ottenuta la conferma:
   `node scripts/imposta-fabbricante.mjs BLT "Nome | Indirizzo | email" --applica`
   → compila 1840 schede e chiude M13.
4. ~~Confermare gli orari del negozio~~ **FATTO il 21/07**: orari
   stagionali confermati dalla titolare e scritti in negozio.ts (testo +
   JSON-LD per periodi a date fisse; il tratto pasquale, a inizio mobile,
   vive solo nel testo). Se in futuro cambiano: aggiornare INSIEME
   `NEGOZIO.orari` e `NEGOZIO.orariStrutturati`.
5. Sostituire l'**email di contatto** (oggi casella personale dello
   sviluppatore, B8) — nota: è anche la casella che riceve gli alert
   tecnici e le notifiche ordine.
6. Far **validare i testi legali** pubblicati da un legale.
7. ~~Confermare l'esenzione microimpresa EAA~~ **FATTO il 21/07**: la
   titolare conferma <10 dipendenti e fatturato ≤2M € → microimpresa,
   ESENTE dagli obblighi EAA sui servizi (niente dichiarazione di
   accessibilità). L'esenzione decade se un giorno si superano le soglie:
   da lì servirebbe la dichiarazione. La qualità a11y del sito resta
   comunque (audit WCAG 2.2 AA chiuso).
8. (Eventuale) URL delle condizioni nella dashboard Stripe se si vorrà
   `consent_collection` al posto del `custom_text`.

## Note operative vincolanti (per chi riprende il lavoro)

- **Standard di fine sessione**: tsc 0 · eslint **0** · `next build` pulito ·
  verifica sul server locale · commit+push · aggiornare QUESTO file.
- **Migration**: `npx supabase db push` (dry-run prima). Mai SQL Editor a
  mano: il ledger è allineato dal 21/07 e deve restarlo.
- **Pattern UI vincolanti**: coral-ink per i fill con testo bianco (mai
  bg-coral col testo); velo scuro sempre attivo sui hero; StatoInvio nei
  form; `{" "}` espliciti nei nodi JSX con entità HTML (quirk del Next
  custom); robots solo /gestore + noindex crawlabile sulle private;
  JSON-LD della PDP con spedizione/reso; niente og title/description nel
  root layout.
- **Carrello/spedizione**: la tariffa arriva ai componenti SEMPRE come prop
  dal server (`SPEDIZIONE_ITALIA_CENTS` è env server-only); il totale
  mostrato deve restare identico all'addebito Stripe.
- **Bundle**: confini lazy da non regredire (editor Filerobot dietro
  dynamic ssr:false; @imgly dentro il click; leaflet dentro await import;
  qrcode lazy in CondividiProdotto). Nuove dipendenze client >20KB → misura
  prima/dopo con gli script `scripts/bundle-*.mjs`.
- **Stock semaforo BLT (>=999)**: mai mostrarlo come numero al cliente.
- **Trappola PDP**: `caricaProdotto` ricostruisce l'oggetto campo per campo
  — una colonna nuova va aggiunta al select E al return.
- **Porta 3000**: verificare prima cosa risponde; dev server con `npm run
  dev` in background; fermarlo prima di `next build` (condividono .next).
- **Windows/PowerShell 5.1**: commit multilinea con `git commit -F <file>`
  (le virgolette interne spezzano -m); mai patchare sorgenti con
  Set-Content (BOM/CRLF); niente `process.exit()` negli script Node con
  fetch keep-alive aperti.
