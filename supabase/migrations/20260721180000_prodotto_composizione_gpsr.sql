-- ============================================================================
-- Borracci Anna — Etichettatura tessile (M12) e GPSR (M13), audit conformita
-- legale 2026-07-14
-- ----------------------------------------------------------------------------
-- M12 (Reg. UE 1007/2011 art. 16): la composizione fibrosa deve essere
-- indicata in modo chiaramente leggibile PRIMA dell'acquisto. Finora viveva
-- come testo libero in coda alla descrizione ("Composizione: 100% Cotone."),
-- senza campo dedicato ne garanzia di presenza.
--
-- M13 (Reg. UE 2023/988 "GPSR" art. 19): l'offerta online deve riportare
-- nome/ragione sociale e recapiti (indirizzo postale ed elettronico) del
-- fabbricante — e della persona responsabile UE se il fabbricante e extra-UE.
-- Testo libero multiriga: la PDP lo mostra cosi com'e.
--
--   composizione: es. "100% Cotone" / "65% poliestere, 35% cotone".
--                 Backfill dalle descrizioni esistenti (1787/1842 hanno la
--                 riga standard) via scripts/estrai-composizione.mjs.
--   fabbricante:  compilato dalla titolare (dati legali reali, mai inventati);
--                 bulk per fornitore via scripts/imposta-fabbricante.mjs.
--
-- Additiva e idempotente; il codice degrada senza (campi assenti = sezioni
-- non mostrate in PDP).
-- ============================================================================

alter table public.prodotti
  add column if not exists composizione text,
  add column if not exists fabbricante text;

comment on column public.prodotti.composizione is
  'Composizione fibrosa come da etichetta (M12, Reg. UE 1007/2011): mostrata in PDP prima dell''acquisto.';
comment on column public.prodotti.fabbricante is
  'Fabbricante e recapiti (M13, GPSR art. 19), testo libero multiriga mostrato in PDP; include l''eventuale responsabile UE.';
