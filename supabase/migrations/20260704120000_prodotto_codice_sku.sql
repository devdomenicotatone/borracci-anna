-- ============================================================================
-- Borracci Anna - Codice prodotto (base per gli SKU delle varianti)
-- ----------------------------------------------------------------------------
-- Migration idempotente e additiva.
--
--   prodotti.codice: codice opzionale del prodotto (es. "ABC123"), scelto dal
--   gestore. Quando valorizzato, gli SKU delle varianti derivano da QUI invece
--   che dallo slug (vedi skuVariante): cosi il codice di magazzino resta stabile
--   anche se cambia l'indirizzo pubblico (slug). NULL => si continua a usare lo
--   slug (comportamento storico). Nessun backfill: i prodotti esistenti restano
--   con codice NULL, quindi il loro SKU non cambia finche non si imposta un codice.
--
--   Unicita: indice unique (piu NULL ammessi: NULL != NULL in Postgres) per
--   intercettare gia a livello di prodotto due codici uguali, prima ancora del
--   vincolo unique su varianti.sku.
-- ============================================================================

alter table public.prodotti
  add column if not exists codice text;

create unique index if not exists prodotti_codice_key
  on public.prodotti (codice);
