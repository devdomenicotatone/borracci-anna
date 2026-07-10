-- ============================================================================
-- Borracci Anna - Tema del prodotto (Fase 2 dei temi/franchise in vetrina)
-- ----------------------------------------------------------------------------
-- Finora il tema (saga/serie/brand: Harry Potter, Napoli, Metallica...) era
-- derivato a runtime dal NOME via dizionario TS (src/lib/franchise.ts): chip
-- e filtro passavano da OR di ilike sul nome. Limiti: falsi match da substring
-- (es. "inter" dentro "Winter"), conteggi che richiedono la scansione dei nomi
-- (e PostgREST tronca a 1000 righe senza errore), temi non assegnabili ai nomi
-- che il dizionario non riconosce.
--
-- Da questa migration il tema e una COLONNA (slug, es. 'harry-potter'):
--   - filtro vetrina: eq(tema) per un chip; per "Altro" il complemento dei
--     chip visibili (tema NULL + temi sotto soglia). I chip restano una
--     partizione esatta: la somma dei numeri e il totale della categoria;
--   - conteggi dei chip: RPC conta_temi_catalogo (group by lato DB, esatto);
--   - modificabile dal gestore nella scheda prodotto; i nuovi prodotti nascono
--     classificati dal dizionario (suggerimento nel form + flussi di import).
-- Il dizionario TS resta come classificatore in SCRITTURA e come fallback in
-- lettura finche questa migration non e applicata.
--
-- Migration idempotente e additiva: colonna + indice + backfill (tocca solo i
-- prodotti con tema NULL: ri-eseguibile, non sovrascrive il gestore) + RPC.
-- ============================================================================

alter table public.prodotti
  add column if not exists tema text;

-- Filtro vetrina per tema (eq / is null sul catalogo attivo).
create index if not exists idx_prodotti_tema on public.prodotti (tema);

-- ----------------------------------------------------------------------------
-- Backfill dal dizionario TS (src/lib/franchise.ts alla data della migration),
-- generato meccanicamente da quel file: stessi slug, stesse parole, stesso
-- ordine (vince il primo match, come franchiseDiNome) e stesso matching
-- substring case-insensitive.
-- ----------------------------------------------------------------------------
with classificati as (
  select p.id,
         case
           when p.nome ilike any (array['%harry potter%', '%hogwarts%', '%hermione%', '%voldemort%', '%grifondoro%', '%serpeverde%', '%corvonero%', '%tassorosso%', '%silente%', '%animali fantastici%', '%fantastic beasts%']) then 'harry-potter'
           when p.nome ilike any (array['%star wars%', '%guerre stellari%', '%darth vader%', '%yoda%', '%mandalorian%', '%grogu%', '%stormtrooper%', '%skywalker%', '%boba fett%', '%jedi%']) then 'star-wars'
           when p.nome ilike any (array['%marvel%', '%avengers%', '%spider-man%', '%spiderman%', '%iron man%', '%capitan america%', '%captain america%', '%deadpool%', '%wolverine%', '%venom%', '%hulk%', '%thor%', '%loki%', '%black panther%', '%punisher%']) then 'marvel'
           when p.nome ilike any (array['%batman%', '%superman%', '%joker%', '%wonder woman%', '%aquaman%', '%harley quinn%']) then 'dc'
           when p.nome ilike any (array['%stranger things%', '%demogorgon%', '%hellfire%', '%hawkins%']) then 'stranger-things'
           when p.nome ilike any (array['%squid game%']) then 'squid-game'
           when p.nome ilike any (array['%casa di carta%', '%money heist%']) then 'casa-di-carta'
           when p.nome ilike any (array['%rick and morty%', '%rick & morty%', '%rick e morty%', '%rick morty%']) then 'rick-morty'
           when p.nome ilike any (array['%simpson%']) then 'simpsons'
           when p.nome ilike any (array['%lupin%']) then 'lupin'
           when p.nome ilike any (array['%diabolik%']) then 'diabolik'
           when p.nome ilike any (array['%jurassic%']) then 'jurassic-park'
           when p.nome ilike any (array['%top gun%', '%maverick%']) then 'top-gun'
           when p.nome ilike any (array['%nightmare before christmas%', '%jack skellington%']) then 'nightmare-christmas'
           when p.nome ilike any (array['%witcher%', '%geralt%']) then 'witcher'
           when p.nome ilike any (array['%predator%']) then 'predator'
           when p.nome ilike any (array['%scooby%']) then 'scooby-doo'
           when p.nome ilike any (array['%one piece%', '%luffy%', '%rufy%', '%zoro%']) then 'one-piece'
           when p.nome ilike any (array['%naruto%', '%sasuke%', '%uzumaki%', '%akatsuki%']) then 'naruto'
           when p.nome ilike any (array['%holly benji%', '%holly e benji%', '%captain tsubasa%', '%tsubasa%']) then 'holly-benji'
           when p.nome ilike any (array['%attack on titan%', '%shingeki%', '%eren%', '%mikasa%']) then 'attack-on-titan'
           when p.nome ilike any (array['%bleach%', '%kurosaki%', '%soul reaper%', '%soulreaper%']) then 'bleach'
           when p.nome ilike any (array['%my hero academia%', '%boku no hero%', '%deku%']) then 'my-hero-academia'
           when p.nome ilike any (array['%death note%']) then 'death-note'
           when p.nome ilike any (array['%junji ito%']) then 'junji-ito'
           when p.nome ilike any (array['%sakamoto days%']) then 'sakamoto-days'
           when p.nome ilike any (array['%dragon ball%', '%goku%', '%vegeta%', '%saiyan%']) then 'dragon-ball'
           when p.nome ilike any (array['%demon slayer%', '%kimetsu%', '%tanjiro%', '%nezuko%']) then 'demon-slayer'
           when p.nome ilike any (array['%pokemon%', '%pokémon%', '%pikachu%']) then 'pokemon'
           when p.nome ilike any (array['%call of duty%', '%warzone%']) then 'call-of-duty'
           when p.nome ilike any (array['%assassin%']) then 'assassins-creed'
           when p.nome ilike any (array['%super mario%', '%mario bros%', '%nintendo%']) then 'super-mario'
           when p.nome ilike any (array['%among us%']) then 'among-us'
           when p.nome ilike any (array['%fortnite%']) then 'fortnite'
           when p.nome ilike any (array['%minecraft%']) then 'minecraft'
           when p.nome ilike any (array['%space invaders%']) then 'space-invaders'
           when p.nome ilike any (array['%zelda%', '%hyrule%']) then 'zelda'
           when p.nome ilike any (array['%sonic%']) then 'sonic'
           when p.nome ilike any (array['%pac-man%', '%pacman%']) then 'pac-man'
           when p.nome ilike any (array['%juventus%', '%juve%']) then 'juventus'
           when p.nome ilike any (array['%milan%']) then 'milan'
           when p.nome ilike any (array['%inter%']) then 'inter'
           when p.nome ilike any (array['%napoli%']) then 'napoli'
           when p.nome ilike any (array['%lazio%']) then 'lazio'
           when p.nome ilike any (array['%fiorentina%']) then 'fiorentina'
           when p.nome ilike any (array['%as roma%']) then 'roma'
           when p.nome ilike any (array['%real madrid%']) then 'real-madrid'
           when p.nome ilike any (array['%barcellona%', '%barcelona%']) then 'barcellona'
           when p.nome ilike any (array['%atletico madrid%', '%atletico%']) then 'atletico-madrid'
           when p.nome ilike any (array['%liverpool%']) then 'liverpool'
           when p.nome ilike any (array['%arsenal%']) then 'arsenal'
           when p.nome ilike any (array['%chelsea%']) then 'chelsea'
           when p.nome ilike any (array['%manchester city%', '%man city%']) then 'manchester-city'
           when p.nome ilike any (array['%manchester united%', '%man united%', '%man utd%']) then 'manchester-united'
           when p.nome ilike any (array['%bayern%']) then 'bayern'
           when p.nome ilike any (array['%paris saint%', '%psg%']) then 'psg'
           when p.nome ilike any (array['%maradona%']) then 'maradona'
           when p.nome ilike any (array['%ferrari%']) then 'ferrari'
           when p.nome ilike any (array['%mercedes amg%', '%mercedes%']) then 'mercedes'
           when p.nome ilike any (array['%red bull%']) then 'red-bull'
           when p.nome ilike any (array['%mclaren%']) then 'mclaren'
           when p.nome ilike any (array['%formula 1%', '%formula1%']) then 'formula-1'
           when p.nome ilike any (array['%motogp%', '%moto gp%']) then 'motogp'
           when p.nome ilike any (array['%valentino rossi%', '%vr46%']) then 'valentino-rossi'
           when p.nome ilike any (array['%iron maiden%']) then 'iron-maiden'
           when p.nome ilike any (array['%ac/dc%', '%ac dc%', '%acdc%']) then 'ac-dc'
           when p.nome ilike any (array['%metallica%']) then 'metallica'
           when p.nome ilike any (array['%linkin park%']) then 'linkin-park'
           when p.nome ilike any (array['%led zeppelin%']) then 'led-zeppelin'
           when p.nome ilike any (array['%black sabbath%']) then 'black-sabbath'
           when p.nome ilike any (array['%guns n%']) then 'guns-n-roses'
           when p.nome ilike any (array['%pink floyd%']) then 'pink-floyd'
           when p.nome ilike any (array['%foo fighters%']) then 'foo-fighters'
           when p.nome ilike any (array['%sex pistols%']) then 'sex-pistols'
           when p.nome ilike any (array['%nirvana%']) then 'nirvana'
           when p.nome ilike any (array['%queen%']) then 'queen'
           when p.nome ilike any (array['%beatles%']) then 'beatles'
           when p.nome ilike any (array['%rolling stones%']) then 'rolling-stones'
           when p.nome ilike any (array['%ramones%']) then 'ramones'
           when p.nome ilike any (array['%slipknot%']) then 'slipknot'
           when p.nome ilike any (array['%rammstein%']) then 'rammstein'
           when p.nome ilike any (array['%aerosmith%']) then 'aerosmith'
           when p.nome ilike any (array['%avenged sevenfold%']) then 'avenged-sevenfold'
           when p.nome ilike any (array['%bring me the horizon%']) then 'bring-me-horizon'
           when p.nome ilike any (array['%billie eilish%']) then 'billie-eilish'
         end as tema_dal_nome
  from public.prodotti p
  where p.tema is null
)
update public.prodotti p
set tema = c.tema_dal_nome
from classificati c
where p.id = c.id and c.tema_dal_nome is not null;

-- ----------------------------------------------------------------------------
-- conta_temi_catalogo: quanti prodotti ATTIVI per ogni tema (la riga con tema
-- NULL e i temi sotto soglia confluiscono nel chip "Altro", lato app),
-- opzionalmente ristretti a una lista di categorie (gia espansa ai
-- discendenti, vedi idConDiscendenti in vetrina.ts). Un group-by lato DB:
-- conteggi esatti qualunque sia la taglia del catalogo (la risposta ha ~una
-- riga per tema, mai vicina al tetto PostgREST).
-- SICUREZZA: SECURITY INVOKER (default) -> vale la RLS del chiamante; conta
-- solo il catalogo attivo, gli stessi dati delle card pubbliche.
-- ----------------------------------------------------------------------------
create or replace function public.conta_temi_catalogo(
  p_categoria_ids uuid[] default null
)
returns table (tema text, n bigint)
language sql
stable
as $$
  select p.tema, count(*)::bigint as n
  from public.prodotti p
  where p.attivo = true
    and (p_categoria_ids is null
         or cardinality(p_categoria_ids) = 0
         or p.categoria_id = any (p_categoria_ids))
  group by p.tema;
$$;

grant execute on function public.conta_temi_catalogo(uuid[]) to anon, authenticated;
