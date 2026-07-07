-- ============================================================================
-- Borracci Anna - Prodotti correlati ("Ti potrebbe piacere anche") nella PDP
-- ----------------------------------------------------------------------------
-- Obiettivo: in fondo alla scheda prodotto, suggerire articoli della STESSA
-- "licenza/entita" (Harry Potter -> altri Harry Potter, Napoli -> altri Napoli).
--
-- Il problema: la licenza NON e una colonna ne una categoria. Le categorie di
-- 3o livello sono macro-temi ("Film & Serie TV" mescola tutte le saghe, "Calcio"
-- tutte le squadre). L'entita vive solo nel `nome` (parole) e nel `codice`
-- (prefisso, es. HP=Harry Potter, NAP=Napoli), quest'ultimo ~99,9% valorizzato
-- ma di lunghezza irregolare (HP/JU corti, NAPSCRJ lungo).
--
-- La soluzione (recommender content-based, nativo Postgres, niente embedding):
-- un punteggio pesato per ogni candidato che combina piu segnali, con fallback
-- automatico dal piu specifico al piu generico:
--   * similarita trigram sul NOME "normalizzato" (tolte le parole-tappo tipo
--     Cappello/Ufficiale/donna: resta l'entita) -> segnale principale;   [pg_trgm]
--   * bonus se condivide il PREFISSO del codice (stessa entita di magazzino);
--   * bonus categoria: stessa foglia > stesso tipo (padre) > stesso genere (radice);
--   * micro-bonus vicinanza di prezzo.
-- Anti-monotonia: max 2 risultati per "nome normalizzato" (es. non 8 sciarpe
-- Napoli identiche). Soglia minima: si scartano i candidati troppo deboli.
--
-- SICUREZZA: SECURITY INVOKER (default) -> la RLS si applica col ruolo del
-- chiamante; un visitatore anonimo vede solo il catalogo attivo (dati pubblici,
-- gli stessi delle card di vetrina). Callabile da anon (gira nella PDP pubblica).
-- ============================================================================

create extension if not exists pg_trgm;

-- ----------------------------------------------------------------------------
-- norm_nome_prodotto: minuscolo, via punteggiatura, via le "parole-tappo" (tipi
-- di capo, qualificatori, genere) cosi resta l'entita distintiva:
--   "T-shirt Harry Potter donna"  -> "harry potter"
--   "Sciarpa Napoli Jacquard"     -> "napoli jacquard"
--   "Cappello Ufficiale FC Barcelona" -> "barcelona"
-- IMMUTABLE cosi e indicizzabile (gin_trgm_ops su espressione) se un domani il
-- catalogo cresce e serve il prefiltro con l'operatore `%`. La lista di stop e
-- volutamente semplice da estendere.
-- ----------------------------------------------------------------------------
create or replace function public.norm_nome_prodotto(p text)
returns text
language sql
immutable
parallel safe
as $norm$
  select trim(both ' ' from
    regexp_replace(                                   -- 5) collassa gli spazi
      regexp_replace(                                 -- 4) via lettere singole (f, c, s da f.c./s.s.c.)
        regexp_replace(                               -- 3) via numeri isolati (anni, taglie)
          regexp_replace(                             -- 2) via le parole-tappo
            ' ' || regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', ' ', 'g') || ' ',  -- 1) minuscolo + de-punteggiatura
            '\m(tshirt|shirt|maglia|maglietta|maglie|maglione|felpa|felpe|polo|camicia|cappello|cappellino|cappelli|berretto|berretti|visiera|trucker|pantaloni|pantalone|salopette|pallone|palloni|palla|completo|completi|kit|tuta|giacca|gilet|canotta|canottiera|shorts|bermuda|costume|sciarpa|sciarpe|borsa|zaino|calzini|guanti|portachiavi|tazza|poster|ufficiale|official|replica|home|away|third|logo|jersey|con|collo|coreano|coreana|da|di|del|dello|della|dei|delle|il|la|le|lo|gli|in|ed|kids|junior|baby|bimbo|bimba|donna|uomo|bambino|bambina|unisex|adulto|new|edition|calcio|ciclismo|fc|ac|as|ssc|cf|us|ssd)\M',
            ' ', 'g'
          ),
          '\m[0-9]+\M', ' ', 'g'
        ),
        '\m[a-z]\M', ' ', 'g'
      ),
      '\s+', ' ', 'g'
    )
  );
$norm$;

-- ----------------------------------------------------------------------------
-- prodotti_correlati: fino a p_limit prodotti correlati a quello con slug =
-- p_slug, ordinati per pertinenza (vedi il commento in testa per i segnali).
-- Ritorna gli stessi campi delle card di vetrina (CAMPI_CARD in vetrina.ts).
-- ----------------------------------------------------------------------------
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
      c.immagine_url, c.attivo, c.solo_online, c.categoria_id,
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

-- Funzioni pubbliche (dati del catalogo attivo, gia esposti nelle card).
grant execute on function public.norm_nome_prodotto(text)       to anon, authenticated;
grant execute on function public.prodotti_correlati(text, integer) to anon, authenticated;
