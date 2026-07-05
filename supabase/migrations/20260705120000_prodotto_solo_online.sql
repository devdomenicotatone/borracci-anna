-- ============================================================================
-- Borracci Anna - Prodotto "solo online"
-- ----------------------------------------------------------------------------
-- Migration idempotente e additiva.
--
--   prodotti.solo_online (default FALSE): l'articolo si puo avere SOLO dal
--   sito, non e esposto/presente in negozio. E un'informazione per il cliente
--   (badge in vetrina e sulla scheda prodotto), non cambia il flusso di
--   acquisto. Impostabile dalla scheda prodotto e dai flussi di import.
-- ============================================================================

alter table public.prodotti
  add column if not exists solo_online boolean not null default false;
