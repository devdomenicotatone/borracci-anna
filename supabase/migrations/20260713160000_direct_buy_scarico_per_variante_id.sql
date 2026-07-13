-- ============================================================================
-- Borracci Anna — Direct-buy: ricostruzione righe per variante_id (non per SKU)
-- (chiusura finding audit 2026-07-13 I1)
-- ----------------------------------------------------------------------------
-- La 20260710120000 ha reso il DECREMENTO stock robusto al rename dello SKU
-- (scala per variante_id dalle ordine_righe). Ma nel flusso DIRECT-BUY l'ordine
-- NON e' pre-salvato (api/checkout non scrive ordini/ordine_righe): al webhook
-- le righe non esistono e vengono SEMPRE ricostruite qui dal blocco "righe
-- mancanti", che risolveva la variante con `left join varianti on sku`. Lo SKU
-- e' MODIFICABILE (applicaVarianti lo rinomina): se cambiava tra creazione
-- sessione e pagamento, il join falliva -> variante_id NULL nella riga -> il
-- decremento (che salta variante_id null) NON scalava lo stock. Incasso ok, ma
-- possibile oversell + riga orfana. E' lo stesso caso che la 20260710120000
-- voleva chiudere, rimasto aperto sul ramo di ricostruzione direct-buy.
--
-- Fix: il direct-buy ora passa anche il `variante_id` (IMMUTABILE) nei metadata
-- del product Stripe (src/app/api/checkout/route.ts) e il webhook lo inoltra in
-- p_righe. La ricostruzione risolve la variante PRIMA per variante_id, e ripiega
-- sullo SKU solo se assente (sessioni vecchie in volo durante il deploy).
--
-- Backward-compatible in entrambi i sensi:
--   - p_righe senza variante_id (codice vecchio) -> fallback SKU = comportamento
--     precedente;
--   - variante_id presente ma RPC vecchia (migration non ancora applicata) ->
--     la chiave extra nel jsonb viene ignorata, join per SKU = comportamento
--     precedente.
-- Percio' l'ordine di deploy e' flessibile. Corpo identico alla 20260710120000
-- tranne il blocco di ricostruzione; firma invariata -> CREATE OR REPLACE.
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

  -- Decremento atomico per VARIANTE_ID (immutabile), dalle ordine_righe attive:
  -- robusto al rename dello SKU. Aggrega le quantita per variante; salta
  -- variante_id null e le righe rimosse in conferma parziale. Stesso criterio di
  -- segna_ordine_pagato_manuale.
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

  -- Marca pagato + email + flag idempotente; allinea totale/spedizione/indirizzo.
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
