-- ============================================================================
-- Borracci Anna — Righe d'ordine ricostruite nel fallback del webhook
-- ----------------------------------------------------------------------------
-- Finding 46 (audit 2026-07-08): se il salvataggio pre-pagamento della route
-- /api/checkout fallisce (best effort), il fallback di finalizza_ordine_pagato
-- creava solo la TESTATA dell'ordine: ordine "pagato" a pannello con totale ma
-- zero articoli — per sapere cosa spedire bisognava decifrare le line item
-- nella dashboard Stripe.
--
-- Ora, se al momento della finalizzazione l'ordine non ha righe, le
-- ricostruiamo da p_righe: il webhook vi passa anche nome e prezzo unitario
-- (ricavati dalle line item Stripe) oltre a sku e qta; taglia/colore/foto si
-- risolvono dalla variante via SKU (unique). La versione precedente della RPC
-- ignora le chiavi extra nel jsonb, quindi il deploy del webhook puo precedere
-- questa migration senza rompere nulla.
--
-- Corpo identico alla 20260708120000 + il blocco "righe mancanti". Firma
-- invariata -> basta CREATE OR REPLACE.
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
  v_ordine public.ordini%rowtype;
  v_riga   jsonb;
begin
  -- Lock della riga ordine: serializza le finalizzazioni concorrenti.
  select * into v_ordine
    from public.ordini
   where stripe_session_id = p_session_id
   for update;

  -- Nessun ordine pre-creato (fallback direct-buy): lo creiamo gia "pagato"
  -- includendo subito costo spedizione e indirizzo.
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

  -- Righe mancanti (pre-save fallito o assente): ricostruiscile da p_righe,
  -- risolvendo variante/prodotto per SKU. Snapshot: nome e prezzo unitario
  -- arrivano dal webhook; la foto e la copertina del prodotto (fallback).
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

  -- Decremento atomico per ogni riga (greatest = mai sotto zero).
  for v_riga in select * from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb))
  loop
    update public.varianti
       set stock = greatest(0, stock - greatest(0, coalesce((v_riga->>'qta')::int, 0)))
     where sku = (v_riga->>'sku');
  end loop;

  -- Marca pagato + email + flag idempotente; allinea il totale a quanto incassato
  -- (amount_total include la spedizione) e salva costo spedizione + indirizzo.
  -- coalesce: non azzerare valori gia presenti se un parametro arriva null.
  update public.ordini
     set stato = 'pagato',
         email = coalesce(p_email, email),
         stock_scalato = true,
         totale_cents = coalesce(p_total, totale_cents),
         costo_spedizione_cents = coalesce(p_shipping_cents, costo_spedizione_cents),
         spedizione_indirizzo = coalesce(p_indirizzo, spedizione_indirizzo)
   where id = v_ordine.id;

  -- true: questa invocazione ha finalizzato l'ordine -> il webhook invia le email.
  return true;
end;
$$;

revoke all on function public.finalizza_ordine_pagato(text, text, integer, jsonb, integer, jsonb) from public;
grant execute on function public.finalizza_ordine_pagato(text, text, integer, jsonb, integer, jsonb) to service_role;
