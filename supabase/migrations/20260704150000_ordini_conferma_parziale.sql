-- ============================================================================
-- Borracci Anna — Righe ordine: foto snapshot + conferma parziale
-- ----------------------------------------------------------------------------
-- Migration idempotente e additiva. Estende public.ordine_righe per due usi:
--   1) immagine_url: snapshot della foto del prodotto al momento dell'ordine
--      (foto del colore scelto, altrimenti copertina). Denormalizzata come
--      nome/prezzo: la riga resta leggibile anche se il catalogo cambia.
--   2) rimossa_il / rimossa_motivo: conferma parziale. In fase di conferma il
--      gestore puo segnare una riga come "non disponibile": NULL = riga attiva,
--      valorizzata = esclusa dal totale, dal pagamento e dallo scarico stock.
--      Il motivo viene mostrato al cliente (es. "Taglia esaurita").
-- ============================================================================

alter table public.ordine_righe
  add column if not exists immagine_url text;
alter table public.ordine_righe
  add column if not exists rimossa_il timestamptz;
alter table public.ordine_righe
  add column if not exists rimossa_motivo text;

-- Backfill foto per le righe esistenti: prima foto della galleria con lo
-- stesso colore della riga (order by ordine), altrimenti la copertina del
-- prodotto. Solo dove manca (idempotente sui retry); le righe senza prodotto
-- (catalogo eliminato) restano senza foto.
update public.ordine_righe r
   set immagine_url = coalesce(
         (select f.url
            from public.prodotto_foto f
           where f.prodotto_id = r.prodotto_id
             and f.colore = r.colore
           order by f.ordine
           limit 1),
         (select p.immagine_url
            from public.prodotti p
           where p.id = r.prodotto_id)
       )
 where r.immagine_url is null
   and r.prodotto_id is not null;

-- ----------------------------------------------------------------------------
-- segna_ordine_pagato_manuale: le righe rimosse in conferma parziale NON
-- scalano lo stock. Stessa funzione della migration 20260623200000, cambia
-- solo il filtro del decremento (`and rimossa_il is null`).
-- ----------------------------------------------------------------------------
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
  select * into v_ordine
    from public.ordini
   where id = p_ordine_id
   for update;

  if not found then
    raise exception 'Ordine inesistente.';
  end if;

  -- Idempotenza.
  if v_ordine.stato = 'pagato' then
    return;
  end if;

  -- Solo da una richiesta in attesa o confermata si puo passare a pagato.
  if v_ordine.stato not in ('in_attesa', 'confermato') then
    raise exception 'Transizione non consentita da % a pagato.', v_ordine.stato;
  end if;

  -- Decremento atomico aggregato per variante (somma quantita per variante).
  -- Le righe rimosse (rimossa_il valorizzato) non scalano lo stock.
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
     set stato = 'pagato',
         stock_scalato = true
   where id = v_ordine.id;
end;
$$;

revoke all on function public.segna_ordine_pagato_manuale(uuid) from public;
grant execute on function public.segna_ordine_pagato_manuale(uuid) to service_role;
