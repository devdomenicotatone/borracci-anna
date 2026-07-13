-- ============================================================================
-- Borracci Anna — Carrelli riservati al service role (chiusura finding audit
-- 2026-07-13, superficie RLS)
-- ----------------------------------------------------------------------------
-- init_schema (20260622194500) definiva policy TOTALMENTE permissive:
--   carrelli_select      USING (true)
--   carrelli_insert      WITH CHECK (true)
--   carrello_righe_all   FOR ALL USING (true) WITH CHECK (true)
-- Con RLS attiva ma policy USING(true) e i grant di default intatti, il ruolo
-- `anon` (la ANON KEY e' PUBBLICA: viaggia nel bundle del browser) poteva, via
-- PostgREST diretto, senza mai conoscere alcun cart_id:
--   - elencare TUTTE le righe di TUTTI i carrelli (SELECT non filtrata);
--   - svuotare/alterare i carrelli altrui (DELETE/PATCH con filtro tautologico);
--   - creare carrelli/righe illimitati (INSERT WITH CHECK true) -> storage bloat.
-- Il filtro `.eq("carrello_id", cartId)` in src/lib/cart.ts e' APPLICATIVO, non
-- RLS: le chiamate dirette lo scavalcano. Nessuna PII in gioco (solo prodotto_id,
-- variante_id, quantita) -> impatto su INTEGRITA' e DISPONIBILITA', non
-- confidenzialita', ma reale.
--
-- Fix: si allineano `carrelli`/`carrello_righe` al modello gia' usato per
-- `ordini`/`ordine_righe` -> accessibili SOLO dal service role (che bypassa la
-- RLS). Tutte le operazioni carrello passano ora dall'admin client server-side
-- (src/lib/cart.ts, "use server"); la PROPRIETA' del carrello resta garantita
-- dal cookie httpOnly `cart_id` (uuid imprevedibile) filtrato dall'applicazione.
-- Unica eccezione: una policy SELECT per il gestore su carrello_righe, gemella di
-- `ordine_righe_lettura_gestore`, per il conteggio "righe di carrello svuotate"
-- mostrato al salvataggio varianti (applicaVarianti, src/lib/gestore/actions.ts).
--
-- Migration idempotente. NB DEPLOY: applicare DOPO che il codice che usa il
-- service role per il carrello e' in produzione (se applicata prima, il vecchio
-- codice anon perderebbe l'accesso e il carrello smetterebbe di funzionare).
-- ============================================================================

-- 1. Via le policy permissive di init_schema.
drop policy if exists "carrelli_insert"    on public.carrelli;
drop policy if exists "carrelli_select"    on public.carrelli;
drop policy if exists "carrello_righe_all" on public.carrello_righe;

-- 2. RLS resta ATTIVA (idempotente). Senza policy per anon/authenticated il
--    default e' DENY: solo il service role (bypass RLS) opera sulle due tabelle.
alter table public.carrelli       enable row level security;
alter table public.carrello_righe enable row level security;

-- 3. Policy SELECT per il gestore su carrello_righe (gemella di
--    ordine_righe_lettura_gestore, migration 20260622210000): serve al conteggio
--    delle righe di carrello svuotate da una CASCADE quando il gestore elimina
--    una variante (applicaVarianti). SOLO SELECT: nessuna scrittura da qui.
drop policy if exists "carrello_righe_lettura_gestore" on public.carrello_righe;
create policy "carrello_righe_lettura_gestore"
  on public.carrello_righe for select to authenticated
  using ( public.is_gestore() );

-- 4. Revoca i grant di default (difesa in profondita': impedisce che una futura
--    policy aggiunta per errore riapra il buco). `carrelli` non e' letta da
--    nessun ruolo non-service; su `carrello_righe` si conserva il solo SELECT ad
--    `authenticated`, richiesto perche' la policy gestore del punto 3 sia
--    raggiungibile (il GRANT e' valutato PRIMA della RLS). Il service role NON e'
--    toccato da questi revoke e mantiene pieno accesso.
revoke all on public.carrelli from anon, authenticated;
revoke insert, update, delete on public.carrello_righe from anon, authenticated;
revoke select on public.carrello_righe from anon;

-- 5. Cap anti-bloat sul numero di righe per carrello (difesa in profondita',
--    stesso pattern di limita_indirizzi/limita_preferiti). Ora che solo il
--    service role scrive, il bloat via anon e' gia' chiuso; questo tetto frena
--    comunque un eventuale runaway applicativo. 100 righe distinte sono ben oltre
--    qualunque carrello reale. SECURITY INVOKER: col service role il count vede
--    tutte le righe del carrello (RLS bypassata), che e' il perimetro giusto.
create or replace function public.limita_righe_carrello()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if (select count(*) from public.carrello_righe
       where carrello_id = new.carrello_id) >= 100 then
    raise exception 'Carrello troppo grande (max 100 articoli distinti).';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_limite_righe_carrello on public.carrello_righe;
create trigger trg_limite_righe_carrello
  before insert on public.carrello_righe
  for each row execute function public.limita_righe_carrello();
