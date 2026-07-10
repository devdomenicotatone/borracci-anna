-- ============================================================================
-- Sync catalogo BLT — costo ingrosso + applicazione massiva delle giacenze
-- ----------------------------------------------------------------------------
-- Applica questo file A MANO nel SQL Editor di Supabase (come le altre migration).
-- Alimenta il cron giornaliero /api/cron/sync-catalogo che scarica il CSV del
-- fornitore e allinea giacenze e disponibilita.
-- ============================================================================

-- 1. Costo ingrosso (IVA esclusa) del fornitore, in CENTESIMI, per PRODOTTO.
--    Il CSV BLT riporta lo stesso prezzo su tutte le taglie di un articolo,
--    quindi il costo vive sul prodotto, non sulla variante. Serve a: (a) tenere
--    d'occhio i margini, (b) far scattare l'"avviso prezzo" quando il fornitore
--    ritocca il costo. Nullable: valorizzato dal primo sync.
alter table public.prodotti
  add column if not exists costo_cents integer
    check (costo_cents is null or costo_cents >= 0);

-- 2. (UNA TANTUM, quando sei pronto) Vendita diretta su tutto il catalogo:
--    togli "disponibile su richiesta" cosi lo stock delle varianti diventa
--    vincolante e il checkout con carta si abilita. Eseguilo DOPO il primo sync
--    reale (che popola le giacenze), verificato il risultato sul sito. Il sync
--    NON tocca questo flag: eventuali scelte manuali future restano tue.
--    Scommenta ed esegui:
-- update public.prodotti set disponibilita_su_richiesta = false;

-- 3. RPC di applicazione massiva chiamata dal cron (service role).
--    p_varianti : [{ "id": <uuid variante>, "stock": <int> }]
--    p_prodotti : [{ "id": <uuid prodotto>, "costo_cents": <int> }]
--    Un solo round-trip, transazionale: aggiorna le giacenze delle varianti e
--    il costo ingrosso dei prodotti toccati. NON cambia disponibilita_su_richiesta
--    (vedi punto 2): la modalita di vendita e una scelta esplicita, non del sync.
create or replace function public.applica_sync_catalogo(
  p_varianti jsonb,
  p_prodotti jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.varianti v
     set stock = d.stock
    from jsonb_to_recordset(coalesce(p_varianti, '[]'::jsonb)) as d(id uuid, stock integer)
   where v.id = d.id;

  update public.prodotti p
     set costo_cents = d.costo_cents
    from jsonb_to_recordset(coalesce(p_prodotti, '[]'::jsonb)) as d(id uuid, costo_cents integer)
   where p.id = d.id;
end;
$$;

-- La funzione la chiama SOLO il cron col service role (che bypassa la RLS):
-- niente esecuzione dal client pubblico.
revoke all on function public.applica_sync_catalogo(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.applica_sync_catalogo(jsonb, jsonb) to service_role;
