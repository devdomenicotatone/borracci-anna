-- ============================================================================
-- Borracci Anna — Notifica ordine pagato (email a titolare e cliente)
-- ----------------------------------------------------------------------------
-- Finora la finalizzazione (webhook Stripe) scalava lo stock e segnava l'ordine
-- "pagato" ma NON avvisava nessuno: la titolare scopriva le vendite solo aprendo
-- il pannello, e il cliente non riceveva la conferma promessa dalla pagina di
-- successo. Ora il webhook manda due email dopo il pagamento.
--
-- Perche serve toccare la RPC: le email vanno inviate UNA volta sola. Stripe
-- consegna gli eventi "at least once" (retry, duplicati), quindi il webhook puo
-- chiamare finalizza_ordine_pagato piu volte per lo stesso ordine. La RPC e gia
-- idempotente sullo stock (flag stock_scalato); qui la facciamo RITORNARE un
-- booleano: true solo per l'invocazione che ha effettivamente finalizzato
-- l'ordine, false per i no-op idempotenti. Il webhook invia le email solo quando
-- riceve true, così niente doppioni.
--
-- returns void -> returns boolean richiede il DROP (CREATE OR REPLACE non puo
-- cambiare il tipo di ritorno). Firma degli argomenti invariata.
-- ============================================================================

drop function if exists public.finalizza_ordine_pagato(text, text, integer, jsonb, integer, jsonb);

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
