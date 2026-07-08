-- ============================================================================
-- Borracci Anna — Stock totale denormalizzato sul prodotto (badge "Esaurito")
-- ----------------------------------------------------------------------------
-- In vetrina i prodotti esauriti erano indistinguibili nella griglia: la card
-- appariva normale e lo si scopriva solo nella scheda. Per mostrare un badge
-- "Esaurito" senza embeddare le varianti (e il loro stock) in ogni query delle
-- card — che sono sul percorso caldo — denormalizziamo la somma dello stock
-- delle varianti in una colonna sul prodotto, mantenuta da un trigger.
--
-- "Esaurito" (lato UI) = stock_totale <= 0 E non "su richiesta" (i su-richiesta
-- non hanno giacenza in tempo reale). La colonna e solo un aggregato di comodo:
-- la fonte di verita resta varianti.stock.
-- ============================================================================

alter table public.prodotti
  add column if not exists stock_totale integer not null default 0;

-- Backfill iniziale dai valori attuali delle varianti.
update public.prodotti p
   set stock_totale = coalesce(
     (select sum(v.stock) from public.varianti v where v.prodotto_id = p.id),
     0
   );

-- Trigger: ricalcola stock_totale del prodotto coinvolto a ogni inserimento,
-- cancellazione o variazione di stock di una variante. NON scatta sugli update
-- che non toccano lo stock (es. modifica taglia/colore/sku dal form), cosi il
-- salvataggio della scheda non innesca ricalcoli inutili.
create or replace function public.ricalcola_stock_totale()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or tg_op = 'UPDATE') then
    update public.prodotti p
       set stock_totale = coalesce(
         (select sum(v.stock) from public.varianti v where v.prodotto_id = new.prodotto_id),
         0
       )
     where p.id = new.prodotto_id;
  end if;
  if (tg_op = 'DELETE') then
    update public.prodotti p
       set stock_totale = coalesce(
         (select sum(v.stock) from public.varianti v where v.prodotto_id = old.prodotto_id),
         0
       )
     where p.id = old.prodotto_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_ricalcola_stock_totale on public.varianti;
create trigger trg_ricalcola_stock_totale
  after insert or delete or update of stock on public.varianti
  for each row execute function public.ricalcola_stock_totale();
