# by Frody

E-commerce B2C di abbigliamento basics casual. Negozio online minimale:
vetrina prodotti, pagina prodotto con varianti di taglia, carrello e checkout
con pagamento via Stripe. Interfaccia interamente in italiano, valuta EUR,
prezzi gestiti in centesimi (interi) per evitare errori di arrotondamento.

## Stack

- **Next.js 16** (App Router) + **React 19**
- **TypeScript** (strict)
- **Tailwind CSS v4**
- **Supabase** (PostgreSQL + RLS) come database e backend dati
- **Stripe** (Checkout + Webhook) per i pagamenti

## Setup

### 1. Dipendenze

```bash
npm install
```

### 2. Variabili d'ambiente

Copia `.env.example` in `.env.local` e compila i valori:

```bash
cp .env.example .env.local
```

Servono le chiavi Supabase (URL, anon key, service role key) e Stripe
(secret key, webhook secret, publishable key). Il progetto **builda anche
senza env** (degrada mostrando dati di esempio / stato vuoto), ma per
funzionare davvero vanno configurate.

### 3. Database

Apri il **SQL Editor** del tuo progetto Supabase e incolla/esegui il contenuto
di [`supabase/schema.sql`](./supabase/schema.sql). Crea tabelle, indici, policy
RLS e inserisce alcuni prodotti d'esempio con relative varianti di taglia.
(In alternativa, con la Supabase CLI: `supabase db push`.)

### 4. Avvio in sviluppo

```bash
npm run dev
```

App su [http://localhost:3000](http://localhost:3000).

### 5. Webhook Stripe in locale

Per testare i pagamenti in locale inoltra gli eventi al webhook:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copia il `whsec_...` stampato in `STRIPE_WEBHOOK_SECRET`.

## Struttura cartelle

```
byFrody/
├─ src/
│  ├─ app/                      # rotte App Router (pagine + route handler)
│  │  ├─ page.tsx               # / vetrina
│  │  ├─ prodotti/[slug]/       # PDP (pagina prodotto)
│  │  ├─ carrello/              # carrello
│  │  ├─ checkout/successo/     # esito pagamento ok
│  │  ├─ checkout/annullato/    # esito pagamento annullato
│  │  └─ api/
│  │     ├─ checkout/           # POST: crea la sessione Stripe Checkout
│  │     └─ stripe/webhook/     # POST: riceve gli eventi Stripe
│  └─ lib/
│     ├─ types.ts               # tipi del dominio (Prodotto, Variante, Ordine...)
│     ├─ format.ts              # formatPrezzo (it-IT, centesimi -> "29,99 €")
│     ├─ stripe.ts              # getStripe() (client Stripe lazy, server)
│     ├─ cart.ts                # server actions del carrello
│     └─ supabase/
│        ├─ server.ts           # createServerSupabase() (SSR, cookie)
│        ├─ client.ts           # createBrowserSupabase() (browser)
│        └─ admin.ts            # createAdminSupabase() (service role, server)
├─ supabase/
│  └─ schema.sql                # schema DB + RLS + dati d'esempio
├─ .env.example                 # template variabili d'ambiente
└─ README.md
```

### Contratti chiave

- I prezzi sono **sempre in centesimi** (`prezzo_cents: number`).
- `createServerSupabase()` ritorna `null` se le env mancano: i chiamanti
  degradano con grazia (mai un crash in build).
- `createAdminSupabase()` usa la **service role key** e va usato **solo lato
  server** (es. webhook Stripe), perche bypassa le policy RLS.
- Il carrello e identificato da un cookie httpOnly `cart_id`; le righe stanno
  nella tabella `carrello_righe`.

---

## Note fiscali Italia (da confermare col commercialista)

> Queste note sono un orientamento tecnico per impostare il progetto, **non
> consulenza fiscale**. Vanno verificate con il proprio commercialista in base
> al regime adottato (forfettario, ordinario, ecc.).

- **Commercio elettronico indiretto.** La vendita online di beni materiali con
  spedizione al consumatore (B2C) e *commercio elettronico indiretto*. In questo
  regime, per le vendite a privati **non c'e obbligo di emettere fattura** per
  ogni ordine (solo su esplicita richiesta del cliente, o per i clienti B2B con
  partita IVA), **ne** di certificare i corrispettivi con i registratori
  telematici/scontrino. E sufficiente annotare le vendite nel
  **registro dei corrispettivi giornaliero**.

- **Fattura elettronica SDI on-demand.** Quando una fattura *e* dovuta (richiesta
  del cliente o vendita B2B) va emessa in formato elettronico verso il
  **Sistema di Interscambio (SDI)**. Conviene appoggiarsi a un servizio terzo
  con API/SDK (es. **Fatture in Cloud**, che offre un SDK TypeScript) anziche
  integrare direttamente lo SDI.

- **IVA / regime OSS.** Per il calcolo dell'IVA, anche sulle vendite a distanza
  intra-UE oltre la soglia (regime **OSS**), si puo usare **Stripe Tax** per il
  *calcolo* delle aliquote corrette al checkout. Attenzione: Stripe Tax
  **calcola** l'imposta, **non la emette/dichiara** al posto tuo: la
  dichiarazione resta a carico del contribuente/commercialista.

- **Autofattura TD17 (reverse charge sulle fee Stripe).** Le commissioni Stripe
  sono un servizio reso da un soggetto UE non residente (**Stripe Payments
  Europe, Irlanda**). Su questi acquisti di servizi intra-UE scatta il
  **reverse charge**, da gestire con **autofattura tipo documento TD17** in modo
  ricorrente (tipicamente mensile). Questo obbligo riguarda **anche i
  forfettari**.

- **Cookie / GDPR.** Prima di attivare analytics o tracciamenti non strettamente
  necessari serve un **consenso cookie** conforme. Conviene integrare una **CMP**
  pronta (es. **Iubenda** o **Cookiebot**) per banner consensi, cookie policy e
  privacy policy.
