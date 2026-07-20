# Audit integrità ordini/magazzino — 20 luglio 2026

Punto 3 della lista audit concordata: *"il decremento stock è atomico o due
acquisti simultanei possono vendere l'ultimo pezzo due volte? Il webhook Stripe
che arriva due volte crea problemi? E la sync BLT?"*. Analisi mirata del
percorso denaro (RPC di finalizzazione, webhook, checkout, sync) con query di
riscontro sul DB live.

> **Esito in una riga:** l'impianto regge — finalizzazione atomica e idempotente
> verificata percorso per percorso; **2 finding** (1 medio latente, 1 basso),
> entrambi **corretti in questa sessione**. Una migration da applicare.

## Sintesi esecutiva

| Domanda | Verdetto |
|---|---|
| Il webhook doppio crea problemi? | **No** (V1): lock di riga + `stock_scalato` + unique su `stripe_session_id`; email solo alla prima finalizzazione |
| Il decremento stock è atomico? | **Sì** (V2): singolo UPDATE row-locked, niente lost update tra ordini concorrenti |
| Due acquisti simultanei vendono l'ultimo pezzo due volte? | **Oggi impossibile in pratica** (N1: giacenze a semaforo 999/0, non esiste un "ultimo pezzo" reale). Il caso latente (stock manuali) era **invisibile** → F1, corretto |
| La sync BLT è viva? | **Sì** (verificata a inizio sessione): run del 20/07 04:15 UTC ok, 6.556 varianti a stock, 1.822 prodotti comprabili |

## Verifiche superate

### V1 — Idempotenza del webhook (consegne doppie/concorrenti)
`finalizza_ordine_pagato` ([schema.sql](../supabase/schema.sql), migration
20260713160000): `select … for update` sull'ordine per `stripe_session_id`
(unique) serializza le consegne; il ramo direct-buy usa `insert … on conflict do
nothing` + rilettura con lock, quindi anche due **prime** consegne simultanee
convergono su una sola riga; la guardia `stato='pagato' and stock_scalato`
rende i retry dei no-op (`return false`) e il webhook invia le email **solo**
quando la RPC ritorna `true`. Coperti anche: `checkout.session.completed` con
`payment_status != paid` (metodi asincroni: si attende `async_payment_succeeded`),
doppio pagamento sullo stesso ordine confermato (`creaCheckoutOrdineAction`
rifiuta se la sessione precedente risulta `complete`/`paid` e fa scadere le
altre), pagamento manuale dal pannello concorrente col webhook (stesso lock di
riga + `stock_scalato` in `segna_ordine_pagato_manuale`).

### V2 — Atomicità del decremento
Il decremento è un singolo `UPDATE varianti … from (aggregato righe)` dentro la
transazione della RPC: Postgres serializza sul lock di riga, due ordini
concorrenti sulla stessa variante sottraggono ciascuno la propria quantità,
nessun lost update. Aggregazione per `variante_id` (immutabile, robusta al
rename SKU — I1 chiuso il 13/07); `varianti.sku` è `unique`, quindi anche il
ripiego per SKU della ricostruzione righe non può moltiplicare le righe.

### V3 — Flussi collaterali
- Sessione scaduta → pulizia solo degli ordini legacy `in_attesa` (idempotente,
  non tocca i `confermato`).
- Conferma parziale: le righe `rimossa_il` non vengono né pagate né scalate,
  stesso criterio in entrambe le RPC.
- Carrello misto (sessioni separate del 20/07): gli articoli su richiesta non
  entrano mai nella sessione Stripe né nello scarico stock.

### V4 — Esposizione reale quantificata (query live del 20/07)
6.669 varianti totali: **6.556 a stock 999, 113 a 0, zero con giacenze
1–998**. Lo stock è un semaforo (`STOCK_DISPONIBILE = 999` in
[sync-catalogo.ts](../src/lib/gestore/sync-catalogo.ts)), non un conteggio: la
race "ultimo pezzo" non è esercitabile oggi.

## Finding corretti

### F1 (medio, latente) — Oversell silenzioso: ordine pagato con giacenza insufficiente e nessun avviso
- **Dove**: `finalizza_ordine_pagato` / `segna_ordine_pagato_manuale`
  (`greatest(0, stock - qta)`).
- **Problema**: Stripe Checkout hosted non prenota lo stock: tra creazione
  sessione (dove le giacenze sono verificate) e pagamento passano minuti. Se due
  clienti pagano l'ultimo pezzo, entrambi gli ordini risultano `pagato`: il
  clamp a 0 è corretto ma **muto** — niente flag, niente log, niente email. Il
  negozio lo scopre preparando il pacco. Oggi non esercitabile (V4), ma il form
  gestore permette stock manuali in qualsiasi momento: il buco è "a un prodotto
  di distanza" dall'essere reale.
- **Fix** (migration [`20260720170000_ordine_stock_mancante.sql`](../supabase/migrations/20260720170000_ordine_stock_mancante.sql)):
  le RPC bloccano le varianti coinvolte in ordine deterministico (elimina anche
  il rischio teorico di deadlock tra ordini multi-variante), fotografano il
  deficit **nella stessa transazione** del decremento e lo persistono in
  `ordini.stock_mancante` (jsonb, NULL = ok). Il webhook lo rilegge e l'email
  alla titolare diventa `⚠️ Ordine pagato con stock insufficiente — …` con SKU,
  ordinati e disponibili. Retro-compatibile nei due sensi (colonna assente →
  il webhook degrada senza avviso; RPC nuova + codice vecchio → colonna solo
  valorizzata).

### F2 (basso) — Righe pagate che restano nel carrello se il cliente non torna sulla success page
- **Dove**: la pulizia del carrello avveniva **solo** client-side alla visita di
  `/checkout/successo`.
- **Problema**: chi chiude il browser subito dopo il pagamento si ritrova le
  righe già pagate ancora nel carrello (cookie di 30 giorni): un secondo "Vai al
  pagamento" distratto le ripaga.
- **Fix**: il checkout mette `cart_id` (uuid opaco del cookie) nei metadata
  della sessione; il webhook, a pagamento riuscito, cancella dal carrello le
  sole righe **pagate** (per `variante_id` — quelle su richiesta del carrello
  misto restano). Idempotente sui retry, best effort (al peggio resta la
  pulizia client-side, che rimane come fallback e per l'aggiornamento
  immediato del badge).

## Note di modello (nessuna azione)

- **N1 — Semaforo, non giacenza**: il sync BLT (04:15 UTC) scrive 999
  ("disponibile": BLT è una stamperia, il numero non è un vincolo reale) o 0
  ("esaurito") e ogni mattina riallinea al CSV, azzerando la contabilità dei
  decrementi della giornata precedente. Coerente col modello fornitore: il
  decremento tra due sync serve da segnale relativo, non da conteggio assoluto.
- **N2 — Finestra senza prenotazione**: nessuna riserva di stock durante la
  permanenza su Stripe (limite del Checkout hosted, già documentato nel rollout
  spedizione). Con giacenze a semaforo è irrilevante; con eventuali stock
  manuali bassi ora è almeno **visibile** (F1). Una vera prenotazione
  richiederebbe checkout custom: da valutare solo se il modello di magazzino
  cambia.

## Messa in produzione

1. **Applicare la migration** `20260720170000_ordine_stock_mancante.sql` nel
   SQL Editor di Supabase (incolla ed esegui), come per le migration precedenti.
   Ordine di deploy libero: codice e migration sono compatibili in entrambe le
   direzioni.
2. Il resto va live col normale deploy (nessuna env nuova).

### Nota a margine — drift del ledger migrazioni (scoperto durante l'audit)

`npx supabase db push --dry-run` elenca come "da applicare" **31 migration**, di
cui 30 sono in realtà già live (tutte quelle dal 24/06 al 13/07: le feature
corrispondenti funzionano in produzione). Il ledger remoto
(`supabase_migrations.schema_migrations`) è fermo al 23/06: da allora le
migration sono state applicate a mano dal SQL Editor, che non lo aggiorna.
**Conseguenza pratica: un `npx supabase db push` "vero" oggi rilancerebbe tutte
e 31 le migration** — molte sono idempotenti, ma non è un rischio da correre.

Per riallineare (una tantum, quando vuoi) e tornare a poter usare `db push`:

```bash
npx supabase migration repair --status applied \
  20260624120000 20260624140000 20260625100000 20260704120000 20260704150000 \
  20260705120000 20260705160000 20260706120000 20260706150000 20260706180000 \
  20260707120000 20260707150000 20260707170000 20260707180000 20260708120000 \
  20260708140000 20260708150000 20260708160000 20260708170000 20260709120000 \
  20260710120000 20260710130000 20260711120000 20260711130000 20260711150000 \
  20260711170000 20260711180000 20260713120000 20260713140000 20260713160000
# poi: npx supabase db push   → applica SOLO la 20260720170000
```

`migration repair` scrive solo nel ledger (nessun SQL di migrazione eseguito) ed
è reversibile con `--status reverted`. Se applichi la 20260720170000 dal SQL
Editor, aggiungi anche lei alla lista del repair.

**Follow-up possibile (non fatto)**: badge "stock insufficiente" su
`/gestore/ordini` leggendo `ordini.stock_mancante` — oggi l'avviso viaggia solo
via email.
