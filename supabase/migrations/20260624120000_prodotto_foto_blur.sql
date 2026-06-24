-- ============================================================================
-- Borracci Anna — LQIP "blur-up" per la galleria prodotto
-- ----------------------------------------------------------------------------
-- Aggiunge `prodotto_foto.blur_data_url`: una data URL minuscola (~16px WebP)
-- generata lato client al momento dell'upload e usata come `blurDataURL` di
-- next/image (placeholder="blur") nella scheda prodotto, per eliminare il box
-- vuoto durante il caricamento della foto.
--
-- Idempotente. Colonna NULLABLE: le foto caricate prima di questa feature
-- restano valide e la UI ripiega su un placeholder generico finche non vengono
-- ricaricate (nessun backfill obbligatorio). Nessuna nuova policy: le policy
-- RLS esistenti di prodotto_foto coprono gia insert/update/select.
-- ============================================================================

alter table public.prodotto_foto
  add column if not exists blur_data_url text;

comment on column public.prodotto_foto.blur_data_url is
  'LQIP: data URL minuscola (~16px WebP) per placeholder="blur" di next/image. null = placeholder generico.';
