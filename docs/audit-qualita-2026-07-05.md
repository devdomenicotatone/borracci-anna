# Audit qualità — 5 luglio 2026

Secondo audit completo del codebase Anna Shop, a valle di un mese di sviluppo (import fornitore, categorie navigabili, spedizione, SKU, conferma parziale) dopo l'[audit del 23 giugno](./audit-qualita-2026-06-23.md).

## Sintesi esecutiva

Il codebase è in **ottima salute: nessun problema critico**. I rischi gravi di giugno sul percorso denaro (oversell, doppio addebito) e la postura di sicurezza risultano **risolti e robusti**: finalizzazione pagamenti atomica e idempotente via RPC Postgres con lock di riga e flag `stock_scalato`, transizioni di stato ordini guardate, firma webhook verificata sul raw body, `verifySession()` su ogni Server Action del gestore, RLS `is_gestore` completa, difesa SSRF robusta sull'import fornitore.

L'audit ha prodotto **33 finding confermati** (0 critical, 4 alta, 9 media, 13 bassa, 7 pulizia), tutti di qualità — nessuno comporta perdita di denaro o dati. **Tutti e 33 sono stati corretti e verificati in questa stessa sessione** e distribuiti su due commit su `main` (`a49e62b`, `3f53fc9`).

## Metodo

- **Analisi**: audit multi-agente su 11 dimensioni (frontend, iOS Safari, Android/desktop cross-browser, a11y/SEO, React, pagamenti/ordini, sicurezza, robustezza dati, import/AI/media, performance, build/config/deps).
- **Verifica**: ogni finding sottoposto a un revisore avversariale che ha riletto il codice attuale; **2 falsi positivi scartati** (vedi in fondo).
- **Correzione**: 28 finding residui corretti in parallelo da 13 agenti partizionati per file (un file = un proprietario, zero conflitti); le 4 priorità "alta" corrette prima.
- **Gate globale**: `tsc --noEmit`, `eslint`, `next build` tutti puliti; smoke test nel browser (canonical, breadcrumb, apple-icon, mappa leaflet, cache facette) senza errori.

## Finding corretti

### 🔶 Alta (4)

#### 1. Manca l'export viewport con viewport-fit=cover: le safe-area del gestore diventano inutili su iPhone — ✓ Risolto `a49e62b`
*iOS Safari · iOS Safari (iPhone con notch/home indicator)*

- **Dove**: `src/app/layout.tsx:24`
- **Problema**: In tutto il progetto non esiste nessun `export const viewport` (verificato: grep 'export const viewport' su src non trova nulla; layout.tsx esporta solo `metadata`). Senza viewport-fit=cover, Next 16 emette il viewport di default `width=device-width, initial-scale=1` privo di `viewport-fit=cover`. Su iOS Safari, quando viewport-fit non è 'cover', le funzioni `env(safe-area-inset-*)` restituiscono 0. Il codice del gestore fa massiccio affidamento su queste inset per le barre azioni sticky in basso: AdminNav.tsx:211 (`pb-[env(safe-area-inset-bottom)]`), FormProdotto.tsx:494, GeneraDaFoto.tsx:289 e :463, ImportaDaUrl.tsx:298, ImportaBatch.tsx:783 e :893, RevisioneBozza.tsx:383 (tutte `pb-[calc(env(safe-area-inset-bottom)+0.75rem)]`).
- **Fix applicato**: Aggiungere in src/app/layout.tsx un `export const viewport: Viewport = { themeColor: '#0077c8', viewportFit: 'cover' }` (import { Viewport } da 'next'). Questo attiva viewport-fit=cover e fa sì che env(safe-area-inset-*) restituisca i valori reali su iPhone, rendendo effettive le pb-safe già scritte nel gestore. Consultare node_modules/next/dist/docs per l'API viewport di Next 16.

#### 2. JSON-LD Product dichiara sempre availability: InStock, anche per prodotti esauriti — ✓ Risolto `a49e62b`
*Accessibilità / SEO*

- **Dove**: `src/app/(vetrina)/prodotti/[slug]/page.tsx:210`
- **Problema**: I dati strutturati schema.org/Product hardcodano `availability: "https://schema.org/InStock"` senza guardare le giacenze. Nella stessa pagina è già noto se il prodotto è esaurito (ProdottoDettaglio calcola `esaurito = varianti.every(v => v.stock <= 0)`); qui il dato viene ignorato. Anche prezzo/valuta vengono sempre emessi come offerta acquistabile.
- **Fix applicato**: Derivare la disponibilità dalle varianti: se tutte hanno stock <= 0 usare `https://schema.org/OutOfStock`, altrimenti `InStock` (per gli articoli 'su richiesta' valutare `https://schema.org/PreOrder` o `LimitedAvailability`). Passare il valore calcolato al campo `offers.availability`.

#### 3. Hydration mismatch nel pannello ordini: data formattata con timezone locale in SSR — ✓ Risolto `a49e62b`
*React*

- **Dove**: `src/components/gestore/ListaOrdini.tsx:91-98 (dataIt), usata a src/components/gestore/ListaOrdini.tsx:357`
- **Problema**: `dataIt()` chiama `new Date(iso).toLocaleDateString("it-IT", { day, month, hour, minute })` DURANTE il render di un client component. OrdiniPage (src/app/(gestore)/gestore/(app)/ordini/page.tsx) è un server component che SSRizza `ListaOrdini`, quindi la stringa viene prodotta prima sul server e poi ri-prodotta in idratazione sul client. Includendo `hour` e `minute`, l'output dipende dalla timezone del runtime: il server (tipicamente UTC su hosting come Vercel) genera un orario diverso dal browser dell'utente (es. CEST). Server e client emettono testi diversi per lo stesso nodo.
- **Fix applicato**: Rendere la formattazione deterministica e indipendente dalla timezone del runtime: passare `timeZone: "Europe/Rome"` (e volendo `timeZoneName`) a `toLocaleDateString`, oppure calcolare la stringa in un `useEffect`/`useState` (renderizzando un placeholder stabile finché non montato), oppure formattare la data lato server e passarla già pronta come stringa nella prop `OrdineGestore`.

#### 4. La card prodotto usa <img> grezzo: griglia vetrina fuori da next/image — ✓ Risolto `a49e62b`
*Performance*

- **Dove**: `src/components/ProductCard.tsx:61-68`
- **Problema**: La griglia catalogo (home + OGNI pagina /categoria, fino a 24 card per pagina, con paginazione 'Mostra altri') rende le foto prodotto con un <img> nativo (loading="lazy", nessun width/height, nessun sizes). Le immagine_url sono TUTTE su Supabase Storage (ozbsslebqtzslfpqpwyz.supabase.co/storage/v1/object/public/...?v=...), cioe esattamente il remotePatterns dichiarato in next.config.ts. Il commento eslint-disable ('url esterne arbitrarie dal DB') non regge: sono url interne ottimizzabili. Cosi si scarica il master pieno (fino a 1600px) senza negoziazione AVIF/WebP e senza srcset responsive, mentre next.config.ts ha deviceSizes/imageSizes/formats/minimumCacheTTL configurati apposta per queste url.
- **Fix applicato**: Sostituire l'<img> con next/image <Image fill sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw"> dentro il wrapper aspect-[3/3.4] gia presente (quality 75, coerente con qualities in next.config.ts). Aggiungere blur placeholder se disponibile un blur_data_url sulla card. Rimuovere l'eslint-disable.

### 🟡 Media (9)

#### 5. Controlli riordino/elimina categoria sotto i 44px e ravvicinati su mobile — ✓ Risolto `3f53fc9`
*Frontend / Responsive · iOS Safari, Android (tutti i touch)*

- **Dove**: `src/components/gestore/GestoreCategorie.tsx:466 (sposta su), :477 (sposta giù), :488 (elimina), :391 (drag handle)`
- **Problema**: Nella riga categoria i tre bottoni icona sposta-su / sposta-giù / elimina sono h-9 w-9 (36px) e sono sempre visibili (nessun gate lg:), allineati a destra con gap-1.5 (6px) nel contenitore 'flex items-center gap-1.5' (:376). La maniglia di drag è h-11 w-7 (larghezza 28px). Sono i controlli primari per riordinare ed eliminare su touch.
- **Fix applicato**: Portare i tre icon-button a h-11 w-11 (o almeno h-10 w-10 con più gap), e allargare la maniglia di drag ad almeno w-11. In alternativa, dato che a mobile esiste già la select 'Sposta' nella seconda riga (:508), nascondere le frecce su/giù sotto lg (lg:grid) e lasciare a mobile solo maniglia + elimina più grandi e distanziati.

#### 6. Select di ordinamento della vetrina a 14px: zoom automatico al focus su iOS — ✓ Risolto `3f53fc9`
*iOS Safari · iOS Safari (iPhone)*

- **Dove**: `src/components/catalogo/ToolbarCatalogo.tsx:155`
- **Problema**: Il `<select>` per l'ordinamento del catalogo (rivolto al cliente, non al gestore) ha classe `... font-display text-sm font-bold ...` cioè font-size 14px. iOS Safari fa zoom automatico su qualsiasi controllo form con font-size < 16px al focus/tap.
- **Fix applicato**: Portare il select a text-base (16px) su mobile, es. `text-base sm:text-sm` per mantenere la resa compatta solo da sm in su dove iOS non fa zoom, oppure semplicemente text-base.

#### 7. Canonical assente sulla PDP (e sulle altre pagine tranne la categoria) — ✓ Risolto `3f53fc9`
*Accessibilità / SEO*

- **Dove**: `src/app/(vetrina)/prodotti/[slug]/page.tsx:174`
- **Problema**: generateMetadata della PDP non imposta `alternates.canonical`. Idem home (src/app/(vetrina)/page.tsx), vieni-a-trovarci e i checkout. L'unica pagina con canonical è /categoria/[slug] (categoria/[slug]/page.tsx:61). Le PDP sono le pagine più linkate e raggiungibili con query string di tracciamento (utm_*, gclid) o parametri residui.
- **Fix applicato**: Aggiungere `alternates: { canonical: `/prodotti/${slug}` }` al metadata della PDP e `alternates: { canonical: '/' }` (e path corrispondenti) alle altre pagine indicizzabili, sfruttando il metadataBase già configurato nel root layout.

#### 8. Contrasto insufficiente: testo lagoon su sfondo bianco (2.46:1) — ✓ Risolto `3f53fc9`
*Accessibilità / SEO*

- **Dove**: `src/app/(gestore)/gestore/login/page.tsx:30`
- **Problema**: Il sottotitolo 'Area gestore' usa `text-lagoon` (#00b4d8) su card bianca con `text-sm font-bold` (14px): rapporto ~2.46:1, sotto il minimo AA di 4.5:1 per testo normale. Lo stesso pattern lagoon-su-chiaro ricorre come occhiello di sezione in area gestore (es. src/components/gestore/ListaProdotti.tsx:204, GestoreGalleria.tsx:168, EditorVarianti.tsx:35, ListaOrdini.tsx:272).
- **Fix applicato**: Per il testo usare un tono più scuro del ciano (es. --sea #0077c8, che dà 4.70:1) o un 'lagoon-ink' dedicato con contrasto >= 4.5:1; riservare --lagoon a fill/bordi/decori o a testo su fondo scuro (dove è già usato correttamente nel footer).

#### 9. Contrasto insufficiente: coral come testo normale e su pulsanti piccoli — ✓ Risolto `3f53fc9`
*Accessibilità / SEO*

- **Dove**: `src/components/catalogo/CatalogoSezione.tsx:69`
- **Problema**: coral (#ff5c5c) dà 3.03:1 sia come testo su bianco sia come bianco su coral: sotto 4.5:1 per testo normale (< 18.66px bold). Casi concreti sotto soglia: pulsante 'Azzera i filtri' bianco su coral `text-sm font-bold` (CatalogoSezione.tsx:69); 'Azzera tutto' `text-coral text-sm` (ToolbarCatalogo.tsx:226); chip di stato 'Annullato' `text-coral` piccolo (ordine/[token]/page.tsx:102 e ListaOrdini.tsx:88). Nota: il prezzo PDP `text-3xl` coral (ProdottoDettaglio.tsx:188) e i CTA a h-12 bold >=18px passano come 'testo grande' (soglia 3:1).
- **Fix applicato**: Per il testo/etichette usare --coral-ink (#d62828, 5.01:1) al posto di --coral; per i pulsanti bianco-su-coral scurire leggermente il fondo (verso coral-ink) così che anche il testo <18px raggiunga 4.5:1, oppure portare quei pulsanti a >=18px bold.

#### 10. Rate limit di inviaRichiestaAction aggirabile: chiave solo su email, nessun cap per IP/globale — ✓ Risolto `3f53fc9`
*Sicurezza*

- **Dove**: `src/lib/ordini.ts:77-87`
- **Problema**: Il rate limit best-effort conta gli ordini recenti filtrando SOLO per email (.eq("email", email)) negli ultimi 60s, max 3. L'email e un campo libero del form pubblico interamente controllato dall'attaccante: basta variarla a ogni richiesta (a+1@x.com, a+2@x.com, ...) per non superare mai la soglia. Non esiste alcun cap per IP ne globale. Ogni richiesta forgiata: (1) crea una riga reale in `ordini` + N righe in `ordine_righe` (DB bloat), (2) invia DUE email via inviaEmail — una all'indirizzo del negozio (NEGOZIO.email) e una all'indirizzo arbitrario fornito dall'attaccante, rendendo il server un vettore di invio email/spam e potendo esaurire le quote Gmail o mandare il dominio in blacklist. `note` (fino a 2000 char) e `nome` (200) finiscono nel corpo dell'email al gestore.
- **Fix applicato**: Aggiungere un secondo limite non aggirabile dall'email: contare le richieste per finestra temporale a livello globale e/o per IP client (leggere x-forwarded-for via headers() e ratelimitare su quello, come gia si fa DB-backed per email). In aggiunta valutare di non inviare la mail di conferma all'indirizzo cliente finche non minimamente verificato, o di accodare/limitare gli invii.

#### 11. Nessuna immagine LCP della griglia ha priorita: tutte lazy — ✓ Risolto `3f53fc9`
*Performance*

- **Dove**: `src/components/ProductCard.tsx:66, src/components/catalogo/CatalogoSezione.tsx:86-88`
- **Problema**: Ogni card imposta loading="lazy" senza eccezioni. Le card della prima riga (above-the-fold su home e categorie) sono spesso l'elemento LCP, ma non ricevono mai priority/fetchPriority="high": il browser le scopre tardi e le mette in coda come le altre.
- **Fix applicato**: Passare a ProductCard un flag di priorita (es. prime N card) da CatalogoSezione via prodotti.map((p, i) => <ProductCard priorita={i < 4} />), che imposti priority/loading="eager" solo sulla prima riga; le restanti restano lazy.

#### 12. caricaFacetteVetrina: full-scan prodotti+varianti a ogni render, senza cache — ✓ Risolto `3f53fc9`
*Performance*

- **Dove**: `src/lib/vetrina.ts:199-243`
- **Problema**: Per calcolare le facette (taglie/colori/range prezzo della toolbar) la query legge prezzo_cents + tutte le varianti(taglia,colore) di OGNI prodotto attivo, senza limit e senza alcuna strategia di cache. La pagina e force-dynamic (src/app/(vetrina)/page.tsx:21, categoria/[slug]/page.tsx:30), quindi gira a ogni richiesta di home e categoria, e l'aggregazione (min/max prezzo, set taglie/colori) e fatta in JS lato server su tutto il catalogo.
- **Fix applicato**: Le facette non dipendono dai filtri correnti (solo dalla categoria): avvolgerle in unstable_cache con revalidate breve (o revalidateTag su modifica prodotti), oppure spostare l'aggregazione lato DB (RPC/vista con min/max e distinct) invece di trasferire tutte le righe. In alternativa memoizzare per-categoria.

#### 13. ANTHROPIC_API_KEY usata nel codice ma assente da .env.example — ✓ Risolto `3f53fc9`
*Build / Config / Deps*

- **Dove**: `src/lib/gestore/ai-actions.ts:151, src/lib/gestore/import-actions.ts:191`
- **Problema**: Il codice legge process.env.ANTHROPIC_API_KEY in due punti (generazione schede AI e arricchimento import da fornitore), ma la variabile non e documentata in .env.example. Un gestore che segue .env.example per configurare l'ambiente non sapra mai che serve questa chiave.
- **Fix applicato**: Aggiungere a .env.example una sezione '--- Anthropic (generazione schede AI) ---' con ANTHROPIC_API_KEY= e nota che se assente le feature AI degradano (scheda manuale / import senza arricchimento). Coerente con lo stile delle altre sezioni gia presenti (BLT_*, GMAIL_*).

### ⚪ Bassa (13)

#### 14. Select 'Sposta' categoria e input rename a 36px di altezza — ✓ Risolto `3f53fc9`
*Frontend / Responsive · iOS Safari, Android*

- **Dove**: `src/components/gestore/GestoreCategorie.tsx:356 (select sposta, h-9), :419 (input rename inline, h-9)`
- **Problema**: La select di spostamento (usata come alternativa mobile alle frecce, :508) e l'input di rinomina inline sono h-9 (36px), sotto i 44px raccomandati per i target touch. Il resto dei campi del form categoria usa correttamente h-11 (:24, :160).
- **Fix applicato**: Uniformare a h-11 (o h-10 minimo) la select :356 e l'input rename :419, coerentemente con gli altri controlli del form.

#### 15. Pill filtri Ordini con 5 voci va a capo dentro un contenitore rounded-full a 375px — ✓ Risolto `3f53fc9`
*Frontend / Responsive · iOS Safari, Android (viewport ~375px)*

- **Dove**: `src/components/gestore/ListaOrdini.tsx:294 (contenitore) / :302 (bottoni)`
- **Problema**: Il gruppo filtri ha 5 bottoni ('Da confermare', 'Confermati', 'Pagati', 'Annullati', 'Tutti'), alcuni con badge conteggio, dentro 'flex flex-wrap gap-1 rounded-full bg-surface-2 p-1'. A 375px la somma delle etichette non ci sta su una riga e il flex-wrap manda le voci su due righe: nessun overflow orizzontale (flex-wrap protegge), ma il contenitore rounded-full con pill wrappate su due righe appare visivamente rotto/ingoffito.
- **Fix applicato**: Su mobile abbreviare le etichette (es. 'Da confermare' -> 'Da conf.' o usare le chiavi brevi) oppure rendere la fila scrollabile orizzontalmente (overflow-x-auto, flex-nowrap) invece di flex-wrap, mantenendo lg:flex-none come già presente.

#### 16. Input admin in font-mono text-sm: zoom iOS al focus (SKU, slug, URL import) — ✓ Risolto `3f53fc9`
*iOS Safari · iOS Safari (iPhone)*

- **Dove**: `src/components/gestore/FormProdotto.tsx:325 e :352; src/components/gestore/ImportaDaUrl.tsx:289`
- **Problema**: Alcuni input dell'area gestore aggiungono `font-mono text-sm` sopra inputCls (che è text-base/16px), abbassando il font-size effettivo a 14px. FormProdotto.tsx:325 e :352 (campi codice/SKU) e ImportaDaUrl.tsx:289 (campo URL) sono i casi. iOS fa zoom al focus sotto i 16px.
- **Fix applicato**: Sostituire `text-sm` con `text-base` mantenendo font-mono, oppure usare `text-base sm:text-sm`. Il resto degli input gestore (inputCls) è già a 16px e va bene.

#### 17. Assenti manifest/apple-touch-icon/theme-color/apple-mobile-web-app per iOS — ✓ Risolto `3f53fc9`
*iOS Safari · iOS Safari (add-to-home-screen)*

- **Dove**: `src/app/layout.tsx:24 (metadata senza appleWebApp/themeColor/manifest; nessun export viewport) + src/app/ (solo favicon.ico, nessun manifest.ts/apple-icon)`
- **Problema**: Non esiste manifest.ts né file icon/apple-icon in src/app (solo favicon.ico), e metadata in layout.tsx non definisce appleWebApp né themeColor (nessun export viewport). Verificato con grep su themeColor/appleWebApp/apple-touch/manifest: nessun risultato.
- **Fix applicato**: Aggiungere `themeColor` nell'export viewport (vedi finding high), un file src/app/apple-icon.png (o icon), e opzionalmente `appleWebApp: { title: 'Anna Shop', statusBarStyle: 'default' }` nel metadata. Consultare node_modules/next/dist/docs per le convenzioni file-based icon/manifest di Next 16.

#### 18. ProductCard usa <img> grezzo per le copertine Supabase: salta l'ottimizzazione AVIF/WebP di next/image sulla vista piu ricca di immagini — ✓ Risolto `3f53fc9`
*Android / Desktop*

- **Dove**: `src/components/ProductCard.tsx:63`
- **Problema**: La griglia prodotti (vetrina e categorie) renderizza la copertina con un <img> nativo e loading="lazy", con il commento "url esterne arbitrarie dal DB". In realta immagine_url e SEMPRE un getPublicUrl del bucket Supabase "prodotti" (src/lib/gestore/actions.ts:415/463-464/535-536), e anche gli import ri-ospitano le foto nel bucket prima di impostare la copertina (src/lib/gestore/import-actions.ts:824-825,853). Quell'host e proprio quello whitelisted in next.config.ts (formats avif/webp, deviceSizes/imageSizes, cache 30g). Usando <img> grezzo il browser scarica sempre il file originale non negoziato: Chrome/Firefox/Edge/Safari 16.4+ non ricevono AVIF/WebP piu leggeri, e non c'e srcset per DPR/viewport.
- **Fix applicato**: Sostituire <img> con next/image <Image fill sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw" quality={75} className="object-cover ..."> dato che l'host e gia in remotePatterns; passare il blurDataURL LQIP quando disponibile. Se in futuro potessero esistere copertine da host non whitelisted, gestire il fallback con un loader/condizione, ma oggi le copertine sono tutte Supabase e il commento e obsoleto.

#### 19. Manca uno skip link 'Vai al contenuto' — ✓ Risolto `3f53fc9`
*Accessibilità / SEO*

- **Dove**: `src/app/(vetrina)/layout.tsx:25`
- **Problema**: Il layout della vetrina non fornisce alcun link di salto al contenuto principale prima dell'header. L'header contiene hamburger, wordmark, navigazione principale con più macro-categorie e carrello: un utente da tastiera/screen reader deve attraversarli tutti a ogni cambio pagina. Il `<main>` esiste (layout.tsx:27) ma non ha id/target raggiungibile.
- **Fix applicato**: Aggiungere in cima al layout un link con classe sr-only che diventa visibile al focus (es. `<a href="#contenuto" class="sr-only focus:not-sr-only …">Vai al contenuto</a>`) e dare `id="contenuto"` al `<main>`.

#### 20. Timer di auto-dismiss del Toaster mai ripulito — ✓ Risolto `3f53fc9`
*React*

- **Dove**: `src/components/Toaster.tsx:45-52`
- **Problema**: `mostra` lancia un `setTimeout(..., 3500)` per rimuovere il toast ma non ne conserva l'id né lo cancella. Se il ToasterProvider viene smontato (es. cambio di route group vetrina/gestore) mentre un toast è ancora in coda, il timer resta pendente e alla scadenza esegue `setToasts(...)` su un provider smontato. Inoltre non c'è cleanup dei timer in sospeso allo smontaggio.
- **Fix applicato**: Tracciare gli id dei timeout in un ref e cancellarli in un cleanup `useEffect(() => () => timers.forEach(clearTimeout), [])`, oppure gestire l'auto-dismiss con un singolo effetto sulla lista di toast.

#### 21. CartProvider.svuota ignora il fallimento del server (nessun toast, nessuna riconciliazione) — ✓ Risolto `3f53fc9`
*React*

- **Dove**: `src/components/cart/CartProvider.tsx:185-191 (svuota)`
- **Problema**: A differenza di aggiungi/aggiorna/rimuovi (che chiamano `riconcilia(esito)` e mostrano un toast su errore, escludendo `non_configurato`), `svuota` applica l'azione ottimistica poi, se `!esito.ok`, non fa nulla: né `setRighe` (l'ottimistico `[]` rimbalza alle righe precedenti al render successivo), né un messaggio d'errore. L'utente vede il carrello svuotarsi e poi ricomparire senza spiegazioni.
- **Fix applicato**: Allineare `svuota` alle altre azioni: su `esito.ok` mantenere `setRighe([])`, altrimenti riconciliare con lo stato server e mostrare un toast d'errore (saltando `esito.motivo === "non_configurato"`).

#### 22. Sessioni di pagamento multiple sullo stesso ordine su-richiesta possono generare doppio addebito e doppio scarico stock — ✓ Risolto `3f53fc9`
*Pagamenti / Ordini*

- **Dove**: `src/lib/ordini.ts:285-288`
- **Problema**: creaCheckoutOrdineAction sovrascrive incondizionatamente ordini.stripe_session_id a ogni click su "Paga" (righe 285-288), senza guardia sullo stato ne su una sessione gia presente. Se il cliente apre due sessioni di pagamento per lo stesso ordine confermato (es. due tab: cancel_url riporta su /ordine/[token] e permette di ri-avviare il pagamento) e le completa entrambe, il webhook della sessione piu recente (B) finalizza correttamente l'ordine trovandolo per stripe_session_id=B. Il webhook della sessione vecchia (A) esegue 'select ... where stripe_session_id = A for update', ma A e stato sovrascritto: non trova nulla e cade nel ramo di fallback che INSERISCE un NUOVO ordine gia 'pagato' con session_id=A, decrementando di nuovo lo stock. Risultato: cliente addebitato due volte + stock scalato due volte + secondo ordine 'pagato' fantasma. Il flusso direct-buy non ha questo problema perche ogni POST /api/checkout crea una riga ordine distinta.
- **Fix applicato**: In creaCheckoutOrdineAction, prima di creare una nuova sessione, scadere/annullare esplicitamente la sessione Stripe precedente (stripe.checkout.sessions.expire(ordine.stripe_session_id)) quando presente, cosi non puo piu essere pagata; in alternativa non sovrascrivere stripe_session_id ma tracciare le sessioni in una tabella separata e, nel ramo di fallback della RPC finalizza_ordine_pagato, cercare l'ordine anche tramite client_reference_id (che gia contiene ordine.id) prima di inserire un nuovo ordine, cosi due sessioni dello stesso ordine convergono sulla stessa riga e il flag stock_scalato blocca il secondo scarico.

#### 23. confermaOrdineAction: rollback delle rimozioni best-effort con errori ignorati può lasciare l'ordine in stato incoerente — ✓ Risolto `3f53fc9`
*Dati / Robustezza · all (server)*

- **Dove**: `src/lib/gestore/ordini-actions.ts:224-246`
- **Problema**: Se applicaRimozioni() fallisce a metà (es. errRim su una delle update per-riga), il ripristino esegue due update (azzeramento rimossa_il/motivo su tutte le righe, poi riporto ordine a in_attesa) SENZA controllarne l'esito. Se anche una di queste due update di ripristino fallisce (rete transitoria, timeout), l'ordine resta 'confermato' con confermato_il e totale parziale già scritti ma con le righe in uno stato misto (alcune marcate rimossa, altre no), e l'azione ritorna comunque {ok:false, error}. Il gestore vede errore ma l'ordine è di fatto già confermato e diventa pagabile dal cliente con un set di rimozioni incompleto.
- **Fix applicato**: Controllare l'{error} delle due update di ripristino e, se falliscono, loggare/segnalare esplicitamente che il ripristino non è riuscito (stato da verificare a mano), invece di restituire solo l'errore originale delle rimozioni come se il rollback fosse riuscito. In alternativa spostare l'intera conferma parziale (transizione + azzeramento + marcatura righe + ricalcolo totale) in una singola RPC plpgsql transazionale, come già fatto per finalizza_ordine_pagato.

#### 24. MODEL ID Claude non aggiornato: claude-sonnet-4-6 è generazione precedente — ✓ Risolto `3f53fc9`
*Import / AI / Media*

- **Dove**: `src/lib/gestore/ai-actions.ts:18 e src/lib/gestore/import-actions.ts:45`
- **Problema**: Entrambe le feature AI usano `const MODELLO = "claude-sonnet-4-6"`. NON è un modello deprecato/ritirato (l'ID è valido e non dà 404, quindi non è un bug funzionale), ma è la generazione Sonnet precedente: il modello Sonnet attuale è `claude-sonnet-5` (e per qualità superiore su vision/estrazione c'è la famiglia Opus 4.8 `claude-opus-4-8`). Il brief chiedeva esplicitamente di segnalare il MODEL ID usato.
- **Fix applicato**: Aggiornare la costante a `claude-sonnet-5` (o `claude-opus-4-8` se si vuole la massima qualità su lettura etichette). Nessuna altra modifica al codice è necessaria: le chiamate non usano temperature/top_p/budget_tokens né prefill, quindi restano valide. Verificare solo che ANTHROPIC_API_KEY abbia accesso al nuovo modello.

#### 25. NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in .env.example ma mai usata nel codice — ✓ Risolto `3f53fc9`
*Build / Config / Deps*

- **Dove**: `.env.example:26`
- **Problema**: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY e dichiarata in .env.example ma un grep su tutto src/ e scripts/ non trova alcun riferimento (ne process.env, ne loadStripe, ne stringa 'PUBLISHABLE'). Il flusso di pagamento usa Stripe Checkout in redirect server-side (getStripe() con la sola STRIPE_SECRET_KEY in src/lib/stripe.ts), che non richiede la publishable key lato client.
- **Fix applicato**: Rimuovere la riga NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY da .env.example (e il relativo commento), oppure — se e prevista per un futuro Stripe Elements/embedded — annotarla esplicitamente come 'non ancora usata, riservata per uso futuro'.

#### 26. Dipendenza diretta su versione beta con range caret (react-filerobot-image-editor) — ✓ Risolto `3f53fc9`
*Build / Config / Deps*

- **Dove**: `package.json:24`
- **Problema**: react-filerobot-image-editor e fissata a ^5.0.0-beta.159 (installata beta.159). Il caret su una pre-release permette a npm di risolvere qualsiasi beta.N successiva della stessa 5.0.0, versioni instabili per definizione e soggette a breaking change senza preavviso semver. E l'unica dipendenza DIRETTA di produzione su una beta (le altre pre-release nel lockfile sono transitive di konva/filerobot).
- **Fix applicato**: Pinnare la versione esatta senza caret ('react-filerobot-image-editor': '5.0.0-beta.159') per congelare la beta finche non esce una release stabile, verificando che package-lock.json sia committato per garantire installazioni riproducibili.

### 🧹 Pulizia (7)

#### 27. Rientro numerico dei bottoni +/− quantità nel selettore compatto del carrello (10px netti su alcuni tap) — ✓ Risolto `3f53fc9`
*Frontend / Responsive*

- **Dove**: `src/components/CartItem.tsx:127-152`
- **Problema**: I bottoni +/− del selettore quantità nel CartItem sono h-10 w-10 (40px), leggermente sotto i 44px, dentro un contenitore 'ring-2 ring-surface-2 p-1'. Il valore centrale è w-8. Coerente ma marginale.
- **Fix applicato**: Per piena coerenza portare i due bottoni a h-11 w-11 come in BloccoAcquisto.tsx, oppure lasciare così se si accetta 40px per il selettore compatto (non bloccante).

#### 28. Breadcrumb della PDP con separatori '/' come nodi di testo dentro il flusso — ✓ Risolto `3f53fc9`
*Accessibilità / SEO*

- **Dove**: `src/app/(vetrina)/prodotti/[slug]/page.tsx:230`
- **Problema**: Il breadcrumb PDP è un `<nav>` con `<span>` affiancati e slash `/` marcati `aria-hidden`. A differenza della pagina categoria (che usa `<ol>/<li>` con `aria-current="page"`), qui non c'è lista ordinata né marcatura dell'elemento corrente, e le categorie del percorso non sono link (solo testo) anche quando le pagine categoria esistono.
- **Fix applicato**: Uniformare al pattern della pagina categoria: `<ol>`/`<li>`, `aria-current="page"` sull'ultimo nodo e link alle pagine categoria per i nodi intermedi del percorso.

#### 29. MappaNegozio: setTimeout(invalidateSize) non cancellato nel cleanup dell'effetto — ✓ Risolto `3f53fc9`
*React*

- **Dove**: `src/components/MappaNegozio.tsx:71`
- **Problema**: Dopo l'init di Leaflet viene schedulato `setTimeout(() => mappa.invalidateSize(), 0)`. Il cleanup dell'effetto imposta `annullato = true` e fa `mappaRef.current?.remove()`, ma non cancella questo timeout. Se il componente si smonta nello stesso tick, la callback può eseguire `invalidateSize()` su una mappa già rimossa.
- **Fix applicato**: Salvare l'id del timeout in una variabile locale e chiamare `clearTimeout(id)` nel cleanup dell'effetto, oppure guardare `if (annullato || !mappaRef.current) return;` all'inizio della callback del setTimeout.

#### 30. Eventi checkout.session.expired e async_payment_failed non gestiti (nessun ripristino esplicito) — ✓ Risolto `3f53fc9`
*Pagamenti / Ordini*

- **Dove**: `src/app/api/stripe/webhook/route.ts:143-160`
- **Problema**: Il webhook gestisce solo checkout.session.completed e async_payment_succeeded. Non c'e handling per checkout.session.expired ne payment_intent/checkout.session.async_payment_failed. Funzionalmente non e un bug (l'ordine resta in_attesa/confermato e non viene mai scalato lo stock finche non arriva un evento di successo, quindi non c'e perdita di denaro), ma un pagamento asincrono fallito o una sessione scaduta lasciano l'ordine in uno stato che non riflette l'esito e senza notifica.
- **Fix applicato**: Opzionale: aggiungere gestione di checkout.session.expired e async_payment_failed per marcare l'ordine (es. stato dedicato o annotazione) e/o notificare il gestore, restando comunque idempotenti. Non urgente perche non tocca stock ne addebiti.

#### 31. sincronizzaCopertina ignora l'{error} dell'update di prodotti.immagine_url — ✓ Risolto `3f53fc9`
*Dati / Robustezza · all (server)*

- **Dove**: `src/lib/gestore/actions.ts:408-417`
- **Problema**: sincronizzaCopertina esegue supabase.from('prodotti').update({immagine_url}) senza destrutturare né controllare l'errore. Le action galleria (aggiungiFotoGalleriaAction, rimuoviFotoGalleriaAction, riordinaFotoGalleriaAction, sostituisciFotoAction) chiamano questa funzione dopo aver già scritto le foto e poi ritornano {ok:true, foto}. Se l'update della copertina fallisce silenziosamente, la galleria è corretta ma prodotti.immagine_url (copertina mostrata in vetrina/lista) resta disallineata rispetto alla prima foto, senza alcun segnale.
- **Fix applicato**: Se si vuole coerenza forte, controllare l'{error} dell'update e propagarlo (throw così lo cattura il try/catch dell'action chiamante, come già fa leggiGalleria). Altrimenti va bene lasciarlo best-effort ma sarebbe utile un commento esplicito che dichiara l'intenzione (come altrove nel file).

#### 32. Prezzo calcolato (ingrosso+IVA)×3 senza tetto massimo — ✓ Risolto `3f53fc9`
*Import / AI / Media*

- **Dove**: `src/lib/gestore/import-actions.ts:428`
- **Problema**: Quando manca il prezzo consigliato del fornitore, `prezzoCents = prodotto.prezzoIvatoCents * 3`. Il valore è in centesimi interi corretti e la moltiplicazione ×3 è la regola documentata, ma non c'è alcun controllo di sanità sull'ordine di grandezza: se il parser leggesse per errore un finalPrice anomalo (es. un numero enorme da un blocco JSON sbagliato), il prezzo proposto sarebbe enorme senza avviso. La bozza è comunque sempre attivo=false e rivista dal gestore, quindi il rischio reale è basso.
- **Fix applicato**: Opzionale: aggiungere un avviso in `avvisi` quando `prezzoCents` supera una soglia ragionevole per una boutique (es. > 500€/50000 cents) così il gestore è invitato a ricontrollare, oppure un cap difensivo con avviso. Non urgente dato il flusso sempre-bozza.

#### 33. Miniatura ordine con <img> grezzo (bassa priorita) — ✓ Risolto `3f53fc9`
*Performance*

- **Dove**: `src/app/(vetrina)/ordine/[token]/page.tsx:271-296 (img nativo a 276-281)`
- **Problema**: La miniatura 48x48 della riga ordine usa <img> nativo su url Storage invece di next/image. A differenza della griglia e una pagina a traffico bassissimo (post-checkout, dietro token) e le thumb sono piccole, quindi l'impatto e minimo, ma resta incoerente con CartItem che usa correttamente next/image sizes="96px".
- **Fix applicato**: Opzionale: usare <Image fill sizes="48px"> come in CartItem per coerenza, oppure lasciare cosi data la bassa rilevanza.

## Falsi positivi scartati

Due finding sono stati respinti in verifica perché la loro premessa era smentita dal codice attuale:

- **Toaster fisso senza env(safe-area-inset-bottom) e commento sulla bottom-nav ormai stale** (`src/components/Toaster.tsx:61`) — La premessa centrale del finding è falsa. Il finding afferma "il Toaster è montato solo nel ToasterProvider del layout vetrina, dove nessuna bottom-nav esiste". Ma grep di ToasterProvider mostra DUE usi: src/app/(vetrina)/layout.tsx:23 E src/app/(gestore)/gestore/(app)/layout.tsx:17. Quest'ultimo importa da src/components/gestore/Toaster.tsx:3 che è un re-export dello stesso componente ({ ToasterProvider, useToast } from "@/components/Toaster"). Quindi il medesimo contenitore Toaster.tsx:58-61 (className "...fixed inset-x-0 bottom-20 z-[60]...md:bottom-6") è renderizzato ANCHE nell'area gestore. Il layout gestore (gestore/(app)/layout.tsx:19) monta AdminNav, che in src/components/gestore/AdminNav.tsx:211 ha una bottom-nav mobile reale: `<nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 ... pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">`. Quindi il commento a Toaster.tsx:57 ("Sopra la bottom-nav su mobile (bottom-20), in basso su desktop.") NON è stale: descrive correttamente il caso gestore, dove bottom-20 posiziona il toast sopra quella bottom-nav. Il sotto-punto safe-area è tecnicamente vero (bottom-20 non usa env(safe-area-inset-bottom)), ma la bottom-nav gestore gestisce già la safe-area (pb-[env(safe-area-inset-bottom)] a AdminNav.tsx:211) e il finding stesso ammette "il rischio pratico è basso". Il finding va respinto perché la sua tesi principale (commento stale / nessuna bottom-nav) è dimostrabilmente errata.

- **L'area gestore non emette meta robots noindex a livello di pagina** (`src/app/(gestore)/gestore/(app)/layout.tsx:16`) — Il finding sostiene che il noindex dell'area /gestore sia affidato SOLO all'header X-Robots-Tag (proxy.ts:17) e che manchi un `metadata.robots` a livello di documento. Falso. Il layout del route group `src/app/(gestore)/layout.tsx:6-8` dichiara gia: `export const metadata: Metadata = { robots: { index: false, follow: false } };`, con commento esplicito "L'intera area /gestore e esclusa dall'indicizzazione (in aggiunta all'header X-Robots-Tag)". Questo layout e il genitore comune sia del sub-group autenticato `(app)/layout.tsx` sia della pagina `gestore/login/page.tsx`: in Next.js App Router i metadata si propagano/mergiano lungo l'albero dei layout, quindi ogni pagina sotto `(gestore)` (login inclusa, che ha solo `title` a page.tsx:6-8) eredita `robots: index:false, follow:false`. Il secondo segnale a livello di documento invocato dal FIX esiste gia. Il fix proposto (aggiungere metadata a `(app)/layout.tsx` e alla login) sarebbe ridondante.

---

*Analisi e correzioni prodotte in una singola sessione assistita; il report interattivo con filtri per severità e dimensione è stato consegnato a parte.*
