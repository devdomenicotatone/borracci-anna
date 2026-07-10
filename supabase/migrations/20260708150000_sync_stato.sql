-- ============================================================================
-- Borracci Anna — Esito dell'ultimo sync giacenze visibile al gestore
-- ----------------------------------------------------------------------------
-- Finora il report del cron sync (giacenze BLT) finiva solo nella risposta HTTP
-- al cron: la titolare non aveva modo di sapere se il sync giornaliero fosse
-- andato a buon fine, quanti articoli avesse acceso/spento o se ci fossero
-- avvisi di prezzo. Persistiamo l'ultimo esito (una sola riga) e lo mostriamo in
-- un banner nella pagina prodotti del gestore.
--
-- Scrittura: solo il cron (service_role, che bypassa la RLS). Lettura: il
-- gestore autenticato. Nessuna PII, solo conteggi/aggregati del catalogo.
-- ============================================================================

create table if not exists public.sync_stato (
  id          text primary key,
  eseguito_il timestamptz not null default now(),
  ok          boolean     not null,
  report      jsonb
);

alter table public.sync_stato enable row level security;

-- Lettura riservata al gestore (il service_role del cron bypassa comunque la RLS).
drop policy if exists sync_stato_lettura_gestore on public.sync_stato;
create policy sync_stato_lettura_gestore on public.sync_stato
  for select using (public.is_gestore());

grant select on public.sync_stato to authenticated;
