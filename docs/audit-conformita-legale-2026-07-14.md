# Audit conformità legale e-commerce — 2026-07-14

Audit di conformità normativa per la vendita online B2C a consumatori italiani.
Metodo: 6 dimensioni analizzate in parallelo (recesso/condizioni, privacy/GDPR,
cookie/tracker, ODR/identità, prezzi/IVA, email post-vendita) + critico di
completezza; ogni finding verificato da un secondo agente scettico sul codice.
Riscontro runtime sull'HTML servito dal dev server (home renderizzata: nessuna
risorsa esterna, nessun cookie al visitatore anonimo).

**Esito in una riga: la postura tecnica è ottima (zero tracker, cookie solo
tecnici, Stripe hosted → il cookie banner NON serve), la postura documentale è
nulla: non esiste una sola pagina legale e nessun punto di raccolta dati
referenzia un'informativa.**

Nessun finding è stato ancora sistemato: questo documento è lo stato di fatto.

---

## Verdetto cookie banner (l'ipotesi era giusta)

**Il banner cookie NON è necessario.** Verificato sia nel codice sia a runtime:

- Zero script di terze parti, zero analytics/pixel (package.json senza
  dipendenze analytics; grep su `next/script`, gtag, fbq, hotjar, clarity,
  posthog, plausible: nessun match).
- Font self-hosted via `next/font` (src/app/layout.tsx:2-18) — nessuna
  chiamata a Google Fonts a runtime.
- Stripe integrato solo server-side con Checkout hosted (redirect): niente
  `@stripe/stripe-js`, quindi nessun cookie `__stripe_*` sul dominio.
- Cookie first-party esclusivamente tecnici: `cart_id` httpOnly 30gg
  (src/lib/cart.ts:47-49, 221-227) e sessione Supabase `sb-*`.
- localStorage solo funzionale (preferiti, src/lib/preferiti-client.ts:16).
- Unica risorsa terza: tile OpenStreetMap su /vieni-a-trovarci
  (src/components/MappaNegozio.tsx:53-57) — nessun cookie, ma va citata
  nell'informativa.

È un punto di forza reale. Resta però dovuta l'**informativa cookie**
(anche per i soli cookie tecnici — Linee guida Garante 10/06/2021), che oggi
non esiste.

---

## Finding CRITICI (4)

### C1 — Il diritto di recesso non è menzionato in nessun punto
**Norma:** art. 49 co. 1 lett. h, artt. 52-54 D.lgs. 206/2005 (Cod. Consumo).
Grep sull'intero repo per "recesso", "14 giorni", "quattordici": zero
occorrenze rivolte all'utente. Né pagine, né checkout, né email. Conseguenze
automatiche su ogni vendita già conclusa: il termine di recesso si estende da
14 giorni a **12 mesi e 14 giorni** (art. 53) e i costi di restituzione
restano a carico del venditore (art. 57). Profilo sanzionabile AGCM
(art. 66 → art. 27).

### C2 — Non esistono condizioni generali di vendita
**Norma:** art. 49 co. 1 Cod. Consumo; artt. 1341-1342 c.c.
Il contratto si conclude su Stripe senza che il cliente abbia mai potuto
vedere termini su consegna, recesso, garanzia, foro. Le Checkout Session
(src/app/api/checkout/route.ts:163-194, src/lib/ordini.ts:431-451) non hanno
`consent_collection` né `custom_text`. Oltre alla violazione informativa,
nessuna clausola è opponibile al consumatore in caso di controversia.

### C3 — Non esiste alcuna informativa privacy (GDPR art. 13)
**Norma:** GDPR artt. 12-13.
Grep "privacy" su src/: una sola occorrenza, ed è un commento tecnico
(src/lib/preferiti-client.ts:34). Il sito raccoglie dati personali in almeno
4 punti — registrazione (FormRegistrazione.tsx:55-114), modulo richiesta con
nome/email/telefono/note libere (ModuloRichiesta.tsx:74-185), rubrica
indirizzi, checkout — e in nessuno esiste o è linkata un'informativa. È la
lacuna radice dei finding privacy successivi.

### C4 — L'email di conferma ordine non è la conferma ex art. 51 co. 7
**Norma:** art. 51 co. 7 Cod. Consumo.
L'email "Ordine confermato" (src/app/api/stripe/webhook/route.ts:216-224) è
un riepilogo di cortesia: articoli, totale, indirizzo. La legge richiede la
conferma del contratto su supporto durevole con **tutte** le informazioni
dell'art. 49 non già fornite prima (qui: nessuna) — recesso con modulo tipo,
condizioni, garanzia legale, reclami. Vale anche per il flusso richiesta
(src/lib/gestore/ordini-actions.ts:338-342).

---

## Finding ALTI (6)

- **A1 — Garanzia legale di conformità mai menzionata** (art. 49 co. 1
  lett. l, artt. 128-135 Cod. Consumo). Grep "garanzia legale"/"garanzia di
  conformità": zero occorrenze consumer-facing. Il promemoria è dovuto prima
  della conclusione del contratto, sul sito.
- **A2 — Registrazione account senza link all'informativa** (GDPR art. 13).
  FormRegistrazione.tsx raccoglie nome/email/password con il solo testo
  "niente spam" (righe 111-113). Serve almeno il link all'informativa
  accanto al bottone (checkbox di consenso NON necessaria: base giuridica
  contrattuale ex art. 6.1.b).
- **A3 — Modulo "Invia richiesta" senza alcun riferimento privacy**
  (GDPR art. 13). Punto di raccolta più esposto: visitatore anonimo
  conferisce nome, email, telefono e note in testo libero; i dati vanno su
  Supabase e transitano su Gmail (src/lib/ordini.ts:140-153, 217-231).
- **A4 — Footer senza link privacy/cookie policy** (GDPR art. 12).
  Footer.tsx:155-167 ha solo P.IVA/REA/PEC. È il collocamento standard del
  link all'informativa, presente su ogni pagina.
- **A5 — Destinatari di fatto non dichiarati: Supabase, Stripe, Vercel,
  Google** (GDPR artt. 13.1.e, 28). Aggravante: le email transazionali con
  dati dei clienti partono da un **account Gmail consumer** via app password
  (src/lib/email.ts) — i termini Gmail consumer non includono un DPA
  ex art. 28; i dati restano nella cartella "Inviata" di una casella
  personale. Con Google Workspace il problema si risolve.
- **A6 — Informativa cookie mancante** (art. 122 Cod. privacy, LG Garante
  10/06/2021 §5). Dovuta anche con soli cookie tecnici; può essere una
  sezione della privacy policy. Deve citare: cart_id (30gg), cookie sb-*
  Supabase, localStorage preferiti, tile OSM, redirect Stripe.

---

## Finding MEDI (11)

- **M1 — Nessuna dicitura "IVA inclusa"** accanto ai prezzi (card, PDP,
  carrello). I prezzi SONO IVA inclusa by design (import fornitore:
  (ingrosso+IVA 22%)×3, src/lib/gestore/import-actions.ts:448; Stripe
  addebita `prezzo_cents` tal quale) ma non viene mai dichiarato.
- **M2 — Dicitura fuorviante "Spedizione e imposte calcolate al pagamento"**
  (CartDrawer.tsx:228-230, CarrelloContenuto.tsx:134-137). Nessuna imposta
  viene aggiunta al pagamento (niente `automatic_tax`): la frase è un calco
  USA, falsa in Italia, e implica prezzi IVA esclusa. Da rimuovere/correggere.
- **M3 — Costo spedizione (5,90 €, gratis ≥ 89 €) mai comunicato prima della
  pagina Stripe** (art. 49 co. 1 lett. e). La tariffa è fissa e deterministica
  (src/lib/spedizione.ts:24, 66-77): esporla nel carrello è banale. Manca
  anche una pagina spedizioni con tariffa/soglia/tempi.
- **M4 — Informativa precontrattuale incompleta sul sito** (spedizione e
  consegna comunicate solo su Stripe; attenuata perché il vincolo scatta
  dopo la pagina Stripe, ma "in tempo utile prima" è al limite).
- **M5 — Flusso "su richiesta": contratto concluso via email senza corredo
  informativo**; il totale può cambiare (articoli rimossi, spedizione
  aggiunta dal gestore) e la proposta finale viaggia in un'email nuda.
- **M6 — Informativa ADR mancante** (art. 141-sexies Cod. Consumo). Dopo la
  dismissione della piattaforma ODR (luglio 2025) l'obbligo residuo è
  informare sugli organismi ADR nelle condizioni di vendita.
- **M7 — Cookie tecnici senza informativa che li descriva** (assorbito da A6,
  contato a parte dalla dimensione privacy).
- **M8 — Diritti dell'interessato non comunicati.** La cancellazione account
  self-service c'è ed è ben fatta (auth-actions.ts:337-370); la conservazione
  ordini post-cancellazione è legittima (art. 17.3.b, obblighi fiscali) ma
  deroga, retention e diritti non self-service (accesso, portabilità, reclamo
  al Garante) vanno dichiarati nell'informativa.
- **M9 — Rientro dati da Stripe non coperto da informativa** (l'indirizzo di
  spedizione raccolto su Stripe viene persistito nell'ordine dal webhook,
  webhook/route.ts:105-160, e sincronizzato col Customer Stripe).
- **M10 — Ordini direct-buy senza token né numero d'ordine visibile:**
  l'ospite non ha alcun riferimento da citare per recesso/reclami (la RPC
  `finalizza_ordine_pagato` non valorizza `token`, schema.sql:255-262;
  l'email non contiene numero né link).
- **M11 — Invio email di conferma best-effort e non monitorato:**
  `inviaEmail` ritorna false in silenzio (email.ts:28-59), nessun flag
  sull'ordine, nessun retry; impossibile provare l'adempimento art. 51 co. 7
  per uno specifico ordine. La pagina di successo promette comunque
  "Riceverai a breve una email di conferma".
- **M12 — Etichettatura tessile non garantita** (Reg. UE 1007/2011 art. 16):
  la composizione fibrosa deve essere visibile prima dell'acquisto; oggi è
  testo libero facoltativo dentro `descrizione` (nessuna colonna dedicata,
  nessun controllo) — dipende dalla qualità dei dati fornitore.
- **M13 — GPSR (Reg. UE 2023/988 art. 19, in vigore dal 13/12/2024):**
  l'offerta online non indica fabbricante e suoi recapiti né identificazione
  del prodotto; nessun campo previsto in scheda.

*(M7 conteggiato in A6; l'elenco effettivo dei medi distinti è M1-M6, M8-M13.)*

## Finding BASSI (9)

- **B1 — Pulsante ordine:** l'inoltro con obbligo di pagamento avviene sul
  bottone Stripe "Paga [importo]" (formula equivalente accettata ex art. 51
  co. 2); i bottoni del sito ("Vai al pagamento", "Paga ora") sono fasi
  preliminari. Rischio residuo basso, testo presidiato da Stripe.
- **B2 — IP trattati** (log richiesta ordini, tabella rate_limit_eventi con
  retention ~24h): trattamento difendibile ex art. 6.1.f ma da dichiarare
  nell'informativa.
- **B3 — localStorage preferiti** da citare nell'informativa (per i loggati
  contiene lo userId, SincronizzaPreferiti.tsx:29,42).
- **B4 — Tile OSM** da citare nell'informativa (IP comunicato a OSMF).
- **B5 — Sfondo banner vetrina con URL libero** (FasciaBanner.tsx:72-80,
  FasciaHero.tsx:84-95): se il gestore imposta un'immagine su host terzo, i
  visitatori si connettono a quell'host — può invalidare la premessa "nessuna
  terza parte" senza toccare il codice. Rischio di configurazione.
- **B6 — "Totale stimato" del carrello esclude la spedizione** pur essendo
  questa nota al centesimo; ambiguità attenuata dall'aggettivo.
- **B7 — Omnibus (art. 17-bis):** oggi non applicabile (nessun prezzo
  barrato/sconto annunciato), ma non esiste storicizzazione dei prezzi con
  cui documentare il "prezzo più basso 30 giorni" se si volessero annunciare
  saldi. Rischio latente.
- **B8 — Email di contatto = casella personale dello sviluppatore**
  (`1.domenicotatone@gmail.com`, src/lib/negozio.ts:27): pubblicata in footer
  e vieni-a-trovarci come contatto del prestatore ex art. 7 D.lgs. 70/2003.
  Da sostituire con recapito del negozio prima del go-live (nota: anche gli
  orari in negozio.ts:43 sono marcati "da confermare").
- **B9 — Pagina /ordine/[token] ed email senza recapito cliccabile** nei
  punti dove serve di più (lo stato "annullato" dice "scrivici pure" senza
  link); attenuato dal footer presente ovunque. I template Supabase Auth sono
  curati ma applicati a mano in dashboard (non verificabile dal codice) e
  senza identità/recapiti del titolare.

---

## Requisiti già a posto (verificati)

- Identità e recapiti del venditore su ogni pagina: ragione sociale, indirizzo,
  telefono, email, PEC, P.IVA, REA (src/lib/negozio.ts + Footer su tutto il
  route group vetrina) — incluso obbligo P.IVA in home (art. 35 DPR 633/72).
- **Nessun link morto alla piattaforma ODR** (dismessa dalla Commissione UE a
  luglio 2025, Reg. UE 2024/3228): correttamente assente.
- Coerenza prezzo mostrato ↔ addebitato: verificata (prezzi riletti dal DB,
  `unit_amount` = `prezzo_cents`, EUR, nessuno scostamento).
- Valuta EUR uniforme, formattazione it-IT centralizzata.
- Nessuna newsletter/marketing → nessun consenso ex art. 130 necessario.
- Cancellazione account self-service con riverifica password; ordini
  conservati legittimamente (obblighi fiscali).
- Email di ricezione richiesta con link di tracciamento /ordine/[token]
  (flusso differito).
- RAEE/pile: non applicabile (catalogo solo tessile). Vendita a minori:
  nessun obbligo attivato.
- Accessibilità (EAA/D.lgs. 82/2022): e-commerce in ambito dal 28/6/2025 ma
  **probabile esenzione microimpresa** (<10 dipendenti e ≤2M €) — da
  confermare col titolare; la qualità a11y tecnica del sito è comunque buona.

## Piano d'azione suggerito (per priorità)

1. **Scrivere 4 documenti** e pubblicarli come pagine statiche linkate dal
   footer: Condizioni di vendita (con recesso 14gg + modulo tipo Allegato I-B,
   garanzia legale 26 mesi, spedizioni/consegna, ADR), Informativa privacy
   (con sezione cookie), pagina Spedizioni e resi, eventualmente FAQ.
   ⚠️ I testi vanno fatti validare da un legale: questo audit individua le
   lacune, non sostituisce la consulenza.
2. **Collegare i documenti nei punti di raccolta**: link privacy sotto i form
   (registrazione, richiesta), link condizioni + `consent_collection` o
   `custom_text` sulla Checkout Session Stripe.
3. **Arricchire l'email di conferma ordine** (art. 51 co. 7): recesso +
   modulo, garanzia, condizioni (o link/PDF), numero d'ordine e token anche
   per il direct-buy; flag `email_inviata` sull'ordine.
4. **Correggere le diciture prezzi**: "IVA inclusa" accanto ai prezzi,
   rimuovere "imposte calcolate al pagamento", mostrare spedizione 5,90 €
   (gratis ≥ 89 €) nel carrello.
5. **Igiene operativa**: sostituire l'email Gmail personale con recapito del
   negozio (e valutare Workspace o un provider transazionale con DPA per
   l'invio), confermare orari in negozio.ts.

---

*Audit eseguito con workflow multi-agente (39 agenti, verifica adversariale
per finding: 31 confermati, 1 smontato, 13 requisiti ok). Nessuna modifica
al codice applicata.*
