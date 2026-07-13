-- ============================================================================
-- Borracci Anna — Rate limit per-IP DB-backed generico (chiusura finding audit
-- 2026-07-13: M2 ricerca semantica, B1 /api/checkout, B2 invio richiesta)
-- ----------------------------------------------------------------------------
-- Tabella finestrata condivisa tra le istanze serverless, sullo stesso pattern
-- di `auth_richieste` (migration 20260711170000) ma generica: la `azione`
-- distingue i bucket ('checkout', 'ricerca_semantica', 'richiesta_ordine') e la
-- `chiave` e' di norma l'IP client. Accessibile SOLO dal service role (usata da
-- src/lib/rate-limit-ip.ts via admin client).
--
-- Migration idempotente. Il codice che la usa FAIL-OPEN se la tabella non
-- esiste (consentiPerIp degrada a "consenti"), quindi l'ordine di deploy e'
-- flessibile: applicarla prima o dopo il codice non rompe nulla, semplicemente
-- il rate limit entra in vigore quando entrambi sono presenti.
-- ============================================================================

create table if not exists public.rate_limit_eventi (
  id        uuid primary key default gen_random_uuid(),
  azione    text not null,   -- bucket: 'checkout' | 'ricerca_semantica' | 'richiesta_ordine'
  chiave    text not null,   -- di norma l'IP client (x-real-ip / x-forwarded-for)
  creato_il timestamptz not null default now()
);
comment on table public.rate_limit_eventi is
  'Log finestrato per il rate limit per-IP DB-backed (checkout, ricerca semantica, invio richiesta). Solo service role.';

-- RLS attiva con ZERO policy: accesso esclusivo al service role (come auth_richieste).
alter table public.rate_limit_eventi enable row level security;

-- Conteggio nella finestra: filtro per (azione, chiave) su un intervallo di tempo.
create index if not exists idx_rate_limit_azione_chiave
  on public.rate_limit_eventi (azione, chiave, creato_il desc);
-- Pulizia periodica delle righe scadute.
create index if not exists idx_rate_limit_creato
  on public.rate_limit_eventi (creato_il);
