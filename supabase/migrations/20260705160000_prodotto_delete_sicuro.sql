-- Delete sicuro dei prodotti rispetto allo storico ordini, ATOMICO.
--
-- Un prodotto referenziato da ordine_righe (venduto) NON va hard-eliminato: la
-- FK ordine_righe.prodotto_id e ON DELETE SET NULL, quindi il delete azzererebbe
-- il legame con l'ordine (si perderebbero riga prodotto e foto; lo storico
-- sopravvive solo grazie agli snapshot denormalizzati in ordine_righe).
--
-- Le server action (eliminaProdottoAction / eliminaProdottiBulkAction) decidono
-- soft-vs-hard con un check applicativo su ordine_righe, ma tra il check e il
-- delete c'e una finestra TOCTOU: un ordine concorrente per quel prodotto puo
-- arrivare in mezzo (checkout webhook o inviaRichiestaAction) e il prodotto,
-- risultato "mai venduto" al check, verrebbe comunque hard-eliminato.
--
-- Questo trigger BEFORE DELETE chiude la race spostando la scelta DENTRO la
-- stessa operazione di delete: gli insert concorrenti su ordine_righe prendono
-- un lock FOR KEY SHARE sulla riga del prodotto (via FK) che serializza col
-- lock del delete, quindi l'EXISTS qui vede sempre lo stato coerente. Se il
-- prodotto risulta venduto lo nasconde (attivo=false) e ANNULLA il delete;
-- altrimenti lo lascia cancellare. E un backstop: le action continuano a fare
-- la stessa scelta best-effort (per i conteggi e il cleanup foto), ma la
-- GARANZIA di non cancellare un prodotto venduto e ora a livello DB.

create or replace function public.prodotto_nascondi_se_venduto()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if exists (
    select 1 from public.ordine_righe where prodotto_id = old.id
  ) then
    update public.prodotti set attivo = false where id = old.id;
    return null; -- annulla il DELETE: il prodotto resta, solo nascosto
  end if;
  return old; -- mai venduto: consenti il DELETE (cleanup foto lato app)
end;
$$;

drop trigger if exists trg_prodotto_nascondi_se_venduto on public.prodotti;
create trigger trg_prodotto_nascondi_se_venduto
  before delete on public.prodotti
  for each row execute function public.prodotto_nascondi_se_venduto();
