-- ============================================================================
-- Borracci Anna - Aggancio ordini <-> clienti + numero ordine leggibile +
-- lettura "i miei ordini" via RLS.
-- ----------------------------------------------------------------------------
-- Il guest checkout resta INTATTO: user_id e' nullable e viene popolato dai
-- trigger (che scattano anche sugli insert del service role: webhook Stripe e
-- flusso richiesta NON vanno toccati). Le SCRITTURE su ordini/ordine_righe
-- restano riservate al service role: qui si aggiungono SOLO policy di lettura.
-- Migration idempotente.
-- ============================================================================

-- 1. COLONNA user_id (nullable) + indici --------------------------------------
-- FK su auth.users con ON DELETE SET NULL: l'ordine e' un dato contabile e
-- sopravvive alla cancellazione dell'account (torna "ospite").
alter table public.ordini
  add column if not exists user_id uuid references auth.users (id) on delete set null;
create index if not exists idx_ordini_user on public.ordini (user_id)
  where user_id is not null;
-- L'aggancio per email gira a ogni verifica/login: deve costare zero.
create index if not exists idx_ordini_email_lower_senza_utente
  on public.ordini (lower(email)) where user_id is null;

-- 2. NUMERO ORDINE PROGRESSIVO -------------------------------------------------
-- Numero leggibile per clienti e assistenza ("Ordine #1042"): gli uuid restano
-- le chiavi, il numero e' solo presentazione. Backfill cronologico dal 1001.
create sequence if not exists public.ordini_numero_seq;
alter table public.ordini add column if not exists numero bigint;

with da_numerare as (
  select id, row_number() over (order by creato_il, id) as rn
  from public.ordini
  where numero is null
), base as (
  select coalesce(max(numero), 1000) as massimo from public.ordini
)
update public.ordini o
   set numero = base.massimo + d.rn
  from da_numerare d, base
 where o.id = d.id;

-- Allinea la sequence al massimo assegnato (1000 = il prossimo sara' 1001).
select setval(
  'public.ordini_numero_seq',
  coalesce((select max(numero) from public.ordini), 1000),
  true
);
alter table public.ordini alter column numero set default nextval('public.ordini_numero_seq');
alter sequence public.ordini_numero_seq owned by public.ordini.numero;
grant usage, select on sequence public.ordini_numero_seq to service_role;
create unique index if not exists idx_ordini_numero on public.ordini (numero);

-- 3. RPC DI AGGANCIO STORICO (idempotente, SOLO email VERIFICATA) --------------
-- Collega al cliente gli ordini ospite passati con la sua stessa email.
-- Il join su public.clienti esclude i gestori; il filtro email_confirmed_at
-- impedisce di "pescare" ordini registrando un'email altrui non verificata.
-- SECURITY DEFINER: serve per leggere auth.users. Grant SOLO service_role
-- (esposta ad anon/authenticated sarebbe un oracolo di enumerazione email).
create or replace function public.aggancia_ordini_cliente(p_user_id uuid)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_email      text;
  v_agganciati integer;
begin
  select lower(u.email) into v_email
    from auth.users u
    join public.clienti c on c.id = u.id
   where u.id = p_user_id
     and u.email_confirmed_at is not null;   -- MAI agganciare email non verificate
  if v_email is null then
    return 0;
  end if;

  update public.ordini o
     set user_id = p_user_id
   where o.user_id is null
     and o.email is not null
     and lower(o.email) = v_email;
  get diagnostics v_agganciati = row_count;
  return v_agganciati;
end;
$$;
revoke all on function public.aggancia_ordini_cliente(uuid) from public, anon, authenticated;
grant execute on function public.aggancia_ordini_cliente(uuid) to service_role;

-- 4. TRIGGER SU auth.users: alla PRIMA verifica dell'email (o a un cambio email
--    confermato) sincronizza clienti.email e aggancia lo storico ordini.
create or replace function public.gestisci_email_cliente_verificata()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null
     and (tg_op = 'INSERT'
          or old.email_confirmed_at is null
          or new.email is distinct from old.email) then
    update public.clienti
       set email = new.email
     where id = new.id and email is distinct from new.email;
    perform public.aggancia_ordini_cliente(new.id);
  end if;
  return new;
exception when others then
  -- MAI far fallire la conferma email per un problema di aggancio:
  -- il login rifa' comunque l'aggancio best effort.
  raise warning 'gestisci_email_cliente_verificata fallita per %: %', new.id, sqlerrm;
  return new;
end;
$$;
drop trigger if exists on_auth_user_email_verificata on auth.users;
create trigger on_auth_user_email_verificata
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function public.gestisci_email_cliente_verificata();

-- 5. TRIGGER SU ordini: i FUTURI ordini ospite con l'email (verificata) di un
--    cliente esistente nascono gia' collegati. Copre TUTTI i percorsi di
--    creazione ordine (RPC finalizza_ordine_pagato dal webhook Stripe,
--    inviaRichiestaAction, futuri) senza toccarne il codice: i trigger
--    scattano anche per gli insert del service role.
create or replace function public.assegna_cliente_a_ordine()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.user_id is null and new.email is not null then
    select u.id into new.user_id
      from auth.users u
      join public.clienti c on c.id = u.id
     where lower(u.email) = lower(new.email)
       and u.email_confirmed_at is not null
     limit 1;   -- l'email in Supabase Auth e' comunque unica
  end if;
  return new;
end;
$$;
drop trigger if exists trg_ordini_assegna_cliente on public.ordini;
create trigger trg_ordini_assegna_cliente
  before insert or update of email on public.ordini
  for each row execute function public.assegna_cliente_a_ordine();

-- 6. RLS: il cliente legge SOLO i propri ordini (sola lettura) -----------------
-- Nessuna policy insert/update/delete: le scritture restano al service role.
drop policy if exists "ordini_select_proprio" on public.ordini;
create policy "ordini_select_proprio"
  on public.ordini for select to authenticated
  using ( user_id is not null and user_id = (select auth.uid()) );

drop policy if exists "ordine_righe_select_proprio" on public.ordine_righe;
create policy "ordine_righe_select_proprio"
  on public.ordine_righe for select to authenticated
  using ( exists (
    select 1 from public.ordini o
    where o.id = ordine_id
      and o.user_id = (select auth.uid())
  ) );
