# Audit performance — bundle client per route (2026-07-21)

**Esito in una riga: i bundle client sono già sani.** Tutti i sospetti del
cantiere (styled-components, konva, filerobot, leaflet) risultano già
confinati dove devono stare; lo zoccolo comune a tutte le pagine è runtime
Next/React non riducibile a livello applicativo. **Nessun fix necessario**:
questa sessione consegna la misura (baseline replicabile), i verdetti e i
vincoli da non regredire.

Build misurato: commit `c33e565`, Next.js 16.2.9 (Turbopack), build di
produzione.

---

## 1. Metodo (come rifare la misura)

Due metriche complementari, tre script in `scripts/`:

| Metrica | Cosa dice | Come |
| --- | --- | --- |
| **JS eager** | Ciò che il browser scarica davvero al primo load (esclude i chunk lazy e il polyfill `noModule`) | `npm run build && npm run start`, poi `node scripts/bundle-eager.mjs http://localhost:3000 . out.json <route...>` |
| **Grafo completo per route** | Tutti i chunk client raggiungibili dalla route, inclusi quelli lazy: dice *quali pacchetti appartengono a quali route* | `npx next experimental-analyze --output`, poi `node scripts/bundle-per-route.mjs .next/diagnostics/analyze/data out.json` |
| Zoom su una route | File sorgente e chunk più pesanti, con filtro regex | `node scripts/bundle-dettaglio.mjs <analyze.data> [N] [regex]` |

Avvertenze pratiche scoperte sul campo:

- Questo Next custom **non stampa più la tabella "First Load JS"** a fine
  `next build`: la misura per route esiste solo via `experimental-analyze`.
- `experimental-analyze` fa un **build separato**: gli hash dei chunk non
  coincidono con quelli serviti da `next start` (i contenuti sì — confrontare
  per dimensione).
- I file `analyze.data` sono frame `[u32 BE lunghezza][JSON]`; il frame 0
  contiene il grafo (`sources`/`chunk_parts`/`output_files`).
- Il **polyfill da 110 KB** (`polyfill-nomodule`) compare tra gli script della
  pagina ma ha l'attributo `noModule` (camelCase nell'HTML): i browser
  moderni **non lo scaricano**. Da escludere sempre dalla metrica.
- Fermare il dev server prima di build/analisi (condividono `.next`: è la
  causa storica dei worker crashati e delle PDP 500 in dev).

---

## 2. Baseline — JS eager reale (browser moderno, pagine pubbliche)

Misura via HTML di `next start` (12 chunk a pagina, polyfill escluso):

| Route | KB | gzip KB |
| --- | ---: | ---: |
| /privacy, /condizioni-di-vendita | 561,9 | **162,5** |
| /vieni-a-trovarci | 564,7 | 164,1 |
| /accedi | 569,9 | 165,1 |
| /registrati | 571,9 | 166,0 |
| / (home) | 573,1 | 166,8 |
| /carrello | 576,4 | 166,8 |
| /preferiti | 581,4 | 168,8 |
| /prodotti | 596,8 | 172,6 |
| /categoria/[slug] | 596,8 | 172,6 |
| /prodotti/[slug] (PDP) | 609,5 | **176,1** |
| /gestore/login | 754,6 | **211,3** |

Lettura: lo zoccolo (162,5 KB gz) è composto per ~95% da framework —
react-dom (194,8 KB raw), runtime router/segment-cache di Next (~250 KB raw
distribuiti su 4 chunk, tutti `node_modules/next/dist/...` — verificato
modulo per modulo). Il codice applicativo condiviso (header, MenuMobile,
CartDrawer, provider, Toaster) pesa ~35 KB raw ≈ 10 KB gz in tutto.
Il delta della pagina più pesante della vetrina (PDP) sullo zoccolo è di
soli **13,6 KB gz** di codice proprio (galleria, taglie, condivisione).

Asset non-JS per contesto: CSS 83,9 KB (+10,3 mappa, gz ~13 KB), font 16
woff2 per 368 KB totali su disco (Inter + Poppins via next/font, subset;
per pagina se ne precaricano solo alcuni).

## 3. Baseline — grafo completo per route (inclusi chunk lazy)

Da `experimental-analyze` (KB raw / gz; solo le righe significative):

| Route | KB | gzip KB | Contenuto oltre lo zoccolo |
| --- | ---: | ---: | --- |
| /gestore/prodotti/[id] | 2353,8 | 852,7 | stack editor immagini (lazy, §4) |
| /gestore/media | 2280,0 | 828,1 | stack editor immagini (lazy, §4) |
| /gestore/sicurezza | 890,4 | 311,0 | client Supabase browser (§5) |
| /gestore/login | 862,1 | 300,0 | client Supabase browser (§5) |
| /vieni-a-trovarci | 827,4 | 297,7 | leaflet 145 KB (lazy post-hydration) |
| /prodotti/[slug] | 751,0 | 284,7 | qrcode 22,2 KB (lazy alla prima apertura di "Condividi") |
| vetrina (altre route) | 680–715 | 255–269 | solo codice proprio 16–35 KB |
| /gestore (dashboard) | 644,0 | 236,6 | — (zoccolo gestore) |

## 4. Verdetti sui sospetti del cantiere

| Sospetto | Verdetto | Evidenza |
| --- | --- | --- |
| `styled-components` "forse dipendenza morta" | **NON morta, non rimovibile** | peer dependency obbligatoria di `react-filerobot-image-editor` (>=5.3.5) e usata in `EditorImmagine` (`StyleSheetManager` + `@emotion/is-prop-valid` per compat React 19). Presente SOLO nel grafo delle 2 route editor (21,4 KB) |
| `konva` + `filerobot` "solo bundle gestore" | **Già così** | solo in /gestore/media e /gestore/prodotti/[id], dietro `dynamic(..., {ssr:false})` in GestoreGalleria/GestoreMedia → chunk lazy, caricati all'apertura dell'editor |
| `react-konva` mai importato dall'app | **Peer dep di filerobot** | vive nel chunk lazy dell'editor (8,6 KB) |
| `leaflet` "solo /vieni-a-trovarci" | **Già così** | `await import("leaflet")` dentro MappaNegozio; a runtime l'HTML della pagina non lo referenzia (eager = 164,1 KB gz ≈ zoccolo) |
| — (scoperto in corso) `@imgly/background-removal` | **Ottimo** | import dinamico dentro il click "Rimuovi sfondo"; si porta dietro **onnxruntime-web da 613,6 KB**, che quindi non pesa nemmeno all'apertura dell'editor |
| — (scoperto in corso) `qrcode` | **Ok** | lazy nella PDP (CondividiProdotto, prima apertura); statico solo in `social-card.ts`, che è codice server (og-image) |

Stack editor completo (lazy, ~1,57 MB raw: si paga solo aprendo l'editor):
onnxruntime-web 613,6 · filerobot 263,3 · konva 184,9 · @scaleflex/ui 126,7 ·
@scaleflex/icons 115,9 · react-reconciler 113,3 · @imgly 78,3 ·
styled-components 21,4 · popper+tippy 33,4 · react-konva 8,6.

## 5. Anomalia rilevata e ACCETTATA (motivazione)

`/gestore/login` e `/gestore/sicurezza` caricano **eager l'intero client
Supabase browser** (~213 KB raw ≈ +45–49 KB gz: auth-js 94,4 · realtime-js
29,1 · phoenix 23,9 · storage-js 20,7 · postgrest-js 15,3 · resto ~30).
Le pagine vetrina NON sono toccate: /accedi e /registrati fanno auth via
server action e restano a zoccolo (165–166 KB gz).

Non si interviene perché: (1) pagine interne della titolare, escluse da
robots e non rilevanti per Core Web Vitals; (2) i flussi login/MFA sono
coperti dall'audit sicurezza chiuso — spostare l'import del client dentro
gli handler cambierebbe l'inizializzazione (listener onAuthStateChange,
refresh token) per un risparmio percepito nullo su broadband; (3) su
/gestore/sicurezza il client serve comunque al mount per elencare i fattori
MFA: lazy non sposterebbe nulla.

## 6. Vincoli da NON regredire (per il lavoro futuro)

1. `EditorImmagine` va importato SOLO via `dynamic(() => import(...), { ssr:
   false })` (oggi: GestoreGalleria, GestoreMedia). Mai import statico.
2. `@imgly/background-removal` resta dentro il click handler "Rimuovi
   sfondo" (si porta dietro onnxruntime-web: 614 KB).
3. `leaflet` resta dentro `await import` in MappaNegozio; nessun import
   statico altrove (il CSS statico di leaflet va bene).
4. `qrcode` lato client resta lazy in CondividiProdotto.
5. Dalla vetrina non importare moduli del gestore oltre agli attuali
   condivisi leggeri (`gestore/ui.tsx`, 2,9 KB).
6. Ogni nuova dipendenza client sopra ~20 KB va aggiunta con una misura
   prima/dopo (script in `scripts/`, §1).

## 7. Confronto prima/dopo

Obbligatorio da cantiere: **dopo = prima**, nessuna modifica al codice
applicativo (la misura ha smentito i sospetti; unico intervento: script di
misura + questo report). Le tabelle §2–3 sono la baseline ufficiale per i
prossimi interventi sul bundle.
