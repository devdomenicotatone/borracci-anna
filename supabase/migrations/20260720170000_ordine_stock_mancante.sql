-- ============================================================================
-- Borracci Anna — Oversell visibile: ordini pagati con giacenza insufficiente
-- (chiusura finding F1, audit integrità ordini/magazzino 2026-07-20)
-- ----------------------------------------------------------------------------
-- Il decremento stock di finalizza_ordine_pagato usa `greatest(0, stock - qta)`:
-- corretto (lo stock non va mai negativo, vincolo check), ma SILENZIOSO. Se due
-- clienti pagano l'ultimo pezzo nella finestra tra creazione sessione Stripe e
-- pagamento (Stripe Checkout hosted non prenota lo stock), entrambi gli ordini
-- risultano "pagato" e nessuno si accorge che la merce non basta: il negozio lo
-- scopre solo preparando il pacco.
--
-- Oggi il rischio è teorico (giacenze a semaforo 999/0 dal sync BLT: non esiste
-- un "ultimo pezzo" reale), ma il form gestore permette stock manuali in ogni
-- momento: il buco è a un prodotto di distanza dall'essere reale.
--
-- Fix: la RPC fotografa il deficit DENTRO la stessa transazione del decremento
-- (varianti bloccate con FOR UPDATE in ordine deterministico, così due
-- finalizzazioni concorrenti non possono né sbagliare il conto né andare in
-- deadlock) e lo persiste in `ordini.stock_mancante` (jsonb, NULL = tutto ok).
-- Il webhook lo rilegge e trasforma l'email alla titolare in un avviso
-- esplicito. Stessa fotografia in segna_ordine_pagato_manuale (pagamenti
-- segnati a mano dal pannello).
--
-- Backward-compatible nei due sensi:
--   - codice nuovo + RPC vecchia: la lettura di stock_mancante fallisce
--     (colonna assente) e il webhook degrada senza avviso — nessun errore;
--   - RPC nuova + codice vecchio: la colonna viene valorizzata e ignorata.
-- Firma invariata -> CREATE OR REPLACE.
-- ============================================================================

-- Deficit di giacenza fotografato alla finalizzazione: array di
-- {variante_id, sku, richiesti, disponibili}. NULL = giacenza sufficiente.
alter table public.ordini add column if not exists stock_mancante jsonb;

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
  v_ordine   public.ordini%rowtype;
  v_mancante jsonb;
begin
  -- Lock della riga ordine: serializza le finalizzazioni concorrenti.
  select * into v_ordine
    from public.ordini
   where stripe_session_id = p_session_id
   for update;

  -- Nessun ordine pre-creato (direct-buy): lo creiamo gia "pagato" includendo
  -- subito costo spedizione e indirizzo.
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
    -- Race: un'altra consegna ha appena inserito -> rileggi con lock.
    if not found then
      select * into v_ordine from public.ordini
       where stripe_session_id = p_session_id for update;
    end if;
  end if;

  -- Idempotenza: gia finalizzato (pagato + stock scalato) -> niente da fare e
  -- niente email (false = nessuna nuova finalizzazione).
  if v_ordine.stato = 'pagato' and v_ordine.stock_scalato then
    return false;
  end if;

  -- Righe mancanti (direct-buy, o pre-save fallito): ricostruiscile da p_righe.
  -- Risoluzione della variante PRIMA per variante_id (immutabile, dai metadata
  -- Stripe), poi ripiego sullo SKU per le sessioni vecchie senza variante_id.
  -- Confronto su vi.id::text (niente cast ::uuid dell'input): un valore assente
  -- o malformato non fa fallire la funzione, semplicemente non matcha -> SKU.
  if not exists (
    select 1 from public.ordine_righe where ordine_id = v_ordine.id
  ) then
    insert into public.ordine_righe (
      ordine_id, prodotto_id, variante_id, nome_prodotto, sku,
      taglia, colore, prezzo_cents, quantita, immagine_url
    )
    select
      v_ordine.id,
      coalesce(vi.prodotto_id, vs.prodotto_id),
      coalesce(vi.id, vs.id),
      coalesce(nullif(r->>'nome', ''), 'Articolo ' || coalesce(r->>'sku', '?')),
      r->>'sku',
      coalesce(vi.taglia, vs.taglia),
      coalesce(vi.colore, vs.colore),
      greatest(0, coalesce((r->>'prezzo_cents')::int, 0)),
      coalesce((r->>'qta')::int, 1),
      p.immagine_url
    from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) as r
    left join public.varianti vi on vi.id::text = nullif(r->>'variante_id', '')
    left join public.varianti vs on vs.sku = (r->>'sku')
    left join public.prodotti  p  on p.id = coalesce(vi.prodotto_id, vs.prodotto_id)
    where coalesce((r->>'qta')::int, 0) > 0;
  end if;

  -- Blocca le varianti coinvolte in ordine DETERMINISTICO (per id) e fotografa
  -- il deficit PRIMA del decremento, nella stessa transazione: il conto e'
  -- esatto anche sotto concorrenza (chi arriva secondo resta in attesa qui e
  -- legge lo stock gia' scalato dal primo). L'ordine di lock fisso elimina
  -- anche il rischio teorico di deadlock tra ordini multi-variante.
  with agg as (
    select variante_id, sum(quantita)::int as qta
      from public.ordine_righe
     where ordine_id = v_ordine.id
       and variante_id is not null
       and rimossa_il is null
     group by variante_id
  ), bloccate as (
    select v.id, v.sku, v.stock, agg.qta
      from agg
      join public.varianti v on v.id = agg.variante_id
     order by v.id
       for update of v
  )
  select jsonb_agg(
           jsonb_build_object(
             'variante_id', b.id,
             'sku',         b.sku,
             'richiesti',   b.qta,
             'disponibili', b.stock
           )
           order by b.sku
         ) filter (where b.stock < b.qta)
    into v_mancante
    from bloccate b;

  -- Decremento atomico per VARIANTE_ID (immutabile), dalle ordine_righe attive:
  -- robusto al rename dello SKU. Aggrega le quantita per variante; salta
  -- variante_id null e le righe rimosse in conferma parziale. Stesso criterio di
  -- segna_ordine_pagato_manuale. (Righe gia' bloccate qui sopra.)
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

  -- Marca pagato + email + flag idempotente; allinea totale/spedizione/
  -- indirizzo e persiste l'eventuale deficit di giacenza (NULL = tutto ok).
  update public.ordini
     set stato = 'pagato',
         email = coalesce(p_email, email),
         stock_scalato = true,
         totale_cents = coalesce(p_total, totale_cents),
         costo_spedizione_cents = coalesce(p_shipping_cents, costo_spedizione_cents),
         spedizione_indirizzo = coalesce(p_indirizzo, spedizione_indirizzo),
         stock_mancante = v_mancante
   where id = v_ordine.id;

  -- true: questa invocazione ha finalizzato l'ordine -> il webhook invia le email.
  return true;
end;
$$;

revoke all on function public.finalizza_ordine_pagato(text, text, integer, jsonb, integer, jsonb) from public;
grant execute on function public.finalizza_ordine_pagato(text, text, integer, jsonb, integer, jsonb) to service_role;

-- Stessa fotografia del deficit per i pagamenti segnati a mano dal pannello.
create or replace function public.segna_ordine_pagato_manuale(
  p_ordine_id uuid
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_ordine   public.ordini%rowtype;
  v_mancante jsonb;
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
    with agg as (
      select variante_id, sum(quantita)::int as qta
        from public.ordine_righe
       where ordine_id = p_ordine_id
         and variante_id is not null
         and rimossa_il is null
       group by variante_id
    ), bloccate as (
      select v.id, v.sku, v.stock, agg.qta
        from agg
        join public.varianti v on v.id = agg.variante_id
       order by v.id
         for update of v
    )
    select jsonb_agg(
             jsonb_build_object(
               'variante_id', b.id,
               'sku',         b.sku,
               'richiesti',   b.qta,
               'disponibili', b.stock
             )
             order by b.sku
           ) filter (where b.stock < b.qta)
      into v_mancante
      from bloccate b;

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
         stock_scalato = true,
         stock_mancante = case when v_ordine.stock_scalato
                               then stock_mancante else v_mancante end
   where id = v_ordine.id;
end;
$$;
revoke all on function public.segna_ordine_pagato_manuale(uuid) from public;
grant execute on function public.segna_ordine_pagato_manuale(uuid) to service_role;
