-- ============================================================================
-- Borracci Anna — Scarico stock per variante_id (non per SKU) nel webhook Stripe
-- ----------------------------------------------------------------------------
-- Finding (check 2026-07-10): finalizza_ordine_pagato scalava lo stock con
-- `update varianti set stock = ... where sku = <sku snapshot>`. Lo SKU e' un
-- campo MODIFICABILE (applicaVarianti lo rinomina liberamente): se cambiava tra
-- creazione della sessione e pagamento, l'UPDATE non trovava piu la riga e
-- toccava 0 varianti -> incasso avvenuto, stock NON scalato, oversell sul
-- cliente successivo.
--
-- Ora il decremento avviene per `variante_id` (identificatore IMMUTABILE),
-- leggendolo dalle ordine_righe gia' persistite (pre-save al checkout) o
-- ricostruite qui sopra: si aggregano le quantita' per variante, saltando le
-- righe con variante_id null (variante eliminata: non devono nemmeno essere
-- fatte pagare) e quelle rimosse in conferma parziale. E' lo STESSO identico
-- criterio gia' usato da segna_ordine_pagato_manuale (pagamento in negozio).
--
-- p_righe resta necessario per la RICOSTRUZIONE delle righe nel fallback
-- direct-buy (dove lo SKU dai metadata Stripe e' l'unico riferimento), ma non
-- e' piu usato per il decremento. Corpo identico alla 20260708170000 tranne il
-- blocco di decremento; firma invariata -> CREATE OR REPLACE.
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
  -- risolvendo variante/prodotto per SKU (qui lo SKU e' l'unico riferimento
  -- disponibile dai metadata Stripe). Nel percorso normale le righe esistono
  -- gia' col variante_id persistito al checkout, quindi questo ramo non scatta.
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

  -- Decremento atomico per VARIANTE_ID (immutabile), dalle ordine_righe attive:
  -- robusto al rename dello SKU tra sessione e pagamento. Aggrega le quantita per
  -- variante; salta variante_id null (variante eliminata) e le righe rimosse in
  -- conferma parziale. Stesso criterio di segna_ordine_pagato_manuale.
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
