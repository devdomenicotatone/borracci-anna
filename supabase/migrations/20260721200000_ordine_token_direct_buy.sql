-- ============================================================================
-- Borracci Anna - Token pubblico anche per gli ordini direct-buy (finding M10
-- audit conformita legale 2026-07-14).
-- ----------------------------------------------------------------------------
-- Gli ordini creati dal webhook Stripe (ramo fallback di finalizza_ordine_
-- pagato) nascevano senza `token`: il cliente non aveva ne il link di
-- tracciamento /ordine/[token] ne un riferimento da citare per recesso e
-- reclami (il numero progressivo c'e gia dalla migration 20260711180000, ma
-- non veniva comunicato). Qui la RPC genera il token alla creazione e lo
-- integra sugli ordini esistenti che ne fossero privi.
--
-- CAUTELA (audit integrita 2026-07-20, chiuso e verificato): firma, valore di
-- ritorno, lock di riga, lock deterministico delle varianti, idempotenza e
-- fotografia di stock_mancante restano IDENTICI. Le uniche differenze sono:
--   1) l'insert del ramo direct-buy valorizza `token` (gen_random_uuid);
--   2) l'update finale completa `token` SOLO se mancante (coalesce).
-- Il token e' un uuid come quello del flusso richiesta (crypto.randomUUID) e
-- l'unicita' e' garantita dall'indice idx_ordini_token.
-- Migration idempotente.
-- ============================================================================

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

  -- Nessun ordine pre-creato (fallback direct-buy): lo creiamo gia "pagato",
  -- col token pubblico per /ordine/[token] (finding M10).
  if not found then
    insert into public.ordini (
      stato, totale_cents, email, stripe_session_id, stock_scalato,
      costo_spedizione_cents, spedizione_indirizzo, token
    )
    values (
      'pagato', coalesce(p_total, 0), p_email, p_session_id, false,
      p_shipping_cents, p_indirizzo, gen_random_uuid()::text
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
  -- esatto anche sotto concorrenza e l'ordine di lock fisso evita i deadlock
  -- tra ordini multi-variante.
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

  -- Decremento per variante_id (immutabile) dalle ordine_righe attive: robusto al
  -- rename dello SKU. Salta variante_id null e righe rimosse. Stesso criterio di
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

  update public.ordini
     set stato = 'pagato',
         email = coalesce(p_email, email),
         stock_scalato = true,
         totale_cents = coalesce(p_total, totale_cents),
         costo_spedizione_cents = coalesce(p_shipping_cents, costo_spedizione_cents),
         spedizione_indirizzo = coalesce(p_indirizzo, spedizione_indirizzo),
         stock_mancante = v_mancante,
         -- M10: ordini legacy pre-creati senza token (o creati dalla RPC
         -- vecchia) lo ricevono alla finalizzazione; mai sovrascritto se c'e.
         token = coalesce(token, gen_random_uuid()::text)
   where id = v_ordine.id;

  return true;
end;
$$;
revoke all on function public.finalizza_ordine_pagato(text, text, integer, jsonb, integer, jsonb) from public;
grant execute on function public.finalizza_ordine_pagato(text, text, integer, jsonb, integer, jsonb) to service_role;

-- Backfill una tantum: qualunque ordine esistente senza token ne riceve uno
-- (al 21/07 la tabella e' vuota, pre-lancio: e' una rete di sicurezza).
update public.ordini
   set token = gen_random_uuid()::text
 where token is null;
