-- ============================================================================
-- Borracci Anna - Ricerca/filtri lato server per la lista prodotti del gestore
-- ----------------------------------------------------------------------------
-- Fino a ora la pagina /gestore/prodotti caricava TUTTI i prodotti (a blocchi
-- di 1000) con tutte le varianti (stock + sku) e faceva ricerca, filtri,
-- ordinamento e conteggi nel browser. A ~2000 articoli e' ancora accettabile,
-- ma il payload cresce linearmente (soprattutto per gli sku, serviti solo per
-- la ricerca) e non regge un catalogo da 5000+.
--
-- Queste funzioni spostano tutto a Postgres, dove sta bene:
--   * ricerca testuale su nome/slug/codice E sku delle varianti (impossibile
--     in una singola query PostgREST perche' lo sku vive in un'altra tabella);
--   * ordinamento per "scorte" = somma aggregata dello stock delle varianti;
--   * conteggi per categoria (group by) per il menu a tendina;
--   * paginazione con totale in un solo giro (window count).
--
-- SICUREZZA: funzioni SECURITY INVOKER (default), quindi girano con i permessi
-- del CHIAMANTE e la RLS si applica normalmente. Il gestore (is_gestore) vede
-- anche i prodotti nascosti via le policy `*_lettura_gestore`; un eventuale
-- chiamante anonimo vedrebbe solo il catalogo attivo (dati pubblici, innocui).
-- Nessun bisogno di security definer + check manuale.
-- ============================================================================

-- Ricerca trigram per accelerare gli ILIKE '%...%' man mano che il catalogo
-- cresce (a queste dimensioni il seq scan e' comunque rapido; questi indici
-- servono per lo scenario 5000+). Nome e sku sono i campi piu' cercati.
create extension if not exists pg_trgm;
create index if not exists idx_prodotti_nome_trgm
  on public.prodotti using gin (nome gin_trgm_ops);
create index if not exists idx_varianti_sku_trgm
  on public.varianti using gin (sku gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- cerca_prodotti_gestore: una pagina di prodotti che rispettano i filtri, con
-- gli aggregati per riga (num varianti, stock totale) e il TOTALE dei match
-- (window count) su ogni riga. Ordinamento e paginazione inclusi.
--
-- Parametri:
--   p_q               testo di ricerca (nome/slug/codice/sku). '' = nessuna.
--   p_stato           'tutti' | 'attivi' | 'nascosti'.
--   p_categorie       array di id categoria GIA' espanso ai discendenti (lo fa
--                     il chiamante con idConDiscendenti). null/[] = tutte.
--   p_senza_categoria true = solo prodotti senza categoria (ignora p_categorie).
--   p_ordina          'recenti' | 'nome' | 'prezzo-asc' | 'prezzo-desc' | 'scorte'.
--   p_offset/p_limit  finestra di paginazione (il chiamante usa offset 0 e
--                     limit crescente: modello "Mostra altri" cumulativo).
-- ----------------------------------------------------------------------------
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
  -- Aggregati calcolati in UN solo passaggio sulle varianti (group by), poi
  -- hash-join sui prodotti: costo lineare nel numero di varianti, non un
  -- subquery correlato per prodotto.
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
      -- stato
      (    p_stato = 'attivi'   and p.attivo
        or p_stato = 'nascosti' and not p.attivo
        or p_stato not in ('attivi', 'nascosti'))
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
    -- Un blocco CASE per criterio: quello attivo ordina, gli altri restano NULL
    -- (nulls last) e non influiscono. Tie-break finale su id = paginazione stabile.
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

-- ----------------------------------------------------------------------------
-- ids_prodotti_gestore: SOLO gli id dei prodotti che rispettano i filtri (senza
-- paginazione). Serve al "Seleziona tutti i N" quando i match superano la
-- pagina caricata: si spostano gli id, non le righe intere. Stessa clausola
-- WHERE di cerca_prodotti_gestore (tenerle allineate).
-- ----------------------------------------------------------------------------
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
      or p_stato not in ('attivi', 'nascosti'))
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

-- ----------------------------------------------------------------------------
-- conteggi_categorie_gestore: quanti prodotti per ogni categoria (una riga per
-- categoria_id, inclusa la riga NULL = "senza categoria"), sull'INTERO catalogo
-- del gestore (attivi + nascosti via RLS), indipendente dai filtri correnti:
-- alimenta i numeri del menu a tendina categorie.
-- ----------------------------------------------------------------------------
create or replace function public.conteggi_categorie_gestore()
returns table (categoria_id uuid, n bigint)
language sql
stable
as $$
  select p.categoria_id, count(*)::bigint as n
  from public.prodotti p
  group by p.categoria_id;
$$;

-- Permessi: solo il gestore (ruolo authenticated + RLS is_gestore) le usa.
revoke all on function public.cerca_prodotti_gestore(text, text, uuid[], boolean, text, integer, integer) from public;
revoke all on function public.ids_prodotti_gestore(text, text, uuid[], boolean) from public;
revoke all on function public.conteggi_categorie_gestore() from public;
grant execute on function public.cerca_prodotti_gestore(text, text, uuid[], boolean, text, integer, integer) to authenticated;
grant execute on function public.ids_prodotti_gestore(text, text, uuid[], boolean) to authenticated;
grant execute on function public.conteggi_categorie_gestore() to authenticated;
