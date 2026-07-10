-- ============================================================================
-- Borracci Anna - Ricerca semantica del catalogo (Fase 3 dei temi)
-- ----------------------------------------------------------------------------
-- La ricerca vetrina e letterale (token ilike su nome/descrizione, vedi
-- lib/vetrina): "felpa uomo ragno" o "maglia del mago" tornano vuoti anche se
-- il prodotto c'e. Da questa migration il catalogo ha anche un percorso
-- SEMANTICO: ogni prodotto ha l'embedding OpenAI (text-embedding-3-large,
-- 1536 dimensioni) del testo "nome. Tema: <etichetta>. descrizione" (vedi
-- src/lib/embedding-testo.ts), e la query dell'utente — embeddata a sua
-- volta — trova i prodotti piu vicini per significato con pgvector. L'app lo
-- usa come FALLBACK INTEGRATIVO: solo quando il letterale trova meno di 8
-- risultati (vedi lib/vetrina + lib/ricerca-semantica).
--
-- Scelte:
--   * tabella SEPARATA prodotto_embedding (1:1 con prodotti): un vettore 1536
--     serializzato pesa 12-19 KB e le scansioni a blocchi di vetrina/facette
--     leggono migliaia di righe prodotti — come colonna li gonfierebbe ogni
--     payload PostgREST con select larghi. Si joina solo nella RPC qui sotto.
--   * `testo` conserva il testo esattamente come embeddato: i flussi di
--     scrittura lo confrontano e saltano la chiamata OpenAI se invariato;
--     `modello` identifica modello+dimensioni (embedding di modelli diversi
--     non sono confrontabili: cambiare modello = ri-backfillare).
--   * indice HNSW coseno: a ~2k righe e quasi decorativo (il seq scan basta),
--     ma e lo standard pgvector e regge la crescita. 1536 dimensioni perche
--     HNSW sul tipo `vector` regge max 2000 (le 3072 native di -large non
--     sarebbero indicizzabili) e cosi small/large restano interscambiabili
--     senza toccare lo schema.
--   * scritture SOLO via service role (nessuna policy di insert/update):
--     hook nei flussi di salvataggio + script di backfill rieseguibile.
--
-- SICUREZZA: RPC SECURITY INVOKER (default) -> vale la RLS del chiamante; un
-- visitatore anonimo raggiunge solo gli embedding del catalogo attivo e la
-- funzione ritorna solo (id, distanza): le card complete le carica l'app coi
-- filtri e le policy di sempre.
--
-- Migration idempotente e additiva: ri-eseguibile senza danni.
-- ============================================================================

-- pgvector (tipo `vector`, operatori di distanza, indici HNSW). Schema
-- `extensions` come da convenzione Supabase (vedi pg_trgm dei correlati).
create extension if not exists vector with schema extensions;

-- ----------------------------------------------------------------------------
-- prodotto_embedding: l'embedding del testo di ricerca di ogni prodotto
-- (anche bozze: cosi la pubblicazione non deve aspettare nessun ricalcolo;
-- la RPC e la policy di lettura filtrano comunque sui soli attivi).
-- ----------------------------------------------------------------------------
create table if not exists public.prodotto_embedding (
  prodotto_id   uuid primary key references public.prodotti(id) on delete cascade,
  embedding     extensions.vector(1536) not null,
  -- Il testo esattamente come embeddato: se non cambia, niente nuova chiamata
  -- OpenAI (skip nei flussi di scrittura, vedi lib/embeddings).
  testo         text not null,
  -- Modello con le dimensioni (es. 'text-embedding-3-large@1536').
  modello       text not null,
  aggiornato_il timestamptz not null default now()
);

-- Vicini piu prossimi per distanza coseno (operatore <=>), parametri default.
create index if not exists idx_prodotto_embedding_hnsw
  on public.prodotto_embedding
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.prodotto_embedding enable row level security;

-- Lettura pubblica dei SOLI embedding di prodotti attivi (coerente con
-- prodotti_lettura_pubblica): serve alla RPC SECURITY INVOKER chiamata
-- dall'anon della vetrina. Le bozze restano invisibili. Niente policy di
-- scrittura: scrive solo il service role, che bypassa la RLS.
drop policy if exists "prodotto_embedding_lettura_pubblica" on public.prodotto_embedding;
create policy "prodotto_embedding_lettura_pubblica"
  on public.prodotto_embedding for select
  using (
    exists (
      select 1 from public.prodotti p
      where p.id = prodotto_id and p.attivo = true
    )
  );

-- ----------------------------------------------------------------------------
-- ricerca_semantica_catalogo: gli id dei prodotti ATTIVI piu vicini per
-- significato all'embedding della query, con la distanza coseno (0 = identico,
-- piu piccolo = piu vicino). Ritorna SOLO (id, distanza): le card complete le
-- carica l'app col costruttore esistente (stessi filtri di sempre: varianti,
-- prezzo, categoria, tema) via .in(id, ...) — cosi la semantica dei filtri
-- vive in un posto solo e l'embed prodotto_foto delle card resta standard.
--
-- p_max_distanza scarta i match troppo deboli (la taratura vera vive lato app,
-- vedi lib/ricerca-semantica); il LIMIT ha un tetto a 500: la risposta resta
-- lontana dal max-rows di PostgREST (1000, troncamento silenzioso).
-- ----------------------------------------------------------------------------
create or replace function public.ricerca_semantica_catalogo(
  p_embedding    extensions.vector(1536),
  p_limite       integer default 200,
  p_max_distanza real    default 0.9
)
returns table (id uuid, distanza real)
language sql
stable
-- search_path esplicito: l'operatore <=> di pgvector su Supabase vive nello
-- schema `extensions`; cosi la risoluzione dei nomi non dipende dal
-- search_path del chiamante (stessa ragione dei correlati con pg_trgm).
set search_path = public, extensions, pg_catalog
as $$
  select p.id,
         (e.embedding <=> p_embedding)::real as distanza
  from public.prodotto_embedding e
  join public.prodotti p on p.id = e.prodotto_id
  where p.attivo = true
    and (e.embedding <=> p_embedding) <= p_max_distanza
  order by e.embedding <=> p_embedding, p.id
  limit least(greatest(coalesce(p_limite, 200), 1), 500);
$$;

grant execute on function public.ricerca_semantica_catalogo(extensions.vector, integer, real) to anon, authenticated;
