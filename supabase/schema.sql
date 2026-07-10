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
  -- Tema (saga/serie/brand) come slug del dizionario src/lib/franchise.ts
  -- (es. 'harry-potter'). NULL = nessun tema -> finisce nel chip "Altro" in
  -- vetrina. Vedi migration 20260707150000.
  tema          text,
  creato_il     timestamptz not null default now()
);
-- Idempotente per i DB gia creati (la create-table sopra non aggiunge colonne).
alter table public.prodotti
  add column if not exists disponibilita_su_richiesta boolean not null default true;
alter table public.prodotti
  add column if not exists codice text;
alter table public.prodotti
  add column if not exists solo_online boolean not null default false;
alter table public.prodotti
  add column if not exists tema text;
create unique index if not exists prodotti_codice_key on public.prodotti (codice);

create index if not exists idx_prodotti_attivo on public.prodotti (attivo);
create index if not exists idx_prodotti_tema on public.prodotti (tema);

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
-- persistenza costo spedizione/indirizzo (migration 20260625100000) +
-- ritorno boolean e ricostruzione righe (20260708120000/20260708170000) +
-- scarico stock per variante_id anziche SKU (20260710120000).
drop function if exists public.finalizza_ordine_pagato(text, text, integer, jsonb);
create or replace function public.finalizza_ordine_pagato(
  p_session_id     text,
  p_email          text,
  p_total          integer,
  p_righe          jsonb,
  p_shipping_cents integer default null,
  p_indirizzo      jsonb   default null
) returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_ordine public.ordini%rowtype;
begin
  -- Lock della riga ordine: serializza le finalizzazioni concorrenti.
  select * into v_ordine
    from public.ordini
   where stripe_session_id = p_session_id
   for update;

  -- Nessun ordine pre-creato (fallback direct-buy): lo creiamo gia "pagato".
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

  -- Idempotenza: gia finalizzato -> niente (false = nessuna nuova finalizzazione).
  if v_ordine.stato = 'pagato' and v_ordine.stock_scalato then
    return false;
  end if;

  -- Righe mancanti (pre-save fallito): ricostruiscile da p_righe risolvendo la
  -- variante per SKU (unico riferimento dai metadata Stripe nel fallback).
  if not exists (
    select 1 from public.ordine_righe where ordine_id = v_ordine.id
  ) then
    insert into public.ordine_righe (
      ordine_id, prodotto_id, variante_id, nome_prodotto, sku,
      taglia, colore, prezzo_cents, quantita, immagine_url
    )
    select
      v_ordine.id,
      v.prodotto_id,
      v.id,
      coalesce(nullif(r->>'nome', ''), 'Articolo ' || coalesce(r->>'sku', '?')),
      r->>'sku',
      v.taglia,
      v.colore,
      greatest(0, coalesce((r->>'prezzo_cents')::int, 0)),
      coalesce((r->>'qta')::int, 1),
      p.immagine_url
    from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) as r
    left join public.varianti v on v.sku = (r->>'sku')
    left join public.prodotti p on p.id = v.prodotto_id
    where coalesce((r->>'qta')::int, 0) > 0;
  end if;

  -- Decremento per variante_id (immutabile) dalle ordine_righe attive: robusto al
  -- rename dello SKU. Salta variante_id null e righe rimosse. Stesso criterio di
  -- segna_ordine_pagato_manuale.
  update public.varianti vv
     set stock = greatest(0, vv.stock - agg.qta)
    from (
      select variante_id, sum(quantita)::int as qta
        from public.ordine_righe
       where ordine_id = v_ordine.id
         and variante_id is not null
         and rimossa_il is null
       group by variante_id
    ) agg
   where agg.variante_id = vv.id;

  update public.ordini
     set stato = 'pagato',
         email = coalesce(p_email, email),
         stock_scalato = true,
         totale_cents = coalesce(p_total, totale_cents),
         costo_spedizione_cents = coalesce(p_shipping_cents, costo_spedizione_cents),
         spedizione_indirizzo = coalesce(p_indirizzo, spedizione_indirizzo)
   where id = v_ordine.id;

  return true;
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

-- Storage: lettura del bucket 'prodotti', scrittura solo gestore.
-- Lettura/enumerazione (SELECT governa anche il LIST): gestore vede tutto; gli
-- altri solo gli oggetti di prodotti ATTIVI, cosi le foto delle bozze non sono
-- enumerabili con la anon key (finding #3, migration 20260710130000).
drop policy if exists "prodotti_storage_lettura_pubblica" on storage.objects;
create policy "prodotti_storage_lettura_pubblica"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'prodotti'
    and (
      public.is_gestore()
      or exists (
        select 1 from public.prodotti p
        where p.id::text = (storage.foldername(name))[1]
          and p.attivo = true
      )
    )
  );

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

-- ============================================================================
-- RICERCA/FILTRI LATO SERVER PER LA LISTA PRODOTTI DEL GESTORE
-- ----------------------------------------------------------------------------
-- Stesso contenuto della migration 20260706180000_ricerca_prodotti_gestore.sql.
-- Funzioni SECURITY INVOKER: la RLS si applica col ruolo del chiamante (il
-- gestore vede anche i nascosti; un anonimo solo il catalogo attivo). Spostano
-- a Postgres cio' che PostgREST non fa bene: ricerca sugli sku delle varianti,
-- ordinamento per stock aggregato, conteggi per categoria, totale paginato.
-- ============================================================================

create extension if not exists pg_trgm;
create index if not exists idx_prodotti_nome_trgm
  on public.prodotti using gin (nome gin_trgm_ops);
create index if not exists idx_varianti_sku_trgm
  on public.varianti using gin (sku gin_trgm_ops);

create or replace function public.cerca_prodotti_gestore(
  p_q               text    default '',
  p_stato           text    default 'tutti',
  p_categorie       uuid[]  default null,
  p_senza_categoria boolean default false,
  p_ordina          text    default 'recenti',
  p_offset          integer default 0,
  p_limit           integer default 50
)
returns table (
  id                         uuid,
  slug                       text,
  nome                       text,
  prezzo_cents               integer,
  valuta                     text,
  immagine_url               text,
  attivo                     boolean,
  disponibilita_su_richiesta boolean,
  categoria_id               uuid,
  num_varianti               integer,
  stock_totale               integer,
  totale                     bigint
)
language sql
stable
as $$
  with agg as (
    select prodotto_id,
           count(*)::int                as num_varianti,
           coalesce(sum(stock), 0)::int as stock_totale
    from public.varianti
    group by prodotto_id
  ),
  filtrati as (
    select
      p.id, p.slug, p.nome, p.prezzo_cents, p.valuta, p.immagine_url,
      p.attivo, p.disponibilita_su_richiesta, p.categoria_id, p.creato_il,
      coalesce(a.num_varianti, 0) as num_varianti,
      coalesce(a.stock_totale, 0) as stock_totale
    from public.prodotti p
    left join agg a on a.prodotto_id = p.id
    where
      (    p_stato = 'attivi'   and p.attivo
        or p_stato = 'nascosti' and not p.attivo
        or p_stato not in ('attivi', 'nascosti'))
      and (case
             when p_senza_categoria then p.categoria_id is null
             when p_categorie is null or array_length(p_categorie, 1) is null then true
             else p.categoria_id = any (p_categorie)
           end)
      and (
            coalesce(p_q, '') = ''
        or  p.nome   ilike '%' || p_q || '%'
        or  p.slug   ilike '%' || p_q || '%'
        or  p.codice ilike '%' || p_q || '%'
        or  exists (
              select 1 from public.varianti vs
              where vs.prodotto_id = p.id
                and vs.sku ilike '%' || p_q || '%'
            )
      )
  )
  select
    id, slug, nome, prezzo_cents, valuta, immagine_url, attivo,
    disponibilita_su_richiesta, categoria_id, num_varianti, stock_totale,
    count(*) over () as totale
  from filtrati
  order by
    case when p_ordina = 'nome'        then nome         end asc  nulls last,
    case when p_ordina = 'prezzo-asc'  then prezzo_cents end asc  nulls last,
    case when p_ordina = 'prezzo-desc' then prezzo_cents end desc nulls last,
    case when p_ordina = 'scorte'      then stock_totale end asc  nulls last,
    case when p_ordina not in ('nome', 'prezzo-asc', 'prezzo-desc', 'scorte')
         then creato_il end desc nulls last,
    id
  offset greatest(p_offset, 0)
  limit  least(greatest(p_limit, 0), 5000);
$$;

create or replace function public.ids_prodotti_gestore(
  p_q               text    default '',
  p_stato           text    default 'tutti',
  p_categorie       uuid[]  default null,
  p_senza_categoria boolean default false
)
returns table (id uuid)
language sql
stable
as $$
  select p.id
  from public.prodotti p
  where
    (    p_stato = 'attivi'   and p.attivo
      or p_stato = 'nascosti' and not p.attivo
      or p_stato not in ('attivi', 'nascosti'))
    and (case
           when p_senza_categoria then p.categoria_id is null
           when p_categorie is null or array_length(p_categorie, 1) is null then true
           else p.categoria_id = any (p_categorie)
         end)
    and (
          coalesce(p_q, '') = ''
      or  p.nome   ilike '%' || p_q || '%'
      or  p.slug   ilike '%' || p_q || '%'
      or  p.codice ilike '%' || p_q || '%'
      or  exists (
            select 1 from public.varianti vs
            where vs.prodotto_id = p.id
              and vs.sku ilike '%' || p_q || '%'
          )
    );
$$;

create or replace function public.conteggi_categorie_gestore()
returns table (categoria_id uuid, n bigint)
language sql
stable
as $$
  select p.categoria_id, count(*)::bigint as n
  from public.prodotti p
  group by p.categoria_id;
$$;

revoke all on function public.cerca_prodotti_gestore(text, text, uuid[], boolean, text, integer, integer) from public;
revoke all on function public.ids_prodotti_gestore(text, text, uuid[], boolean) from public;
revoke all on function public.conteggi_categorie_gestore() from public;
grant execute on function public.cerca_prodotti_gestore(text, text, uuid[], boolean, text, integer, integer) to authenticated;
grant execute on function public.ids_prodotti_gestore(text, text, uuid[], boolean) to authenticated;
grant execute on function public.conteggi_categorie_gestore() to authenticated;

-- ============================================================================
-- PRODOTTI CORRELATI ("Ti potrebbe piacere anche" nella scheda prodotto)
-- ----------------------------------------------------------------------------
-- Stesso contenuto delle migration 20260707120000_prodotti_correlati.sql e
-- 20260711120000_correlati_tema.sql (che aggiunge il segnale tema).
-- Recommender content-based nativo Postgres: la "licenza/entita" (Harry Potter,
-- Napoli...) vive nel `nome`, nel prefisso `codice` e — dalla migration
-- 20260707150000 — nella colonna `tema` curabile dal gestore.
-- Si combina: similarita trigram sul nome normalizzato (segnale forte) + bonus
-- prefisso codice + bonus categoria (foglia>tipo>genere) + vicinanza prezzo +
-- bonus stesso `tema`, con anti-monotonia (max 2 per nome normalizzato) e
-- soglia minima.
-- SECURITY INVOKER: la RLS mostra solo il catalogo attivo (dati pubblici).
-- ============================================================================

create extension if not exists pg_trgm;

create or replace function public.norm_nome_prodotto(p text)
returns text
language sql
immutable
parallel safe
as $norm$
  select trim(both ' ' from
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            ' ' || regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', ' ', 'g') || ' ',
            '\m(tshirt|shirt|maglia|maglietta|maglie|maglione|felpa|felpe|polo|camicia|cappello|cappellino|cappelli|berretto|berretti|visiera|trucker|pantaloni|pantalone|salopette|pallone|palloni|palla|completo|completi|kit|tuta|giacca|gilet|canotta|canottiera|shorts|bermuda|costume|sciarpa|sciarpe|borsa|zaino|calzini|guanti|portachiavi|tazza|poster|ufficiale|official|replica|home|away|third|logo|jersey|con|collo|coreano|coreana|da|di|del|dello|della|dei|delle|il|la|le|lo|gli|in|ed|kids|junior|baby|bimbo|bimba|donna|uomo|bambino|bambina|unisex|adulto|new|edition|calcio|ciclismo|fc|ac|as|ssc|cf|us|ssd)\M',
            ' ', 'g'
          ),
          '\m[0-9]+\M', ' ', 'g'
        ),
        '\m[a-z]\M', ' ', 'g'
      ),
      '\s+', ' ', 'g'
    )
  );
$norm$;

create or replace function public.prodotti_correlati(
  p_slug  text,
  p_limit integer default 8
)
returns table (
  id           uuid,
  slug         text,
  nome         text,
  descrizione  text,
  prezzo_cents integer,
  valuta       text,
  immagine_url text,
  attivo       boolean,
  solo_online  boolean,
  categoria_id uuid
)
language sql
stable
set search_path = public, extensions, pg_catalog
as $$
  with
  catinfo as (
    select c.id,
           c.parent_id,
           coalesce(gp.id, pp.id, c.id) as root_id
    from public.categorie c
    left join public.categorie pp on pp.id = c.parent_id
    left join public.categorie gp on gp.id = pp.parent_id
  ),
  target as (
    select
      p.id,
      p.categoria_id,
      p.prezzo_cents,
      p.tema,
      public.norm_nome_prodotto(p.nome)                          as nom,
      lower(coalesce(substring(p.codice from '^[A-Za-z]+'), ''))  as pfx,
      ci.parent_id                                               as t_parent,
      ci.root_id                                                 as t_root
    from public.prodotti p
    left join catinfo ci on ci.id = p.categoria_id
    where p.slug = p_slug and p.attivo = true
    limit 1
  ),
  candidates as (
    select
      c.id, c.slug, c.nome, c.descrizione, c.prezzo_cents, c.valuta,
      c.immagine_url, c.attivo, c.solo_online, c.categoria_id, c.tema,
      public.norm_nome_prodotto(c.nome)                          as cand_nom,
      lower(coalesce(substring(c.codice from '^[A-Za-z]+'), ''))  as cpfx,
      ci.parent_id                                               as c_parent,
      ci.root_id                                                 as c_root
    from public.prodotti c
    left join catinfo ci on ci.id = c.categoria_id
    where c.attivo = true
  ),
  scored as (
    select
      c.id, c.slug, c.nome, c.descrizione, c.prezzo_cents, c.valuta,
      c.immagine_url, c.attivo, c.solo_online, c.categoria_id, c.cand_nom,
      (
          4.0 * case
                  when length(t.nom) >= 2 and length(c.cand_nom) >= 2
                    then similarity(c.cand_nom, t.nom)
                  else 0
                end
        + 2.0 * case
                  when length(t.pfx) >= 3 and length(c.cpfx) >= 3
                       and left(c.cpfx, 3) = left(t.pfx, 3) then 1.0
                  when length(t.pfx) >= 2 and length(c.cpfx) >= 2
                       and left(c.cpfx, 2) = left(t.pfx, 2) then 0.35
                  else 0
                end
        + 1.5 * case
                  when c.categoria_id is not null and c.categoria_id = t.categoria_id then 1.0
                  when c.c_parent   is not null and c.c_parent = t.t_parent           then 0.6
                  when c.c_root     is not null and t.t_root is not null
                       and c.c_root = t.t_root                                        then 0.3
                  else 0
                end
        + 0.5 * (1 - least(1.0, abs(c.prezzo_cents - t.prezzo_cents)::numeric
                                   / greatest(t.prezzo_cents, 1)))
          -- (5) TEMA: stessa colonna `tema` = stessa entita anche quando i
          --     nomi non si somigliano (vedi migration 20260711120000).
        + 2.0 * case
                  when t.tema is not null and c.tema = t.tema then 1.0
                  else 0
                end
      ) as score
    from candidates c
    cross join target t
    where c.id <> t.id
  ),
  ranked as (
    select s.*,
           row_number() over (
             partition by s.cand_nom
             order by s.score desc, s.prezzo_cents asc, s.id asc
           ) as rn
    from scored s
    where s.score >= 0.5
  )
  select
    id, slug, nome, descrizione, prezzo_cents, valuta, immagine_url,
    attivo, solo_online, categoria_id
  from ranked
  where rn <= 2
  order by score desc, prezzo_cents asc, id asc
  limit greatest(coalesce(p_limit, 8), 0);
$$;

grant execute on function public.norm_nome_prodotto(text)          to anon, authenticated;
grant execute on function public.prodotti_correlati(text, integer) to anon, authenticated;

-- ============================================================================
-- CONTEGGIO TEMI DEL CATALOGO (chip "temi" della vetrina)
-- ----------------------------------------------------------------------------
-- Stesso contenuto della migration 20260707150000_prodotto_tema.sql (che
-- contiene anche il backfill una-tantum di `tema` dal dizionario TS).
-- Quanti prodotti ATTIVI per ogni tema (la riga con tema NULL e i temi sotto
-- soglia confluiscono nel chip "Altro", lato app), opzionalmente ristretti a
-- una lista di categorie gia espansa ai discendenti. Group-by lato DB:
-- conteggi esatti qualunque sia la taglia del catalogo. SECURITY INVOKER:
-- vale la RLS del chiamante (catalogo attivo).
-- ============================================================================

create or replace function public.conta_temi_catalogo(
  p_categoria_ids uuid[] default null
)
returns table (tema text, n bigint)
language sql
stable
as $$
  select p.tema, count(*)::bigint as n
  from public.prodotti p
  where p.attivo = true
    and (p_categoria_ids is null
         or cardinality(p_categoria_ids) = 0
         or p.categoria_id = any (p_categoria_ids))
  group by p.tema;
$$;

grant execute on function public.conta_temi_catalogo(uuid[]) to anon, authenticated;

-- ============================================================================
-- RICERCA SEMANTICA DEL CATALOGO (pgvector + embedding OpenAI)
-- ----------------------------------------------------------------------------
-- Stesso contenuto della migration 20260711130000_ricerca_semantica.sql.
-- Un embedding per prodotto (testo "nome. Tema: <etichetta>. descrizione",
-- vedi src/lib/embedding-testo.ts) in tabella separata, indice HNSW coseno e
-- RPC che ritorna gli id attivi piu vicini alla query embeddata. L'app la usa
-- come fallback integrativo quando la ricerca letterale trova <8 risultati.
-- SECURITY INVOKER: vale la RLS del chiamante (solo catalogo attivo).
-- ============================================================================

create extension if not exists vector with schema extensions;

create table if not exists public.prodotto_embedding (
  prodotto_id   uuid primary key references public.prodotti(id) on delete cascade,
  embedding     extensions.vector(1536) not null,
  testo         text not null,
  modello       text not null,
  aggiornato_il timestamptz not null default now()
);

create index if not exists idx_prodotto_embedding_hnsw
  on public.prodotto_embedding
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.prodotto_embedding enable row level security;

drop policy if exists "prodotto_embedding_lettura_pubblica" on public.prodotto_embedding;
create policy "prodotto_embedding_lettura_pubblica"
  on public.prodotto_embedding for select
  using (
    exists (
      select 1 from public.prodotti p
      where p.id = prodotto_id and p.attivo = true
    )
  );

create or replace function public.ricerca_semantica_catalogo(
  p_embedding    extensions.vector(1536),
  p_limite       integer default 200,
  p_max_distanza real    default 0.9
)
returns table (id uuid, distanza real)
language sql
stable
set search_path = public, extensions, pg_catalog
as $$
  select p.id,
         (e.embedding <=> p_embedding)::real as distanza
  from public.prodotto_embedding e
  join public.prodotti p on p.id = e.prodotto_id
  where p.attivo = true
    and (e.embedding <=> p_embedding) <= p_max_distanza
  order by e.embedding <=> p_embedding, p.id
  limit least(greatest(coalesce(p_limite, 200), 1), 500);
$$;

grant execute on function public.ricerca_semantica_catalogo(extensions.vector, integer, real) to anon, authenticated;
