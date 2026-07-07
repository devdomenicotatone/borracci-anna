-- ============================================================================
-- Origine del prodotto — distingue gli articoli BLT dai prodotti propri
-- ----------------------------------------------------------------------------
-- Applica A MANO nel SQL Editor di Supabase.
-- Il sync giornaliero deve aggiornare SOLO gli articoli importati da Ingrosso
-- BLT, mai i prodotti propri del negozio (che il gestore gestisce a mano).
-- ============================================================================

-- 'BLT' = importato da Ingrosso BLT (lo tocca il sync); null = prodotto proprio
-- del negozio (il sync lo ignora sempre).
alter table public.prodotti add column if not exists fornitore text;

-- Marcatura una-tantum: il campo `codice` e popolato SOLO dall'import BLT,
-- quindi "ha un codice" == "e un articolo BLT". I prodotti propri non hanno
-- codice e restano null (esclusi dal sync).
update public.prodotti
   set fornitore = 'BLT'
 where codice is not null
   and fornitore is null;

create index if not exists idx_prodotti_fornitore on public.prodotti (fornitore);
