# Residui legali M12 (etichettatura tessile) e M13 (GPSR) — 2026-07-21

**In una riga: la composizione fibrosa ora è un campo strutturato mostrato
in scheda prima dell'acquisto — già valorizzato per 1785 prodotti su 1842
(97%) estraendolo dalle descrizioni esistenti — e la scheda prodotto ha il
campo GPSR "fabbricante e recapiti", con l'infrastruttura pronta e il
riempimento bulk a un comando; i DATI del fabbricante restano un'azione
della titolare (mai inventarli).**

## M12 — Etichettatura tessile (Reg. UE 1007/2011 art. 16): CHIUSO

La composizione viveva come riga libera in coda alla descrizione
("Composizione: 100% Cotone.", convenzione dei flussi genera/import).
Adesso:

- **Colonna `prodotti.composizione`** (migration `20260721180000`, applicata
  con `db push` e verificata).
- **Backfill: 1785/1842 prodotti valorizzati** con
  `scripts/estrai-composizione.mjs` (dry-run rivisto prima dell'apply: la
  distribuzione dei valori estratti era pulita — 100% cotone/poliestere/
  acrilico, misti, Pvc, gomma…). I 57 senza riga sono compilabili dal form.
- **PDP**: voce dedicata "Composizione: X" nella scheda (visibile prima
  dell'acquisto, come richiede il regolamento); la riga legacy dentro la
  descrizione viene nascosta al render quando la colonna esiste (niente
  doppioni; dato in DB intatto). Helper puri in `src/lib/etichetta.ts`.
- **Flussi di creazione**: genera-da-foto e import BLT ora scrivono ANCHE la
  colonna (stessa regex del backfill, sulla descrizione finale rivista dal
  gestore). Il form prodotto ha il campo "Composizione (etichetta)".

## M13 — GPSR (Reg. UE 2023/988 art. 19): infrastruttura PRONTA, dati alla titolare

- **Colonna `prodotti.fabbricante`** (testo libero multiriga: ragione
  sociale, indirizzo postale, email; se il fabbricante è extra-UE va
  aggiunta la persona responsabile UE).
- **PDP**: blocco "Fabbricante:" mostrato quando compilato.
- **Form gestore**: campo "Fabbricante e recapiti (GPSR)" con placeholder
  esemplificativo.
- **Riempimento bulk**: `scripts/imposta-fabbricante.mjs BLT "Nome | Via …
  | email" [--applica]` — imposta il valore su tutti i prodotti del
  fornitore che ne sono privi (1840 BLT oggi), senza toccare quelli già
  compilati a mano. Dry-run di default.

**Perché M13 non è "chiuso" del tutto:** i dati del fabbricante sono fatti
legali che non possono essere inventati dal codice. La titolare deve
recuperare da Ingrosso BLT (o dal produttore effettivo dei capi) ragione
sociale e recapiti, e lanciare lo script. Fino ad allora la PDP
semplicemente non mostra il blocco.

## Verifiche

- Migration applicata (`db push`, dry-run prima) e colonne interrogabili.
- Backfill: `prodotti con composizione = 1785` (conteggio DB post-apply).
- PDP live: voce "Composizione: 100% Cotone" presente, riga legacy assente
  dalla descrizione, ordine desktop corretto (dopo il blocco acquisto,
  con la descrizione).
- tsc 0 · eslint 0 · build pulito.

## Nota tecnica

Il mapping della PDP (`caricaProdotto`) ricostruisce l'oggetto campo per
campo: aggiungere una colonna al `select` NON basta, va aggiunta anche al
return — dimenticarlo non produce errori, solo il campo silenziosamente
assente (successo qui, beccato dalla verifica live).
