-- ============================================================================
-- Borracci Anna - Area Clienti: anagrafica, rubrica indirizzi, preferiti,
-- rate-limit auth.
-- ----------------------------------------------------------------------------
-- Migration idempotente. NON tocca profili / is_gestore() / handle_new_user:
-- la whitelist gestori resta invariata (qualsiasi riga in `profili` = permessi
-- da gestore su tutte le policy RLS; i clienti vivono in una tabella SEPARATA
-- che non conferisce alcun permesso).
-- ============================================================================

-- 1. ANAGRAFICA CLIENTI -------------------------------------------------------
create table if not exists public.clienti (
  id                       uuid primary key references auth.users (id) on delete cascade,
  email                    text,          -- denormalizzata da auth.users, sync via trigger
  nome                     text,
  stripe_customer_id       text,          -- scrivibile SOLO dal service role (vedi grant sotto)
  stripe_customer_ambiente text check (stripe_customer_ambiente in ('test', 'live')),
  creato_il                timestamptz not null default now(),
  aggiornato_il            timestamptz not null default now()
);
comment on table public.clienti is
  'Anagrafica clienti dell''area utente. NON conferisce alcun permesso gestore (quello e'' public.profili + is_gestore()).';
alter table public.clienti enable row level security;

create index if not exists idx_clienti_email on public.clienti (lower(email));
create unique index if not exists idx_clienti_stripe_customer
  on public.clienti (stripe_customer_id) where stripe_customer_id is not null;

drop trigger if exists trg_clienti_aggiornato on public.clienti;
create trigger trg_clienti_aggiornato
  before update on public.clienti
  for each row execute function public.tocca_aggiornato_il();

-- RLS: il cliente vede/aggiorna SOLO la propria riga.
drop policy if exists "clienti_select_proprio" on public.clienti;
create policy "clienti_select_proprio"
  on public.clienti for select to authenticated
  using ( id = (select auth.uid()) );

drop policy if exists "clienti_update_proprio" on public.clienti;
create policy "clienti_update_proprio"
  on public.clienti for update to authenticated
  using ( id = (select auth.uid()) ) with check ( id = (select auth.uid()) );

-- Grant di COLONNA: da PostgREST (anon key + sessione) il cliente puo
-- modificare SOLO `nome`. email e stripe_* restano di competenza di trigger e
-- service role: senza questo revoke un cliente potrebbe impostarsi un
-- stripe_customer_id arbitrario e dirottare lo storico pagamenti.
-- ATTENZIONE: un futuro `grant all on clienti` di massa riaprirebbe il buco.
revoke insert, update, delete on public.clienti from anon, authenticated;
grant update (nome) on public.clienti to authenticated;

-- 2. AUTO-PROVISIONING cliente alla creazione utente --------------------------
-- Trigger SEPARATO da handle_new_user (che continua a gestire gestore/staff):
-- chiunque si registri SENZA ruolo in raw_app_meta_data diventa cliente.
create or replace function public.handle_new_cliente()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'ruolo', '') not in ('gestore', 'staff') then
    insert into public.clienti (id, email, nome)
    values (
      new.id,
      new.email,
      nullif(trim(coalesce(new.raw_user_meta_data ->> 'nome', '')), '')
    )
    on conflict (id) do nothing;
  end if;
  return new;
exception when others then
  -- MAI bloccare la signup per un errore qui: il DAL fa self-heal della riga.
  raise warning 'handle_new_cliente fallita per %: %', new.id, sqlerrm;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_cliente on auth.users;
create trigger on_auth_user_created_cliente
  after insert on auth.users
  for each row execute function public.handle_new_cliente();

-- 3. RUBRICA INDIRIZZI ---------------------------------------------------------
create table if not exists public.indirizzi (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.clienti (id) on delete cascade,
  etichetta     text,                    -- "Casa", "Ufficio"...
  nome          text not null,           -- destinatario
  telefono      text,
  line1         text not null,
  line2         text,
  cap           text not null,
  citta         text not null,
  provincia     text not null,
  paese         text not null default 'IT',
  predefinito   boolean not null default false,
  creato_il     timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);
alter table public.indirizzi enable row level security;
create index if not exists idx_indirizzi_user on public.indirizzi (user_id);
-- Al massimo UN indirizzo predefinito per utente, garantito dal DB.
create unique index if not exists idx_indirizzi_predefinito_unico
  on public.indirizzi (user_id) where predefinito;

-- Cap di lunghezza nel DB: PostgREST e' raggiungibile direttamente con la
-- anon key + sessione, i soli check nelle Server Actions non bastano.
alter table public.indirizzi drop constraint if exists indirizzi_lunghezze;
alter table public.indirizzi add constraint indirizzi_lunghezze check (
  char_length(coalesce(etichetta, ''))  <= 40  and
  char_length(nome)                     between 1 and 200 and
  char_length(coalesce(telefono, ''))   <= 40  and
  char_length(line1)                    between 1 and 200 and
  char_length(coalesce(line2, ''))      <= 200 and
  char_length(cap)                      between 3 and 12 and
  char_length(citta)                    between 1 and 120 and
  char_length(provincia)                between 1 and 60 and
  paese = 'IT'                          -- si spedisce solo in Italia (come Stripe)
);

drop trigger if exists trg_indirizzi_aggiornato on public.indirizzi;
create trigger trg_indirizzi_aggiornato
  before update on public.indirizzi
  for each row execute function public.tocca_aggiornato_il();

-- Cap 10 indirizzi/utente. SECURITY INVOKER: con RLS attiva il count vede solo
-- le righe del chiamante, che e' esattamente il perimetro giusto.
create or replace function public.limita_indirizzi()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if (select count(*) from public.indirizzi where user_id = new.user_id) >= 10 then
    raise exception 'Hai raggiunto il numero massimo di indirizzi (10).';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_limite_indirizzi on public.indirizzi;
create trigger trg_limite_indirizzi
  before insert on public.indirizzi
  for each row execute function public.limita_indirizzi();

-- RLS indirizzi: CRUD solo sulle proprie righe.
drop policy if exists "indirizzi_select_proprio" on public.indirizzi;
create policy "indirizzi_select_proprio"
  on public.indirizzi for select to authenticated
  using ( user_id = (select auth.uid()) );

drop policy if exists "indirizzi_insert_proprio" on public.indirizzi;
create policy "indirizzi_insert_proprio"
  on public.indirizzi for insert to authenticated
  with check ( user_id = (select auth.uid()) );

drop policy if exists "indirizzi_update_proprio" on public.indirizzi;
create policy "indirizzi_update_proprio"
  on public.indirizzi for update to authenticated
  using ( user_id = (select auth.uid()) ) with check ( user_id = (select auth.uid()) );

drop policy if exists "indirizzi_delete_proprio" on public.indirizzi;
create policy "indirizzi_delete_proprio"
  on public.indirizzi for delete to authenticated
  using ( user_id = (select auth.uid()) );

-- RPC atomica per il predefinito: due UPDATE in un'unica transazione, cosi
-- l'indice parziale unico non va mai in violazione transitoria.
-- SECURITY INVOKER: le RLS sopra continuano a valere (tocca solo righe proprie).
create or replace function public.imposta_indirizzo_predefinito(p_id uuid)
  returns void
  language plpgsql
  set search_path = ''
as $$
begin
  update public.indirizzi
     set predefinito = false
   where user_id = (select auth.uid()) and predefinito and id <> p_id;

  update public.indirizzi
     set predefinito = true
   where id = p_id and user_id = (select auth.uid());
  if not found then
    raise exception 'Indirizzo non trovato.';
  end if;
end;
$$;
revoke all on function public.imposta_indirizzo_predefinito(uuid) from public, anon;
grant execute on function public.imposta_indirizzo_predefinito(uuid) to authenticated;

-- 4. PREFERITI SERVER-SIDE -----------------------------------------------------
-- Copia d'autorita dei "cuoricini" per i clienti loggati; gli ospiti restano
-- su localStorage (nessuna riga qui).
create table if not exists public.preferiti (
  user_id     uuid not null references public.clienti (id) on delete cascade,
  prodotto_id uuid not null references public.prodotti (id) on delete cascade,
  creato_il   timestamptz not null default now(),
  primary key (user_id, prodotto_id)
);
alter table public.preferiti enable row level security;
create index if not exists idx_preferiti_prodotto on public.preferiti (prodotto_id);

-- Cap 500 preferiti/utente (anti-bloat, stesso razionale del cap indirizzi).
create or replace function public.limita_preferiti()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if (select count(*) from public.preferiti where user_id = new.user_id) >= 500 then
    raise exception 'Hai raggiunto il numero massimo di preferiti (500).';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_limite_preferiti on public.preferiti;
create trigger trg_limite_preferiti
  before insert on public.preferiti
  for each row execute function public.limita_preferiti();

drop policy if exists "preferiti_select_proprio" on public.preferiti;
create policy "preferiti_select_proprio"
  on public.preferiti for select to authenticated
  using ( user_id = (select auth.uid()) );

drop policy if exists "preferiti_insert_proprio" on public.preferiti;
create policy "preferiti_insert_proprio"
  on public.preferiti for insert to authenticated
  with check ( user_id = (select auth.uid()) );

drop policy if exists "preferiti_delete_proprio" on public.preferiti;
create policy "preferiti_delete_proprio"
  on public.preferiti for delete to authenticated
  using ( user_id = (select auth.uid()) );

-- Un preferito si aggiunge o si toglie: mai update.
revoke update on public.preferiti from anon, authenticated;

-- 5. RATE LIMIT AUTH (DB-backed, stesso pattern del rate limit richieste) ------
create table if not exists public.auth_richieste (
  id        uuid primary key default gen_random_uuid(),
  email     text not null,
  ip        text,
  tipo      text not null check (tipo in ('registrazione', 'recupero', 'reinvio_conferma')),
  creato_il timestamptz not null default now()
);
comment on table public.auth_richieste is
  'Log finestrato delle richieste auth (signup/reset/reinvio) per il rate limit DB-backed. Solo service role.';
-- RLS attiva con ZERO policy: accesso esclusivo al service role.
alter table public.auth_richieste enable row level security;
create index if not exists idx_auth_richieste_email on public.auth_richieste (email, creato_il desc);
create index if not exists idx_auth_richieste_ip    on public.auth_richieste (ip, creato_il desc);
