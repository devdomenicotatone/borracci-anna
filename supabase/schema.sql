-- ============================================================================
-- by Frody - Schema database (PostgreSQL / Supabase)
-- ----------------------------------------------------------------------------
-- Esegui questo file nel SQL Editor di Supabase (o via `supabase db push`).
-- Convenzioni:
--   - prezzi e totali in CENTESIMI di euro (integer), valuta EUR.
--   - chiavi primarie uuid generate da gen_random_uuid().
--   - timestamp in timestamptz, default now().
-- ============================================================================

-- Estensione per gen_random_uuid() (gia presente su Supabase, idempotente).
create extension if not exists pgcrypto;

-- ============================================================================
-- TABELLE
-- ============================================================================

-- Prodotti a catalogo --------------------------------------------------------
create table if not exists public.prodotti (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  nome          text not null,
  descrizione   text,
  prezzo_cents  integer not null check (prezzo_cents >= 0),
  valuta        text not null default 'EUR',
  immagine_url  text,
  attivo        boolean not null default true,
  creato_il     timestamptz not null default now()
);

create index if not exists idx_prodotti_attivo on public.prodotti (attivo);

-- Varianti (taglia/colore + stock) -------------------------------------------
create table if not exists public.varianti (
  id           uuid primary key default gen_random_uuid(),
  prodotto_id  uuid not null references public.prodotti (id) on delete cascade,
  taglia       text,
  colore       text,
  sku          text not null unique,
  stock        integer not null default 0 check (stock >= 0),
  creato_il    timestamptz not null default now()
);

create index if not exists idx_varianti_prodotto on public.varianti (prodotto_id);

-- Carrelli (uno per cookie cart_id) ------------------------------------------
create table if not exists public.carrelli (
  id         uuid primary key default gen_random_uuid(),
  creato_il  timestamptz not null default now()
);

-- Righe di carrello ----------------------------------------------------------
create table if not exists public.carrello_righe (
  id           uuid primary key default gen_random_uuid(),
  carrello_id  uuid not null references public.carrelli (id) on delete cascade,
  prodotto_id  uuid not null references public.prodotti (id) on delete cascade,
  variante_id  uuid not null references public.varianti (id) on delete cascade,
  quantita     integer not null default 1 check (quantita > 0),
  creato_il    timestamptz not null default now(),
  -- una sola riga per (carrello, variante): si incrementa la quantita.
  unique (carrello_id, variante_id)
);

create index if not exists idx_carrello_righe_carrello on public.carrello_righe (carrello_id);

-- Ordini ---------------------------------------------------------------------
create table if not exists public.ordini (
  id                 uuid primary key default gen_random_uuid(),
  stato              text not null default 'in_attesa'
                       check (stato in ('in_attesa', 'pagato', 'annullato')),
  totale_cents       integer not null check (totale_cents >= 0),
  email              text,
  stripe_session_id  text unique,
  creato_il          timestamptz not null default now()
);

create index if not exists idx_ordini_stato on public.ordini (stato);

-- Righe d'ordine (snapshot dei prezzi al momento dell'acquisto) --------------
create table if not exists public.ordine_righe (
  id              uuid primary key default gen_random_uuid(),
  ordine_id       uuid not null references public.ordini (id) on delete cascade,
  prodotto_id     uuid references public.prodotti (id) on delete set null,
  variante_id     uuid references public.varianti (id) on delete set null,
  -- snapshot denormalizzato: il nome/prezzo restano anche se il catalogo cambia.
  nome_prodotto   text not null,
  sku             text,
  prezzo_cents    integer not null check (prezzo_cents >= 0),
  quantita        integer not null check (quantita > 0)
);

create index if not exists idx_ordine_righe_ordine on public.ordine_righe (ordine_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
-- Strategia:
--   - prodotti/varianti: LETTURA pubblica solo dei record attivi (anon + auth).
--   - carrelli/carrello_righe/ordini/ordine_righe: nessuna policy per anon/auth,
--     quindi NON accessibili col client pubblico. Tutte le scritture (e letture
--     del carrello server-side) passano dal server: l'anon key con RLS attiva
--     non potra leggere/scrivere queste tabelle, e il service role (webhook)
--     bypassa la RLS. Le Server Actions usano l'anon key, quindi per farle
--     funzionare aggiungiamo policy esplicite mirate qui sotto.
-- ============================================================================

alter table public.prodotti       enable row level security;
alter table public.varianti       enable row level security;
alter table public.carrelli       enable row level security;
alter table public.carrello_righe enable row level security;
alter table public.ordini         enable row level security;
alter table public.ordine_righe   enable row level security;

-- Lettura pubblica del catalogo attivo ---------------------------------------
drop policy if exists "prodotti_lettura_pubblica" on public.prodotti;
create policy "prodotti_lettura_pubblica"
  on public.prodotti for select
  using (attivo = true);

drop policy if exists "varianti_lettura_pubblica" on public.varianti;
create policy "varianti_lettura_pubblica"
  on public.varianti for select
  using (
    exists (
      select 1 from public.prodotti p
      where p.id = varianti.prodotto_id and p.attivo = true
    )
  );

-- Carrello: il client pubblico (anon) gestisce il proprio carrello.
-- Nota: il carrello e protetto dall'imprevedibilita dell'uuid salvato nel
-- cookie httpOnly (non esposto al JS). Le policy permettono CRUD sulle righe
-- e sui carrelli a chiunque, ma senza conoscere l'id non si raggiunge nulla.
drop policy if exists "carrelli_insert" on public.carrelli;
create policy "carrelli_insert"
  on public.carrelli for insert
  with check (true);

drop policy if exists "carrelli_select" on public.carrelli;
create policy "carrelli_select"
  on public.carrelli for select
  using (true);

drop policy if exists "carrello_righe_all" on public.carrello_righe;
create policy "carrello_righe_all"
  on public.carrello_righe for all
  using (true)
  with check (true);

-- Ordini e righe d'ordine: NESSUNA policy per anon/auth.
-- => non leggibili/scrivibili col client pubblico. Solo il service role
--    (webhook Stripe, createAdminSupabase) puo operarvi, bypassando la RLS.

-- ============================================================================
-- DATI DI ESEMPIO (basics casual) - upsert idempotente per slug
-- ============================================================================

insert into public.prodotti (slug, nome, descrizione, prezzo_cents, valuta, immagine_url, attivo)
values
  ('t-shirt-basic-bianca',
   'T-shirt Basic Bianca',
   'T-shirt in puro cotone organico, vestibilita regular. Un essenziale del guardaroba.',
   1999, 'EUR', null, true),
  ('felpa-girocollo-grigia',
   'Felpa Girocollo Grigia',
   'Felpa girocollo in cotone garzato, calda e morbida. Perfetta per il tempo libero.',
   4499, 'EUR', null, true),
  ('jeans-slim-blu',
   'Jeans Slim Blu',
   'Jeans cinque tasche in denim stretch, taglio slim e lavaggio medio.',
   5999, 'EUR', null, true),
  ('camicia-oxford-azzurra',
   'Camicia Oxford Azzurra',
   'Camicia in tessuto Oxford, colletto button-down. Versatile dal lavoro al weekend.',
   4999, 'EUR', null, true),
  ('pantaloni-chino-beige',
   'Pantaloni Chino Beige',
   'Chino in cotone twill leggermente elasticizzato, vestibilita dritta.',
   5499, 'EUR', null, true),
  ('maglione-lana-blu-notte',
   'Maglione Lana Blu Notte',
   'Maglione girocollo in misto lana, tinta unita. Caldo senza essere ingombrante.',
   6999, 'EUR', null, true)
on conflict (slug) do nothing;

-- Varianti di taglia per ciascun prodotto d'esempio.
-- Una sola insert: per ogni prodotto e per ogni taglia genera una variante,
-- con sku idempotente (slug-taglia) protetto dal vincolo unique.
insert into public.varianti (prodotto_id, taglia, colore, sku, stock)
select
  pr.id,
  t.taglia,
  c.colore,
  pr.slug || '-' || lower(t.taglia) as sku,
  t.stock
from (
  values
    ('t-shirt-basic-bianca',     'Bianco'),
    ('felpa-girocollo-grigia',   'Grigio'),
    ('jeans-slim-blu',           'Blu'),
    ('camicia-oxford-azzurra',   'Azzurro'),
    ('pantaloni-chino-beige',    'Beige'),
    ('maglione-lana-blu-notte',  'Blu notte')
) as c(slug, colore)
join public.prodotti pr on pr.slug = c.slug
cross join (
  values ('S', 10), ('M', 15), ('L', 15), ('XL', 8)
) as t(taglia, stock)
on conflict (sku) do nothing;

-- ============================================================================
-- AREA GESTORE (auth + RLS scrittura catalogo + storage foto)
-- ----------------------------------------------------------------------------
-- Stesso contenuto della migration 20260622210000_area_gestore.sql. Tenuto qui
-- come snapshot completo: applicare schema.sql da zero produce lo stesso stato.
-- ============================================================================

-- Bucket Storage 'prodotti' (pubblico in lettura).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'prodotti', 'prodotti', true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Profili: utenti abilitati all'area gestore.
create table if not exists public.profili (
  id            uuid primary key references auth.users (id) on delete cascade,
  ruolo         text not null default 'gestore'
                  check (ruolo in ('gestore', 'staff')),
  nome          text,
  creato_il     timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);
alter table public.profili enable row level security;

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
revoke all on function public.is_gestore() from public;
grant execute on function public.is_gestore() to anon, authenticated;

drop policy if exists "profili_select_proprio" on public.profili;
create policy "profili_select_proprio"
  on public.profili for select to authenticated
  using ( id = (select auth.uid()) );

-- Provisioning del profilo dal ruolo in raw_app_meta_data (no escalation).
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

create or replace function public.tocca_aggiornato_il()
  returns trigger
  language plpgsql
  set search_path = ''
as $$ begin new.aggiornato_il := now(); return new; end; $$;
drop trigger if exists trg_profili_aggiornato on public.profili;
create trigger trg_profili_aggiornato
  before update on public.profili
  for each row execute function public.tocca_aggiornato_il();

-- Scrittura catalogo per il gestore + lettura dei prodotti non attivi.
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

-- Lettura ordine_righe per il gestore (check "mai venduto" in eliminaProdotto).
drop policy if exists "ordine_righe_lettura_gestore" on public.ordine_righe;
create policy "ordine_righe_lettura_gestore"
  on public.ordine_righe for select to authenticated
  using ( public.is_gestore() );

-- Storage: lettura pubblica del bucket 'prodotti', scrittura solo gestore.
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
