-- ============================================================================
-- Borracci Anna — Foto delle bozze non piu enumerabili dallo storage pubblico
-- ----------------------------------------------------------------------------
-- Finding #3 (check 2026-07-10): la policy di lettura su storage.objects era
-- `using (bucket_id = 'prodotti')`, cioe' TRUE per anon+authenticated sull'intero
-- bucket. Su storage.objects la SELECT governa anche l'operazione LIST, quindi
-- chiunque con la anon key poteva ENUMERARE il bucket (list della root e delle
-- cartelle <prodottoId>/) e scoprire/scaricare le foto di prodotti ancora in
-- BOZZA (attivo=false) — merchandise non pubblicato. La RLS su prodotto_foto
-- nascondeva le righe del DB ma non i file nello storage.
--
-- Ora la lettura/enumerazione via API e' consentita solo:
--   - al gestore (is_gestore): vede tutto, incluse le bozze e la cartella di un
--     prodotto appena eliminato (cleanup file dopo la DELETE in eliminaProdotto*);
--   - a chiunque, ma SOLO per gli oggetti di un prodotto ATTIVO (pubblicato).
-- La cartella e' l'uuid del prodotto: <prodottoId>/<file>.
--
-- NOTA (residuo accettato): il bucket resta public=true, quindi un file di cui si
-- conosce GIA' il path esatto (/object/public/prodotti/<uuid>/<file>) resta
-- scaricabile anche senza RLS. Ma i path delle bozze non sono esposti da nessuna
-- parte (righe prodotto_foto nascoste, prodotto non in vetrina) e ora non sono
-- piu scopribili col LIST: la via di enumerazione e chiusa. Un lockdown totale
-- richiederebbe bucket privato + signed URL ovunque, con perdita di caching CDN
-- sulle foto pubbliche (sproporzionato per foto di merchandise non pubblicato).
-- ============================================================================

drop policy if exists "prodotti_storage_lettura_pubblica" on storage.objects;
create policy "prodotti_storage_lettura_pubblica"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'prodotti'
    and (
      public.is_gestore()
      or exists (
        select 1 from public.prodotti p
        where p.id::text = (storage.foldername(name))[1]
          and p.attivo = true
      )
    )
  );
