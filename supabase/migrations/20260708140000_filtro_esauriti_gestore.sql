-- ============================================================================
-- Borracci Anna — Filtro "Esauriti" nella lista prodotti del gestore
-- ----------------------------------------------------------------------------
-- Da quando il sync BLT azzera le giacenze ogni giorno, la titolare ha bisogno
-- di vedere a colpo d'occhio quali prodotti sono a stock 0. Aggiungiamo il valore
-- p_stato = 'esauriti' alle due RPC della lista gestore (cerca + ids per il
-- "seleziona tutti"), tenendole allineate.
--
-- "Esaurito" = somma stock delle varianti = 0 E prodotto NON "su richiesta"
-- (i su-richiesta hanno giacenza non in tempo reale: non sono mai "esauriti"
-- dal punto di vista della vendita). create or replace: firma e tipo di ritorno
-- invariati, quindi niente DROP e i grant restano.
-- ============================================================================

create or replace function public.cerca_prodotti_gestore(
  p_q               text    default '',
  p_stato           text    default 'tutti',
  p_categorie       uuid[]  default null,
  p_senza_categoria boolean default false,
  p_ordina          text    default 'recenti',
  p_offset          integer default 0,
  p_limit           integer default 50
)
returns table (
  id                         uuid,
  slug                       text,
  nome                       text,
  prezzo_cents               integer,
  valuta                     text,
  immagine_url               text,
  attivo                     boolean,
  disponibilita_su_richiesta boolean,
  categoria_id               uuid,
  num_varianti               integer,
  stock_totale               integer,
  totale                     bigint
)
language sql
stable
as $$
  with agg as (
    select prodotto_id,
           count(*)::int                as num_varianti,
           coalesce(sum(stock), 0)::int as stock_totale
    from public.varianti
    group by prodotto_id
  ),
  filtrati as (
    select
      p.id, p.slug, p.nome, p.prezzo_cents, p.valuta, p.immagine_url,
      p.attivo, p.disponibilita_su_richiesta, p.categoria_id, p.creato_il,
      coalesce(a.num_varianti, 0) as num_varianti,
      coalesce(a.stock_totale, 0) as stock_totale
    from public.prodotti p
    left join agg a on a.prodotto_id = p.id
    where
      -- stato: attivi / nascosti / esauriti (stock 0, escl. su richiesta) / tutti
      (    p_stato = 'attivi'   and p.attivo
        or p_stato = 'nascosti' and not p.attivo
        or p_stato = 'esauriti' and not p.disponibilita_su_richiesta
             and coalesce(a.stock_totale, 0) = 0
        or p_stato not in ('attivi', 'nascosti', 'esauriti'))
      -- categoria (senza-categoria ha precedenza; [] o null = tutte)
      and (case
             when p_senza_categoria then p.categoria_id is null
             when p_categorie is null or array_length(p_categorie, 1) is null then true
             else p.categoria_id = any (p_categorie)
           end)
      -- ricerca: nome/slug/codice sul prodotto, oppure sku di una sua variante
      and (
            coalesce(p_q, '') = ''
        or  p.nome   ilike '%' || p_q || '%'
        or  p.slug   ilike '%' || p_q || '%'
        or  p.codice ilike '%' || p_q || '%'
        or  exists (
              select 1 from public.varianti vs
              where vs.prodotto_id = p.id
                and vs.sku ilike '%' || p_q || '%'
            )
      )
  )
  select
    id, slug, nome, prezzo_cents, valuta, immagine_url, attivo,
    disponibilita_su_richiesta, categoria_id, num_varianti, stock_totale,
    count(*) over () as totale
  from filtrati
  order by
    case when p_ordina = 'nome'        then nome         end asc  nulls last,
    case when p_ordina = 'prezzo-asc'  then prezzo_cents end asc  nulls last,
    case when p_ordina = 'prezzo-desc' then prezzo_cents end desc nulls last,
    case when p_ordina = 'scorte'      then stock_totale end asc  nulls last,
    case when p_ordina not in ('nome', 'prezzo-asc', 'prezzo-desc', 'scorte')
         then creato_il end desc nulls last,
    id
  offset greatest(p_offset, 0)
  limit  least(greatest(p_limit, 0), 5000);
$$;

create or replace function public.ids_prodotti_gestore(
  p_q               text    default '',
  p_stato           text    default 'tutti',
  p_categorie       uuid[]  default null,
  p_senza_categoria boolean default false
)
returns table (id uuid)
language sql
stable
as $$
  select p.id
  from public.prodotti p
  where
    (    p_stato = 'attivi'   and p.attivo
      or p_stato = 'nascosti' and not p.attivo
      or p_stato = 'esauriti' and not p.disponibilita_su_richiesta
           and coalesce(
                 (select sum(v.stock) from public.varianti v where v.prodotto_id = p.id),
                 0
               ) = 0
      or p_stato not in ('attivi', 'nascosti', 'esauriti'))
    and (case
           when p_senza_categoria then p.categoria_id is null
           when p_categorie is null or array_length(p_categorie, 1) is null then true
           else p.categoria_id = any (p_categorie)
         end)
    and (
          coalesce(p_q, '') = ''
      or  p.nome   ilike '%' || p_q || '%'
      or  p.slug   ilike '%' || p_q || '%'
      or  p.codice ilike '%' || p_q || '%'
      or  exists (
            select 1 from public.varianti vs
            where vs.prodotto_id = p.id
              and vs.sku ilike '%' || p_q || '%'
          )
    );
$$;
