-- ============================================================================
-- Borracci Anna - Categorie: barriera DB "massimo 2 livelli"
-- ----------------------------------------------------------------------------
-- I check applicativi (categorie-actions.ts) sono read-then-write su round-trip
-- REST separati: due mutazioni concorrenti su categorie correlate potrebbero
-- aggirarli e creare un 3o livello (nonni), che i consumatori (vetrina,
-- FormProdotto, GeneraDaFoto) — che raggruppano per parent_id a 2 livelli —
-- renderebbero male. Questo trigger sposta l'invariante nel DB, a prova di
-- concorrenza. Migration idempotente e additiva.
-- ============================================================================

create or replace function public.categorie_max_due_livelli()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is not null then
    -- (a) Il padre non deve essere a sua volta una sottocategoria (= 3o livello).
    if exists (
      select 1 from public.categorie p
      where p.id = new.parent_id and p.parent_id is not null
    ) then
      raise exception
        'Gerarchia categorie: massimo 2 livelli (la categoria principale e gia una sottocategoria).'
        using errcode = 'check_violation';
    end if;

    -- (b) Una categoria che diventa figlia non deve avere gia figli propri
    --     (diventerebbe insieme figlia e padre = 3o livello).
    if exists (
      select 1 from public.categorie c where c.parent_id = new.id
    ) then
      raise exception
        'Gerarchia categorie: massimo 2 livelli (questa categoria ha gia sottocategorie).'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- Scatta solo quando cambia parent_id (insert sempre): la rinomina non lo tocca.
drop trigger if exists trg_categorie_max_due_livelli on public.categorie;
create trigger trg_categorie_max_due_livelli
  before insert or update of parent_id on public.categorie
  for each row execute function public.categorie_max_due_livelli();
