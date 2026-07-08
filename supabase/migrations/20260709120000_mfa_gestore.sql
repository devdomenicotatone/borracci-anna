-- MFA (TOTP) per l'area gestore — muro definitivo a livello database.
--
-- is_gestore() ora richiede ANCHE che la sessione soddisfi la MFA: livello
-- aal2 (secondo fattore verificato in questa sessione) quando l'utente ha
-- almeno un authenticator verificato. Chi non ha fattori registrati non
-- cambia nulla (aal1 basta): cosi l'attivazione e' graduale e il primo
-- enrollment resta possibile.
--
-- Irrigidire QUESTA funzione protegge in un colpo tutte le policy RLS che la
-- usano (prodotti, varianti, categorie, ordini, storage...): una password
-- rubata senza authenticator non puo' ne' leggere i dati da gestore ne'
-- scrivere, anche chiamando le API direttamente. E' il pattern ufficiale
-- Supabase ("Enforce rules for MFA usage", docs auth-mfa).
--
-- NB: security definer (owner postgres) e' cio' che permette di leggere
-- auth.mfa_factors; search_path vuoto -> riferimenti sempre qualificati.

create or replace function public.is_gestore()
  returns boolean
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select
    exists (
      select 1 from public.profili p
      where p.id = (select auth.uid())
    )
    and (
      coalesce((select auth.jwt()->>'aal'), 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = (select auth.uid())
          and f.status = 'verified'
      )
    );
$$;

comment on function public.is_gestore() is
  'TRUE se auth.uid() ha una riga in public.profili E la sessione soddisfa la MFA (aal2 obbligatorio se l''utente ha fattori verificati). SECURITY DEFINER: niente ricorsione RLS.';
