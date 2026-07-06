-- ============================================================================
-- Borracci Anna - Schema database (PostgreSQL / Supabase)
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
  -- Codice opzionale (es. "ABC123"): base degli SKU delle varianti al posto
  -- dello slug. NULL => gli SKU derivano dallo slug. Vedi migration 20260704120000.
  codice        text,
  nome          text not null,
  descrizione   text,
  prezzo_cents  integer not null check (prezzo_cents >= 0),
  valuta        text not null default 'EUR',
  immagine_url  text,
  attivo        boolean not null default true,
  -- Magazzino NON in tempo reale: il cliente sceglie colore+taglia e contatta
  -- il negozio ("Scrivici per la disponibilita"). Vedi migration 20260623160000.
  disponibilita_su_richiesta boolean not null default true,
  -- Articolo disponibile SOLO dal sito, non presente in negozio (badge
  -- informativo in vetrina). Vedi migration 20260705120000.
  solo_online   boolean not null default false,
  creato_il     timestamptz not null default now()
);
-- Idempotente per i DB gia creati (la create-table sopra non aggiunge colonne).
alter table public.prodotti
  add column if not exists disponibilita_su_richiesta boolean not null default true;
alter table public.prodotti
  add column if not exists codice text;
alter table public.prodotti
  add column if not exists solo_online boolean not null default false;
create unique index if not exists prodotti_codice_key on public.prodotti (codice);

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
create index if not exists idx_carrello_righe_prodotto on public.carrello_righe (prodotto_id);
create index if not exists idx_carrello_righe_variante on public.carrello_righe (variante_id);

-- Ordini ---------------------------------------------------------------------
create table if not exists public.ordini (
  id                 uuid primary key default gen_random_uuid(),
  stato              text not null default 'in_attesa'
                       check (stato in ('in_attesa', 'confermato', 'pagato', 'annullato')),
  totale_cents       integer not null check (totale_cents >= 0),
  email              text,
  -- Dati cliente della richiesta + token pubblico per /ordine/[token].
  nome               text,
  telefono           text,
  note               text,
  token              text,
  confermato_il      timestamptz,
  stripe_session_id  text unique,
  -- Idempotenza del decremento stock (vedi finalizza_ordine_pagato). Migration
  -- 20260623200000.
  stock_scalato      boolean not null default false,
  -- Spedizione (migration 20260625100000): costo incassato via Stripe
  -- shipping_options + indirizzo scelto dal cliente. NULL finche ignoti
  -- (pre-pagamento / richiesta non confermata).
  costo_spedizione_cents integer
    check (costo_spedizione_cents is null or costo_spedizione_cents >= 0),
  spedizione_indirizzo   jsonb,
  creato_il          timestamptz not null default now()
);
-- Idempotente per i DB gia creati. Vedi migration 20260623180000.
alter table public.ordini drop constraint if exists ordini_stato_check;
alter table public.ordini
  add constraint ordini_stato_check
  check (stato in ('in_attesa', 'confermato', 'pagato', 'annullato'));
alter table public.ordini add column if not exists nome text;
alter table public.ordini add column if not exists telefono text;
alter table public.ordini add column if not exists note text;
alter table public.ordini add column if not exists token text;
alter table public.ordini add column if not exists confermato_il timestamptz;
alter table public.ordini add column if not exists stock_scalato boolean not null default false;
alter table public.ordini add column if not exists costo_spedizione_cents integer;
alter table public.ordini add column if not exists spedizione_indirizzo jsonb;

create index if not exists idx_ordini_stato on public.ordini (stato);
create unique index if not exists idx_ordini_token on public.ordini (token);

-- Righe d'ordine (snapshot dei prezzi al momento dell'acquisto) --------------
create table if not exists public.ordine_righe (
  id              uuid primary key default gen_random_uuid(),
  ordine_id       uuid not null references public.ordini (id) on delete cascade,
  prodotto_id     uuid references public.prodotti (id) on delete set null,
  variante_id     uuid references public.varianti (id) on delete set null,
  -- snapshot denormalizzato: il nome/prezzo restano anche se il catalogo cambia.
  nome_prodotto   text not null,
  sku             text,
  taglia          text,
  colore          text,
  prezzo_cents    integer not null check (prezzo_cents >= 0),
  quantita        integer not null check (quantita > 0),
  -- Snapshot foto (colore scelto o copertina) + conferma parziale: rimossa_il
  -- NULL = riga attiva, valorizzata = non disponibile (esclusa da totale,
  -- pagamento e scarico stock), col motivo mostrato al cliente. Vedi migration
  -- 20260704150000.
  immagine_url    text,
  rimossa_il      timestamptz,
  rimossa_motivo  text
);
-- Idempotente per i DB gia creati. Vedi migration 20260623180000.
alter table public.ordine_righe add column if not exists taglia text;
alter table public.ordine_righe add column if not exists colore text;
-- Idempotente per i DB gia creati. Vedi migration 20260704150000.
alter table public.ordine_righe add column if not exists immagine_url text;
alter table public.ordine_righe add column if not exists rimossa_il timestamptz;
alter table public.ordine_righe add column if not exists rimossa_motivo text;

create index if not exists idx_ordine_righe_ordine on public.ordine_righe (ordine_id);
create index if not exists idx_ordine_righe_prodotto on public.ordine_righe (prodotto_id);
create index if not exists idx_ordine_righe_variante on public.ordine_righe (variante_id);

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

-- Finalizzazione ordini atomica/idempotente (migration 20260623200000) +
-- persistenza costo spedizione/indirizzo (migration 20260625100000).
drop function if exists public.finalizza_ordine_pagato(text, text, integer, jsonb);
create or replace function public.finalizza_ordine_pagato(
  p_session_id     text,
  p_email          text,
  p_total          integer,
  p_righe          jsonb,
  p_shipping_cents integer default null,
  p_indirizzo      jsonb   default null
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_ordine public.ordini%rowtype;
  v_riga   jsonb;
begin
  select * into v_ordine
    from public.ordini
   where stripe_session_id = p_session_id
   for update;

  if not found then
    insert into public.ordini (
      stato, totale_cents, email, stripe_session_id, stock_scalato,
      costo_spedizione_cents, spedizione_indirizzo
    )
    values (
      'pagato', coalesce(p_total, 0), p_email, p_session_id, false,
      p_shipping_cents, p_indirizzo
    )
    on conflict (stripe_session_id) do nothing
    returning * into v_ordine;
    if not found then
      select * into v_ordine from public.ordini
       where stripe_session_id = p_session_id for update;
    end if;
  end if;

  if v_ordine.stato = 'pagato' and v_ordine.stock_scalato then
    return;
  end if;

  for v_riga in select * from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb))
  loop
    update public.varianti
       set stock = greatest(0, stock - greatest(0, coalesce((v_riga->>'qta')::int, 0)))
     where sku = (v_riga->>'sku');
  end loop;

  update public.ordini
     set stato = 'pagato',
         email = coalesce(p_email, email),
         stock_scalato = true,
         totale_cents = coalesce(p_total, totale_cents),
         costo_spedizione_cents = coalesce(p_shipping_cents, costo_spedizione_cents),
         spedizione_indirizzo = coalesce(p_indirizzo, spedizione_indirizzo)
   where id = v_ordine.id;
end;
$$;
revoke all on function public.finalizza_ordine_pagato(text, text, integer, jsonb, integer, jsonb) from public;
grant execute on function public.finalizza_ordine_pagato(text, text, integer, jsonb, integer, jsonb) to service_role;

create or replace function public.segna_ordine_pagato_manuale(
  p_ordine_id uuid
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_ordine public.ordini%rowtype;
begin
  select * into v_ordine from public.ordini where id = p_ordine_id for update;
  if not found then
    raise exception 'Ordine inesistente.';
  end if;
  if v_ordine.stato = 'pagato' then
    return;
  end if;
  if v_ordine.stato not in ('in_attesa', 'confermato') then
    raise exception 'Transizione non consentita da % a pagato.', v_ordine.stato;
  end if;
  -- Le righe rimosse in conferma parziale non scalano lo stock.
  if not v_ordine.stock_scalato then
    update public.varianti v
       set stock = greatest(0, v.stock - agg.qta)
      from (
        select variante_id, sum(quantita)::int as qta
          from public.ordine_righe
         where ordine_id = p_ordine_id and variante_id is not null
           and rimossa_il is null
         group by variante_id
      ) agg
     where agg.variante_id = v.id;
  end if;
  update public.ordini
     set stato = 'pagato', stock_scalato = true
   where id = v_ordine.id;
end;
$$;
revoke all on function public.segna_ordine_pagato_manuale(uuid) from public;
grant execute on function public.segna_ordine_pagato_manuale(uuid) to service_role;

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

-- Delete sicuro: un prodotto gia venduto (referenziato da ordine_righe) non si
-- hard-elimina (la FK e SET NULL, spezzerebbe lo storico); il trigger lo nasconde
-- (attivo=false) e annulla il delete, atomicamente (chiude la race del check app).
create or replace function public.prodotto_nascondi_se_venduto()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if exists (
    select 1 from public.ordine_righe where prodotto_id = old.id
  ) then
    update public.prodotti set attivo = false where id = old.id;
    return null;
  end if;
  return old;
end;
$$;
drop trigger if exists trg_prodotto_nascondi_se_venduto on public.prodotti;
create trigger trg_prodotto_nascondi_se_venduto
  before delete on public.prodotti
  for each row execute function public.prodotto_nascondi_se_venduto();

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

-- ============================================================================
-- CATEGORIE + GALLERIA FOTO
-- ----------------------------------------------------------------------------
-- Stesso contenuto della migration 20260623120000_categorie_galleria.sql.
-- ============================================================================

-- Categorie (lista gestibile dal pannello) + seed Polo/Coreane.
create table if not exists public.categorie (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  nome       text not null,
  parent_id  uuid references public.categorie (id) on delete set null,
  ordine     integer not null default 0,
  creato_il  timestamptz not null default now()
);
-- Per DB gia esistenti: aggiunge parent_id se la tabella c'era senza.
alter table public.categorie
  add column if not exists parent_id uuid
    references public.categorie (id) on delete set null;
create index if not exists idx_categorie_ordine on public.categorie (ordine);
create index if not exists idx_categorie_parent on public.categorie (parent_id);
alter table public.categorie enable row level security;

drop policy if exists "categorie_lettura_pubblica" on public.categorie;
create policy "categorie_lettura_pubblica"
  on public.categorie for select
  using ( true );

drop policy if exists "categorie_insert_gestore" on public.categorie;
create policy "categorie_insert_gestore"
  on public.categorie for insert to authenticated
  with check ( public.is_gestore() );

drop policy if exists "categorie_update_gestore" on public.categorie;
create policy "categorie_update_gestore"
  on public.categorie for update to authenticated
  using ( public.is_gestore() ) with check ( public.is_gestore() );

drop policy if exists "categorie_delete_gestore" on public.categorie;
create policy "categorie_delete_gestore"
  on public.categorie for delete to authenticated
  using ( public.is_gestore() );

insert into public.categorie (slug, nome, ordine)
values
  ('uomo',    'Uomo',    1),
  ('donna',   'Donna',   2),
  ('polo',    'Polo',    1),
  ('coreane', 'Coreane', 2)
on conflict (slug) do nothing;

-- Gerarchia: Polo e Coreane sotto la macro UOMO (solo se senza genitore).
update public.categorie
  set parent_id = (select id from public.categorie where slug = 'uomo')
  where slug in ('polo', 'coreane')
    and parent_id is null;

-- Barriera "massimo 3 livelli" (stesso contenuto della migration
-- 20260706150000_categorie_tre_livelli.sql): l'invariante vive nel DB perche i
-- check applicativi sono read-then-write su round-trip separati.
create or replace function public.categorie_max_tre_livelli()
returns trigger
language plpgsql
as $$
declare
  nonno uuid;
  bisnonno uuid;
  ha_figli boolean;
  ha_nipoti boolean;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception
      'Gerarchia categorie: una categoria non puo essere figlia di se stessa.'
      using errcode = 'check_violation';
  end if;

  -- Serializza tutte le mutazioni di gerarchia (rilasciato a fine transazione):
  -- chiude anche le race "a due salti" su rami diversi dell'albero.
  perform pg_advisory_xact_lock(hashtext('public.categorie.gerarchia'));

  -- (a) Se il padre e gia al 3o livello, la nuova figlia sarebbe un 4o livello.
  select p.parent_id into nonno
    from public.categorie p where p.id = new.parent_id;
  if nonno is not null then
    select n.parent_id into bisnonno
      from public.categorie n where n.id = nonno;
    if bisnonno is not null then
      raise exception
        'Gerarchia categorie: massimo 3 livelli (la categoria scelta e gia al terzo livello).'
        using errcode = 'check_violation';
    end if;
  end if;

  -- (b) Chi ha figli puo stare solo sotto una radice; chi ha anche nipoti
  --     deve restare radice.
  select exists (
    select 1 from public.categorie c where c.parent_id = new.id
  ) into ha_figli;
  if ha_figli then
    if nonno is not null then
      raise exception
        'Gerarchia categorie: massimo 3 livelli (questa categoria ha sottocategorie: puo stare solo sotto una principale).'
        using errcode = 'check_violation';
    end if;
    select exists (
      select 1
        from public.categorie c
        join public.categorie f on f.parent_id = c.id
       where c.parent_id = new.id
    ) into ha_nipoti;
    if ha_nipoti then
      raise exception
        'Gerarchia categorie: massimo 3 livelli (questa categoria ha gia due livelli sotto di se).'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_categorie_max_due_livelli on public.categorie;
drop trigger if exists trg_categorie_max_tre_livelli on public.categorie;
create trigger trg_categorie_max_tre_livelli
  before insert or update of parent_id on public.categorie
  for each row execute function public.categorie_max_tre_livelli();

-- Riferimento categoria sul prodotto (set null on delete).
alter table public.prodotti
  add column if not exists categoria_id uuid
    references public.categorie (id) on delete set null;
create index if not exists idx_prodotti_categoria on public.prodotti (categoria_id);

-- Galleria foto del prodotto. La foto segue un COLORE (testo): resta legata al
-- colore anche quando le varianti vengono rigenerate (solo colore -> colore x
-- taglia). `variante_id` resta per compatibilita ma non e piu il riferimento.
create table if not exists public.prodotto_foto (
  id           uuid primary key default gen_random_uuid(),
  prodotto_id  uuid not null references public.prodotti (id) on delete cascade,
  variante_id  uuid references public.varianti (id) on delete set null,
  colore       text,
  url          text not null,
  ordine       integer not null default 0,
  creato_il    timestamptz not null default now()
);
-- Idempotente per i DB gia creati. Vedi migration 20260623160000.
alter table public.prodotto_foto
  add column if not exists colore text;
create index if not exists idx_prodotto_foto_prodotto
  on public.prodotto_foto (prodotto_id, ordine);
create index if not exists idx_prodotto_foto_variante
  on public.prodotto_foto (variante_id);
alter table public.prodotto_foto enable row level security;

drop policy if exists "prodotto_foto_lettura_pubblica" on public.prodotto_foto;
create policy "prodotto_foto_lettura_pubblica"
  on public.prodotto_foto for select
  using (
    exists (
      select 1 from public.prodotti p
      where p.id = prodotto_foto.prodotto_id and p.attivo = true
    )
  );

drop policy if exists "prodotto_foto_lettura_gestore" on public.prodotto_foto;
create policy "prodotto_foto_lettura_gestore"
  on public.prodotto_foto for select to authenticated
  using ( public.is_gestore() );

drop policy if exists "prodotto_foto_insert_gestore" on public.prodotto_foto;
create policy "prodotto_foto_insert_gestore"
  on public.prodotto_foto for insert to authenticated
  with check ( public.is_gestore() );

drop policy if exists "prodotto_foto_update_gestore" on public.prodotto_foto;
create policy "prodotto_foto_update_gestore"
  on public.prodotto_foto for update to authenticated
  using ( public.is_gestore() ) with check ( public.is_gestore() );

drop policy if exists "prodotto_foto_delete_gestore" on public.prodotto_foto;
create policy "prodotto_foto_delete_gestore"
  on public.prodotto_foto for delete to authenticated
  using ( public.is_gestore() );

-- ============================================================================
-- VETRINA CURATA: sezioni della home (fasce) + prodotti pinnati a mano.
-- Vedi migration 20260706120000_vetrina_sezioni.sql (con il seed iniziale).
-- ============================================================================
create table if not exists public.vetrina_sezioni (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null
                check (tipo in ('hero','banner','categorie',
                                'prodotti_manuale','prodotti_auto')),
  titolo      text,
  sottotitolo text,
  ordine      integer not null default 0,
  visibile    boolean not null default true,
  config      jsonb   not null default '{}'::jsonb,
  creato_il   timestamptz not null default now()
);

create table if not exists public.vetrina_sezione_prodotti (
  id          uuid primary key default gen_random_uuid(),
  sezione_id  uuid not null references public.vetrina_sezioni (id) on delete cascade,
  prodotto_id uuid not null references public.prodotti (id)        on delete cascade,
  ordine      integer not null default 0,
  creato_il   timestamptz not null default now(),
  unique (sezione_id, prodotto_id)
);
create index if not exists idx_vsp_sezione
  on public.vetrina_sezione_prodotti (sezione_id, ordine);

alter table public.vetrina_sezioni enable row level security;

drop policy if exists "vetrina_sezioni_lettura_pubblica" on public.vetrina_sezioni;
create policy "vetrina_sezioni_lettura_pubblica"
  on public.vetrina_sezioni for select to anon, authenticated
  using ( visibile = true );

drop policy if exists "vetrina_sezioni_lettura_gestore" on public.vetrina_sezioni;
create policy "vetrina_sezioni_lettura_gestore"
  on public.vetrina_sezioni for select to authenticated
  using ( public.is_gestore() );

drop policy if exists "vetrina_sezioni_insert_gestore" on public.vetrina_sezioni;
create policy "vetrina_sezioni_insert_gestore"
  on public.vetrina_sezioni for insert to authenticated
  with check ( public.is_gestore() );

drop policy if exists "vetrina_sezioni_update_gestore" on public.vetrina_sezioni;
create policy "vetrina_sezioni_update_gestore"
  on public.vetrina_sezioni for update to authenticated
  using ( public.is_gestore() ) with check ( public.is_gestore() );

drop policy if exists "vetrina_sezioni_delete_gestore" on public.vetrina_sezioni;
create policy "vetrina_sezioni_delete_gestore"
  on public.vetrina_sezioni for delete to authenticated
  using ( public.is_gestore() );

alter table public.vetrina_sezione_prodotti enable row level security;

drop policy if exists "vsp_lettura_pubblica" on public.vetrina_sezione_prodotti;
create policy "vsp_lettura_pubblica"
  on public.vetrina_sezione_prodotti for select to anon, authenticated
  using ( exists (
    select 1 from public.vetrina_sezioni s
    where s.id = sezione_id and s.visibile
  ) );

drop policy if exists "vsp_lettura_gestore" on public.vetrina_sezione_prodotti;
create policy "vsp_lettura_gestore"
  on public.vetrina_sezione_prodotti for select to authenticated
  using ( public.is_gestore() );

drop policy if exists "vsp_insert_gestore" on public.vetrina_sezione_prodotti;
create policy "vsp_insert_gestore"
  on public.vetrina_sezione_prodotti for insert to authenticated
  with check ( public.is_gestore() );

drop policy if exists "vsp_update_gestore" on public.vetrina_sezione_prodotti;
create policy "vsp_update_gestore"
  on public.vetrina_sezione_prodotti for update to authenticated
  using ( public.is_gestore() ) with check ( public.is_gestore() );

drop policy if exists "vsp_delete_gestore" on public.vetrina_sezione_prodotti;
create policy "vsp_delete_gestore"
  on public.vetrina_sezione_prodotti for delete to authenticated
  using ( public.is_gestore() );
