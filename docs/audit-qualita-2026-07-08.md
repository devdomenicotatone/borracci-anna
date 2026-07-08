# Audit qualità — 8 luglio 2026

Terzo audit completo del codebase Anna Shop, a valle del blocco "sync giacenze BLT + taglie cappello/pallone", dopo l'[audit del 5 luglio](./audit-qualita-2026-07-05.md).

> **Aggiornamento 8 lug 2026 (sessione fix):** corretti a lotti tutti i finding ad alta priorità più molti a media. Vedi lo stato per finding qui sotto.
>
> **Corretti e verificati** (tsc + eslint + next build puliti): 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 18, 19, 22, 25, 26, 27, 28, 29, 30, 31, 33, 34, 35, 44, 45–46 (parziale via 3), 47, 48, 51 — più il dedup dei loop di scansione in `vetrina.ts`.
>
> **Migration da applicare nel SQL Editor di Supabase:**
> - [`20260708120000_ordine_pagato_notifica.sql`](../supabase/migrations/20260708120000_ordine_pagato_notifica.sql) — email d'ordine (già applicata)
> - [`20260708140000_filtro_esauriti_gestore.sql`](../supabase/migrations/20260708140000_filtro_esauriti_gestore.sql) — filtro «Esauriti» (degrada in sicurezza se non applicata: il filtro mostra tutto)
> - [`20260708150000_sync_stato.sql`](../supabase/migrations/20260708150000_sync_stato.sql) — banner esito sync (degrada in sicurezza: nessun banner)
> - [`20260708160000_prodotto_stock_totale.sql`](../supabase/migrations/20260708160000_prodotto_stock_totale.sql) — **DA APPLICARE PRIMA DEL DEPLOY**: aggiunge `prodotti.stock_totale`, referenziata dalle query delle card. Se il codice va live senza questa colonna, la griglia vetrina si svuota.
>
> **Ancora da fare** (scelta/minori): 16 (zona spedizione — decisione di policy), 20/21 (ORDER BY e prezzo nel sync), 36–41 (finding extra), «bassa»/architettura (32, 43, 50, 52, 53, 54, 55).

## Sintesi esecutiva

Il codebase resta in buona salute: il percorso denaro regge (prezzi sempre dal DB server-side, firma webhook sul raw body, finalizzazione atomica e idempotente via RPC con lock, cron protetto da `CRON_SECRET`, carrello con cookie httpOnly e cap anti-oversell all'aggiunta).

L'audit ha prodotto **56 finding confermati** (0 critica, 12 alta, 29 media, 15 bassa): 38 bug reali, 14 migliorie ad alto valore, 4 semplificazioni.

I temi dominanti:

1. **Troncamento PostgREST a 1000 righe** in 7 punti mai agganciati al pattern a blocchi già presente in `src/lib/vetrina.ts` (`BLOCCO_SCANSIONE`): sitemap, "Seleziona tutti" del gestore, pagina Media, selettore Vetrina, conteggi Categorie, "Mostra altri" in vetrina, lista gestore oltre riga 1000. Con ~1840 prodotti ognuno di questi tronca **in silenzio**. Nota: il max-rows si applica anche alle RPC che ritornano SET.
2. **Ordini pagati senza notifica**: nessuna email parte alla finalizzazione (né alla titolare né al cliente), mentre la pagina di successo la promette.
3. **Stock non riverificato al pagamento**: il carrello dura 30 giorni, le giacenze cambiano ogni giorno (sync BLT + vendite), ma né `/api/checkout` né `creaCheckoutOrdineAction` ricontrollano stock/attivo; in più il form prodotto sovrascrive lo stock con i valori letti al render.
4. **Due flussi d'acquisto contraddittori** sullo stesso carrello: il mini-cart fa pagare subito, la pagina /carrello costringe al modulo richiesta e promette "nessun pagamento ora".

### Ordine di lavoro suggerito

1. Email ordine pagato (finding 3) + riverifica stock al checkout (finding 2 e 34) + stock stantio nel form prodotto (finding 4).
2. I 7 troncamenti a 1000 righe (finding 1, 5, 6, 10, 14, 19, 26) — conviene estrarre prima l'helper di scansione (finding 33).
3. Doppio pagamento su /ordine/[token] (finding 12) e coerenza dei due flussi carrello (finding 8, 15).
4. Il resto in ordine di priorità.

## Metodo

- **Analisi**: revisione multi-agente su 7 dimensioni (bug vetrina, checkout/pagamenti, sicurezza, bug gestore, UX cliente, UX admin, architettura) + 3 round extra su aree scoperte individuate da un critico di completezza (ordini su richiesta, CRUD categorie/vetrina home, pipeline immagini/AI).
- **Verifica**: ogni bug sottoposto a 3 verificatori avversariali indipendenti istruiti a confutarlo (confermato con ≥2 voti su 3); ogni miglioria vagliata da un giudice di valore calibrato sul contesto (piccolo e-commerce, una sola amministratrice non tecnica). **4 falsi positivi scartati** (vedi in fondo).
- **Numeri**: 156 agenti, ~1.900 letture di codice, 47 minuti.

## Finding da correggere

### 🔶 Alta (12)

#### 1. La sitemap tronca silenziosamente a 1000 prodotti: ~840 URL fuori dall'indice
*Vetrina · Bug*

- **Dove**: `src/app/sitemap.ts:25`
- **Problema**: La query `supabase.from("prodotti").select("slug").eq("attivo", true)` non è paginata: PostgREST/Supabase tronca la risposta a max-rows (1000) senza errore. Il catalogo ha ~1840 prodotti attivi, quindi la sitemap pubblica al massimo 1000 URL prodotto e ne perde ~840 in silenzio. Il resto del codebase conosce il problema (BLOCCO_SCANSIONE in src/lib/vetrina.ts, righe 32-35, con scansione a blocchi guidata dal count), ma la sitemap non applica lo stesso pattern.
- **Scenario**: Google richiede /sitemap.xml: riceve solo i primi 1000 slug (in ordine arbitrario, la query non ha nemmeno un order by). Circa 840 schede prodotto non vengono mai segnalate ai motori: indicizzazione e traffico organico dimezzati senza alcun sintomo visibile.
- **Proposta**: Paginare la lettura a blocchi da 1000 con `.range()` e count exact, come fa `aggregaFacette` in src/lib/vetrina.ts (righe 340-355), aggiungendo un `.order("id")` per blocchi stabili. Sono ~2 round-trip in più, la sitemap resta veloce.

#### 2. Il checkout diretto (/api/checkout) non riverifica stock né 'attivo': si paga merce esaurita o ritirata
*Vetrina · Bug*

- **Dove**: `src/app/api/checkout/route.ts:71`
- **Problema**: La route legge il carrello (riga 55) e costruisce direttamente i line item Stripe (righe 71-89) senza mai ricontrollare `variante.stock` né `prodotto.attivo`. L'unico controllo anti-oversell è al momento dell'aggiunta al carrello (src/lib/cart.ts, righe 245-263), ma il cookie carrello dura 30 giorni (src/lib/cart.ts riga 27) e le giacenze cambiano ogni giorno col sync BLT, con gli acquisti altrui e con le modifiche del pannello. In più il carrello a stock 0 non mostra nulla: in CartItem.tsx (righe 47-48) l'avviso "Solo N rimasti" richiede stock > 0, quindi a stock 0 la riga appare normale e il bottone "Vai al pagamento" del drawer resta abilitato. Il webhook poi scala con greatest(0, stock - qta) (migration 20260623200000, riga 72), quindi l'ammanco non lascia nemmeno uno stock negativo come segnale.
- **Scenario**: Cliente aggiunge 2 pezzi lunedì (stock 2); mercoledì il sync BLT porta la variante a stock 0. Il cliente riapre il sito, il carrello mostra la riga senza avvisi, dal mini-cart clicca "Vai al pagamento" e paga su Stripe merce che il negozio non ha: la titolare deve rimborsare a mano, e nulla nel sistema le segnala perché è successo.
- **Proposta**: In POST, dopo `leggiCarrello()`, rileggere le varianti coinvolte e rifiutare (409 con messaggio chiaro) se una riga ha `quantita > stock` o `prodotto.attivo === false`, invitando ad aggiornare il carrello. In alternativa cappare le quantità e mostrare l'avviso prima di creare la sessione.

#### 3. Nessuna email a titolare e cliente quando un ordine viene pagato (ma la pagina di successo la promette)
*Checkout / pagamenti · Bug*

- **Dove**: `src/app/api/stripe/webhook/route.ts:162`
- **Problema**: La finalizzazione (finalizzaOrdine -> RPC finalizza_ordine_pagato) segna l'ordine pagato e scala lo stock, ma non invia nessuna email: inviaEmail è usato solo in inviaRichiestaAction e confermaOrdineAction (grep su src: src/lib/ordini.ts:196,203 e src/lib/gestore/ordini-actions.ts:283). Intanto la pagina /checkout/successo dichiara al cliente "Riceverai a breve una email di conferma con il riepilogo dell'ordine" (src/app/(vetrina)/checkout/successo/page.tsx:38-40): quella email non esiste. Soprattutto, la titolare non riceve alcuna notifica di vendita: per gli acquisti diretti dal mini-cart nessuno la avvisa, e nel flusso differito non sa quando il cliente ha pagato.
- **Scenario**: Un cliente compra direttamente dal mini-cart di sabato. Nessuna email parte: la titolare (unica amministratrice, che non tiene il pannello aperto) scopre l'ordine solo se apre /gestore/ordini o la dashboard Stripe, magari giorni dopo, con la promessa di consegna in 2-4 giorni lavorativi già bruciata.
- **Proposta**: Nel webhook, dopo la RPC riuscita, inviare (best effort, come altrove) due email con inviaEmail: notifica alla titolare (NEGOZIO.email) con righe/indirizzo/totale e conferma al cliente (session.customer_details.email). Per l'idempotenza sui retry basta far ritornare alla RPC un flag "era_gia_finalizzato" e inviare solo la prima volta.

#### 4. Il salvataggio del form prodotto sovrascrive lo stock delle varianti con i valori stantii letti al render
*Gestore · Bug*

- **Dove**: `src/lib/gestore/actions.ts:300`
- **Problema**: Il form prodotto non permette di modificare le giacenze (EditorVarianti gestisce solo colori/taglie), ma il payload delle varianti include comunque `stock: ex?.stock ?? 0` preso da `variantiIniziali`, cioè dai dati renderizzati quando la pagina è stata aperta (src/components/gestore/FormProdotto.tsx:187). In `applicaVarianti` l'UPDATE delle varianti esistenti scrive anche `stock: r.stock` (actions.ts:296-304). Quindi qualunque salvataggio del form riporta lo stock di TUTTE le varianti al valore visto al momento del render. Lo stock però cambia sotto i piedi del form: il webhook Stripe lo decrementa a ogni vendita (migration 20260623200000, `set stock = greatest(0, stock - ...)`) e il sync BLT giornaliero lo porta a 999/0.
- **Scenario**: La titolare apre la scheda di un prodotto in vendita diretta (stock M = 5). Un cliente compra: il webhook porta lo stock a 4. Lei corregge un refuso nel nome e salva: lo stock torna a 5 → possibile oversell. Analogamente, se il cron delle giacenze BLT accende una variante (0→999) mentre la scheda è aperta, un salvataggio la rispegne a 0 senza alcun avviso.
- **Proposta**: Nell'UPDATE delle varianti esistenti non toccare `stock` (aggiornare solo taglia, colore, sku); lasciare `stock` solo nell'INSERT delle varianti nuove. In alternativa, far mandare al client `stock: undefined` per le righe con id e ignorarlo lato server.

#### 5. "Seleziona tutti i N" seleziona al massimo 1000 prodotti: le azioni bulk lasciano indietro il resto in silenzio
*Gestore · Bug*

- **Dove**: `src/lib/gestore/prodotti-lista.ts:138`
- **Problema**: `idsProdottiGestore` chiama la RPC `ids_prodotti_gestore` con un singolo `.rpc()` senza `.range()`/paginazione. Il max-rows di PostgREST (1000 su Supabase) si applica anche alle funzioni che ritornano set: con ~1840 prodotti a catalogo la risposta viene troncata a 1000 id senza errore. La RPC stessa (migration 20260706180000) non ha limiti interni, quindi il troncamento avviene nel layer HTTP. Il flusso: ListaProdotti.tsx `selezionaTuttiFiltrati()` → `idsProdottiFiltratiAction` → bulk assegna-categoria / elimina operano solo sui 1000 id ricevuti.
- **Scenario**: La titolare filtra "tutti", clicca «Seleziona tutti i 1840» e poi «Elimina» (o assegna una categoria): l'operazione tocca solo 1000 prodotti; ~840 restano invariati. Il toast dice "1000 prodotti" ma lei aveva chiesto 1840, e nessun errore segnala il taglio.
- **Proposta**: Paginare anche la RPC: in `idsProdottiGestore` iterare con `supabase.rpc(...).range(da, da+999)` accumulando finché il blocco è < 1000 (stesso pattern di `leggiTutto` nel sync), oppure far ritornare alla RPC un unico `uuid[]` aggregato (array_agg) che non subisce max-rows.

#### 6. La pagina Media carica al massimo 1000 foto: la libreria è parziale e "Ripulisci bordi bianchi" dichiara finito un lavoro fatto a metà
*Gestore · Bug*

- **Dove**: `src/app/(gestore)/gestore/(app)/media/page.tsx:23`
- **Problema**: La select su `prodotto_foto` è un'unica query senza `.range()`: PostgREST tronca a 1000 righe senza errore. Con ~1840 prodotti importati da BLT (più foto ciascuno) le foto superano abbondantemente le 1000: la vista Media mostra solo i primi prodotti per `prodotto_id` e nasconde il resto senza alcuna indicazione. Aggravante: `ripulisciBordi()` in GestoreMedia.tsx (riga 114) itera sui soli gruppi caricati, quindi il batch "Ripulisci bordi bianchi" elabora solo le prime 1000 foto e chiude con il messaggio di completamento, facendo credere che tutto il catalogo sia stato ripulito.
- **Scenario**: La titolare lancia «Ripulisci bordi bianchi» per sistemare le foto importate dal fornitore: il progresso arriva a 1000/1000 e il toast conferma, ma migliaia di foto oltre il troncamento non sono mai state analizzate; in vetrina metà catalogo resta con i bordi bianchi.
- **Proposta**: Leggere `prodotto_foto` a blocchi da 1000 con `.range(da, da+999)` e ordinamento stabile (`.order("prodotto_id").order("ordine").order("id")`), accumulando finché il blocco è pieno — come fa `leggiTutto` nel sync. Facoltativo: mostrare il totale reale (count exact) come verifica.

#### 7. La ricerca prodotti non esiste in vetrina, anche se il backend è già pronto
*UX cliente · Miglioria (impatto alto)*

- **Dove**: `src/components/catalogo/ToolbarCatalogo.tsx:101`
- **Problema**: Il filtro testuale `q` è completamente implementato lato server: parseFiltri lo legge (src/lib/filtri-catalogo.ts:105), caricaProdottiVetrina fa il match multi-token su nome+descrizione (src/lib/vetrina.ts:154-183) e la toolbar lo conserva a ogni navigazione con il commento "la ricerca ha il suo campo: qui resta com'e" (ToolbarCatalogo.tsx:101; idem filtri-catalogo.ts:186-187 "campo dedicato sempre in vista"). Ma quel campo NON esiste da nessuna parte: né in Header.tsx, né in MenuMobile.tsx, né in ToolbarCatalogo. L'unico input type="search" del progetto è nell'admin (components/gestore/ListaProdotti.tsx). Con ~1840 prodotti di merchandising licenziato (il cliente arriva cercando "Napoli", "One Piece", "portachiavi"...) l'assenza di ricerca è il gap di conversione più grande della vetrina.
- **Scenario**: Un cliente vuole la "maglia Harry Potter" vista in negozio: deve indovinare la categoria giusta e scorrere pagine di card, perché non c'è nessuna barra di ricerca in tutto il sito. Su mobile spesso abbandona prima di trovarla, mentre digitando ?q=harry a mano nell'URL i risultati arrivano perfetti (il backend c'è già).
- **Proposta**: Aggiungere il campo di ricerca già previsto: un'icona lente nell'Header che apre un input (e un campo in cima a ToolbarCatalogo) che naviga a /prodotti?q=... riusando serializzaFiltri. Serve solo UI: niente lavoro su DB o query. Mostrare il termine attivo come chip rimovibile accanto agli altri filtri.

#### 8. Dalla pagina /carrello non si può pagare: sempre e solo il modulo richiesta, in contraddizione col mini-cart
*UX cliente · Bug*

- **Dove**: `src/components/cart/CarrelloContenuto.tsx:85`
- **Problema**: CarrelloContenuto renderizza SEMPRE ModuloRichiesta (riga 85) con il box "Nessun pagamento ora" (righe 74-81) e "Spedizione: Da concordare" (riga 46), anche quando nessun articolo è su richiesta. Il mini-cart invece distingue: se nessuna riga ha disponibilita_su_richiesta mostra CheckoutButton con pagamento Stripe immediato (CartDrawer.tsx:169-179), e /api/checkout/route.ts supporta e protegge esattamente questo flusso (blocca solo i carrelli con articoli su richiesta, righe 63-68). Risultato: lo stesso carrello ha due percorsi d'acquisto contraddittori a seconda della porta d'ingresso. Chi clicca l'icona carrello nell'Header (Header.tsx:115) o "Vai al carrello" finisce nel flusso lento (lascia i contatti, aspetta la conferma manuale della titolare, riceve un link, poi paga) anche per merce a magazzino pagabile subito.
- **Scenario**: Cliente aggiunge una t-shirt disponibile (vendita diretta), chiude il drawer, più tardi clicca l'icona carrello nell'header: su /carrello non trova nessun "Vai al pagamento", solo un form nome/email/telefono con scritto "Nessun pagamento ora". Molti abbandonano; chi compila carica di lavoro manuale la titolare per un ordine che Stripe avrebbe incassato da solo.
- **Proposta**: Allineare /carrello al drawer: se righe.some(r => r.prodotto.disponibilita_su_richiesta) mostra ModuloRichiesta, altrimenti CheckoutButton (già esportato da CartItem.tsx) con il riepilogo spedizione coerente. Il controllo server in /api/checkout c'è già, è solo UI.

#### 9. I prodotti esauriti sono indistinguibili nella griglia: card normale, si scopre solo in PDP
*UX cliente · Miglioria (impatto medio)*

- **Dove**: `src/lib/vetrina.ts:38`
- **Problema**: CAMPI_CARD (vetrina.ts:38) non porta nessuna informazione di stock e la query della griglia filtra solo `attivo=true` (vetrina.ts:164): un prodotto con tutte le varianti a stock 0 appare in griglia come card normale con prezzo (ProductCard.tsx non ha alcuno stato "esaurito"). Il cliente lo scopre solo entrando nella PDP, dove trova "Prodotto esaurito." (ProdottoDettaglio.tsx:358-361) senza alternative. Il problema è amplificato dal sync BLT: oggi le giacenze arrivano dal CSV del fornitore e molti articoli finiscono a stock 0 restando attivi, quindi la griglia può riempirsi di vicoli ciechi.
- **Scenario**: Cliente sfoglia la categoria Calcio, apre 3 card di fila e tutte e tre dicono "Prodotto esaurito.": nessun badge lo avvisava in griglia. Dopo il secondo buco nell'acqua chiude il sito sfiduciato.
- **Proposta**: Aggiungere alla query card un aggregato di disponibilità (es. embed varianti(stock) o colonna denormalizzata aggiornata dal sync) e in ProductCard mostrare un badge "Esaurito" con immagine attenuata; idealmente ordinare gli esauriti in fondo alla griglia. Poco codice, evita il pogo-sticking su un catalogo che il sync azzera spesso.

#### 10. Il selettore prodotti della Vetrina è troncato a 1000 righe: metà catalogo non è pinnabile
*UX admin · Bug*

- **Dove**: `src/app/(gestore)/gestore/(app)/vetrina/page.tsx:20`
- **Problema**: La pagina Vetrina carica il catalogo per il selettore "aggiungi prodotto" con `supabase.from("prodotti").select(...).order("nome")` senza `.range()` né paginazione. PostgREST tronca silenziosamente a 1000 righe e il catalogo ne ha ~1840: il commento nel codice ("il catalogo boutique e piccolo") è un'assunzione ormai stantia. La ricerca locale in EditorProdottiPinnati (GestoreVetrina.tsx, riga 750) filtra solo dentro queste 1000 righe.
- **Scenario**: La titolare apre Vetrina, espande una fascia "Prodotti scelti a mano" e cerca un prodotto il cui nome viene alfabeticamente dopo il 1000° (es. una maglia "Zelda..."): la ricerca risponde "Nessun prodotto trovato" anche se il prodotto esiste ed è attivo. Non c'è nessun errore, quindi lei conclude che il prodotto non c'è.
- **Proposta**: Leggere il catalogo a blocchi da 1000 col pattern `leggiTutto` già presente in src/lib/gestore/sync-catalogo.ts (riga 74), oppure — meglio — sostituire la ricerca locale con una server action che riusa la RPC `cerca_prodotti_gestore` (già esistente) e restituisce i primi 8 match.

#### 11. L'esito del sync giacenze BLT è invisibile: report, errori e avvisi prezzo finiscono solo nella risposta HTTP al cron
*UX admin · Miglioria (impatto alto)*

- **Dove**: `src/app/api/cron/sync-catalogo/route.ts:34`
- **Problema**: `eseguiSyncCatalogo` produce un ReportSync ricco (varianti accese/spente, codici orfani, senzaRiscontro, e soprattutto `avvisiPrezzo`: variazioni del costo d'ingrosso che possono azzerare il margine) ma la route lo serializza solo nella risposta JSON al Vercel Cron, che nessuno legge. Non c'è persistenza né alcuna superficie admin: se il login BLT fallisce per giorni (ok:false, status 500), le giacenze restano stantie e la titolare non ha modo di accorgersene; gli avvisi prezzo calcolati in sync-catalogo.ts (riga 137) vengono buttati via.
- **Scenario**: BLT cambia il captcha o scade la password: il sync fallisce silenziosamente per una settimana, il sito continua a mostrare disponibile merce esaurita dal fornitore, e i clienti ordinano articoli che non arriveranno. Oppure BLT alza il costo di 3 prodotti: la titolare continua a venderli sottocosto senza saperlo.
- **Proposta**: Persistere il ReportSync in una tabella `sync_log` (una riga per run) e mostrare in cima a /gestore/prodotti una card "Ultimo sync giacenze: <data> — N accese, M spente" con stato rosso se l'ultimo run è fallito o è più vecchio di 48h, elencando gli avvisiPrezzo. In alternativa minima: inviaEmail al gestore quando ok:false o avvisiPrezzo non è vuoto.

#### 12. Doppio pagamento possibile: 'Paga ora' resta cliccabile mentre il webhook è in ritardo e la nuova sessione orfana quella già pagata
*Ordini su richiesta · Bug*

- **Dove**: `src/lib/ordini.ts:306`
- **Problema**: Dopo il pagamento il cliente torna su /ordine/[token]?pagato=1. Finché il webhook non ha segnato l'ordine 'pagato', la pagina mostra il banner 'Stiamo registrando il pagamento…' MA rende comunque PulsantePaga, perché il render è guardato solo da `ordine.stato === "confermato"` (src/app/(vetrina)/ordine/[token]/page.tsx:164) senza escludere `inElaborazione`. Se il cliente riclicca, creaCheckoutOrdineAction controlla solo lo stato a DB (ordini.ts:248-253, ancora 'confermato'), tenta `sessions.expire` sulla sessione GIÀ COMPLETATA — che fallisce e viene silenziata dal catch vuoto (ordini.ts:306-312) — poi crea una NUOVA sessione pagabile e sovrascrive `stripe_session_id` (ordini.ts:326-329). A quel punto il webhook della prima sessione non trova più l'ordine (`where stripe_session_id = p_session_id` in finalizza_ordine_pagato) e imbocca il fallback 'direct-buy': crea un SECONDO ordine 'pagato' senza righe e scala lo stock; l'ordine originale resta 'confermato'. Se il cliente paga anche la seconda sessione: doppio addebito e stock scalato due volte.
- **Scenario**: Cliente paga la sessione A; il webhook tarda 20-30 secondi; torna sulla pagina con ?pagato=1, vede ancora 'Paga ora' sotto il banner e riclicca (o ha un secondo tab aperto). Viene creata la sessione B: il webhook di A genera un ordine duplicato 'pagato' senza articoli, l'ordine vero resta 'Da pagare' e, se paga anche B, il cliente viene addebitato due volte.
- **Proposta**: Due mosse: (1) nella pagina, non renderizzare PulsantePaga quando `inElaborazione` è true (`ordine.stato === "confermato" && !inElaborazione`); (2) in creaCheckoutOrdineAction, prima di fare expire, recuperare la sessione esistente con `stripe.checkout.sessions.retrieve(ordine.stripe_session_id)` e, se `payment_status === "paid"`, ritornare `{ ok:false, error: "Pagamento già ricevuto, lo stiamo registrando." }` invece di creare una nuova sessione.

### 🟡 Media (29)

#### 13. Ogni checkout diretto abbandonato lascia un ordine fantasma 'in_attesa' nel pannello "Da confermare"
*Vetrina · Bug*

- **Dove**: `src/app/api/checkout/route.ts:133`
- **Problema**: Prima del pagamento la route inserisce un ordine `stato: "in_attesa"` con le righe (righe 133-187), senza nome, telefono né token. Se il cliente non completa il pagamento (chiude Stripe, sessione scade dopo 24h), nessuno ripulisce: il webhook su `checkout.session.expired` si limita a loggare (src/app/api/stripe/webhook/route.ts, righe 170-178) e non annulla l'ordine. Il pannello gestore apre di default sul filtro "in_attesa" (src/components/gestore/ListaOrdini.tsx, riga 108, etichetta "Da confermare") e mostra questi ordini monchi accanto alle richieste vere: la titolare può persino "confermarli" (cliente senza nome né contatti). Ogni click su "Vai al pagamento" seguito da un ripensamento ne crea uno nuovo.
- **Scenario**: Un cliente clicca "Vai al pagamento" dal mini-cart tre volte in giorni diversi senza mai pagare: la titolare trova tre "richieste da confermare" anonime, identiche, senza modo di distinguerle dalle richieste reali dei clienti, e perde tempo (o le conferma per errore inviando email a nessuno).
- **Proposta**: Nel webhook, sull'evento `checkout.session.expired`, marcare `annullato` (o eliminare) l'ordine con quel `stripe_session_id` se è ancora `in_attesa`. In alternativa creare l'ordine con uno stato dedicato (es. `checkout_diretto`) escluso dal filtro "Da confermare" del pannello.

#### 14. "Mostra altri" si blocca per sempre a 1000 prodotti: il range oltre max-rows viene troncato in silenzio
*Vetrina · Bug*

- **Dove**: `src/lib/vetrina.ts:204`
- **Problema**: Nel percorso senza filtro tema, `caricaProdottiVetrina` carica tutte le pagine cumulate con `range(0, pagina * PRODOTTI_PER_PAGINA - 1)` in UNA sola richiesta. Con 24 prodotti a pagina, da pagina 42 in su il range chiede più di 1000 righe, ma PostgREST le cappa a max-rows (1000) senza errore: `data` resta a 1000 elementi mentre `count` dice ~1840. In CatalogoSezione.tsx (riga 96) `prodotti.length < totale` resta vero, quindi il link "Mostra altri" (pagina 43, 44, …) continua a comparire ma non carica mai nulla: "Hai visto 1000 prodotti su 1840" per sempre. Il percorso tema dello stesso file gestisce correttamente il problema a blocchi (righe 222-238); questo ramo no.
- **Scenario**: Su /prodotti (catalogo intero, ~1840 attivi) un utente o un crawler che segue i link "Mostra altri" arriva a pagina 42: la griglia si ferma a 1000 card e il bottone diventa un loop inutile. Lo stesso accade aprendo direttamente /prodotti?pagina=43.
- **Proposta**: Per pagine oltre la soglia, spezzare il caricamento in blocchi da 1000 con range successivi (riusando il pattern del percorso tema alle righe 222-238), oppure cappare la paginazione cumulativa e passare a un range per-pagina (`range((pagina-1)*24, pagina*24-1)`) accumulando lato client.

#### 15. Due flussi di acquisto contraddittori sullo stesso carrello: il drawer fa pagare subito, la pagina carrello promette "Nessun pagamento ora"
*Vetrina · Bug*

- **Dove**: `src/components/cart/CartDrawer.tsx:178`
- **Problema**: Il mini-cart mostra il `CheckoutButton` (pagamento Stripe immediato via /api/checkout) quando nessuna riga è "su richiesta" (righe 169-179). La pagina /carrello invece propone SEMPRE e solo il flusso richiesta, col testo "Nessun pagamento ora. Invii la richiesta, confermiamo la disponibilità... e solo dopo paghi" (src/components/cart/CarrelloContenuto.tsx, righe 74-82) — anche per gli stessi articoli a vendita diretta. Lo stesso identico carrello dice due cose opposte a seconda di dove lo si guarda, e il percorso del drawer salta la verifica di disponibilità su cui il negozio basa il proprio flusso (le giacenze BLT sono un semaforo, non tempo reale).
- **Scenario**: Cliente con una t-shirt a vendita diretta nel carrello: dal mini-cart paga subito con Stripe; se invece apre /carrello legge che "non si paga ora" e deve inviare una richiesta con nome/email. Confusione per il cliente e, per la titolare, ordini pagati che arrivano senza la conferma di disponibilità prevista dal suo processo.
- **Proposta**: Decidere un solo flusso: se la vendita è a pagamento differito, sostituire il CheckoutButton del drawer con il link "Procedi con la richiesta" (già presente per i carrelli su richiesta); se invece il pagamento diretto è voluto, aggiungere il bottone "Vai al pagamento" anche in /carrello e correggere il copy "Nessun pagamento ora" per i carrelli a vendita diretta.

#### 16. La zona di spedizione la sceglie il cliente: chi spedisce nelle isole può pagare la tariffa continentale
*Checkout / pagamenti · Bug*

- **Dove**: `src/app/api/checkout/route.ts:99`
- **Problema**: Sotto la soglia free-shipping, opzioniSpedizione() ritorna due opzioni ("Italia continentale" 5,90 € e "Isole e aree disagiate" 8,90 €, src/lib/spedizione.ts:64-80) che vengono passate entrambe come shipping_options alla Checkout Session. Su Stripe Checkout le shipping options sono radio button a libera scelta del cliente: non c'è alcun legame con l'indirizzo inserito (shipping_address_collection accetta tutta l'Italia). Chiunque spedisca in Sardegna/Sicilia selezionerà sempre la tariffa continentale più bassa, e il webhook persisterà quel costo come definitivo.
- **Scenario**: Cliente di Cagliari: al checkout vede due tariffe, sceglie ovviamente "Italia continentale" a 5,90 € e fa spedire a Cagliari. La titolare paga al corriere il supplemento isole (~3 € a pacco) di tasca sua, su ogni ordine insulare.
- **Proposta**: Offrire una sola tariffa al checkout: o la tariffa unica prudente, oppure verificare nel webhook la provincia dell'indirizzo (session.collected_information.shipping_details) contro la tariffa scelta e segnalare alla titolare il mismatch. In alternativa, due sessioni distinte previa scelta della zona con validazione della provincia nel webhook.

#### 17. L'email "ordine confermato, paga qui" può fallire in silenzio: il cliente non saprà mai di poter pagare
*Checkout / pagamenti · Bug*

- **Dove**: `src/lib/gestore/ordini-actions.ts:283`
- **Problema**: inviaEmail è progettata per non lanciare e ritorna false su errore (src/lib/email.ts:28-60: credenziali mancanti, timeout SMTP, password app revocata). confermaOrdineAction fa `await inviaEmail({...})` e ne ignora completamente l'esito: ritorna { ok: true } comunque. Quell'email è l'unico canale con cui il cliente scopre che l'ordine è pagabile su /ordine/[token] (nessun altro reminder esiste). Stesso pattern in inviaRichiestaAction (Promise.allSettled a src/lib/ordini.ts:194-208), dove però il danno è minore perché il cliente vede comunque la pagina ordine.
- **Scenario**: Google revoca l'app password (o GMAIL_APP_PASSWORD sparisce da Vercel dopo un cambio env). La titolare conferma le richieste, vede "ok" e aspetta; i clienti non ricevono nulla e gli ordini restano 'confermato' per sempre: vendite perse senza alcun segnale.
- **Proposta**: In confermaOrdineAction raccogliere il boolean di inviaEmail e, se false, ritornare ok:true ma con un campo warning (es. "Confermato, ma l'email al cliente NON è partita: contattalo a +…") che ListaOrdini mostra alla titolare. Idem per la notifica al gestore in inviaRichiestaAction.

#### 18. Annulla e segna-pagato-manuale non fanno scadere la sessione Stripe aperta: doppio incasso o ordine annullato che risuscita
*Checkout / pagamenti · Bug*

- **Dove**: `src/lib/gestore/ordini-actions.ts:296`
- **Problema**: creaCheckoutOrdineAction crea sessioni valide 24h e fa expire della precedente solo quando ne crea una nuova (src/lib/ordini.ts:306-312). Ma annullaOrdineAction e segnaPagatoOrdineAction cambiano lo stato senza mai scadere la sessione salvata in stripe_session_id: la pagina Stripe già aperta resta pagabile. La RPC finalizza_ordine_pagato non ha guardie di stato (migration 20260625100000: l'unico check è `stato='pagato' and stock_scalato`), quindi: (a) un ordine 'annullato' pagato dalla sessione zombie diventa 'pagato' e scala stock; (b) un ordine già segnato pagato a mano fa tornare la RPC senza far nulla, ma la carta del cliente è stata comunque addebitata una seconda volta, senza alcuna traccia nell'app.
- **Scenario**: Cliente clicca "Paga ora" e lascia la scheda Stripe aperta; passa in negozio e paga in contanti, la titolare usa "Segna pagato". La sera il cliente (o un familiare) completa la scheda rimasta aperta: Stripe incassa di nuovo l'intero ordine, il webhook risponde 200 e nessuno se ne accorge finché il cliente non contesta l'addebito.
- **Proposta**: In annullaOrdineAction e segnaPagatoOrdineAction, se l'ordine ha stripe_session_id, chiamare stripe.checkout.sessions.expire() best-effort (stesso try/catch usato in creaCheckoutOrdineAction). In più, nella RPC, trattare il pagamento di un ordine 'annullato' come caso anomalo da segnalare.

#### 19. Lista prodotti del gestore: oltre la riga 1000 i prodotti sono irraggiungibili e lo scroll infinito spara decine di richieste a vuoto
*Gestore · Bug*

- **Dove**: `src/lib/gestore/prodotti-lista.ts:80`
- **Problema**: `caricaProdottiGestore` usa il modello cumulativo `p_offset: 0, p_limit: pagina * 50`, e la RPC accetta limit fino a 5000 (migration 20260706180000, riga 132). Ma il max-rows di PostgREST cappa la risposta della RPC a 1000 righe: dalla pagina 21 in poi (`p_limit` 1050+) arrivano sempre e solo 1000 righe. In ListaProdotti.tsx `puoMostrareAltri` resta true (1000 < totale 1840, pagina < PAGINA_MAX_GESTORE=100), quindi l'IntersectionObserver (riga 283) continua ad auto-incrementare la pagina: ~80 round-trip server+RPC inutili in sequenza, per poi fermarsi al cap di pagina 100 col messaggio fuorviante "Affina la ricerca". I prodotti dal 1001° in poi, nell'ordinamento corrente, non sono visualizzabili dalla lista.
- **Scenario**: Con 1840 prodotti, la titolare scorre la lista senza filtri: arrivata a 1000 righe la pagina continua a mostrare "Carico…" mentre il browser fa decine di richieste senza che compaia nulla di nuovo; i prodotti in coda all'ordinamento (es. i più vecchi con ordine "recenti") non si raggiungono se non cambiando filtri.
- **Proposta**: Passare a una paginazione a finestre reali: chiedere solo la pagina nuova (`p_offset: (pagina-1)*50, p_limit: 50`) e accumulare lato client, oppure applicare `.range()` alla chiamata `.rpc()`. In ogni caso mantenere ogni risposta sotto le 1000 righe.

#### 20. Il sync legge prodotti e varianti a blocchi senza ORDER BY: i blocchi possono rimescolarsi e saltare/duplicare righe in silenzio
*Gestore · Bug*

- **Dove**: `src/lib/gestore/sync-catalogo.ts:77`
- **Problema**: `leggiTutto` pagina con `.range(da, da+999)` ma senza `.order(...)`: Postgres non garantisce un ordine stabile tra query separate (con `synchronize_seqscans` attivo, due seq scan concorrenti sulla stessa tabella possono partire da punti diversi — e le pagine vetrina fanno full-scan di prodotti+varianti per le facette proprio mentre gira il cron). Tra il blocco 1 e il blocco 2 le righe possono spostarsi: alcune varianti vengono lette due volte e altre mai, quindi restano con la giacenza vecchia senza comparire nemmeno in `senzaRiscontro`. Lo stesso pattern è in `verificaCodiciAction` (src/lib/gestore/import-actions.ts:388-392). Il progetto conosce il problema: `aggregaFacette` in src/lib/vetrina.ts:337 aggiunge `.order("id")` con il commento "senza ORDER BY ogni blocco potrebbe rimescolarsi".
- **Scenario**: Il cron delle 6:00 gira mentre un visitatore fa rigenerare le facette (full-scan concorrente su prodotti/varianti): il secondo blocco da 1000 di `varianti` riparte da un offset "scivolato", una manciata di varianti non viene letta e resta segnata disponibile (999) anche se il CSV le dà "No stock" — il sito mostra acquistabile un articolo esaurito dal fornitore.
- **Proposta**: Aggiungere `.order("id", { ascending: true })` alla query di `leggiTutto` (e alla lettura paginata dei codici in `verificaCodiciAction`), come già fatto in aggregaFacette.

#### 21. Il sync cancella il costo ingrosso registrato quando il CSV ha un prezzo illeggibile, e il "primo valore valido" per parent in realtà è "prima riga qualunque"
*Gestore · Bug*

- **Dove**: `src/lib/gestore/fornitori/blt-csv.ts:236`
- **Problema**: Due difetti concatenati. (1) In `indicizzaCatalogoCsv` il commento dice "primo valore valido incontrato per il parent", ma il ramo `else if (!costoPerParent.has(parent)) costoPerParent.set(parent, null)` fissa il parent a null alla PRIMA riga se il suo prezzo non è parsabile: le righe successive con prezzo valido non lo aggiornano più (`costoPerParent.has(parent)` è ormai true). (2) In sync-catalogo.ts:134-139, quando `costo` è null viene comunque fatto `updProdotti.push({ id, costo_cents: null })`, e la RPC `applica_sync_catalogo` scrive NULL su `prodotti.costo_cents`, cancellando il costo registrato dai sync precedenti. L'avviso prezzo non scatta (la condizione richiede `costo !== null`), quindi la cancellazione è del tutto silenziosa.
- **Scenario**: Nel CSV di domani la prima riga taglia di un articolo ha la colonna price vuota o non numerica (es. "-") mentre le altre taglie hanno il prezzo: il costo del prodotto diventa null e il sync azzera il `costo_cents` salvato ieri. La titolare perde il riferimento del margine e non riceverà mai l'avviso quando BLT ritocca il prezzo, senza alcun segnale.
- **Proposta**: In `indicizzaCatalogoCsv` impostare `costoPerParent` solo con valori validi (`if (costoCents !== null && (costoPerParent.get(parent) ?? null) === null) costoPerParent.set(parent, costoCents)`), e in sync-catalogo.ts non spingere `costo_cents: null` quando `p.costo_cents` è già valorizzato (saltare l'update o mantenere il valore esistente).

#### 22. URL sbagliati o prodotti rimossi mostrano il 404 inglese di default di Next, senza header né link
*UX cliente · Bug*

- **Dove**: `src/app/(vetrina)/prodotti/[slug]/page.tsx:195`
- **Problema**: notFound() è usato per slug prodotto inesistente (prodotti/[slug]/page.tsx:195), categoria ignota (categoria/[slug]/page.tsx:110) e ordine non trovato (ordine/[token]/page.tsx:117), ma nel progetto non esiste nessun not-found.tsx (verificato su tutta src/app). Il cliente vede quindi la pagina di default di Next: "404 | This page could not be found." in inglese, renderizzata nel root layout nudo (src/app/layout.tsx) — senza Header, senza menu, senza alcun link per tornare al catalogo. Caso frequente in questo negozio: un prodotto condiviso su WhatsApp/social e poi disattivato dal sync o dalla titolare produce esattamente questo vicolo cieco.
- **Scenario**: La titolare condivide su Facebook il link di una felpa; una settimana dopo la disattiva. Chi clicca dal post vede una pagina bianca con "404 This page could not be found" in inglese, senza logo né navigazione: per continuare deve riscrivere l'indirizzo a mano.
- **Proposta**: Aggiungere src/app/not-found.tsx (o uno dedicato nel gruppo (vetrina)) in italiano, con wordmark, messaggio tipo "Questo articolo non c'è più" e CTA verso /prodotti e la home. Per le PDP si può anche suggerire la categoria del prodotto se ricavabile dallo slug.

#### 23. Nessun loading UI: cliccare una categoria o "Mostra altri" non dà alcun feedback finché il server non risponde
*UX cliente · Miglioria (impatto medio)*

- **Dove**: `src/app/(vetrina)/categoria/[slug]/page.tsx:31`
- **Problema**: Tutte le pagine vetrina sono force-dynamic con query live a Supabase (categoria: categorie + prodotti + facette; col filtro tema anche una scansione a blocchi da 1000 righe, vetrina.ts:224-238), ma non esiste alcun loading.tsx in src/app (verificato). Nella navigazione client di App Router la pagina vecchia resta a schermo immutata finché la nuova non è pronta: cliccando una voce del menu categorie (Header/MenuMobile), un chip categoria o il link "Mostra altri" (CatalogoSezione.tsx:101-107, un Link senza stato pending) non succede visivamente nulla per il tempo del round-trip. L'unico feedback esistente ("Aggiorno…", ToolbarCatalogo.tsx:204) copre solo le navigazioni avviate dalla toolbar stessa.
- **Scenario**: Su rete mobile lenta un cliente tocca "Gaming" nel menu hamburger: il drawer si chiude e la pagina resta identica per 1-2 secondi. Convinto che il tap non sia stato registrato, tocca di nuovo o abbandona.
- **Proposta**: Aggiungere loading.tsx nei segmenti (vetrina)/categoria/[slug], (vetrina)/prodotti e (vetrina)/prodotti/[slug] con uno skeleton della griglia/PDP (blocchi grigi con le stesse proporzioni delle card). Per "Mostra altri", in alternativa, trasformarlo in bottone con useTransition e testo "Carico…" come già fatto nella toolbar.

#### 24. Messaggi di spedizione contraddittori tra barra free-shipping, carrello e conferma ordine
*UX cliente · Bug*

- **Dove**: `src/components/cart/CarrelloContenuto.tsx:46`
- **Problema**: Nello stesso riquadro di /carrello convivono tre messaggi che si smentiscono: la FreeShippingBar promette "Spedizione gratuita sbloccata!" sopra 89€ (FreeShippingBar.tsx:26, soglia in spedizione.ts:6), due righe sotto c'è "Spedizione: Da concordare" (CarrelloContenuto.tsx:44-47) e il flusso richiesta lascia poi il costo alla decisione manuale della titolare (ordine/[token]/page.tsx:234-239, "Da concordare"), dove nulla garantisce la gratuità promessa. In più i tempi di consegna comunicati divergono: Stripe Checkout mostra 2–5 giorni lavorativi (api/checkout/route.ts:104-107) mentre la pagina di successo promette "consegna in 2–4 giorni lavorativi" (checkout/successo/page.tsx:50). Il mini-cart dice invece "Spedizione e imposte calcolate al pagamento" (CartDrawer.tsx:162-164).
- **Scenario**: Cliente aggiunge merce per 95€ apposta per la spedizione gratuita segnalata dalla barra; su /carrello legge "Da concordare" e non ha più nessuna garanzia scritta della gratuità; se invece paga via drawer, su Stripe legge 2-5 giorni e nella pagina di ringraziamento 2-4. Promesse incoerenti sul costo di consegna sono tra le prime cause di abbandono carrello.
- **Proposta**: Unificare la fonte: nel riepilogo di /carrello usare opzioniSpedizione(subtotale) per mostrare "Gratuita" sopra soglia e "5,90 € / 8,90 € (isole)" sotto, riservando "Da concordare" ai soli carrelli su richiesta; allineare la stima di consegna a un unico valore (2–5) in route.ts e successo/page.tsx.

#### 25. Il messaggio d'errore grezzo di Stripe (inglese/tecnico) arriva nel toast del cliente
*UX cliente · Bug*

- **Dove**: `src/app/api/checkout/route.ts:209`
- **Problema**: Nel catch della creazione sessione, la route risponde con `Errore nella creazione del checkout: ${err.message}` (route.ts:206-210), dove err.message è il messaggio raw di Stripe, in inglese e tecnico (es. "Invalid URL: An explicit scheme (such as https) must be provided", "amount must be at least...", chiavi scadute ecc.). CheckoutButton mostra proprio quel testo al cliente nel toast: per gli status non gestiti legge `dati.errore` e lo passa a mostra() (CartItem.tsx:200-208). Anche i messaggi 501 citano "Stripe" e "NEXT_PUBLIC_SITE_URL" (route.ts:41-51), ma quelli il client li rimpiazza; il 500 no.
- **Scenario**: Un problema di configurazione o un limite Stripe fa fallire la creazione della sessione: il cliente che ha cliccato "Vai al pagamento" vede un toast rosso tipo "Errore nella creazione del checkout: Invalid URL: An explicit scheme (such as https)..." — incomprensibile e poco professionale, e per giunta rivela dettagli interni.
- **Proposta**: Nella route: console.error(err) lato server e risposta generica in italiano ("Non è stato possibile avviare il pagamento. Riprova tra poco."). In alternativa (o in aggiunta) in CheckoutButton non mostrare mai dati.errore per gli status 5xx, tenendo il messaggio generico già previsto.

#### 26. Conteggi prodotti per categoria calcolati su massimo 1000 righe
*UX admin · Bug*

- **Dove**: `src/app/(gestore)/gestore/(app)/categorie/page.tsx:16`
- **Problema**: `supabase.from("prodotti").select("categoria_id")` senza paginazione: con ~1840 prodotti PostgREST restituisce solo le prime 1000 righe, quindi i badge "N prodotti" delle categorie sottostimano sistematicamente. Il numero sbagliato finisce anche nel messaggio del dialog di eliminazione (`messaggioElimina` in GestoreCategorie.tsx riga 249: "N prodotti resteranno senza categoria"), cioè proprio nell'informazione su cui la titolare decide un'azione distruttiva.
- **Scenario**: La titolare valuta di eliminare la categoria "Uomo › T-shirt": il dialog le dice "12 prodotti resteranno senza categoria" ma in realtà sono 40, perché 28 stanno oltre la 1000ª riga. Conferma sulla base di un dato falso.
- **Proposta**: Usare la RPC `conteggi_categorie_gestore` già esistente e già usata da /gestore/prodotti (src/lib/gestore/prodotti-lista.ts riga 114), invece della select grezza.

#### 27. "Rifiuta" annulla l'ordine al primo tap, senza conferma e senza avvisare il cliente
*UX admin · Miglioria (impatto alto)*

- **Dove**: `src/components/gestore/ListaOrdini.tsx:532`
- **Problema**: Il bottone Rifiuta chiama direttamente `esegui(o.id, annullaOrdineAction, ...)`: nessun ConfermaDialog (che pure esiste ed è usato per la conferma parziale nello stesso file, riga 615). L'annullamento è di fatto irreversibile: `aggiornaStato` in ordini-actions.ts ammette transizioni solo DA in_attesa/confermato, non esiste alcuna azione per riportare un annullato in attesa. Inoltre `annullaOrdineAction` (ordini-actions.ts riga 296) non invia nessuna email: il cliente, a cui la conferma di ricezione promette "ti ricontattiamo a breve", non saprà mai che la richiesta è stata rifiutata.
- **Scenario**: Su mobile, il bottone Rifiuta sta accanto al campo spedizione e a "Conferma disponibilità": un tap sbagliato annulla definitivamente la richiesta. La titolare non può rimediare dall'admin e il cliente resta in attesa di una risposta che non arriverà mai.
- **Proposta**: Avvolgere Rifiuta in un ConfermaDialog ("Rifiutare la richiesta di Mario? Il cliente riceverà un'email") e in `annullaOrdineAction` inviare una breve email di cortesia al cliente (best effort, come già fa confermaOrdineAction).

#### 28. Le richieste da confermare non sono evidenziate nella navigazione: serve un badge con il conteggio
*UX admin · Miglioria (impatto medio)*

- **Dove**: `src/components/gestore/AdminNav.tsx:195`
- **Problema**: La voce "Ordini" (sidebar riga 195, bottom-nav riga 249) è un link piatto: nessun indicatore del numero di ordini in_attesa. Il conteggio esiste già ma solo DENTRO la pagina ordini (ListaOrdini calcola `conteggi` alla riga 122). Chi lavora nell'admin su prodotti/vetrina non ha alcun segnale che c'è una richiesta ferma da confermare — e in questo flusso "su richiesta" la velocità di risposta è ciò che fa concludere la vendita.
- **Scenario**: La titolare passa mezz'ora a sistemare foto e categorie mentre arriva una richiesta d'ordine; l'email di notifica finisce sotto altre email. Il pannello che ha davanti agli occhi non le mostra nulla: il cliente aspetta la conferma più del necessario.
- **Proposta**: Nel layout (app)/layout.tsx (server component, ha già requireGestore) leggere `count` degli ordini con stato in_attesa e passarlo ad AdminNav, che mostra un pallino rosso col numero sulla voce Ordini (sidebar e bottom-nav). Costo: una count query per navigazione.

#### 29. Manca il filtro "Esauriti" nella lista prodotti, proprio ora che il sync BLT azzera le giacenze ogni giorno
*UX admin · Miglioria (impatto medio)*

- **Dove**: `src/lib/filtri-gestore.ts:15`
- **Problema**: STATI_PRODOTTO è solo ["tutti", "attivi", "nascosti"]. La RPC `cerca_prodotti_gestore` calcola già `stock_totale` per riga e c'è l'ordinamento "scorte: prima le basse", ma non esiste un modo per rispondere alla domanda "quali e quanti prodotti sono esauriti?": bisogna ordinare per scorte e scorrere a mano ~1840 prodotti contando i badge rossi. Col sync giornaliero BLT che spegne varianti in blocco, l'insieme degli esauriti cambia ogni notte.
- **Scenario**: Dopo il sync notturno la titolare vuole nascondere dalla vetrina (o rimettere "su richiesta") i prodotti rimasti a stock zero: oggi deve ordinarli per scorte e scorrerli uno per uno, senza nemmeno sapere quanti sono in totale.
- **Proposta**: Aggiungere lo stato "esauriti" al filtro (STATI_PRODOTTO + un CASE nella RPC su stock_totale = 0 e non su richiesta). Si combina con la selezione multipla esistente per agire in blocco sugli esauriti.

#### 30. La barra azioni in blocco non ha "Metti in vendita / Nascondi": dopo un import si pubblica un prodotto alla volta
*UX admin · Miglioria (impatto medio)*

- **Dove**: `src/components/gestore/ListaProdotti.tsx:686`
- **Problema**: La barra di selezione multipla offre solo "Assegna/Rimuovi categoria" ed "Elimina". L'attivazione resta per forza puntuale: ToggleAttivo riga per riga. L'import massivo di default crea bozze (ImportaBatch, `pubblica` default false, riga 190) proprio perché la titolare le riveda: ma finita la revisione deve pubblicare le N schede una per una, con N che in un batch BLT è facilmente 20-50.
- **Scenario**: La titolare importa una categoria BLT da 40 prodotti in modalità "con revisione" (quindi già controllati uno a uno), poi deve fare 40 tap sui toggle — o rifare l'import con "pubblica subito". Stesso problema all'inverso: nascondere in blocco una linea di prodotti fuori stagione.
- **Proposta**: Aggiungere alla barra bulk due azioni "Metti in vendita" / "Nascondi" con una server action `toggleAttivoBulkAction` gemella di `assegnaCategoriaBulkAction` (stesso pattern a blocchi da 200 già presente in src/lib/gestore/actions.ts riga 753).

#### 31. Il form prodotto scarta le modifiche non salvate senza avvisare
*UX admin · Miglioria (impatto medio)*

- **Dove**: `src/components/gestore/FormProdotto.tsx:491`
- **Problema**: Il link "Annulla" nella save-bar porta a /gestore/prodotti senza nessun controllo, e non c'è alcun handler beforeunload: le modifiche in corso (descrizione riscritta, varianti riconfigurate, prezzo) si perdono in silenzio. Il dirty-tracking esiste già (`dirty`, riga 225) ma è usato solo per abilitare il bottone Salva. ImportaBatch invece protegge il lavoro in corso con beforeunload (riga 257): il pattern in codebase c'è.
- **Scenario**: La titolare riscrive a mano la descrizione di un prodotto per dieci minuti da telefono, poi tocca "Annulla" invece di "Salva modifiche" (sono adiacenti nella save-bar), oppure la bottom-nav/il gesto back: tutto perso senza domanda.
- **Proposta**: Quando `dirty` è true: intercettare il click su "Annulla" con un ConfermaDialog ("Scartare le modifiche?") e registrare un beforeunload come già fa ImportaBatch.

#### 32. Scala taglie e ordinamento duplicati in tre file: catalogo.ts, ingrossoblt.ts e import-actions.ts
*Architettura · Codice contorto (impatto medio)*

- **Dove**: `src/lib/gestore/fornitori/ingrossoblt.ts:291`
- **Problema**: La scala taglie del negozio vive in tre copie: (1) `TAGLIE` + `ordineTaglia` + `eTagliaCappello` + `TAGLIA_UNICA` in src/lib/catalogo.ts (fonte dichiarata "UNICA fonte di verita"); (2) `TAGLIE_CANONICHE` (riga 291) + `rangoTaglia` (riga 353, commento esplicito "Stessa logica di ordineTaglia in lib/catalogo") + range cappello 40–70 e stringa "Taglia unica" ri-inlineati in ingrossoblt.ts; (3) `TAGLIE_CANONICHE` come Set (riga 76) + alias XXL→2XL in `tagliaCanonica` (riga 91) in src/lib/gestore/import-actions.ts, che pure importa già TAGLIA_UNICA da lib/catalogo. Gli ultimi tre commit (taglie cappello, taglie pallone) hanno dovuto aggiungere le stesse bande magiche 15_000/16_000 sia a ordineTaglia sia a rangoTaglia. In catalogo.ts c'è già un sintomo di deriva: `eTagliaPallone` (riga 70) è esportata ma mai usata, perché ordineTaglia ri-inlinea la sua regex alla riga 96.
- **Scenario**: Alla prossima estensione della scala (es. taglie scarpe, come già successo due volte a luglio con cappelli e palloni) chi modifica solo lib/catalogo.ts ottiene un import BLT che scarta o ordina male le nuove taglie, senza alcun errore: il parser e la validazione della action usano le loro copie non aggiornate.
- **Proposta**: ingrossoblt.ts è un modulo puro e può importare da lib/catalogo (che import-actions già importa): sostituire TAGLIE_CANONICHE/rangoTaglia/il check 40-70/il literal "Taglia unica" con TAGLIE, ordinaTaglie, eTagliaCappello, eTagliaPallone e TAGLIA_UNICA; spostare l'alias XXL→2XL in un'unica funzione `tagliaCanonica` esportata da lib/catalogo e usarla sia nel parser sia in creaProdottoDaImportAction. Si eliminano ~60 righe e due fonti di verità.

#### 33. La scansione integrale "a blocchi col count" è scritta a mano tre volte: estrarre un helper riusabile
*Architettura · Codice contorto (impatto medio)*

- **Dove**: `src/lib/vetrina.ts:222`
- **Problema**: Il loop anti-troncamento (`righe`/`attese`, `for(;;)` con `costruisci(righe.length===0).range(...)`, guardia anti-loop sul blocco vuoto e uscita su count) è duplicato identico dentro `caricaProdottiVetrina` (righe 222–238) e `aggregaFacette` (righe 340–355), e riappare in forma diversa in `verificaCodiciAction` (src/lib/gestore/import-actions.ts:386-399). È il pattern difensivo più critico del progetto (PostgREST tronca a 1000 senza errore) e ogni nuovo punto che ne ha bisogno lo sta ricopiando a mano — mentre i tre punti che se lo sono dimenticato (sitemap, pagina Vetrina gestore, pagina Media) sono diventati bug reali.
- **Scenario**: Ogni nuova lettura integrale (le tre da correggere segnalate sopra, o una futura per l'export) ricopia 15 righe delicate: basta sbagliare la condizione d'uscita per reintrodurre un loop infinito o un troncamento silenzioso, come dimostrano i tre punti del codice dove il pattern è stato omesso del tutto.
- **Proposta**: Estrarre in src/lib/supabase (server-only) un helper `leggiTuttoABlocchi<T>(costruisci: (conteggio: boolean) => Builder, blocco = 1000): Promise<T[]>` con dentro il loop e le guardie; sostituirlo nei due punti di vetrina.ts e usarlo per i fix di sitemap/vetrina-gestore/media.

#### 34. creaCheckoutOrdineAction non ricontrolla stock né flag attivo al momento del pagamento: si può incassare merce nel frattempo esaurita
*Ordini su richiesta · Bug*

- **Dove**: `src/lib/ordini.ts:255`
- **Problema**: La select delle righe (ordini.ts:255-260) legge solo lo snapshot (`nome_prodotto, sku, taglia, colore, prezzo_cents, quantita, rimossa_il`) senza join su varianti/prodotti, e i line item Stripe (ordini.ts:272-282) vengono costruiti da lì: nessuna verifica di `varianti.stock` né di `prodotti.attivo` al momento del pagamento. La conferma manuale della titolare È il controllo di disponibilità (quindi che inviaRichiestaAction non verifichi lo stock è accettabile by design), ma un ordine confermato resta pagabile per sempre: tra conferma e pagamento possono passare giorni e nel frattempo la stessa variante può esaurirsi tramite il checkout Stripe diretto o essere ritirata dal catalogo. Il webhook poi scala con `greatest(0, stock - qta)` (migration 20260625100000, riga 82), quindi l'oversell è silenzioso: soldi incassati, merce non disponibile, nessun avviso. Il prezzo snapshot invece è corretto by design: è l'importo comunicato nell'email di conferma.
- **Scenario**: Lunedì la titolare conferma una richiesta con l'ultima felpa taglia M (stock 1). Martedì un altro cliente compra la stessa M col checkout diretto (stock 0). Mercoledì il primo cliente apre /ordine/[token], paga senza alcun blocco: negozio incassato e ordine inevadibile, la titolare se ne accorge solo preparando il pacco.
- **Proposta**: In creaCheckoutOrdineAction aggiungere `variante_id` alla select delle righe e leggere per quelle varianti `stock` + `prodotti(attivo, disponibilita_su_richiesta)`: se una riga attiva punta a variante con stock < quantita (e il prodotto non è su richiesta) o a prodotto disattivato, ritornare un errore tipo 'Un articolo non è più disponibile: contattaci per aggiornare l'ordine' invece di creare la sessione. Per un negozio con una sola amministratrice basta questo blocco, senza riprenotazione automatica.

#### 35. Promessa 'Spedizione gratuita sbloccata!' nel carrello ma la conferma del gestore propone 5,90 € di default, senza alcun aggancio alla soglia
*Ordini su richiesta · Bug*

- **Dove**: `src/components/gestore/ListaOrdini.tsx:113`
- **Problema**: Nel carrello, sopra il modulo di richiesta, FreeShippingBar mostra '🎉 Spedizione gratuita sbloccata!' quando il subtotale supera la soglia di src/lib/spedizione.ts (89 €, FreeShippingBar.tsx:27). Ma il flusso differito non usa mai opzioniSpedizione/statoSpedizione: la spedizione la fissa a mano la titolare in conferma, e il campo del pannello è precompilato SEMPRE a "5,90" (ListaOrdini.tsx:113 `valoreSped = (id) => sped[id] ?? "5,90"`), anche per ordini sopra soglia, senza alcun indicatore che il cliente ha visto la promessa di gratuità. confermaOrdineAction accetta qualunque valore 0–100 € (ordini-actions.ts:108-113). Basta una conferma di routine (invio col default) per addebitare la spedizione a un cliente a cui il sito l'aveva appena promessa gratis.
- **Scenario**: Cliente con carrello da 95 €: vede '🎉 Spedizione gratuita sbloccata!' e invia la richiesta. La titolare conferma col valore precompilato 5,90 €; il cliente riceve l'email con 'Spedizione: 5,90 €' e paga più di quanto promesso dal sito (o scrive contrariato).
- **Proposta**: Nel pannello, precompilare il campo a "0" quando la merce attiva dell'ordine raggiunge SOGLIA_SPEDIZIONE_GRATUITA_CENTS e mostrare accanto una nota tipo 'Il cliente ha superato la soglia spedizione gratuita (89 €)'. In alternativa (o in aggiunta), far rispettare la soglia in confermaOrdineAction confrontando merceCents con la soglia importata da src/lib/spedizione.ts.

#### 36. Eliminando una categoria, le fasce home "prodotti automatici" agganciate a quella categoria spariscono in silenzio
*Categorie & vetrina home · Bug*

- **Dove**: `src/lib/gestore/categorie-actions.ts:545`
- **Problema**: eliminaCategoriaAction gestisce bene prodotti (FK SET NULL) e sottocategorie (re-parent esplicito), ma non tocca vetrina_sezioni: il riferimento config.categoriaId delle fasce prodotti_auto con regola "categoria" è un valore jsonb, non una FK, e resta appeso all'id eliminato. Lato pubblico (src/lib/vetrina-home.ts:177) `regola === "categoria" && config.categoriaId` resta vero, idConDiscendenti ritorna solo l'id morto, la query non trova prodotti (sono stati messi a NULL) e la fascia viene filtrata via dalla home (vetrina-home.ts:261-264). Il dialog di conferma (messaggioElimina, src/components/gestore/GestoreCategorie.tsx:249-278) avvisa su prodotti e sottocategorie ma non menziona le fasce vetrina; nell'editor della fascia il CategoriaSelect resta con un value che non corrisponde a nessuna opzione (selezione vuota, nessun errore). Per contro ho verificato che il resto della pista è a posto: menu, breadcrumb e chip pubblici sono generati dagli slug correnti a ogni richiesta (pagine force-dynamic), quindi l'eliminazione non produce link rotti.
- **Scenario**: La titolare ha in home una fascia "Maglie Napoli" (regola categoria → Napoli); riorganizzando il catalogo elimina la categoria Napoli. I prodotti restano (senza categoria) ma la fascia scompare dalla home senza alcun avviso, e nel pannello la fascia sembra configurata ma con il campo categoria vuoto.
- **Proposta**: In eliminaCategoriaAction, prima del delete, cercare le sezioni prodotti_auto con config->>'categoriaId' uguale all'id eliminato e azzerarne categoriaId (o nasconderle); in più includere nel messaggio del dialog di conferma quante fasce vetrina usano quella categoria.

#### 37. "Rigenera indirizzi" in produzione rompe tutti gli URL categoria indicizzati senza redirect, e su errore a metà lascia slug temporanei tmp-<uuid> online
*Categorie & vetrina home · Bug*

- **Dove**: `src/lib/gestore/categorie-actions.ts:238`
- **Problema**: rigeneraSlugCategorieAction riscrive gli slug di TUTTE le categorie in due passate non transazionali: passata 1 assegna a ogni riga lo slug `tmp-<id>` (righe 238-246), passata 2 quello definitivo (righe 248-256). Non esiste alcun meccanismo di redirect dai vecchi slug (verificato: src/proxy.ts non ha logica di redirect, non c'è tabella di alias, e /categoria/[slug] fa notFound() sugli slug ignoti — riga 110 di src/app/(vetrina)/categoria/[slug]/page.tsx): ogni URL /categoria/* indicizzato o salvato nei preferiti diventa un 404. Il docstring stesso (riga 202-203) dice "usare finché il sito non è pubblicato", ma il sito È in produzione e il pulsante resta attivo nel pannello (src/components/gestore/GestoreCategorie.tsx:416-437) protetto solo da un dialog il cui testo la titolare può fraintendere. In più, se una update fallisce a metà (rete, RLS), le categorie già processate in passata 1 restano pubblicate con slug "tmp-...": i vecchi URL sono già rotti e quelli nuovi non esistono ancora.
- **Scenario**: Sito live e indicizzato: la titolare clicca "Rigenera indirizzi" e conferma. Tutti i link categoria da Google, social e preferiti rispondono 404. Se poi la connessione cade tra le due passate, alcune categorie restano raggiungibili solo come /categoria/tmp-8f3a... finché non si rilancia l'azione.
- **Proposta**: Dato che il sito è pubblicato: rimuovere (o nascondere dietro flag) il pulsante, oppure completare la feature salvando i vecchi slug in una tabella `categorie_slug_redirect` consultata dalla pagina categoria per un redirect 301 prima del notFound(). In ogni caso spostare la riscrittura in una singola RPC Postgres transazionale (UPDATE con slug differiti) invece delle due passate riga-per-riga.

#### 38. Eliminazione prodotto: i file Storage vengono cancellati PRIMA della DELETE, che il trigger DB puo annullare — prodotto vivo con tutte le foto rotte
*Immagini & AI · Bug*

- **Dove**: `src/lib/gestore/actions.ts:731`
- **Problema**: In eliminaProdottoAction (righe 729-735) il cleanup Storage (list + remove della cartella <id>/) avviene prima di prodotti.delete(). Ma il trigger BEFORE DELETE prodotto_nascondi_se_venduto (supabase/migrations/20260705160000_prodotto_delete_sicuro.sql) puo annullare la DELETE (RETURN NULL) se nel frattempo e arrivato un ordine: PostgREST non ritorna errore, il codice prosegue e risponde { ok: true, soft: false } ("Prodotto eliminato"). Risultato: il prodotto esiste ancora (nascosto, conservato apposta per lo storico ordini) ma tutte le righe prodotto_foto e prodotti.immagine_url puntano a file appena distrutti — danno permanente e invisibile. Stesso ordine sbagliato in eliminaProdottiBulkAction (righe 853-872: Promise.all di remove, poi delete). Il commento a riga 700-703 riconosce la race TOCTOU per la delete ma non si accorge che il cleanup foto la subisce comunque. Nota: gli altri percorsi (rimozione foto singola, sostituzione, rollback su insert fallito) sono corretti.
- **Scenario**: La titolare elimina un prodotto "mai venduto"; tra il count su ordine_righe e la DELETE arriva il webhook Stripe di un ordine per quel prodotto. Il trigger converte la delete in soft-delete, ma i file su Storage sono gia stati rimossi: la scheda (visibile al gestore, riattivabile) mostra solo immagini rotte, e la UI le ha detto "Prodotto eliminato".
- **Proposta**: Invertire l'ordine: eseguire prima `.delete().eq("id", id).select("id")` e rimuovere i file su Storage SOLO se la riga e stata davvero cancellata (data.length === 1); se la delete e stata soppressa dal trigger (nessuna riga tornata), riportare soft:true. Nel bulk, fare la delete a blocchi con .select("id") e ripulire le cartelle dei soli id effettivamente cancellati.

#### 39. generaSchedaDaFotoAction: client Anthropic senza maxRetries:0 — i retry del SDK sforano sempre il maxDuration di 60s
*Immagini & AI · Bug*

- **Dove**: `src/lib/gestore/ai-actions.ts:194`
- **Problema**: `new Anthropic({ timeout: 55_000 })` lascia il default del SDK maxRetries=2: timeout di connessione, 429, 529 e 5xx vengono ritentati automaticamente. Con un timeout di 55s per tentativo e la pagina genera a maxDuration=60 (src/app/(gestore)/gestore/(app)/prodotti/genera/page.tsx:7), qualsiasi retry supera matematicamente il cap Vercel: la funzione viene uccisa e il client riceve esattamente il 504 opaco che il commento alle righe 192-193 dichiara di voler evitare (la titolare vede il messaggio generico del catch client "foto troppo pesanti o connessione lenta" anche quando il problema e un 529 dell'API). In piu ogni retry rispedisce fino a ~8MB di foto in base64 (costo e banda doppi/tripli). Il gemello import-actions.ts:239 fa la cosa giusta (`maxRetries: 0`) con un commento che spiega proprio questo problema. Per il resto la gestione errori dell'action e a posto: stop_reason max_tokens gestito, risposta senza tool_use gestita, chiave API solo server-side.
- **Scenario**: L'API risponde 529 (overloaded) dopo 20s: il SDK attende il backoff e ritenta; al secondo tentativo la funzione serverless viene terminata a 60s. La titolare vede un errore fuorviante di rete/foto e riprova riducendo le foto, senza che serva a nulla.
- **Proposta**: `new Anthropic({ timeout: 55_000, maxRetries: 0 })`, come gia fatto in import-actions.ts:239; il fallback e gia il messaggio d'errore del catch, che cosi arriva davvero all'utente.

#### 40. Genera da foto: le foto vengono taggate col nome colore GREZZO mentre le varianti usano il nome canonico — il legame colore→foto in PDP si rompe in silenzio
*Immagini & AI · Bug*

- **Dove**: `src/components/gestore/GeneraDaFoto.tsx:231`
- **Problema**: In crea(), la mappa colorePerIndice (righe 229-232) e il tag inviato con la foto (riga 242) usano `c.nome` cosi come digitato dalla titolare nel campo libero "Nome colore" della fase revisione. Il server pero canonicalizza il colore SOLO per le varianti: creaSchedaDaFotoAction fa `coloreCanonico(c.nome)` (src/lib/gestore/ai-actions.ts:346), mentre aggiungiFotoGalleriaAction salva il colore della foto verbatim (src/lib/gestore/actions.ts:483-485). La PDP abbina foto e colore con uguaglianza stretta di stringhe (src/components/prodotto/ProdottoDettaglio.tsx:53 e 111: `f.colore === c`): se il nome digitato differisce dal canonico anche solo per maiuscola o forma ("azzurro" → "Azzurro", "blu navy" → "Navy"), la variante e la foto non combaciano piu. Quando la bozza arriva intatta dall'AI il problema non si vede (generaSchedaDaFotoAction canonicalizza gia a riga 246); scatta appena la titolare corregge o aggiunge un colore a mano.
- **Scenario**: L'AI propone "Blu"; la titolare lo cambia in "blu navy" nel campo di revisione e crea la bozza. La variante a DB si chiama "Navy", le foto restano taggate "blu navy": in vetrina la selezione del colore Navy non porta piu alla foto giusta e la miniatura mostra l'etichetta fuori palette, senza alcun avviso.
- **Proposta**: In crea(), costruire dati.colori gia canonicalizzati: `nome: coloreCanonico(c.nome.trim())` (coloreCanonico e in @/lib/catalogo, gia importato client-side da altri componenti come EditorVarianti). In alternativa/aggiunta, canonicalizzare il campo `colore` dentro aggiungiFotoGalleriaAction cosi ogni chiamante e coperto.

#### 41. Import massivo: ogni singola foto importata invalida home, tutte le PDP e i tag globali — migliaia di revalidate inutili per prodotti che sono bozze invisibili
*Immagini & AI · Miglioria (impatto medio)*

- **Dove**: `src/lib/gestore/import-actions.ts:958`
- **Problema**: importaFotoDaUrlAction chiude OGNI foto con revalidatePath su /gestore/prodotti, /gestore/prodotti/<id>, /, /prodotti/[slug] (tipo page, cioe tutte le PDP) piu revalidateTag(TAG_CORRELATI) e revalidateTag(TAG_FACETTE_VETRINA) (righe 958-963); creaProdottoDaImportAction fa lo stesso per ogni scheda (righe 711-714). Nel flusso massivo (fino a 1000 card per scansione, piu foto ciascuna) sono migliaia di invalidazioni globali della cache ISR in produzione durante tutto l'import — e i prodotti appena creati sono bozze con attivo=false, invisibili in vetrina: l'invalidazione non rende visibile nulla, butta solo via la cache di home/PDP/facette rigenerandole di continuo (vetrina piu lenta per i clienti reali e invocazioni funzione sprecate su Vercel per tutta la durata dell'import).
- **Scenario**: La titolare importa una categoria da 300 prodotti con 4 foto l'uno: ~1500 invalidazioni complete di home + tutte le PDP + tag correlati/facette nell'arco dell'import; ogni visitatore in quel lasso di tempo colpisce pagine fredde da rigenerare.
- **Proposta**: Aggiungere a importaFotoDaUrlAction (e a creaProdottoDaImportAction) un parametro opzionale tipo `revalida?: boolean` che il flusso batch passa a false, limitandosi a revalidatePath(`/gestore/prodotti/<id>`); a fine batch (o quando il gestore pubblica) fare UNA revalidate complessiva. Le bozze non attive non compaiono comunque in vetrina, quindi non si perde freschezza.

### 🔵 Bassa (15)

#### 42. PDP: cambiando taglia/colore la quantità scelta non viene ri-cappata e l'aggiunta al carrello ne mette meno di quante mostrate, senza avviso
*Vetrina · Bug*

- **Dove**: `src/components/prodotto/BloccoAcquisto.tsx:35`
- **Problema**: Lo stato `quantita` sopravvive al cambio di variante (il componente non è keyed sulla variante e nessun effetto lo clampa). Se l'utente imposta 5 su una taglia con stock 10 e poi passa a una taglia con stock 2, l'input continua a mostrare 5 (il clamp è solo in onChange, righe 67-74). Al click, `const qta = Math.min(Math.max(1, quantita), stockMax)` (riga 35) riduce silenziosamente a 2 e chiama `aggiungi`: il server non cappa nulla (2 <= stock) quindi non genera nemmeno l'`avviso` che il CartProvider mostrerebbe come toast (src/components/cart/CartProvider.tsx, righe 145-149).
- **Scenario**: Cliente seleziona 5 pezzi in M, poi cambia in L (stock 2) e clicca "Aggiungi al carrello" con l'input che mostra ancora 5: nel drawer compaiono 2 pezzi. Nessun messaggio spiega la discrepanza; se non controlla il riepilogo, ordina meno pezzi di quelli che credeva.
- **Proposta**: Ri-clampare `quantita` quando cambia la variante (es. `useEffect` su `variante?.id` che fa `setQuantita(q => Math.min(q, stockMax || 1))`), oppure mostrare l'avviso "Disponibili solo N pezzi" quando `qta < quantita` al momento del click.

#### 43. aggiornaQuantita con stock a 0 forza comunque 1 pezzo in carrello e mostra il toast assurdo "Disponibili solo 0 pezzi."
*Vetrina · Bug*

- **Dove**: `src/lib/cart.ts:353`
- **Problema**: Quando la quantità richiesta supera lo stock, il cap è `finale = Math.max(1, stock)` (riga 353): con stock 0 (variante esaurita dopo l'aggiunta, caso quotidiano col sync BLT) la riga viene comunque aggiornata a quantità 1 invece di essere azzerata/rimossa, e l'avviso interpolato diventa letteralmente "Disponibili solo 0 pezzi." (riga 368), mostrato come toast d'errore dal CartProvider. Il carrello conserva quindi un articolo non acquistabile presentandolo come se un pezzo fosse disponibile.
- **Scenario**: Cliente ha 2 pezzi in carrello di una variante che nel frattempo è passata a stock 0; tocca "−" per scendere a 1: il server riscrive quantità 1 e appare il toast "Disponibili solo 0 pezzi." — messaggio contraddittorio, e la riga fantasma resta pagabile via /api/checkout (che non riverifica lo stock).
- **Proposta**: Se `stock <= 0` (e non su richiesta), rimuovere la riga (riusando `rimuoviDalCarrello`) con avviso "Articolo esaurito, rimosso dal carrello", oppure almeno distinguere il messaggio quando stock è 0 invece di stampare "solo 0 pezzi".

#### 44. /checkout/successo svuota il carrello a ogni visita, senza verificare che un pagamento sia avvenuto
*Vetrina · Bug*

- **Dove**: `src/components/cart/SvuotaCarrelloAlSuccesso.tsx:19`
- **Problema**: Il componente, montato incondizionatamente in src/app/(vetrina)/checkout/successo/page.tsx (riga 17), chiama `svuota()` al mount: cancella le righe DB e il cookie cart_id. La pagina riceve `?session_id={CHECKOUT_SESSION_ID}` da Stripe ma nessuno lo legge né lo verifica: qualunque visita all'URL /checkout/successo (history del browser, back navigation, URL digitato) azzera il carrello corrente, anche se non c'è stato alcun pagamento.
- **Scenario**: Cliente paga, torna sul sito e continua lo shopping riempiendo un nuovo carrello; più tardi con i tasti back/avanti del browser ricapita su /checkout/successo: il nuovo carrello sparisce in silenzio (badge a 0) e il cliente, non capendo, probabilmente abbandona.
- **Proposta**: Leggere il `session_id` dai searchParams e svuotare solo se presente e, idealmente, dopo una verifica server-side dello stato pagato della sessione (o almeno solo se il session_id non è già stato consumato, es. memorizzandolo in sessionStorage).

#### 45. creaCheckoutOrdineAction ignora l'errore del salvataggio di stripe_session_id
*Checkout / pagamenti · Bug*

- **Dove**: `src/lib/ordini.ts:326`
- **Problema**: Dopo la creazione della sessione, `await admin.from("ordini").update({ stripe_session_id: session.id }).eq("id", ordine.id)` non controlla `error`: se l'update fallisce (hiccup Supabase), l'URL di pagamento viene comunque consegnato al cliente. Quando paga, il webhook non trova nessun ordine con quel session_id e il fallback della RPC inserisce un ordine 'pagato' nuovo, senza righe e senza token, mentre l'ordine vero resta 'confermato' con il bottone "Paga ora" attivo su /ordine/[token].
- **Scenario**: Update fallisce, il cliente paga 60 €: nel pannello compare un ordine pagato vuoto (nessun articolo) e l'ordine originale risulta ancora da pagare; il cliente, rivedendo "Da pagare", può pagare una seconda volta con una nuova sessione.
- **Proposta**: Controllare l'errore dell'update e, se fallisce, non ritornare l'URL: fare expire della sessione appena creata e rispondere { ok:false, error:"Riprova" }. Costa tre righe e chiude il ramo ordine-duplicato.

#### 46. Se il salvataggio pre-pagamento fallisce, l'ordine pagato nasce senza righe: la titolare non sa cosa spedire
*Checkout / pagamenti · Bug*

- **Dove**: `src/app/api/checkout/route.ts:190`
- **Problema**: Il salvataggio dell'ordine 'in_attesa' con le righe è dichiarato best-effort: su errore si logga e si prosegue, col commento "il webhook creera/aggiornera l'ordine dalle line item". Il commento è falso a metà: il fallback della RPC finalizza_ordine_pagato (migration 20260625100000, righe 55-71) inserisce solo la testata (stato, totale, email, session_id) e scala lo stock dagli SKU, ma non crea mai le ordine_righe. Risultato: ordine pagato visibile a pannello con totale ma zero articoli, zero taglie/colori, zero indirizzo email di partenza per capire cosa preparare.
- **Scenario**: Supabase ha un errore transitorio durante l'insert pre-pagamento; il cliente completa il pagamento su Stripe. La titolare vede "Ordine pagato — 74,90 €" senza alcuna riga: per sapere cosa spedire deve andare a decifrare le line item nella dashboard Stripe.
- **Proposta**: Rendere il salvataggio pre-pagamento bloccante: se l'insert di ordine o righe fallisce, fare expire della sessione appena creata e rispondere errore 500 (il cliente riprova, nessun soldo in ballo). In alternativa, far creare al fallback della RPC anche le righe da p_righe (aggiungendo nome/prezzo ai metadata dei product Stripe).

#### 47. La pagina di successo svuota il carrello e dichiara il pagamento riuscito senza verificare la sessione
*Checkout / pagamenti · Bug*

- **Dove**: `src/app/(vetrina)/checkout/successo/page.tsx:17`
- **Problema**: Il success_url include ?session_id={CHECKOUT_SESSION_ID} (src/app/api/checkout/route.ts:119) ma la pagina lo ignora del tutto: monta SvuotaCarrelloAlSuccesso (che cancella righe e cookie cart al primo render) e afferma "Il pagamento è andato a buon fine" incondizionatamente. Chiunque visiti /checkout/successo, anche digitando l'URL o tornando da history, perde il carrello. Inoltre con metodi a regolamento asincrono Stripe reindirizza al success_url prima dell'esito: il webhook giustamente aspetta async_payment_succeeded (src/app/api/stripe/webhook/route.ts:150-157), ma la pagina dichiara comunque il successo, e se il pagamento poi fallisce il cliente ha perso il carrello e crede di aver comprato.
- **Scenario**: Cliente sulla pagina Stripe ci ripensa e riapre il sito da history/URL entrando su /checkout/successo: il carrello con 5 articoli scompare senza aver pagato nulla; per un metodo asincrono fallito, il cliente aspetta un pacco che non arriverà mai.
- **Proposta**: Rendere la pagina un Server Component che legge searchParams.session_id, recupera la sessione con stripe.checkout.sessions.retrieve e: se payment_status è paid mostra il successo e svuota il carrello; se è unpaid mostra "pagamento in elaborazione" senza svuotare; se il session_id manca o non è valido, redirect al carrello.

#### 48. src/lib/supabase/admin.ts (service-role) non importa "server-only": nessuna barriera di build contro un import accidentale lato client
*Sicurezza · Sicurezza*

- **Dove**: `src/lib/supabase/admin.ts:5`
- **Problema**: Il modulo che crea il client con service-role key è correttamente usato solo da codice server (verificati tutti gli importer: webhook, checkout, ordini.ts, ordini-actions.ts, vetrina.ts, correlati.ts, sync-catalogo.ts, pagine server ordini e ordine/[token]) e la chiave viene letta da `SUPABASE_SERVICE_ROLE_KEY`, env NON pubblica: quindi oggi la chiave NON finisce nel bundle client (Next inlina solo le NEXT_PUBLIC_*, un import client-side farebbe solo throw a runtime). Manca però il guard `import "server-only"` che invece protegge auth.ts, correlati.ts e vetrina.ts: senza di esso un futuro import da un Client Component non verrebbe intercettato al build.
- **Scenario**: Un refactor futuro importa `createAdminSupabase` (o una utility che lo usa) da un componente marcato "use client": nessun errore di build lo segnala, e si crea un percorso in cui logica privilegiata gira in contesti non previsti. Con `server-only` il build fallirebbe immediatamente.
- **Proposta**: Aggiungere `import "server-only";` come prima riga di src/lib/supabase/admin.ts, coerentemente con auth.ts.

#### 49. Import massivo: gli avvisi per-scheda (foto perse, varianti non salvate, non pubblicato) vengono cancellati dal riepilogo per i prodotti a singolo pubblico
*Gestore · Bug*

- **Dove**: `src/components/gestore/ImportaBatch.tsx:485`
- **Problema**: `creaConFoto` imposta sull'item una nota informativa (es. "3 foto non importate.", "Bozza creata, ma le varianti non sono state salvate...", "Non pubblicato: completa la scheda..."). `creaConSplit` però la raccoglie solo `if (jobs.length > 1 && cur.nota)` (riga 485) e poi, alla fine (righe 494-504), fa `aggiornaItem(idx, { ..., nota: note.length ? note.join(" · ") : undefined })`: per i prodotti con un solo pubblico (il caso più comune) `note` resta vuoto e la nota già scritta da `creaConFoto` viene sovrascritta con undefined. Nel riepilogo l'item appare come "Bozza creata" pulito.
- **Scenario**: Import automatico di una categoria con «Pubblica subito»: per un prodotto le varianti non vengono salvate (SKU in conflitto) e il server avvisa "completala dalla scheda"; oppure 4 foto su 5 falliscono per un 403 del fornitore. Nel riepilogo finale la riga risulta "Bozza creata" senza alcuna nota: la titolare non sa quali schede vanno sistemate a mano.
- **Proposta**: Raccogliere la nota anche con un solo job: `if (cur.nota) note.push(jobs.length > 1 ? `${j.pubblico}: ${cur.nota}` : cur.nota)`, così l'aggiornamento finale non azzera l'informazione.

#### 50. Filtri e chip navigano con router.replace: il tasto indietro non annulla il filtro ma fa uscire dalla pagina
*UX cliente · Miglioria (impatto medio)*

- **Dove**: `src/components/catalogo/ToolbarCatalogo.tsx:81`
- **Problema**: Ogni cambio filtro/ordinamento/chip tema naviga con router.replace (riga 81), che NON crea una voce di cronologia. Il commento in testa al file promette il contrario ("il back del browser funziona", righe 5-6). Nella pratica: applichi tre filtri, premi indietro aspettandoti di togliere l'ultimo, e invece torni alla pagina precedente al catalogo (o esci dal sito). È il pattern opposto a quello dei cataloghi a cui i clienti sono abituati (filtro = push, back = undo del filtro).
- **Scenario**: Da Google un cliente atterra su /categoria/calcio, attiva il chip "Napoli" e il filtro taglia M; il back del telefono (gesto molto usato su Android) lo riporta dritto ai risultati di Google invece che al catalogo senza taglia M.
- **Proposta**: Usare router.push al posto di replace nella funzione naviga (stessa firma, un identificatore da cambiare), mantenendo scroll: false. Se si teme lo spam di cronologia per la digitazione del prezzo, push per chip/select e replace solo per i campi testuali.

#### 51. L'immagine di sfondo dell'hero è un <img> non ottimizzato e senza priorità: LCP della home penalizzato
*UX cliente · Miglioria (impatto medio)*

- **Dove**: `src/components/vetrina/FasciaHero.tsx:47`
- **Problema**: Quando la titolare imposta config.immagineUrl, l'hero (prima fascia, sempre above-the-fold) renderizza un <img> nudo (righe 46-52): niente next/image, quindi il master viene scaricato a risoluzione piena senza AVIF/WebP né srcset, e senza fetchPriority="high", mentre le card sotto — che pesano molto meno — hanno già il trattamento LCP accurato (ProductCard.tsx:91-103, GalleriaProdotto.tsx:68-83). Su mobile l'elemento LCP della home diventa proprio questo sfondo: una foto da 2-4 MB caricata a priorità normale ritarda il primo render percepito dell'intera vetrina.
- **Scenario**: La titolare carica come sfondo hero una foto del negozio da 3 MB presa dal telefono: su 4G la home mostra per 2-3 secondi solo il gradiente, e i Core Web Vitals (LCP) peggiorano anche per la SEO locale su cui il sito punta (schema.org ClothingStore in page.tsx).
- **Proposta**: Se l'URL è del bucket Supabase già in whitelist (come le copertine), usare next/image con fill, sizes="100vw", loading="eager" e fetchPriority="high" come nelle card; in fallback per URL esterni, aggiungere almeno fetchPriority="high" e decoding="async" all'<img> attuale.

#### 52. Su errore della RPC la lista prodotti mostra "Non ci sono ancora prodotti" invece di un errore
*UX admin · Miglioria (impatto medio)*

- **Dove**: `src/lib/gestore/prodotti-lista.ts:84`
- **Problema**: `caricaProdottiGestore` degrada a `{ prodotti: [], totale: 0 }` su qualsiasi errore della RPC. ListaProdotti, ricevendo 0 prodotti e 0 filtri attivi, rende StatoVuoto col testo "Non ci sono ancora prodotti." (riga 944): un errore transitorio di rete/DB viene presentato come catalogo vuoto.
- **Scenario**: Supabase ha un hiccup o la RPC fallisce dopo una migration: la titolare apre Prodotti e vede il catalogo "sparito" con l'invito a "Crea il primo prodotto". Panico ingiustificato, o peggio: ricrea prodotti duplicati.
- **Proposta**: Far risalire l'errore (es. `{ prodotti: [], totale: 0, errore: true }`) e in ListaProdotti mostrare uno stato dedicato "Impossibile caricare i prodotti, riprova" con bottone di reload, distinto dal catalogo realmente vuoto.

#### 53. Gli errori Postgres non mappati arrivano crudi (in inglese) nei toast e nel form
*UX admin · Miglioria (impatto medio)*

- **Dove**: `src/lib/gestore/actions.ts:108`
- **Problema**: `mappaErroreProdotto` gestisce 23505 e 23503 ma il fallback è `errors.generale = error.message`, cioè il messaggio tecnico PostgREST in inglese. Stesso pattern in molte action che ritornano `error.message` direttamente (es. toggleAttivoAction riga 57, aggiornaStato in ordini-actions.ts riga 63, le azioni galleria): il client li mostra tal quali nel toast.
- **Scenario**: Un vincolo o una policy RLS respinge un update: alla titolare compare un toast tipo "new row violates row-level security policy for table prodotti" — incomprensibile e allarmante per una persona non tecnica.
- **Proposta**: Nel fallback loggare `error.message` lato server (console.error, visibile nei log Vercel) e restituire al client un messaggio generico in italiano ("Salvataggio non riuscito, riprova. Se succede ancora contatta l'assistenza."), tenendo le mappature specifiche esistenti.

#### 54. Blocco di revalidate quadruplo ripetuto inline in 8+ action nonostante esista già l'helper, con deriva già avvenuta
*Architettura · Codice contorto (impatto medio)*

- **Dove**: `src/lib/gestore/import-actions.ts:1046`
- **Problema**: In src/lib/gestore/actions.ts esiste `revalidaProdotto()` (riga 446) che centralizza revalidatePath+revalidateTag, ma è usato solo dalle action galleria: toggleAttivoAction (59-62), salvaProdottoAction (209-217), eliminaProdottoAction (722-725 e 738-741), assegnaCategoriaBulkAction (787-790), eliminaProdottiBulkAction (875-878) e, in import-actions.ts, creaProdottoDaImportAction (711-714) e importaFotoDaUrlAction (958-963) ripetono il blocco a mano. La deriva è già visibile: `copiaFotoTraProdottiAction` (righe 1046-1049) revalida i path ma NON i tag TAG_CORRELATI/TAG_FACETTE_VETRINA, a differenza della gemella importaFotoDaUrlAction che cambia gli stessi dati (galleria + copertina).
- **Scenario**: Si aggiunge una nuova cache taggata (com'è successo con TAG_FACETTE_VETRINA e TAG_CORRELATI): bisogna ricordarsi di toccare 8+ blocchi sparsi in due file; ogni dimenticanza produce card o correlati stantii difficili da diagnosticare, esattamente il disallineamento già presente in copiaFotoTraProdottiAction.
- **Proposta**: Spostare `revalidaProdotto(prodottoId?)` in un modulo condiviso (es. src/lib/gestore/revalida.ts) e usarlo ovunque al posto dei blocchi inline, con un parametro per i casi senza pagina prodotto specifica; allineare copiaFotoTraProdottiAction ai tag mancanti.

#### 55. Micro-componenti form duplicati per copia-incolla nell'area gestore (Campo, ChevronSelect, switch, Spinner), con stili già divergenti
*Architettura · Codice contorto (impatto medio)*

- **Dove**: `src/components/gestore/RevisioneBozza.tsx:548`
- **Problema**: Gli stessi primitivi di form sono ridefiniti in fondo a più file: `Campo` in RevisioneBozza.tsx:548, ImportaDaUrl.tsx:434 e (variante con span) GestoreVetrina.tsx:904; `ChevronSelect` in ListaProdotti.tsx:790 (strokeWidth 2) e GestoreVetrina.tsx:894 (strokeWidth 2.5), più chevron inline in ImportaBatch.tsx:999 e RevisioneBozza.tsx:451; il markup dello switch è triplicato (OpzioneToggle e SwitchMini in ImportaBatch.tsx:1471/1513, lo switch "Solo online" inline in RevisioneBozza.tsx:384-413); `Spinner` in ImportaBatch.tsx:1332 e la variante `border-2 animate-spin` inline in ListaProdotti.tsx:670 e GestoreMedia.tsx:198. Anche la stringa `inputCls` è ricopiata in 6+ file con valori leggermente diversi (h-11 vs h-12, con/senza focus ring). Le divergenze di stile (chevron, focus ring) mostrano che le copie stanno già scivolando.
- **Scenario**: Un ritocco al design system del pannello (es. focus ring su tutti gli input, o lo switch accessibile con etichetta) va replicato a mano in 6+ file: alcune copie restano indietro, e l'admin si ritrova select e toggle con stili e comportamenti leggermente diversi da pagina a pagina.
- **Proposta**: Creare src/components/gestore/ui.tsx con Campo, ChevronSelect, Switch (usato sia in versione riga sia mini), Spinner e la costante inputCls; sostituire le definizioni locali. Nessun cambiamento funzionale, ~150 righe in meno e un solo posto dove evolvere lo stile del pannello.

#### 56. Fascia "prodotti automatici" con regola "Una categoria" ma senza categoria scelta: la home mostra tutto il catalogo senza segnalare nulla
*Categorie & vetrina home · Bug*

- **Dove**: `src/lib/gestore/vetrina-actions.ts:138`
- **Problema**: sanificaConfig accetta regola "categoria" con categoriaId assente (`c.categoriaId = testo(raw.categoriaId, 40) ?? null` — nessun errore di validazione in salvaSezioneAction), e il CategoriaSelect nell'editor parte proprio da "Nessuna categoria" (value ""). Lato pubblico prodottiAuto (src/lib/vetrina-home.ts:177) richiede `config.categoriaId` truthy: con null il filtro categoria salta del tutto e la fascia si riempie con gli ultimi arrivi dell'INTERO catalogo, con "vedi tutti" che punta a /prodotti. Stesso comportamento se la categoria referenziata viene eliminata (vedi finding dedicato). Il salvataggio va a buon fine con toast "Sezione salvata": nessun segnale che la configurazione è incompleta.
- **Scenario**: La titolare crea una fascia automatica, sceglie "Una categoria", dimentica di selezionare la categoria nel menu (che parte da "Nessuna categoria") e salva: in home la fascia intitolata ad es. "Solo Gaming" mostra le novità di tutto il negozio, mescolando merchandising di licenze diverse sotto un titolo sbagliato.
- **Proposta**: In salvaSezioneAction ritornare { ok:false, error:"Scegli la categoria per questa fascia." } quando tipo prodotti_auto, regola "categoria" e categoriaId mancante; in difesa anche in prodottiAuto: con regola "categoria" e categoriaId assente ritornare prodotti [] (la fascia vuota viene già omessa) invece di degradare a tutto il catalogo.

## Falsi positivi scartati dalla verifica

1. **leggiCarrello non esclude i prodotti disattivati: restano acquistabili dal carrello anche dopo il ritiro dal catalogo** (`src/lib/cart.ts`)
   Il caso è già gestito dalla RLS, non dal filtro applicativo. leggiCarrello (src/lib/cart.ts) usa createServerSupabase() con anon key: le policy in supabase/schema.sql ("prodotti_lettura_pubblica" using attivo=true, righe 181-184, e "varianti_lettura_pubblica" con exists su p.attivo=true, righe 186-194) rendono illeggibili al cliente anon i prodotti disattivati e le loro varianti. Negli embed PostgREST (prodotto:prodotti, variante:varianti) le righe filtrate dalla RLS arrivano come null, quindi il check alla riga 139 (!prodotto || !variante) scarta proprio anche le righe con attivo=false — il commento alla riga 138 lo dichiara: "eliminati o NON LEGGIBILI". Lo scenario è impossibile: il cliente non vede il prodotto disattivato nel carrello, /api/checkout (riga 55) e inviaRichiestaAction (src/lib/ordini.ts riga 64) usano lo stesso leggiCarrello e quindi non lo includono mai, e aggiungiAlCarrello non può re-inserirlo perché la lettura della variante fallisce per RLS. La lettura dei prodotti non attivi è concessa solo al gestore autenticato (policy prodotti_lettura_gestore), caso estraneo allo scenario descritto.

2. **Le policy RLS di carrelli/carrello_righe sono aperte a chiunque (using(true)): l'anon key pubblica permette lettura/scrittura/cancellazione di TUTTI i carrelli** (`supabase/migrations/20260622194500_init_schema.sql`)
   Le policy RLS descritte esistono davvero: in supabase/migrations/20260622194500_init_schema.sql (righe 134-148) `carrelli_insert`/`carrelli_select` e `carrello_righe_all` sono `using(true)`/`with check(true)` senza clausola `to`, quindi valgono anche per anon, e nessuna migration successiva le restringe (nessun revoke sui GRANT di tabella). Questa è una config debole/anti-pattern a livello DB. MA il difetto NON è reale così com'è descritto, perché l'exploit poggia sulla premessa (falsa) che l'anon key sia inlinata nel bundle client via src/lib/supabase/client.ts. In realtà `createBrowserSupabase` è codice morto: nessun modulo lo importa (grep su `supabase/client`, `createBrowserSupabase` e `from "@/lib/supabase/client"` non trova consumatori), quindi non finisce in alcun chunk client e la sostituzione di NEXT_PUBLIC_* in quel file non raggiunge mai un asset scaricabile. Tutti gli usi reali dell'anon key sono server-side: src/lib/supabase/server.ts (Server Actions), src/proxy.ts (middleware), src/lib/social-card.ts (marcato `import "server-only"`). Il carrello è gestito interamente da Server Actions in src/lib/cart.ts ("use server") con cart_id in cookie httpOnly; i Client Component del carrello (src/components/cart/*) chiamano le Server Actions e non toccano mai Supabase direttamente, e nessun Client Component referenzia l'anon key. Quindi l'anon key (un JWT firmato, non falsificabile) non è recuperabile "dalla pagina": senza di esso le richieste anon a PostgREST danno 401, e lo scenario "senza autenticazione, in scrittura, sul DB di produzione" non è eseguibile allo stato attuale. Il revisore ha letto male client.ts (dead code) come bundle client vivo. Resta valido come hardening difesa-in-profondità (diventerebbe sfruttabile se un Client Component iniziasse a usare il browser client), ma il difetto concreto descritto non è reale.

3. **applica_sync_catalogo è SECURITY DEFINER con search_path=public, in deroga al pattern (search_path='') usato da tutte le altre funzioni definer** (`supabase/migrations/20260707170000_sync_catalogo_blt.sql`)
   I fatti citati sono esatti (riga 39 usa `set search_path = public` mentre le altre definer usano `''`; grant solo a service_role; oggetti qualificati `public.`), ma il difetto come descritto non è reale. Lo scenario di attacco è tecnicamente impossibile: `set search_path = public` FISSA il path per tutta l'esecuzione — non è un "search_path mutabile" e nessun attaccante può anteporre uno schema (pg_catalog, implicitamente davanti per le funzioni, non è scrivibile da non-superuser). Anche perdendo una qualificazione `public.`, il nome si risolverebbe comunque in public, lo schema atteso; e su Supabase (PG15+) anon/authenticated non hanno CREATE su public. Il revisore stesso ammette "nessun exploit pratico". Resta solo un'incoerenza stilistica senza alcun differenziale di sicurezza rispetto a `''` in questa funzione: non un difetto, ma una nota di stile.

4. **Orchestrazione "split adulto/bambino + creazione + import foto" duplicata tra ImportaDaUrl e ImportaBatch** (`src/components/gestore/ImportaDaUrl.tsx`)
   Premessa parzialmente vera: la spina dorsale (dividiTagliePerPubblico, suffisso -B identico a riga 208 di ImportaDaUrl.tsx e 447 di ImportaBatch.tsx, creazione, foto con copia via copiaFotoTraProdottiAction) è davvero duplicata. Ma le differenze non sono "accidentali": il batch intreccia macchina a stati per item, attesaPausa/sleep anti-WAF, pubblicazione opzionale, stati duplicato/saltato, flag importa per riga e note per pubblico — tutto assente e non necessario nel flusso singolo. Un modulo condiviso parametrizzato su callback ne richiederebbe 6-8, un'interfaccia più larga del codice risparmiato, con rischio di regressione su un flusso di produzione collaudato (cooldown, abort via runRef). Il rischio reale (regola -B che diverge rompendo il pre-check duplicati) riguarda ~20 righe pure: il fix proporzionato è estrarre solo la costruzione dei job split in una funzione pura in src/lib/catalogo.ts, non l'orchestrazione intera. La proposta com'è formulata è sproporzionata.

## Note di hardening (non urgenti)

- Le policy RLS di `carrelli`/`carrello_righe` sono `using(true)`/`with check(true)` (migration `20260622194500`, righe 134-148). Oggi non sfruttabile da remoto perché la anon key non raggiunge mai il browser: `createBrowserSupabase` (`src/lib/supabase/client.ts`) non è importato da nessun modulo, quindi le env `NEXT_PUBLIC_SUPABASE_*` non vengono inlinate in nessun bundle client. È però un footgun latente: il giorno in cui quel client venisse usato in un client component, tutti i carrelli diventerebbero leggibili/scrivibili da chiunque. Restringere le policy (o rimuovere il dead code `client.ts`) alla prima occasione.
