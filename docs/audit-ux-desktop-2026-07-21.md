# Audit UX desktop + fix (2026-07-21)

**In una riga: la vetrina desktop era già in buona salute (hover curati,
header con mega-menu, niente overflow) — i problemi veri erano la CTA della
PDP sotto la piega, mezzo schermo sprecato su catalogo e PDP a 1920, e le
diciture false/mancanti del carrello (finding legali M1, M2, M3+B6, chiusi
qui perché affini).** Tutte le misure sono numeriche e ripetibili
(JavaScript sul DOM a 1280×800 e 1920×1000); in questa sessione gli
screenshot del pane non erano disponibili, l'audit è DOM/metriche + codice.

## 1. Metodo e stato di partenza (misurato)

Viewport 1280×800 e 1920×1000 su dev server, pagine: home, /prodotti,
PDP, /carrello (vuoto e pieno), drawer. Cosa stava GIÀ bene:

- card con hover completo (lift `-translate-y-1.5` + ombra + zoom immagine),
  header sticky 64px con nav a categorie completa, breadcrumb in PDP,
  nessun overflow orizzontale a nessuna larghezza;
- chip dei temi (127, riga a scorrimento) CON freccia di scorrimento per
  mouse (`pointer-coarse:hidden`), ordinamento e conteggio risultati ok.

## 2. Finding e fix applicati

| # | Finding (misura PRIMA) | Fix | Misura DOPO |
| --- | --- | --- | --- |
| 1 | PDP 1280×800: CTA "Aggiungi al carrello" a y=850, **sotto la piega** (la descrizione, 104px, stava sopra i selettori) | descrizione spostata DOPO il blocco acquisto solo da md in su (`md:order-1`, colonna già flex-col; SKU `md:order-2`); mobile invariato | CTA a **y=722, interamente sopra la piega** |
| 2 | PDP a 1920: contenuto cappato a 960px, foto 492px (metà schermo vuoto) | contenitore `max-w-5xl → lg:max-w-6xl` (pagina + loading, che era GIÀ 6xl: sanato anche quel micro layout-shift) | griglia PDP 1088px, foto ~560px |
| 3 | Catalogo a 1920: container 1112px fisso, 4 colonne (58% dello schermo) | `xl:max-w-7xl` (prodotti, categoria, preferiti) + `xl:grid-cols-5` (4 griglie: catalogo, skeleton, append, preferiti) | **5 colonne**, griglia 1240px, card 232px (stessa densità delle 224px del 4-col a 1280); `sizes` immagini già coprenti (25vw ≥ reale) |
| 4 | PDP: "**999 disponibili**" — la giacenza-semaforo interna BLT esposta al cliente | da 999 in su niente numero: "Disponibilità immediata" (sotto resta il vero conteggio, incl. "Solo N rimasti") | verificato |
| 5 | **M2**: "Spedizione e imposte calcolate al pagamento" (drawer + carrello) — falso: prezzi IVA inclusa e spedizione nota | frase eliminata ovunque; trust line → "Pagamento sicuro con Stripe · Prezzi IVA inclusa" | `calcolate al pagamento` assente dal DOM |
| 6 | **M3+B6**: "Totale stimato" senza spedizione | riga "Spedizione: 5,90 € / Gratuita" + **"Totale (IVA inclusa)" = subtotale+spedizione** in drawer, riepilogo e barra sticky mobile — stessa cifra che Stripe addebita (tariffa passata DAL SERVER, valore env-driven; helper puro `costoSpedizione()` in spedizione.ts) | 24→"5,90/29,90" ✓, 96→"Gratuita/96,00" ✓ |
| 7 | **M1**: nessun "IVA inclusa" accanto ai prezzi | PDP (accanto al prezzo), card ("IVA incl." sottotono), carrello/drawer (nel totale) | verificato su tutte |
| 8 | `<main>` annidati (residuo a11y) su /carrello e PDP | → `<div>` (landmark nel layout), pattern del residuo audit a11y | `main main` = 0 |

Nei flussi SU RICHIESTA la spedizione resta "Confermata con la
disponibilità" (vero: la definisce il negozio alla conferma) e il totale
resta "stimato (IVA inclusa)": lì nessuna promessa numerica.

## 3. Residui deliberati (piccoli, annotati)

- Chip temi su desktop: 127 chip ≈ 17.700px di scroll con frecce ±1
  viewport per click — funziona ma arrivare in fondo costa ~16 click. Se
  mai servirà: pannello "Tutti i temi" espanso multi-riga (solo desktop).
- Campo ricerca del catalogo largo quanto il container (1112px+): un cap
  (~640px) sarebbe più elegante. Cosmetico.
- FreeShippingBar nel carrello misto ragiona sul subtotale INTERO mentre
  Stripe incassa i soli disponibili (pre-esistente, non toccato qui).
- Chip "Da pagare" della ListaOrdini gestore sotto AA: resta l'ultimo
  residuo a11y (area gestore, file non toccato in questa sessione).

## 4. Verifiche

tsc 0 · eslint 0 · build pulito · verifiche live sul dev server (misure
DOM prima/dopo qui sopra, carrello di test svuotato a fine giro).
