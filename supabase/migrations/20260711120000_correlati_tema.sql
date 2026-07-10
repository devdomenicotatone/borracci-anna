-- ============================================================================
-- Borracci Anna - Il tema entra nei correlati ("Ti potrebbe piacere anche")
-- ----------------------------------------------------------------------------
-- Dalla migration 20260707150000 il tema (saga/serie/brand) e una colonna
-- (`prodotti.tema`), curabile dal gestore. Finora prodotti_correlati doveva
-- INDOVINARE la stessa entita da nome e codice: "T-shirt Eren" e "Felpa
-- Attack on Titan" condividono il franchise ma quasi nessun trigram, quindi
-- non si suggerivano a vicenda.
--
-- Da questa migration il punteggio guadagna il segnale (5) TEMA: bonus se
-- target e candidato hanno lo stesso `tema` (entrambi non NULL). Peso 2.0,
-- pari al prefisso codice: entrambi dicono "stessa entita"; il nome resta il
-- segnale dominante (4.0) e continua a distinguere i prodotti affini dentro
-- lo stesso tema. Prodotti senza tema: nessun bonus, nessuna penalita.
--
-- Migration idempotente: solo CREATE OR REPLACE della funzione (firma e campi
-- di ritorno invariati: nessun cambio lato app, nessun deploy necessario).
-- ============================================================================

create or replace function public.prodotti_correlati(
  p_slug  text,
  p_limit integer default 8
)
returns table (
  id           uuid,
  slug         text,
  nome         text,
  descrizione  text,
  prezzo_cents integer,
  valuta       text,
  immagine_url text,
  attivo       boolean,
  solo_online  boolean,
  categoria_id uuid
)
language sql
stable
-- search_path esplicito: `similarity` (pg_trgm) su Supabase vive nello schema
-- `extensions`; cosi la risoluzione dei nomi non dipende dal search_path del
-- chiamante. (Il SET impedisce l'inlining, irrilevante a questa scala + cache.)
set search_path = public, extensions, pg_catalog
as $$
  with
  -- Padre e radice di ogni categoria (albero max 3 livelli): servono per il
  -- bonus "stesso tipo" (padre) e "stesso genere" (radice).
  catinfo as (
    select c.id,
           c.parent_id,
           coalesce(gp.id, pp.id, c.id) as root_id
    from public.categorie c
    left join public.categorie pp on pp.id = c.parent_id
    left join public.categorie gp on gp.id = pp.parent_id
  ),
  -- Il prodotto di partenza + i suoi segnali precalcolati (una riga).
  target as (
    select
      p.id,
      p.categoria_id,
      p.prezzo_cents,
      p.tema,
      public.norm_nome_prodotto(p.nome)                          as nom,
      lower(coalesce(substring(p.codice from '^[A-Za-z]+'), ''))  as pfx,
      ci.parent_id                                               as t_parent,
      ci.root_id                                                 as t_root
    from public.prodotti p
    left join catinfo ci on ci.id = p.categoria_id
    where p.slug = p_slug and p.attivo = true
    limit 1
  ),
  -- Candidati (catalogo attivo) con nome normalizzato, prefisso codice, padre e
  -- radice di categoria precalcolati.
  candidates as (
    select
      c.id, c.slug, c.nome, c.descrizione, c.prezzo_cents, c.valuta,
      c.immagine_url, c.attivo, c.solo_online, c.categoria_id, c.tema,
      public.norm_nome_prodotto(c.nome)                          as cand_nom,
      lower(coalesce(substring(c.codice from '^[A-Za-z]+'), ''))  as cpfx,
      ci.parent_id                                               as c_parent,
      ci.root_id                                                 as c_root
    from public.prodotti c
    left join catinfo ci on ci.id = c.categoria_id
    where c.attivo = true
  ),
  -- Punteggio pesato per ogni candidato (escluso il prodotto stesso).
  scored as (
    select
      c.id, c.slug, c.nome, c.descrizione, c.prezzo_cents, c.valuta,
      c.immagine_url, c.attivo, c.solo_online, c.categoria_id, c.cand_nom,
      (
          -- (1) NOME: similarita trigram sull'entita normalizzata. Segnale forte.
          4.0 * case
                  when length(t.nom) >= 2 and length(c.cand_nom) >= 2
                    then similarity(c.cand_nom, t.nom)
                  else 0
                end
          -- (2) CODICE: prefisso alfabetico condiviso (stessa entita). Bonus,
          --     perche irregolare: forte se >=3 lettere, tenue a 2.
        + 2.0 * case
                  when length(t.pfx) >= 3 and length(c.cpfx) >= 3
                       and left(c.cpfx, 3) = left(t.pfx, 3) then 1.0
                  when length(t.pfx) >= 2 and length(c.cpfx) >= 2
                       and left(c.cpfx, 2) = left(t.pfx, 2) then 0.35
                  else 0
                end
          -- (3) CATEGORIA: stessa foglia > stesso tipo (padre) > stesso genere.
        + 1.5 * case
                  when c.categoria_id is not null and c.categoria_id = t.categoria_id then 1.0
                  when c.c_parent   is not null and c.c_parent = t.t_parent           then 0.6
                  when c.c_root     is not null and t.t_root is not null
                       and c.c_root = t.t_root                                        then 0.3
                  else 0
                end
          -- (4) PREZZO: micro-bonus di vicinanza (0 se molto distante).
        + 0.5 * (1 - least(1.0, abs(c.prezzo_cents - t.prezzo_cents)::numeric
                                   / greatest(t.prezzo_cents, 1)))
          -- (5) TEMA: stessa colonna `tema` (migration 20260707150000) =
          --     stessa entita anche quando i nomi non si somigliano
          --     ("T-shirt Eren" / "Felpa Attack on Titan"). Solo bonus:
          --     tema NULL (o diverso) non penalizza.
        + 2.0 * case
                  when t.tema is not null and c.tema = t.tema then 1.0
                  else 0
                end
      ) as score
    from candidates c
    cross join target t
    where c.id <> t.id
  ),
  -- Anti-monotonia: max 2 candidati per nome normalizzato (niente 8 "Sciarpa
  -- Napoli Jacquard" identiche). Soglia: scarta i candidati troppo deboli
  -- (~stesso genere o meno) cosi non si riempie la fila con roba scorrelata.
  ranked as (
    select s.*,
           row_number() over (
             partition by s.cand_nom
             order by s.score desc, s.prezzo_cents asc, s.id asc
           ) as rn
    from scored s
    where s.score >= 0.5
  )
  select
    id, slug, nome, descrizione, prezzo_cents, valuta, immagine_url,
    attivo, solo_online, categoria_id
  from ranked
  where rn <= 2
  order by score desc, prezzo_cents asc, id asc
  limit greatest(coalesce(p_limit, 8), 0);
$$;

grant execute on function public.prodotti_correlati(text, integer) to anon, authenticated;
