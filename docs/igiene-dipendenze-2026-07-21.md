# Igiene dipendenze e codice — audit e chiusura warning (2026-07-21)

**In una riga: nessuna dipendenza morta da rimuovere (i 4 sospetti di
depcheck sono falsi positivi motivati), una dipendenza FANTASMA dichiarata
(`server-only`), 0 vulnerabilità dopo gli update in-range, e gli 8 warning
eslint storici sono chiusi: `npx eslint .` ora esce a ZERO.**

## 1. Audit dipendenze inutilizzate (depcheck) — verdetti

| Segnalata "inutilizzata" | Verdetto | Perché resta |
| --- | --- | --- |
| `konva` | **falso positivo** | peer dependency obbligatoria di `react-filerobot-image-editor`/`react-konva`: mai importata dall'app ma richiesta a runtime dall'editor (lazy). Rimuoverla rompe l'editor immagini del gestore |
| `tailwindcss` + `@tailwindcss/postcss` | **falso positivo** | Tailwind v4 si aggancia via PostCSS/CSS (`@import "tailwindcss"`), invisibile all'analisi degli import JS |
| `supabase` (devDep) | **falso positivo** | è la CLI (migration `db push`, ledger riallineato il 21/07) |
| — `server-only` | **PROBLEMA REALE, risolto** | importato in ~20 file ma MAI dichiarato: `npm ls server-only` era vuoto (funzionava solo per l'alias interno del Next custom). Ora è in package.json (`^0.0.1`) come da convenzione |

Tutte le altre dipendenze risultano usate (qrcode e browser-image-compression
comprese; sharp serve all'optimizer immagini in produzione).

## 2. Aggiornamenti applicati (in-range, `npm update`)

@supabase/ssr 0.12.0→0.12.3 · @supabase/supabase-js 2.108.2→2.110.7 ·
tailwindcss + @tailwindcss/postcss 4.3.1→4.3.3 · eslint 9.39.4→9.39.5 ·
konva 9.3.18→9.3.22 · nodemailer 9.0.1→9.0.3 · stripe 22.2.2→22.3.2 ·
styled-components 6.4.2→6.4.4 · supabase (CLI) 2.107.0→2.109.1.

**Vulnerabilità: 3 → 0** (js-yaml "high" via eslint, protobufjs "moderate"
via @imgly/onnxruntime — entrambe risolte dai bump; ri-audit pulito).

**Esclusi di proposito** (da rivalutare in una sessione dedicata, non in un
cantiere di igiene):
- `next` + `eslint-config-next` 16.2.10: il framework è CUSTOM e pinnato
  esatto (`16.2.9`) — un bump del framework merita test propri;
- major: eslint 10, konva 10, typescript 7, @types/node 26 (il runtime
  Vercel è Node 24: se mai, allineare a `^24`, ma i major dei types possono
  far emergere errori nuovi);
- `@anthropic-ai/sdk` 0.105→0.112 (0.x: i minor possono rompere; il flusso
  "Genera da foto" va ritestato a mano quando lo si bumpa).

## 3. Gli 8 warning eslint storici — CHIUSI (eslint a zero)

- **4 nei generatori di card OG** (`opengraph-image.tsx`, `social/route.tsx`
  della PDP): `@next/next/no-img-element` è ora spento SOLO per quei file
  via override in `eslint.config.mjs` — sono JSX per ImageResponse/Satori,
  non girano nel browser e `next/image` lì non esiste: `<img>` è corretto.
  La regola resta attiva in tutto il resto dell'app.
- **3 ternari-statement** negli script diagnostici (`dry-run-sync`,
  `ispeziona-prodotti`, `verifica-esauriti`): riscritti come if/else.
- **1 funzione morta** (`normTaglia` + set `ADULTO` in
  `verifica-esauriti.mjs`): rimossa — la normalizzazione taglie completa
  vive in `src/lib/gestore/fornitori/blt-csv.ts`, nello script il confronto
  è per-parent e non la usava.

## 4. Verifiche

tsc 0 errori · **eslint 0 problemi** · `next build` pulito · server locale:
home/PDP/carrello 200, webhook 400 senza firma (stack aggiornato incluso
stripe/supabase-js/nodemailer esercitato dai percorsi reali).

Nota per i prossimi audit: `npm ls <pacchetto>` prima di credere a depcheck
— i peer degli editor lazy e i plugin PostCSS sono invisibili alla sua
analisi degli import.
