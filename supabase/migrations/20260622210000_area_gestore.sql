-- ============================================================================
-- by Frody - Area Gestore: auth + RLS scrittura catalogo + storage foto.
-- ----------------------------------------------------------------------------
-- Migration idempotente. NON modifica ne rimuove le policy pubbliche esistenti:
-- aggiunge solo nuovi oggetti e policy permissive (combinate in OR sulle SELECT).
-- ============================================================================

-- 0. BUCKET STORAGE 'prodotti' (pubblico in lettura) -------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'prodotti', 'prodotti', true,
  5242880,                                   -- 5 MB per file
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 1. TABELLA PROFILI ---------------------------------------------------------
create table if not exists public.profili (
  id            uuid primary key references auth.users (id) on delete cascade,
  ruolo         text not null default 'gestore'
                  check (ruolo in ('gestore', 'staff')),
  nome          text,
  creato_il     timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);
comment on table public.profili is
  'Utenti abilitati all''area gestore. Presenza riga + ruolo valido = permessi di scrittura sul catalogo.';
alter table public.profili enable row level security;

-- 2. FUNZIONE is_gestore() - SECURITY DEFINER per evitare la ricorsione RLS ---
create or replace function public.is_gestore()
  returns boolean
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select exists (
    select 1 from public.profili p
    where p.id = (select auth.uid())
  );
$$;
comment on function public.is_gestore() is
  'TRUE se auth.uid() ha una riga in public.profili. SECURITY DEFINER: niente ricorsione RLS.';
revoke all on function public.is_gestore() from public;
grant execute on function public.is_gestore() to anon, authenticated;

-- 3. RLS PROFILI: il gestore legge solo il proprio profilo -------------------
drop policy if exists "profili_select_proprio" on public.profili;
create policy "profili_select_proprio"
  on public.profili for select to authenticated
  using ( id = (select auth.uid()) );

-- 4. AUTO-PROVISIONING profilo da raw_app_meta_data.ruolo --------------------
-- SICUREZZA: si legge da raw_APP_meta_data (impostabile SOLO via Admin API /
-- service-role), NON da raw_user_meta_data (auto-assegnabile dall'utente in
-- fase di signup). Cosi nessuno puo auto-promuoversi a 'gestore'.
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if (new.raw_app_meta_data ->> 'ruolo') in ('gestore', 'staff') then
    insert into public.profili (id, ruolo, nome)
    values (
      new.id,
      new.raw_app_meta_data ->> 'ruolo',
      coalesce(
        new.raw_app_meta_data ->> 'nome',
        new.raw_user_meta_data ->> 'nome'
      )
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at su profili (search_path fisso per sicurezza)
create or replace function public.tocca_aggiornato_il()
  returns trigger
  language plpgsql
  set search_path = ''
as $$ begin new.aggiornato_il := now(); return new; end; $$;
drop trigger if exists trg_profili_aggiornato on public.profili;
create trigger trg_profili_aggiornato
  before update on public.profili
  for each row execute function public.tocca_aggiornato_il();

-- 5. RLS PRODOTTI: lettura gestore (anche attivo=false) + scrittura ----------
-- Le SELECT permissive si combinano in OR: (attivo=true) OR is_gestore().
alter table public.prodotti enable row level security;  -- idempotente

drop policy if exists "prodotti_lettura_gestore" on public.prodotti;
create policy "prodotti_lettura_gestore"
  on public.prodotti for select to authenticated
  using ( public.is_gestore() );

drop policy if exists "prodotti_insert_gestore" on public.prodotti;
create policy "prodotti_insert_gestore"
  on public.prodotti for insert to authenticated
  with check ( public.is_gestore() );

drop policy if exists "prodotti_update_gestore" on public.prodotti;
create policy "prodotti_update_gestore"
  on public.prodotti for update to authenticated
  using ( public.is_gestore() ) with check ( public.is_gestore() );

drop policy if exists "prodotti_delete_gestore" on public.prodotti;
create policy "prodotti_delete_gestore"
  on public.prodotti for delete to authenticated
  using ( public.is_gestore() );

-- 6. RLS VARIANTI: stessa logica --------------------------------------------
alter table public.varianti enable row level security;  -- idempotente

drop policy if exists "varianti_lettura_gestore" on public.varianti;
create policy "varianti_lettura_gestore"
  on public.varianti for select to authenticated
  using ( public.is_gestore() );

drop policy if exists "varianti_insert_gestore" on public.varianti;
create policy "varianti_insert_gestore"
  on public.varianti for insert to authenticated
  with check ( public.is_gestore() );

drop policy if exists "varianti_update_gestore" on public.varianti;
create policy "varianti_update_gestore"
  on public.varianti for update to authenticated
  using ( public.is_gestore() ) with check ( public.is_gestore() );

drop policy if exists "varianti_delete_gestore" on public.varianti;
create policy "varianti_delete_gestore"
  on public.varianti for delete to authenticated
  using ( public.is_gestore() );

-- 7. RLS ORDINE_RIGHE: SELECT per il gestore (serve al check "mai venduto") ---
-- Senza questa policy, con RLS attiva la count su ordine_righe dal client
-- anon+sessione restituirebbe sempre 0 -> eliminaProdotto farebbe sempre
-- hard-delete e ON DELETE SET NULL spezzerebbe lo storico ordini.
-- SOLO SELECT: insert/update/delete restano riservate al service-role.
drop policy if exists "ordine_righe_lettura_gestore" on public.ordine_righe;
create policy "ordine_righe_lettura_gestore"
  on public.ordine_righe for select to authenticated
  using ( public.is_gestore() );

-- 8. STORAGE: policy su storage.objects per il bucket 'prodotti' -------------
drop policy if exists "prodotti_storage_lettura_pubblica" on storage.objects;
create policy "prodotti_storage_lettura_pubblica"
  on storage.objects for select to anon, authenticated
  using ( bucket_id = 'prodotti' );

drop policy if exists "prodotti_storage_insert_gestore" on storage.objects;
create policy "prodotti_storage_insert_gestore"
  on storage.objects for insert to authenticated
  with check ( bucket_id = 'prodotti' and public.is_gestore() );

drop policy if exists "prodotti_storage_update_gestore" on storage.objects;
create policy "prodotti_storage_update_gestore"
  on storage.objects for update to authenticated
  using ( bucket_id = 'prodotti' and public.is_gestore() )
  with check ( bucket_id = 'prodotti' and public.is_gestore() );

drop policy if exists "prodotti_storage_delete_gestore" on storage.objects;
create policy "prodotti_storage_delete_gestore"
  on storage.objects for delete to authenticated
  using ( bucket_id = 'prodotti' and public.is_gestore() );
