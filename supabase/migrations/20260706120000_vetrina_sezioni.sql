-- ============================================================================
-- Borracci Anna - Vetrina curata: sezioni della home configurabili dal gestore.
-- ----------------------------------------------------------------------------
-- La home smette di essere un muro unico di prodotti (tutto il catalogo per
-- data) e diventa una sequenza di SEZIONI ("fasce") ordinabili: hero, banner,
-- scorciatoie categoria, caroselli di prodotti scelti a mano (pivot) o per
-- regola (novita / una categoria / solo online).
--
-- Migration idempotente e additiva: crea due tabelle, le loro policy RLS e un
-- seed che replica la home attuale (hero + categorie + novita), cosi al deploy
-- la vetrina non si svuota. Non modifica ne rimuove oggetti esistenti.
-- ============================================================================

-- 1. SEZIONI DELLA VETRINA ---------------------------------------------------
-- `config` (jsonb) porta i parametri specifici del tipo:
--   hero            { occhiello, ctaPrimariaLabel, ctaPrimariaHref,
--                     ctaSecondariaLabel, ctaSecondariaHref,
--                     stickerAlto, stickerBasso, immagineUrl }
--   banner          { testo, ctaLabel, ctaHref, immagineUrl, tono }
--   categorie       { occhiello }
--   prodotti_manuale{ occhiello, limite? }            -- prodotti dalla pivot
--   prodotti_auto   { occhiello, regola, categoriaId?, limite }
--                     regola in ('novita','categoria','solo_online')
create table if not exists public.vetrina_sezioni (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null
                check (tipo in ('hero','banner','categorie',
                                'prodotti_manuale','prodotti_auto')),
  titolo      text,
  sottotitolo text,
  ordine      integer not null default 0,
  visibile    boolean not null default true,
  config      jsonb   not null default '{}'::jsonb,
  creato_il   timestamptz not null default now()
);
comment on table public.vetrina_sezioni is
  'Fasce ordinabili della home, curate dal gestore. `config` jsonb per tipo.';

-- 2. PIVOT: prodotti scelti a mano di una sezione (tipo prodotti_manuale) -----
-- ordine = posizione nel carosello. Un prodotto eliminato/una sezione eliminata
-- portano via le righe (cascade). Un prodotto puo stare in piu sezioni.
create table if not exists public.vetrina_sezione_prodotti (
  id          uuid primary key default gen_random_uuid(),
  sezione_id  uuid not null references public.vetrina_sezioni (id) on delete cascade,
  prodotto_id uuid not null references public.prodotti (id)        on delete cascade,
  ordine      integer not null default 0,
  creato_il   timestamptz not null default now(),
  unique (sezione_id, prodotto_id)
);
create index if not exists idx_vsp_sezione
  on public.vetrina_sezione_prodotti (sezione_id, ordine);

-- 3. RLS ---------------------------------------------------------------------
-- Lettura pubblica SOLO delle sezioni visibili (le SELECT permissive si
-- combinano in OR: il gestore autenticato aggiunge la vista completa). Le
-- mutazioni sono riservate al gestore, come per il resto del catalogo.
alter table public.vetrina_sezioni enable row level security;

drop policy if exists "vetrina_sezioni_lettura_pubblica" on public.vetrina_sezioni;
create policy "vetrina_sezioni_lettura_pubblica"
  on public.vetrina_sezioni for select to anon, authenticated
  using ( visibile = true );

drop policy if exists "vetrina_sezioni_lettura_gestore" on public.vetrina_sezioni;
create policy "vetrina_sezioni_lettura_gestore"
  on public.vetrina_sezioni for select to authenticated
  using ( public.is_gestore() );

drop policy if exists "vetrina_sezioni_insert_gestore" on public.vetrina_sezioni;
create policy "vetrina_sezioni_insert_gestore"
  on public.vetrina_sezioni for insert to authenticated
  with check ( public.is_gestore() );

drop policy if exists "vetrina_sezioni_update_gestore" on public.vetrina_sezioni;
create policy "vetrina_sezioni_update_gestore"
  on public.vetrina_sezioni for update to authenticated
  using ( public.is_gestore() ) with check ( public.is_gestore() );

drop policy if exists "vetrina_sezioni_delete_gestore" on public.vetrina_sezioni;
create policy "vetrina_sezioni_delete_gestore"
  on public.vetrina_sezioni for delete to authenticated
  using ( public.is_gestore() );

alter table public.vetrina_sezione_prodotti enable row level security;

-- Lettura pubblica dei prodotti pinnati SE la loro sezione e visibile (il
-- prodotto in se resta soggetto alla propria RLS attivo=true).
drop policy if exists "vsp_lettura_pubblica" on public.vetrina_sezione_prodotti;
create policy "vsp_lettura_pubblica"
  on public.vetrina_sezione_prodotti for select to anon, authenticated
  using ( exists (
    select 1 from public.vetrina_sezioni s
    where s.id = sezione_id and s.visibile
  ) );

drop policy if exists "vsp_lettura_gestore" on public.vetrina_sezione_prodotti;
create policy "vsp_lettura_gestore"
  on public.vetrina_sezione_prodotti for select to authenticated
  using ( public.is_gestore() );

drop policy if exists "vsp_insert_gestore" on public.vetrina_sezione_prodotti;
create policy "vsp_insert_gestore"
  on public.vetrina_sezione_prodotti for insert to authenticated
  with check ( public.is_gestore() );

drop policy if exists "vsp_update_gestore" on public.vetrina_sezione_prodotti;
create policy "vsp_update_gestore"
  on public.vetrina_sezione_prodotti for update to authenticated
  using ( public.is_gestore() ) with check ( public.is_gestore() );

drop policy if exists "vsp_delete_gestore" on public.vetrina_sezione_prodotti;
create policy "vsp_delete_gestore"
  on public.vetrina_sezione_prodotti for delete to authenticated
  using ( public.is_gestore() );

-- 4. SEED: replica la home attuale (solo se non ci sono ancora sezioni) -------
-- Hero + scorciatoie categoria + fascia "La collezione" (novita). Idempotente:
-- se esistono gia sezioni (rerun, o il gestore ne ha create) non tocca nulla.
do $$
begin
  if not exists (select 1 from public.vetrina_sezioni) then
    insert into public.vetrina_sezioni (tipo, titolo, sottotitolo, ordine, config) values
      (
        'hero',
        'L''estate si veste da Anna Shop.',
        'Capi freschi e leggeri, scelti uno a uno. Vieni a trovarci sul lungomare o te li spediamo a casa.',
        0,
        jsonb_build_object(
          'occhiello', 'Negozio sul lungomare di Rimini',
          'ctaPrimariaLabel', 'Scopri la collezione',
          'ctaPrimariaHref', '/prodotti',
          'ctaSecondariaLabel', 'Vieni a trovarci',
          'ctaSecondariaHref', '/vieni-a-trovarci',
          'stickerAlto', 'Estate 2026',
          'stickerBasso', '☀ Rimini beach'
        )
      ),
      (
        'categorie',
        'Compra per categoria',
        null,
        1,
        jsonb_build_object('occhiello', 'Trova il tuo stile')
      ),
      (
        'prodotti_auto',
        'La collezione',
        null,
        2,
        jsonb_build_object('occhiello', 'Fresche di stagione', 'regola', 'novita', 'limite', 12)
      );
  end if;
end $$;
