-- ============================================================================
-- Borracci Anna - Bucket Storage "vetrina" per gli sfondi hero/banner
-- (finding B5 audit conformita legale 2026-07-14).
-- ----------------------------------------------------------------------------
-- Gli sfondi delle fasce home erano un URL libero: un link a un host terzo
-- avrebbe fatto connettere ogni visitatore della home a quell'host (tracking
-- di fatto), invalidando la premessa "nessuna terza parte" di privacy/cookie
-- policy senza toccare il codice. Da questa migration gli sfondi vivono in un
-- bucket dedicato: lettura pubblica (sono immagini della home), scrittura solo
-- gestore. Il vincolo applicativo vive in src/lib/vetrina-sfondi.ts (rifiuto
-- al salvataggio + guardia al rendering).
--
-- Bucket dedicato e non "prodotti": la lettura pubblica di "prodotti" e
-- condizionata a un prodotto ATTIVO nel primo segmento del path (migration
-- 20260710130000, bozze non enumerabili) — gli sfondi non hanno un prodotto.
-- Migration idempotente.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vetrina', 'vetrina', true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Lettura pubblica del bucket (SELECT governa anche l'enumerazione/list).
drop policy if exists "vetrina_storage_lettura_pubblica" on storage.objects;
create policy "vetrina_storage_lettura_pubblica"
  on storage.objects for select to anon, authenticated
  using ( bucket_id = 'vetrina' );

-- Scrittura riservata al gestore.
drop policy if exists "vetrina_storage_insert_gestore" on storage.objects;
create policy "vetrina_storage_insert_gestore"
  on storage.objects for insert to authenticated
  with check ( bucket_id = 'vetrina' and public.is_gestore() );

drop policy if exists "vetrina_storage_update_gestore" on storage.objects;
create policy "vetrina_storage_update_gestore"
  on storage.objects for update to authenticated
  using ( bucket_id = 'vetrina' and public.is_gestore() )
  with check ( bucket_id = 'vetrina' and public.is_gestore() );

drop policy if exists "vetrina_storage_delete_gestore" on storage.objects;
create policy "vetrina_storage_delete_gestore"
  on storage.objects for delete to authenticated
  using ( bucket_id = 'vetrina' and public.is_gestore() );
