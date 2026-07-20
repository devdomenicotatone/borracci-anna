# Rollout — Spedizione "a spedizione" (corriere + Stripe)

> Checklist operativa per attivare la spedizione calcolata. Il **codice è già pronto**
> (tsc + lint puliti): qui ci sono solo i passi **manuali** di messa in produzione.
> Scenario: **Solo Italia, <50 spedizioni/mese, da zero senza contratto corriere**,
> abbigliamento leggero. Aggregatore scelto: **Packlink (pay-per-use, niente canone)**.
>
> **Aggiornato 2026-07-21:** tariffa **unica nazionale** (le due zone
> continentale/isole non esistono più, vedi callout sotto).

## Cosa fa (in breve)

La spedizione viene addebitata in **due flussi**, entrambi via Stripe Checkout:

| Flusso | Quando si usa | Chi fissa la spedizione | Come |
|---|---|---|---|
| **Diretto** | prodotti in pronta consegna (`disponibilita_su_richiesta = false`) | **automatica** (nessuna scelta del cliente) | `shipping_options` con UNA sola voce: *Spedizione standard (Italia)* con stima 2–5 gg lavorativi, **gratis ≥ 89 €** |
| **Su richiesta** (default) | prodotti `disponibilita_su_richiesta = true` | il **gestore** in "Conferma disponibilità" | voce fissa "Spedizione" col costo concordato |

In entrambi i casi il **webhook** salva su `ordini`: `costo_spedizione_cents`, `spedizione_indirizzo`
(indirizzo scelto su Stripe) e allinea `totale_cents` all'incassato reale (merce + spedizione).

> ℹ️ **Tariffa unica nazionale (decisione della titolare, audit lug 2026, finding 16):**
> in origine il flusso diretto offriva due fasce a scelta del cliente (*continentale* /
> *isole*), ma su Stripe hosted le shipping option sono radio a libera scelta: chi
> spediva nelle isole poteva selezionare la fascia più bassa. Con la tariffa unica il
> problema sparisce; l'eventuale **supplemento isole del corriere è assorbito dal
> negozio**. Fonte di verità: [`src/lib/spedizione.ts`](../src/lib/spedizione.ts).

---

## Pre-requisiti

- [ ] Progetto Supabase attivo (le env `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` già configurate).
- [ ] Stripe in **test mode** funzionante (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`).
- [ ] CF/P.IVA del negozio per la fatturazione dell'aggregatore.

---

## Step 1 — Applica la migration al DB

La migration è additiva (aggiunge colonne + estende la RPC `finalizza_ordine_pagato`),
**non distruttiva**.

```bash
# Consigliato in QUESTO progetto: incolla ed esegui il contenuto del file nel
# SQL Editor di Supabase. Il ledger delle migration CLI e' fermo (le migration
# successive sono state applicate a mano): un `supabase db push` tenterebbe di
# riapplicare tutto lo storico.
```

File: [`supabase/migrations/20260625100000_spedizione.sql`](../supabase/migrations/20260625100000_spedizione.sql)

**Verifica** (SQL Editor):

```sql
-- Le colonne devono esistere:
select column_name from information_schema.columns
 where table_name = 'ordini'
   and column_name in ('costo_spedizione_cents','spedizione_indirizzo');

-- La RPC deve avere la nuova firma (6 argomenti):
select pg_get_function_identity_arguments(oid)
  from pg_proc where proname = 'finalizza_ordine_pagato';
-- atteso: p_session_id text, p_email text, p_total integer, p_righe jsonb,
--         p_shipping_cents integer, p_indirizzo jsonb
```

- [ ] Migration applicata e verificata.

---

## Step 2 — Configura la tariffa (env)

I default funzionano già (5,90 € tariffa unica / gratis ≥ 89 €). La tariffa è
**server-only** (no `NEXT_PUBLIC_`): si legge a runtime → per cambiarla basta
modificarla e **riavviare**, niente rebuild.

> ⚠️ Dal 2026-07-21 tariffa e soglia compaiono anche nella pagina legale
> [`/condizioni-di-vendita`](../src/app/(vetrina)/condizioni-di-vendita/page.tsx),
> che è **statica** (i valori vengono incollati al build): dopo averle cambiate
> serve anche un **deploy**, altrimenti la pagina mostra le cifre vecchie mentre
> il checkout addebita quelle nuove.

In `.env.local` (vedi [`.env.example`](../.env.example)):

```bash
# Soglia spedizione gratuita (pubblica: la usa la barra "spedizione gratis"). 8900 = 89,00 €
NEXT_PUBLIC_FREE_SHIPPING_CENTS=8900
# Tariffa UNICA Italia (server-only). Centesimi. La storica
# SHIPPING_IT_CONTINENTE_CENTS resta letta come fallback se questa manca;
# SHIPPING_IT_ISOLE_CENTS non è più usata.
SHIPPING_IT_CENTS=590   # 5,90 €
```

- [ ] Env impostate (o lasciati i default consapevolmente).

---

## Step 3 — Account corriere + preventivi reali

I prezzi "vetrina" online sono risultati **fuorvianti**: le tariffe nette vere si
ottengono solo dai preventivi nel pannello.

- [ ] Apri un account **Packlink PRO (Free)** — e opzionalmente **SpedirePRO** per confronto.
- [ ] Fai **2-3 preventivi reali** per un pacco 0,5–1 kg su destinazioni diverse (una
      continentale e una nelle isole), leggendo il **netto con supplementi inclusi**
      (fuel, isole/aree disagiate): la tariffa addebitata al cliente è unica, quindi va
      tarata sul costo **medio**, tenendo conto del supplemento isole assorbito dal negozio.
- [ ] **Tara la env** dello Step 2 in base al costo reale + un piccolo cuscinetto.
      Verifica che la soglia **89 €** copra il costo medio spedizione + margine.

> Per <50 spedizioni/mese **non serve l'API**: si stampano le etichette a mano dal
> pannello Packlink. L'integrazione API (es. Sendcloud Shipping Prices) è roba da crescita.

---

## Step 4 — Test in Stripe test-mode

Avvia l'inoltro del webhook in un terminale dedicato e copia il `whsec_…` in
`STRIPE_WEBHOOK_SECRET`:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Carta test: `4242 4242 4242 4242`, scadenza futura, CVC qualsiasi.

**Flusso DIRETTO** (serve un prodotto con `disponibilita_su_richiesta = false`):
- [ ] Aggiungi al carrello → mini-cart → "Paga".
- [ ] Su Stripe compare UNA sola voce di spedizione: **"Spedizione standard (Italia)"**
      con stima 2–5 gg lavorativi (o **"Spedizione gratuita"** se il carrello è ≥ 89 €).
      Nessuna scelta di zona. Inserisci l'indirizzo, paga.
- [ ] L'ordine in DB risulta `pagato` con `costo_spedizione_cents`, `spedizione_indirizzo`
      e `totale_cents` = merce + spedizione.

**Flusso SU RICHIESTA** (prodotto default):
- [ ] Invia una richiesta da `/carrello`.
- [ ] In `/gestore/ordini` imposta **"Spedizione €"** e clicca **Conferma disponibilità**.
- [ ] Apri `/ordine/[token]`: il breakdown mostra Subtotale → Spedizione → Totale; arriva
      l'email col totale finale.
- [ ] "Paga ora" → su Stripe c'è la voce **"Spedizione"** col costo concordato → paga.
- [ ] L'ordine risulta `pagato` con i campi spedizione valorizzati.

**Query di controllo** (SQL Editor):

```sql
select stato, totale_cents, costo_spedizione_cents, spedizione_indirizzo
  from public.ordini
 order by creato_il desc limit 5;
```

- [ ] Entrambi i flussi verificati end-to-end in test mode.

---

## Step 5 — Go-live

- [ ] Passa le chiavi Stripe da `sk_test_…`/`pk_test_…` a `sk_live_…`/`pk_live_…`.
- [ ] Configura l'endpoint webhook **live** nella dashboard Stripe → `…/api/stripe/webhook`,
      e aggiorna `STRIPE_WEBHOOK_SECRET` con quello dell'endpoint live.
- [ ] Conferma le tariffe definitive nelle env e **riavvia** l'app.
- [ ] Primo ordine reale di prova (anche di importo basso) per validare l'incasso.

---

## File toccati (riferimento)

**MVP / flusso diretto**
- [`supabase/migrations/20260625100000_spedizione.sql`](../supabase/migrations/20260625100000_spedizione.sql) — colonne `ordini` + RPC estesa
- [`supabase/schema.sql`](../supabase/schema.sql) — canonical allineato
- [`src/lib/spedizione.ts`](../src/lib/spedizione.ts) — `opzioniSpedizione()` (unico punto di verità del costo)
- [`src/app/api/checkout/route.ts`](../src/app/api/checkout/route.ts) — `shipping_options` nel checkout diretto
- [`src/app/api/stripe/webhook/route.ts`](../src/app/api/stripe/webhook/route.ts) — persiste costo + indirizzo
- [`src/lib/types.ts`](../src/lib/types.ts), [`src/lib/supabase/database.types.ts`](../src/lib/supabase/database.types.ts), [`.env.example`](../.env.example)

**Passo 2 / flusso su richiesta**
- [`src/lib/gestore/ordini-actions.ts`](../src/lib/gestore/ordini-actions.ts) — `confermaOrdineAction(id, costoSpedizioneCents)`
- [`src/lib/ordini.ts`](../src/lib/ordini.ts) — `creaCheckoutOrdineAction` con voce "Spedizione"
- [`src/components/gestore/ListaOrdini.tsx`](../src/components/gestore/ListaOrdini.tsx) — campo "Spedizione €"
- [`src/app/(gestore)/gestore/(app)/ordini/page.tsx`](../src/app/(gestore)/gestore/(app)/ordini/page.tsx) — select aggiornata
- [`src/app/(vetrina)/ordine/[token]/page.tsx`](../src/app/(vetrina)/ordine/[token]/page.tsx) — breakdown costi

---

## Limiti noti / evoluzioni future

- **Supplemento isole assorbito** (flusso diretto): con la tariffa unica il cliente
  delle isole paga come tutti; l'eventuale supplemento del corriere resta a carico
  del negozio. Scelta deliberata (vedi callout in alto): a questi volumi costa meno
  del vecchio loophole della zona auto-selezionata.
- **Peso non considerato**: tariffa unica, non per peso. Per l'abbigliamento leggero
  (ordine tipico < 1 kg) va bene. Se servirà far pagare di più gli ordini voluminosi:
  aggiungere `peso_grammi` al prodotto e passare a fasce di peso.
- **Tariffe live multi-zona / UE**: richiederebbero un checkout custom (Payment Element +
  API corriere). Da valutare solo con la crescita (UE / volumi alti).
