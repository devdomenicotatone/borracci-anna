-- ============================================================================
-- Borracci Anna — Esito dell'email di conferma ordine sul record (M11 audit
-- conformita legale 2026-07-14)
-- ----------------------------------------------------------------------------
-- L'email di conferma al cliente (art. 51 co. 7 Cod. Consumo: conferma del
-- contratto su supporto durevole) partiva best-effort dal webhook Stripe senza
-- lasciare traccia: impossibile provare l'adempimento per uno specifico ordine
-- o accorgersi di un mancato invio. Persistiamo l'esito sull'ordine:
--
--   email_conferma_inviata:
--     true  = SMTP ha accettato l'email di conferma;
--     false = invio tentato e fallito, oppure nessuna email cliente dalla
--             sessione Stripe (conferma non recapitabile: da gestire a mano);
--     null  = non applicabile/sconosciuto (ordini precedenti alla migration,
--             pagamenti segnati manualmente in negozio, ordini non pagati).
--   email_conferma_il: momento dell'invio riuscito (null se mai riuscito).
--
-- Scrive solo il webhook (service_role). Il gestore vede un badge sugli ordini
-- pagati con flag false. Migration additiva e idempotente: il codice degrada
-- in sicurezza se applicata dopo il deploy (scritture/letture in try-catch).
-- ============================================================================

alter table public.ordini
  add column if not exists email_conferma_inviata boolean,
  add column if not exists email_conferma_il timestamptz;

comment on column public.ordini.email_conferma_inviata is
  'Esito email di conferma ordine al cliente (art. 51 co. 7): true inviata, false fallita o non recapitabile, null non applicabile (M11).';
comment on column public.ordini.email_conferma_il is
  'Momento dell''invio riuscito dell''email di conferma ordine (null se mai riuscito).';
