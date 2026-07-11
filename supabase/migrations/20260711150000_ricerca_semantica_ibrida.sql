-- ============================================================================
-- Borracci Anna - Ricerca semantica IBRIDA (trigram adattivo sulla coda)
-- ----------------------------------------------------------------------------
-- Problema osservato in produzione ("t-shirt mardanona"): una parola di capo
-- generica ("t-shirt") avvicina TUTTE le t-shirt del catalogo, il refuso
-- indebolisce il segnale "maradona", e una coda di prodotti fuori tema
-- (DanDaDan, Terminator, Il Padrino...) scivola sotto la soglia di distanza.
-- Misurato: la coda spuria parte a +0.06 dal miglior risultato, ma i risultati
-- LEGITTIMI di altre query ("felpa uomo ragno") si estendono fino a +0.11:
-- nessuna soglia fissa (assoluta o relativa) pulisce l'una senza mutilare
-- l'altra. La distanza coseno da sola non basta.
--
-- Soluzione: secondo segnale LESSICALE con cio' che c'e' gia' in casa —
-- pg_trgm e norm_nome_prodotto (Fase 1 dei correlati). La RPC riceve anche il
-- TESTO della query; query e nome vengono spogliati delle parole-tappo
-- ("t-shirt mardanona" -> "mardanona"; "felpa uomo ragno" -> "ragno") e
-- confrontati per trigrammi (word_similarity: "mardanona"~"maradona" ~0.36,
-- "mardanona"~"dandadan" ~0.06). Il filtro e' ADATTIVO:
--   * se NESSUN candidato ha aggancio lessicale (query-sinonimo pura, es.
--     "ragno" vs "Spider-Man": trigrammi zero) -> comportamento invariato,
--     puro semantico;
--   * se QUALCHE candidato ha aggancio (query-refuso: il nome giusto esiste)
--     -> restano solo i candidati agganciati per nome OPPURE nel nucleo
--     semantico stretto (+0.06 dal migliore). La coda generica sparisce, i
--     "Maglia calcio Maradona" a distanza piu' alta rientrano via trigram.
--
-- Firma NUOVA (p_query text): la funzione a 3 argomenti va eliminata, non
-- sovrascritta — con entrambe le firme una chiamata PostgREST senza p_query
-- diventerebbe ambigua (PGRST203). p_query e' opzionale (default null = puro
-- semantico): il deploy dell'app puo' seguire la migration senza finestre
-- rotte (l'app vecchia chiama senza p_query e continua a funzionare).
--
-- SICUREZZA: invariata — SECURITY INVOKER, solo catalogo attivo, solo
-- (id, distanza) in uscita. Migration idempotente: ri-eseguibile.
-- ============================================================================

drop function if exists public.ricerca_semantica_catalogo(extensions.vector, integer, real);

create or replace function public.ricerca_semantica_catalogo(
  p_embedding    extensions.vector(1536),
  p_query        text    default null,
  p_limite       integer default 200,
  p_max_distanza real    default 0.9
)
returns table (id uuid, distanza real)
language sql
stable
set search_path = public, extensions, pg_catalog
as $$
  with parametri as (
    -- Query spogliata delle parole-tappo, calcolata una volta. NULL/vuota
    -- (query assente o fatta solo di parole generiche, es. "felpa uomo"):
    -- niente lato lessicale, puro semantico.
    select nullif(public.norm_nome_prodotto(p_query), '') as q_norm
  ),
  candidati as (
    select p.id,
           (e.embedding <=> p_embedding)::real as distanza,
           -- Aggancio lessicale fuzzy della query al NOME (0 = nessuno).
           case
             when par.q_norm is null then 0
             else word_similarity(par.q_norm, public.norm_nome_prodotto(p.nome))
           end as aggancio
    from public.prodotto_embedding e
    join public.prodotti p on p.id = e.prodotto_id
    cross join parametri par
    where p.attivo = true
      and (e.embedding <=> p_embedding) <= p_max_distanza
    order by e.embedding <=> p_embedding, p.id
    limit least(greatest(coalesce(p_limite, 200), 1), 500)
  ),
  soglie as (
    -- Il miglior candidato e se ESISTE un aggancio lessicale nel set:
    -- decide la modalita' (0.3 = soglia trigram di pg_trgm; misurato:
    -- refusi veri 0.35-0.6, parole scorrelate <0.25).
    select min(distanza)          as migliore,
           bool_or(aggancio >= 0.3) as ha_aggancio
    from candidati
  )
  select c.id, c.distanza
  from candidati c
  cross join soglie s
  where (not s.ha_aggancio)              -- query-sinonimo: puro semantico
     or c.aggancio >= 0.3                -- query-refuso: nome agganciato...
     or c.distanza < s.migliore + 0.06   -- ...oppure nucleo semantico stretto
  order by c.distanza, c.id;
$$;

grant execute on function public.ricerca_semantica_catalogo(extensions.vector, text, integer, real) to anon, authenticated;
