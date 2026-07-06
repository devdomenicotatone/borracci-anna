-- ============================================================================
-- Borracci Anna - Categorie: la gerarchia passa da 2 a 3 livelli
-- ----------------------------------------------------------------------------
-- Il negozio vuole un ordinamento piu fine (es. Uomo > T-shirt > Manga/Calcio).
-- Sostituisce il trigger categorie_max_due_livelli con una barriera "massimo
-- 3 livelli": vale la regola generale profondita(padre) + altezza(sottoalbero
-- spostato) <= 3. Come il predecessore, l'invariante vive nel DB perche i
-- check applicativi (categorie-actions.ts) sono read-then-write su round-trip
-- separati e due mutazioni concorrenti potrebbero aggirarli.
-- In piu: advisory lock transazionale su una chiave fissa, cosi TUTTE le
-- mutazioni di gerarchia si serializzano tra loro e l'invariante regge anche
-- sotto concorrenza. Un row lock sul solo padre non basterebbe: la race "a
-- due salti" (inserisco un nipote sotto F mentre sposto il nonno di F sotto
-- un'altra radice) tocca insiemi di righe disgiunti. Le categorie sono poche
-- e le mutazioni rare: la serializzazione globale non crea contesa.
-- Migration idempotente.
-- ============================================================================

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
  -- i check qui sotto leggono cosi sempre lo stato committato piu recente,
  -- anche contro mutazioni concorrenti su rami diversi dell'albero.
  perform pg_advisory_xact_lock(hashtext('public.categorie.gerarchia'));

  -- (a) Profondita del padre: se il padre e gia al 3o livello (ha un nonno),
  --     la nuova figlia sarebbe un 4o livello.
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

  -- (b) Altezza del sottoalbero spostato: chi ha figli puo stare solo sotto
  --     una radice; chi ha anche nipoti (2 livelli sotto di se) deve restare
  --     radice.
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

-- Scatta solo quando cambia parent_id (insert sempre): la rinomina non lo tocca.
drop trigger if exists trg_categorie_max_due_livelli on public.categorie;
drop trigger if exists trg_categorie_max_tre_livelli on public.categorie;
create trigger trg_categorie_max_tre_livelli
  before insert or update of parent_id on public.categorie
  for each row execute function public.categorie_max_tre_livelli();

-- La funzione dei 2 livelli non ha piu trigger: via anche lei.
drop function if exists public.categorie_max_due_livelli();
