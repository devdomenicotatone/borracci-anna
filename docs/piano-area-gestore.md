# Piano di Implementazione — Area Gestore byFrody (PIANO FINALE)

> Tech-lead spec definitiva, verificata contro **Next 16.2.9 reale** (`node_modules/next/dist/docs/`), **schema RLS esistente** (`supabase/schema.sql`) e i **componenti reali** del progetto. Dove la verifica contraddiceva un'assunzione comune, **vince la verifica**. Le correzioni dei tre revisori (Next16-API, Sicurezza-RLS, Completezza/UX) sono integrate; priorità assoluta a **API Next 16** e **sicurezza RLS/Storage**.

**Fatti verificati in questa sessione (load-bearing):**
- `src/app/layout.tsx` **esiste** ed emette `<html lang="it"><body><Header/><main>` con font Geist + `metadata`. → Decide la strategia layout (vedi §1, non è più un'incognita).
- `src/lib/supabase/server.ts` esporta `createServerSupabase()` (async, ritorna `null` senza env; `setAll` in try/catch → refresh delegato al proxy).
- `src/lib/format.ts` ha **solo** `formatPrezzo` → manca l'inverso euro→cents.
- `next.config.ts` vuoto.
- Schema: `ordini`/`ordine_righe` **senza alcuna policy** per anon/authenticated (commento esplicito righe 150-152); `carrello_righe.variante_id … on delete cascade` (riga 57); `ordine_righe.prodotto_id … on delete set null` (riga 83); `varianti.sku` **UNIQUE globale NOT NULL** (riga 39); `prodotti.creato_il` esiste (riga 28).
- Componenti reali: `AddToCart.tsx`/`CartItem.tsx` usano **scala zinc raw + dark mode**; `Header.tsx`/`ProductCard.tsx` usano i **token brand**. `ProductCard` usa placeholder `bg-[repeating-linear-gradient(...)]` con `aspect-[4/5]`.
- Doc Next 16 confermati: `proxy.md` (middleware deprecato→`proxy`, runtime Node default, `runtime` config vietato); `layout.md` r.142-144 (multiple root layout = nessun `layout.js` sopra); `route-groups.md` r.32 (home dentro un gruppo se niente top-level); `route-segment-config/index.md` r.19 (`dynamic` rimosso solo con Cache Components abilitato); `revalidatePath.md` r.26/146-148 (`'page'` obbligatorio su segmento dinamico; forma con gruppo supportata).

## Decisione di naming (vincolante)

Route in italiano, coerenti con `prodotti/`, `carrello/`, `checkout/`: **`/gestore`**. Route group `(gestore)`.

---

## 1) Sintesi architetturale

**Incastro con la vetrina.** La vetrina pubblica (`/`, `/prodotti/[slug]`, `/carrello`, `/checkout/*`) resta funzionalmente intatta. L'area gestore è isolata in un route group `(gestore)` montato su `/gestore/*`. Riusa `createServerSupabase`, i token Tailwind v4, `formatPrezzo`, il pattern Server-Action-da-Client-Component (`useActionState`/`useTransition`). Nessuna modifica alle policy RLS pubbliche, alle Server Actions del carrello, al webhook Stripe.

**Strategia layout — DECISIONE VINCOLANTE: Strategia B (root layout minimale + layout di gruppo nidificati).** *Motivo:* `src/app/layout.tsx` **esiste già** ed emette `<html><body>`. Non è un'incognita "da verificare in build". I doc sono espliciti (`layout.md` r.142: *"Any layout without a layout.js above it is a root layout"*): **un secondo `<html>/<body>` in un layout di gruppo, con il top-level ancora presente, produce HTML annidato invalido**. Quindi:

- `src/app/layout.tsx` diventa **root minimale**: solo `<html lang="it" className={font…}><body>{children}</body></html>` + font Geist + `metadata` globale. **Niente `<Header/>`, niente `<main>`.**
- `<Header/>` + `<main>` si spostano in **`(vetrina)/layout.tsx`** (layout figlio, **senza** `<html>/<body>`).
- `(gestore)/layout.tsx` è un **layout figlio** (shell admin, **senza** `<html>/<body>`).

Questa scelta **non richiede di spostare le pagine vetrina** (restano sotto `src/app/` o vengono raggruppate sotto `(vetrina)/` solo per pulizia — opzionale). È meno invasiva della Strategia A (root layout multipli, che obbligherebbe a `[ELIMINA] src/app/layout.tsx` + spostamento di tutte le pagine vetrina dentro `(vetrina)/`). Strategia A resta tecnicamente valida ma **non adottata**.

> *Conseguenza:* navigazione vetrina↔gestore = client navigation (stesso root layout), niente full reload. Accettabile.

**Perché RLS + sessione e NON service-role.** Il service-role (`createAdminSupabase`) **bypassa la RLS**: un check di sessione dimenticato in una action = accesso totale al DB (inclusi `ordini`/clienti) e la chiave girerebbe in codice raggiungibile da utenti loggati. Con **anon key + sessione + RLS** la sicurezza è enforced **dentro Postgres** (`is_gestore()`): anche con un bug applicativo è il DB a rifiutare. Service-role **confinato al webhook Stripe**.

**Proxy vs barriera (Next 16).** `middleware.ts` è **deprecato e rinominato `proxy.ts`** (`proxy.md` r.11, version history `v16.0.0`). Con `src/` → **`src/proxy.ts`**, export `proxy(request: NextRequest)`. Runtime **Node.js di default** (supabase-js OK); `export const runtime` **vietato** (lancia errore — `proxy.md` r.223). Il proxy fa **solo refresh sessione + redirect ottimistico + header noindex**; **non è la barriera di autorizzazione** (le Server Actions sono raggiungibili via POST diretto). **Il confine vero = RLS `is_gestore()` + `verifySession()` in ogni action.**

---

## 2) Albero file da creare/modificare

```
byfrody/
├── next.config.ts                                    [MODIFICA] images.remotePatterns + qualities
├── src/
│   ├── app/
│   │   ├── layout.tsx                                 [MODIFICA] → root MINIMALE: <html><body>{children}</body>
│   │   │                                                          + font Geist + metadata globale.
│   │   │                                                          RIMUOVERE <Header/> e <main> (spostati in (vetrina)).
│   │   ├── globals.css                                [INVARIATO]
│   │   ├── robots.ts                                  [CREA opz.] Disallow: /gestore
│   │   │
│   │   ├── (vetrina)/                                 [CREA gruppo]
│   │   │   └── layout.tsx                             [CREA] layout figlio: <Header/> + <main className="flex-1">{children}</main>
│   │   │   # Le pagine vetrina (page.tsx, prodotti/, carrello/, checkout/) possono
│   │   │   # restare in src/app/ OPPURE essere spostate qui sotto per pulizia (opzionale,
│   │   │   # non necessario con Strategia B). api/ resta in src/app/api/.
│   │   │
│   │   └── (gestore)/
│   │       ├── layout.tsx                             [CREA] layout figlio (NO <html>/<body>): shell minima + metadata noindex
│   │       └── gestore/
│   │           ├── login/page.tsx                     [CREA] Server page + <FormLogin/> (fuori dalla shell autenticata)
│   │           └── (app)/                             [CREA] sotto-group area autenticata
│   │               ├── layout.tsx                     [CREA] AdminShell: requireGestore() + <AdminNav/> + <Toaster/>
│   │               ├── page.tsx                       [CREA] redirect → /gestore/prodotti
│   │               └── prodotti/
│   │                   ├── page.tsx                   [CREA] LISTA (server query, order+limit)
│   │                   ├── nuovo/page.tsx             [CREA] form create
│   │                   └── [id]/page.tsx              [CREA] form edit (params: Promise)
│   │
│   ├── proxy.ts                                       [CREA] refresh sessione + gating /gestore + X-Robots-Tag
│   │
│   ├── components/gestore/                            [CREA]
│   │   ├── AdminNav.tsx                               header sticky + bottom-nav + sidebar md + sheet profilo
│   │   ├── ListaProdotti.tsx                          ricerca + filtro stato + badge stock
│   │   ├── ToggleAttivo.tsx                           switch optimistic con revert su errore
│   │   ├── FormProdotto.tsx                           create/edit, slug-auto, prezzo, dirty-tracking
│   │   ├── EditorVarianti.tsx                         righe variante + SKU + stock + empty state
│   │   ├── UploaderFoto.tsx                           camera/galleria + compressione OBBLIGATORIA + upload
│   │   ├── FormLogin.tsx                              useActionState(loginGestore)
│   │   ├── Toaster.tsx                                context + toast (aria-live)
│   │   ├── ConfermaDialog.tsx                         <dialog> conferma distruttiva (delete + rimozione foto)
│   │   └── SaveBar.tsx                                sticky save-bar mobile (safe-area)
│   │
│   ├── lib/
│   │   ├── format.ts                                  [MODIFICA] aggiungi parsePrezzoCents() robusto
│   │   ├── types.ts                                   [MODIFICA] aggiungi tipo Profilo + VarianteInput
│   │   ├── supabase/server.ts                         [INVARIATO]
│   │   └── gestore/
│   │       ├── auth.ts                                [CREA] DAL: verifySession(), requireGestore()
│   │       ├── actions.ts                             [CREA] Server Actions catalogo
│   │       ├── auth-actions.ts                        [CREA] loginGestore, logoutGestore
│   │       └── slug.ts                                [CREA] slugify() + suffissi incrementali
│   │
├── supabase/
│   ├── schema.sql                                     [MODIFICA] appendi snapshot dei nuovi oggetti (idempotente)
│   └── migrations/
│       └── 20260622210000_area_gestore.sql           [CREA] migration idempotente (§3) — timestamp ODIERNO
└── .env.example                                       [INVARIATO] nessuna nuova env
```

> Il sotto-group `(app)` tiene `login/` **fuori** dalla shell autenticata: la login non monta `AdminShell` né chiama `requireGestore()`. URL finali: `/gestore/login`, `/gestore/prodotti`, ecc.

---

## 3) DB — migration SQL completa e idempotente

File: **`supabase/migrations/20260622210000_area_gestore.sql`** (timestamp coerente con **oggi 2026-06-22**, dopo l'init `20260622194500`). Stile coerente con l'init (`create … if not exists`, `drop policy if exists` prima di `create policy`, commenti IT). **Non modifica né rimuove** policy esistenti: aggiunge solo policy permissive (combinate in OR sulle SELECT) e nuovi oggetti.

**Correzioni di sicurezza integrate rispetto alla bozza:**
- **[CRITICA]** policy SELECT su `ordine_righe` per il gestore → la count "mai venduto" funziona davvero (altrimenti hard-delete sempre, storico ordini perso).
- **[MEDIA]** ruolo letto da **`raw_app_meta_data`** (impostabile solo via Admin API/service-role), **non** `raw_user_meta_data` (auto-assegnabile dall'utente in signup) → no privilege escalation a gestore.
- **[BASSA]** `set search_path = ''` anche su `tocca_aggiornato_il()`.

```sql
-- ============================================================================
-- by Frody - Area Gestore (auth + RLS scrittura catalogo + storage foto)
-- Migration idempotente. NON tocca le policy pubbliche esistenti.
-- ============================================================================

-- 0. BUCKET STORAGE 'prodotti' (pubblico in lettura) -------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'prodotti', 'prodotti', true,
  5242880,                                  -- 5 MB/file
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 1. TABELLA PROFILI ---------------------------------------------------------
create table if not exists public.profili (
  id            uuid primary key references auth.users (id) on delete cascade,
  ruolo         text not null default 'gestore'
                  check (ruolo in ('gestore', 'staff')),
  nome          text,
  creato_il     timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);
comment on table public.profili is
  'Utenti abilitati all''area gestore. Presenza riga + ruolo valido = permessi scrittura.';
alter table public.profili enable row level security;

-- 2. FUNZIONE is_gestore() -- SECURITY DEFINER per evitare ricorsione RLS -----
create or replace function public.is_gestore()
  returns boolean
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select exists (
    select 1 from public.profili p
    where p.id = (select auth.uid())
  );
$$;
comment on function public.is_gestore() is
  'TRUE se auth.uid() ha una riga in public.profili. SECURITY DEFINER: niente ricorsione RLS.';
revoke all on function public.is_gestore() from public;
grant execute on function public.is_gestore() to anon, authenticated;

-- 3. RLS PROFILI: il gestore legge solo il proprio profilo -------------------
drop policy if exists "profili_select_proprio" on public.profili;
create policy "profili_select_proprio"
  on public.profili for select to authenticated
  using ( id = (select auth.uid()) );

-- 4. AUTO-PROVISIONING profilo da raw_app_meta_data.ruolo --------------------
-- SICUREZZA: si legge da raw_APP_meta_data (impostabile SOLO via Admin API /
-- service-role), NON da raw_user_meta_data (auto-assegnabile dall'utente in
-- signup). Cosi anche con signup pubbliche attive nessuno puo farsi 'gestore'.
create or replace function public.handle_new_user()
  returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (new.raw_app_meta_data ->> 'ruolo') in ('gestore', 'staff') then
    insert into public.profili (id, ruolo, nome)
    values (
      new.id,
      new.raw_app_meta_data ->> 'ruolo',
      coalesce(new.raw_app_meta_data ->> 'nome', new.raw_user_meta_data ->> 'nome')
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at su profili (hardened: search_path fisso)
create or replace function public.tocca_aggiornato_il()
  returns trigger language plpgsql
  set search_path = ''
as $$ begin new.aggiornato_il := now(); return new; end; $$;
drop trigger if exists trg_profili_aggiornato on public.profili;
create trigger trg_profili_aggiornato
  before update on public.profili
  for each row execute function public.tocca_aggiornato_il();

-- 5. RLS PRODOTTI: lettura gestore (anche attivo=false) + scrittura ----------
-- Le SELECT permissive si combinano in OR: (attivo=true) OR is_gestore().
alter table public.prodotti enable row level security;  -- idempotente

drop policy if exists "prodotti_lettura_gestore" on public.prodotti;
create policy "prodotti_lettura_gestore"
  on public.prodotti for select to authenticated
  using ( public.is_gestore() );

drop policy if exists "prodotti_insert_gestore" on public.prodotti;
create policy "prodotti_insert_gestore"
  on public.prodotti for insert to authenticated
  with check ( public.is_gestore() );

drop policy if exists "prodotti_update_gestore" on public.prodotti;
create policy "prodotti_update_gestore"
  on public.prodotti for update to authenticated
  using ( public.is_gestore() ) with check ( public.is_gestore() );

drop policy if exists "prodotti_delete_gestore" on public.prodotti;
create policy "prodotti_delete_gestore"
  on public.prodotti for delete to authenticated
  using ( public.is_gestore() );

-- 6. RLS VARIANTI: stessa logica --------------------------------------------
alter table public.varianti enable row level security;  -- idempotente

drop policy if exists "varianti_lettura_gestore" on public.varianti;
create policy "varianti_lettura_gestore"
  on public.varianti for select to authenticated
  using ( public.is_gestore() );

drop policy if exists "varianti_insert_gestore" on public.varianti;
create policy "varianti_insert_gestore"
  on public.varianti for insert to authenticated
  with check ( public.is_gestore() );

drop policy if exists "varianti_update_gestore" on public.varianti;
create policy "varianti_update_gestore"
  on public.varianti for update to authenticated
  using ( public.is_gestore() ) with check ( public.is_gestore() );

drop policy if exists "varianti_delete_gestore" on public.varianti;
create policy "varianti_delete_gestore"
  on public.varianti for delete to authenticated
  using ( public.is_gestore() );

-- 7. RLS ORDINE_RIGHE: SELECT per il gestore (serve al check "mai venduto") ---
-- CRITICA: senza questa policy, con RLS attiva la count su ordine_righe dal
-- client anon+sessione restituisce SEMPRE 0 -> eliminaProdottoAction farebbe
-- sempre hard-delete e ON DELETE SET NULL spezzerebbe lo storico ordini.
-- SOLO SELECT (no insert/update/delete: restano riservate al service-role).
drop policy if exists "ordine_righe_lettura_gestore" on public.ordine_righe;
create policy "ordine_righe_lettura_gestore"
  on public.ordine_righe for select to authenticated
  using ( public.is_gestore() );

-- (Opzionale, per una futura schermata Ordini in sola lettura:)
-- drop policy if exists "ordini_lettura_gestore" on public.ordini;
-- create policy "ordini_lettura_gestore"
--   on public.ordini for select to authenticated
--   using ( public.is_gestore() );

-- 8. STORAGE: policy su storage.objects bucket 'prodotti' --------------------
drop policy if exists "prodotti_storage_lettura_pubblica" on storage.objects;
create policy "prodotti_storage_lettura_pubblica"
  on storage.objects for select to anon, authenticated
  using ( bucket_id = 'prodotti' );

drop policy if exists "prodotti_storage_insert_gestore" on storage.objects;
create policy "prodotti_storage_insert_gestore"
  on storage.objects for insert to authenticated
  with check ( bucket_id = 'prodotti' and public.is_gestore() );

drop policy if exists "prodotti_storage_update_gestore" on storage.objects;
create policy "prodotti_storage_update_gestore"
  on storage.objects for update to authenticated
  using ( bucket_id = 'prodotti' and public.is_gestore() )
  with check ( bucket_id = 'prodotti' and public.is_gestore() );

drop policy if exists "prodotti_storage_delete_gestore" on storage.objects;
create policy "prodotti_storage_delete_gestore"
  on storage.objects for delete to authenticated
  using ( bucket_id = 'prodotti' and public.is_gestore() );
```

**Note di progettazione critiche:**
- `is_gestore()` è `SECURITY DEFINER` + `set search_path = ''` + `STABLE` → niente ricorsione RLS, niente schema-hijacking. La policy `profili` usa `id = auth.uid()` diretto (difesa in profondità).
- Le SELECT pubbliche restano: il gestore vede i non-attivi grazie all'**OR** tra policy permissive. **Mai** policy `RESTRICTIVE` (combinano in AND → romperebbero il pubblico).
- **Storage single-tenant (MEDIA — accettato e documentato):** le policy storage autorizzano qualunque gestore a scrivere/cancellare in qualunque cartella `prodottoId/...` del bucket, e la public-read espone **tutti** gli oggetti del bucket (anche orfani). Per un admin single-tenant è accettabile; mitigazione = cleanup orfani (§6/§8) e naming non indovinabile. Irrigidimento futuro: vincolare il primo segmento del path a un uuid di `prodotti` esistente, o upload solo via service-role server-side.
- `schema.sql` va aggiornato **appendendo** gli stessi blocchi (snapshot completo), **senza** modificare la migration init; verificare che applicare `schema.sql` da zero produca lo stesso stato delle due migration in sequenza.

---

## 4) Auth & protezione

### `src/proxy.ts` (Next 16 — file e funzione `proxy`, runtime Node.js)

Refresh sessione + gating ottimistico + **header `X-Robots-Tag: noindex` su `/gestore`**. `getUser()` rinfresca il token e fa scattare `setAll`; **nessun codice tra `createServerClient` e `getUser()`**.

**Correzioni integrate:** (a) `X-Robots-Tag` per noindex anche su risposte non-HTML; (b) **niente redirect da `/gestore/login` per utente autenticato non-gestore** → si evita il ping-pong `login ↔ prodotti` per un authenticated senza profilo (la decisione spetta a `requireGestore()`).

```ts
// src/proxy.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const path = request.nextUrl.pathname
  const isArea = path.startsWith('/gestore')
  // noindex per TUTTE le risposte sotto /gestore (anche non-HTML)
  if (isArea) response.headers.set('X-Robots-Tag', 'noindex, nofollow')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return response  // degrada con grazia, come server.ts

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        if (isArea) response.headers.set('X-Robots-Tag', 'noindex, nofollow')
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options))
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()

  const isLogin = path === '/gestore/login'
  // gating UX: area protetta senza utente -> login
  if (isArea && !isLogin && !user) {
    return NextResponse.redirect(new URL('/gestore/login', request.nextUrl))
  }
  // NB: NON si redirige /gestore/login -> /gestore/prodotti per utente loggato:
  // un authenticated NON-gestore creerebbe loop con requireGestore(). La login
  // gestisce da se' il caso "gia gestore" (vedi FormLogin/loginGestore).
  return response
}

export const config = {
  // tutte le rotte tranne static/asset (i doc auth raccomandano "tutte")
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

> **Non** impostare `export const runtime` (vietato in proxy — `proxy.md` r.223). Il proxy è **solo UX/SEO**: non verifica il ruolo. Quello lo fanno DAL e RLS.

### DAL — `src/lib/gestore/auth.ts` (la barriera vera, memoizzata)

```ts
import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'

// Memoizzata per-richiesta: una sola validazione server anche se chiamata piu volte.
export const verifySession = cache(async () => {
  const supabase = await createServerSupabase()
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profilo } = await supabase
    .from('profili').select('id, ruolo, nome').eq('id', user.id).maybeSingle()
  if (!profilo) return null               // loggato ma NON gestore
  return { user, profilo, supabase }
})

export async function requireGestore() {
  const sess = await verifySession()
  if (!sess) redirect('/gestore/login')
  return sess
}
```

### Login / Logout — `src/lib/gestore/auth-actions.ts`

**Correzione integrata (MEDIA):** il check ruolo **non** usa più `rpc('is_gestore')` (fragile rispetto alla propagazione di `auth.uid()` nello stesso request). Si legge **direttamente `profili` con l'uid restituito da `signInWithPassword`**. La RLS resta la barriera reale; questo check è solo early-exit UX.

```ts
'use server'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'

export type StatoLogin = { error?: string } | undefined

export async function loginGestore(_state: StatoLogin, formData: FormData): Promise<StatoLogin> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const supabase = await createServerSupabase()
  if (!supabase) return { error: 'Supabase non configurato.' }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) return { error: 'Credenziali non valide.' }

  // Verifica ruolo leggendo profili con l'uid certo (no rpc/auth.uid fragile).
  const { data: profilo } = await supabase
    .from('profili').select('id').eq('id', data.user.id).maybeSingle()
  if (!profilo) {
    await supabase.auth.signOut()
    return { error: 'Account non abilitato all\'area gestore.' }
  }
  redirect('/gestore/prodotti')           // fuori da try/catch (throwa NEXT_REDIRECT)
}

export async function logoutGestore() {
  const supabase = await createServerSupabase()
  if (supabase) await supabase.auth.signOut()
  redirect('/gestore/login')
}
```

### Guardia del layout

`(app)/layout.tsx` chiama `requireGestore()` per risolvere nome/ruolo e fare un redirect **UX**. **Ma** i layout **non si ri-renderizzano** a ogni navigazione (Partial Rendering): il check del layout **non è una barriera di sicurezza**. La barriera è: **(1)** RLS `is_gestore()` su ogni scrittura; **(2)** `verifySession()` dentro **ogni** Server Action (POST diretto possibile).

---

## 5) Pagine & Server Actions

### `/gestore/login` — `(gestore)/gestore/login/page.tsx`
- **Server Component** minimale: rende `<FormLogin/>`. Nessun `requireGestore` (fuori dalla shell). Centrato, mobile-first, wordmark + "· gestore".
- `FormLogin` (**Client**): `useActionState(loginGestore, undefined)`, email/password, pending nel bottone, errore in banner. Testo discreto di onboarding "Nessun accesso? Contatta l'amministratore" (vedi §11 bootstrap).

### `(gestore)/layout.tsx` (layout di gruppo, NO `<html>`)
- Layout figlio: wrapper minimo + **`export const metadata = { robots: { index: false, follow: false } }`** → tutte le pagine `/gestore` ereditano noindex (in aggiunta all'header del proxy).

### `(gestore)/gestore/(app)/layout.tsx` — AdminShell
- **Server Component**: `const { profilo } = await requireGestore()`; monta `<AdminNav nome={profilo.nome} ruolo={profilo.ruolo}/>` + `<Toaster>` + `{children}`. `<main className="pb-20 md:pb-0">`. Eredita il metadata noindex del gruppo.

### `/gestore` (index) — `(app)/page.tsx`
- `redirect('/gestore/prodotti')` server-side.

### `/gestore/prodotti` (LISTA) — `(app)/prodotti/page.tsx`
- **Server Component**. **Niente `export const dynamic = 'force-dynamic'`** (correzione BASSA Next16): la query passa per la sessione Supabase via `cookies()`, che rende la pagina **intrinsecamente dinamica**. *Dipendenza documentata:* vale finché **Cache Components NON è abilitato** (`next.config.ts` vuoto → non lo è; `route-segment-config/index.md` r.19: `dynamic` rimosso solo con Cache Components). Se in futuro si abilita Cache Components, passare al modello `'use cache'`/`connection()`.
- **Query (correzione ALTA Completezza):** colonne esplicite (no `select('*')`), conteggio varianti + **somma stock** per badge, **`.order('creato_il', { ascending: false })`** e **`.limit(200)`**. Oltre 200 prodotti → passare a ricerca server-side (`ilike` su nome/slug + range). Passa i dati a `<ListaProdotti/>`.
- `ListaProdotti` (**Client**): ricerca client-side (debounce 200ms), segmented `Tutti·Attivi·Nascosti`, card.

### `/gestore/prodotti/nuovo` — `(app)/prodotti/nuovo/page.tsx`
- **Server Component**: rende `<FormProdotto action={salvaProdottoAction}/>` (create mode).

### `/gestore/prodotti/[id]` — `(app)/prodotti/[id]/page.tsx`
- **Server Component**. Firma Next 16: **`params: Promise<{ id: string }>` → `const { id } = await params`**. Carica prodotto + varianti (RLS gestore). Se assente → `notFound()`. Rende `<FormProdotto …/>` + `<EditorVarianti …/>` + `<UploaderFoto …/>` + zona "elimina".

### Server Actions — `src/lib/gestore/actions.ts` (`'use server'`)

**Pattern obbligatorio per ogni action:** **(1)** `verifySession()` → early-return `{ok:false,error}` se non gestore; **(2)** validazione → stato con errori (no throw); **(3)** mutazione via anon+sessione+RLS, **in try/catch** → su errore di rete/DB ritorna `{ok:false,error}` (mai eccezione non gestita); **(4)** `revalidatePath` e poi `redirect` **fuori da try/catch**.

| Firma | Responsabilità |
|---|---|
| `salvaProdottoAction(state: StatoForm, formData: FormData): Promise<StatoForm>` | Create se manca `id`, update altrimenti. Valida nome (obbligatorio), slug (`^[a-z0-9-]+$`), `prezzo_cents` (intero **> 0**, derivato lato client via hidden input ma **ri-validato** server-side), `attivo`. **Univocità slug = vincolo unique come fonte di verità:** intercetta Postgres **23505** su slug → `{errors:{slug:'Slug gia in uso'}}` (la SELECT pre-check resta solo feedback anticipato, non garanzia — evita race). `revalidatePath('/gestore/prodotti')` + `revalidatePath('/')` + revalidazione pagina pubblica del prodotto (vedi nota path). In create → `redirect('/gestore/prodotti/'+nuovoId)`; in edit → ritorna `{message:'Salvato'}` (toast) senza redirect. |
| `toggleAttivoAction(id: string, attivo: boolean): Promise<{ok:boolean;error?:string}>` | Update `attivo`. `revalidatePath('/gestore/prodotti')` + `'/'`. **Ritorna esito** per optimistic-revert lato client. Invocata via `useTransition` (non form). |
| `salvaVariantiAction(prodottoId: string, righe: VarianteInput[]): Promise<StatoVarianti>` | Diff insert/update/delete varianti. `sku` **NOT NULL obbligatorio**; **23505** (unique globale) → errore mirato per riga `'SKU gia in uso'`. **CASCADE reale (correzione ALTA):** `varianti.id` è referenziato da `carrello_righe ON DELETE CASCADE` → cancellare una variante **cancella in cascata le righe di carrello dei clienti**. Quindi: pre-check `select count from carrello_righe where variante_id = …` (la policy `carrello_righe_all using(true)` lo consente) e, se >0, **avvisare** prima di procedere; per varianti già vendute (`ordine_righe.variante_id ON DELETE SET NULL`) lo snapshot regge. **Non atomico** → vedi mitigazione sotto. `revalidatePath('/gestore/prodotti/'+prodottoId,'page')`. |
| `caricaFotoAction(prodottoId: string, formData: FormData): Promise<{url?:string;error?:string}>` | Upload Storage → public URL → update `immagine_url` → cleanup. (Vedi §6.) |
| `rimuoviFotoAction(prodottoId: string): Promise<{ok:boolean;error?:string}>` | Svuota cartella Storage del prodotto + `immagine_url = null`. |
| `eliminaProdottoAction(id: string): Promise<{ok:boolean;error?:string}>` | Soft/hard delete secondo §8 (ora **funzionante** grazie alla policy SELECT su `ordine_righe`). In hard-delete: cleanup foto + delete (varianti via CASCADE) + `revalidatePath('/gestore/prodotti')` + `redirect('/gestore/prodotti')`. |

**Mitigazione UX salvataggio varianti non atomico (correzione ALTA):** Supabase non offre transazioni multi-statement dal client JS. **Preferenza:** **RPC Postgres** dedicata (`plpgsql`) che esegue il diff insert/update/delete **in transazione**, chiamata via `supabase.rpc(...)`, con `is_gestore()` come guard interna → atomicità + RLS preservata. **Fallback per partire:** dopo il salvataggio **ricaricare sempre le varianti dal server** (revalidate + refetch) e mostrare lo stato reale, con toast "Alcune varianti non salvate" che elenca le righe fallite (mai lasciare il form e il DB in stati divergenti senza segnalarlo).

**Nota `revalidatePath` + route group (correzione BASSA):** con segmento dinamico il secondo argomento `'page'` è **obbligatorio** (`revalidatePath.md` r.26). Per la pagina pubblica del prodotto: preferire la forma con **URL pubblico** `revalidatePath('/prodotti/[slug]','page')`; se la vetrina fosse spostata in `(vetrina)/` e quella forma non invalidasse, usare la forma con gruppo `revalidatePath('/(vetrina)/prodotti/[slug]','page')` (supportata — `revalidatePath.md` r.146-148). Fallback a tappeto sempre valido: `revalidatePath('/','layout')`.

### `src/lib/format.ts` — `parsePrezzoCents()` robusto (correzione MEDIA UX)

Tollera input reali da telefono: `€`, spazi/NBSP, separatore migliaia, valore che inizia con separatore. Evita il float-error di `*100`.

```ts
// Euro -> centesimi interi. Tollerante a "29,99", "29.99", "€ 1.299,00", ",99", ".5".
export function parsePrezzoCents(input: string): number | null {
  let s = input.trim()
    .replace(/[€\s\u00A0\u202F]/g, '')   // euro, spazi normali/NBSP/narrow-NBSP
  if (!s) return null
  // separatore migliaia: se c'e sia '.' che ',', l'ultimo e il decimale.
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.')
  if (lastComma > -1 && lastDot > -1) {
    const dec = Math.max(lastComma, lastDot)
    s = s.slice(0, dec).replace(/[.,]/g, '') + '.' + s.slice(dec + 1)
  } else {
    s = s.replace(',', '.')
  }
  if (s.startsWith('.')) s = '0' + s     // ".5" -> "0.5"
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const cents = Math.round(parseFloat(s) * 100)
  return Number.isFinite(cents) ? cents : null
}
```

Il `FormProdotto` mostra **inline** sotto il campo l'anteprima `formatPrezzo(parsePrezzoCents(...))` mentre si digita, e valida **prezzo > 0**.

---

## 6) Foto — flusso completo

**Decisione architetturale:** upload via **Server Action** (non upload diretto dal browser): unica superficie di sicurezza (sessione cookie), coerente col resto del progetto. `UploaderFoto` invia il `File` in un `FormData` a `caricaFotoAction`.

**Compressione/conversione client OBBLIGATORIA (correzione MEDIA UX — non più "suggerita"):** le foto da fotocamera moderna superano spesso 5MB e iOS produce **HEIC** (`image/heic`, **non** tra gli allowed_mime → rifiutato dal bucket). Quindi `UploaderFoto` **converte e comprime sempre** client-side (es. `browser-image-compression` → **WebP ~1600px**) prima dell'invio: risolve sia HEIC sia il limite 5MB. Validare il mime effettivo e mostrare messaggi chiari ("Formato non supportato" / "Immagine ridotta automaticamente"); `image/heic` va intercettato e **riconvertito**, mai inviato grezzo.

**Flusso:**
1. `UploaderFoto` (**Client**): `<input type="file" accept="image/*" capture="environment">` (apre fotocamera su mobile) + affordance galleria. Anteprima immediata `URL.createObjectURL(file)`. → **compressione/conversione WebP obbligatoria** → submit.
2. `caricaFotoAction(prodottoId, formData)`. **Naming deterministico `prodottoId/cover.webp` con `upsert:true`** (correzione MEDIA UX: più robusto del "rimuovi tutte tranne la nuova", che è fragile in caso di upload concorrente):
   ```ts
   const sess = await verifySession(); if (!sess) return { error: 'Non autorizzato.' }
   const { supabase } = sess
   const file = formData.get('foto') as File
   if (!['image/webp','image/jpeg','image/png','image/avif'].includes(file.type))
     return { error: 'Formato non supportato.' }
   const path = `${prodottoId}/cover.webp`           // deterministico => no orfani
   const { error: up } = await supabase.storage.from('prodotti')
     .upload(path, file, { upsert: true, contentType: file.type })
   if (up) return { error: up.message }
   const { data: { publicUrl } } = supabase.storage.from('prodotti').getPublicUrl(path)
   // cache-busting per la public URL deterministica (altrimenti CDN serve la vecchia)
   const urlConV = `${publicUrl}?v=${Date.now()}`
   const { error: dbErr } = await supabase.from('prodotti')
     .update({ immagine_url: urlConV }).eq('id', prodottoId)
   if (dbErr) return { error: dbErr.message }
   revalidatePath('/gestore/prodotti'); revalidatePath('/')
   return { url: urlConV }
   ```
   > Il naming `cover.webp` + `upsert` elimina il problema degli orfani e il cleanup fragile. Il `?v=` forza il refresh della CDN sulla URL pubblica deterministica.
3. RLS storage (`prodotti_storage_insert_gestore`) autorizza solo il gestore. Public URL deterministica, nessuna firma.
4. **Rimozione foto** = azione distruttiva → **`ConfermaDialog`** (correzione MEDIA UX). `rimuoviFotoAction`: `remove(['${prodottoId}/cover.webp'])` + `immagine_url = null` → la UI mostra di nuovo il **placeholder `repeating-linear-gradient`** coerente con `ProductCard`.
5. **Cleanup su eliminazione prodotto:** `list(prodottoId)` + `remove(...)` prima del delete riga (lo Storage non conosce il DB).

**`next.config.ts`** (host Supabase dalla MEMORY + `qualities` obbligatorio in Next 16):
```ts
import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ozbsslebqtzslfpqpwyz.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
        search: '',
      },
    ],
    qualities: [75],   // OBBLIGATORIO da Next 16
  },
}
export default nextConfig
```
Le miniature admin usano `<Image width height>` (host noto). La `ProductCard` della vetrina **non si tocca**.

---

## 7) UX mobile-first

**Regola brand (correzione ALTA UX — resa esplicita):** la convenzione **corretta** sono i **token brand light** (`bg-background/text-foreground/text-muted/border-line/bg-surface/bg-foreground/text-background`), come in `Header.tsx`/`ProductCard.tsx`. L'uso di **zinc raw + dark mode** in `AddToCart.tsx`/`CartItem.tsx` è una **incoerenza pre-esistente**, da **non** propagare. L'area gestore usa **solo token**, **niente dark mode**. Riusa le classi già presenti: bottone-pill `rounded-full bg-foreground text-background h-12`, `.wordmark` per il marchio → l'admin eredita la **stessa identità visiva**. Touch target ≥44px, `focus-visible` ring coerente.

**Schermate:**
- **Login** — card `max-w-sm` centrata, wordmark + "· gestore", email (`inputMode="email"`)/password, pill scuro full-width `h-12`, errore in banner, testo onboarding discreto.
- **Shell autenticata** — mobile: header sticky `h-14` (wordmark + avatar-iniziale → **sheet** dal basso con nome/ruolo/Logout); **bottom-nav** `fixed bottom-0` con `pb-[env(safe-area-inset-bottom)]`: Prodotti · **+ Nuovo** (CTA pill scura centrale) · (Ordini futuro). Desktop ≥md: **sidebar** `w-60` con profilo+Logout in fondo, `md:hidden` sulla bottom-nav.
- **Lista** — toolbar sticky: ricerca pill `h-11` + segmented `Tutti·Attivi·Nascosti` (`aria-pressed`). Card riga: miniatura `aspect-[4/5] w-16` (placeholder a righe diagonali se assente), nome+slug(`font-mono text-xs`)+prezzo(`tabular-nums`), badge stato + **badge `Esaurito`/`Scorte basse`** se somma stock varianti ≤ soglia (correzione BASSA UX) + `ToggleAttivo`. Tap card → dettaglio; area toggle `stopPropagation`. **Stato vuoto** dedicato + CTA.
- **Form prodotto** — nome (auto-slug finché `slugDirty=false`; se lo slug derivato esiste → **suffisso incrementale `-2/-3`** via `slug.ts`), slug (`font-mono`, prefisso `/prodotti/`, rigenera), descrizione (auto-grow), **prezzo in euro** (`inputMode="decimal"`, suffisso €, accetta `,`/`.`, **anteprima formattata inline**, hidden `prezzo_cents` via `parsePrezzoCents`), switch Attivo. **Save-bar sticky** (`sticky bottom-0 … pb-[env(safe-area-inset-bottom)]`): Annulla ghost + **Salva disabilitato finché non ci sono modifiche (dirty-tracking)** e durante pending (correzione BASSA UX).
- **Varianti** — mini-card (2 col: taglia|colore, sku|stock), **SKU suggerito includendo il colore quando presente** `${slug}-${taglia}-${colore}` (+ disambiguazione) per evitare collisioni unique (correzione ALTA), validazione client di unicità tra le righe prima del submit, stock stepper −/+ (44px), cestino con micro-conferma se `stock>0`/id esistente **e avviso se la variante è in carrelli attivi** (CASCADE). **Empty state** dedicato: "Nessuna variante, aggiungine una" (correzione BASSA UX). "Aggiungi variante" tratteggiato full-width.
- **Upload foto** — riquadro `aspect-[4/5] rounded-xl`, anteprima istantanea, overlay spinner in upload, tap → Sostituisci/Rimuovi (**Rimuovi dietro `ConfermaDialog`**). Placeholder a righe diagonali coerente con `ProductCard` se assente.
- **Feedback & errori di rete (correzione MEDIA UX):** `Toaster` nel layout (`aria-live`), successo pill scuro auto-dismiss 3s posizionato `bottom-20` su mobile (sopra bottom-nav). **Ogni action ritorna `{ok:false,error}` su catch di rete** → Toaster mostra l'errore; `ToggleAttivo` fa **revert** dello stato optimistic su `ok:false`; `UploaderFoto` **ripristina l'anteprima precedente** e nasconde lo spinner; `FormProdotto` **conserva i valori digitati** (controlled o `defaultValue` da formData) così un errore non svuota il form. `ConfermaDialog` `<dialog>` per delete e rimozione foto (unico tocco di rosso `text-red-700`). Skeleton `animate-pulse` al primo load.

---

## 8) Sicurezza + strategia eliminazione/soft-delete

**Riepilogo confini:**
- **RLS = confine vero.** Scritture `prodotti`/`varianti`/storage gated su `is_gestore()`. Anon non è mai gestore. SELECT pubbliche intatte (OR permissive). SELECT `ordine_righe` aperta al gestore **solo in lettura**.
- **Sessione:** cookie `@supabase/ssr`, refresh nel `proxy.ts`. **`getUser()`** (non `getSession()`) per utente verificato dal server.
- **Ogni Server Action** ri-verifica `verifySession()` (POST diretto possibile). Proxy/layout sono solo UX/SEO.
- **Provisioning ruolo via `raw_app_meta_data`** (service-role/Admin API): nessuna auto-escalation a gestore anche con signup attive. La disabilitazione signup (M2) resta consigliata come difesa in profondità, ma **non è più l'unica barriera**.
- **Storage:** bucket pubblico in lettura (single-tenant, documentato), scrittura solo gestore. Naming deterministico `prodottoId/cover.webp`.
- **Service-role:** confinato al webhook Stripe. Mai nell'area gestore.
- **noindex:** metadata `robots:{index:false}` sul gruppo `(gestore)` + `X-Robots-Tag` dal proxy + `robots.ts` opzionale con `Disallow: /gestore`.

**Eliminazione prodotto vs FK — strategia soft-delete di default (ora EFFICACE).** FK reali: `varianti`→CASCADE, `carrello_righe`→CASCADE, `ordine_righe.prodotto_id`→SET NULL (snapshot `nome_prodotto/prezzo_cents/sku` not null restano). Con la **policy SELECT su `ordine_righe`** aggiunta in §3, il check "mai venduto" **funziona** (senza, restituiva sempre 0 → hard-delete sempre → storico spezzato).
1. **Azione primaria UI = toggle attivo/non attivo** (soft-delete). Sparisce dal pubblico, resta visibile al gestore.
2. **Hard-delete reale solo se mai venduto:**
   ```ts
   const sess = await verifySession(); if (!sess) return { ok:false, error:'Non autorizzato.' }
   const { supabase } = sess
   const { count } = await supabase.from('ordine_righe')
     .select('id', { count: 'exact', head: true }).eq('prodotto_id', id)
   if ((count ?? 0) > 0) {
     await supabase.from('prodotti').update({ attivo: false }).eq('id', id)  // soft
   } else {
     const { data: files } = await supabase.storage.from('prodotti').list(id)
     if (files?.length) await supabase.storage.from('prodotti')
       .remove(files.map(f => `${id}/${f.name}`))
     await supabase.from('prodotti').delete().eq('id', id)   // varianti via CASCADE
   }
   ```
3. Il delete distruttivo **non** è azione primaria mobile: dietro `ConfermaDialog`.

---

## 9) Ordine di build + step manuali

**Step manuali (prima/intorno al codice):**
- **M1.** Eseguire la migration `20260622210000_area_gestore.sql` sul cloud (CLI `supabase db push` o SQL Editor). Verificare bucket `prodotti` e `select * from public.profili`.
- **M2.** **Signup pubbliche OFF** (Dashboard → Authentication → Providers → Email → "Enable Sign-ups" = OFF). *Difesa in profondità:* con il ruolo letto da `raw_app_meta_data`, l'auto-escalation è già bloccata a livello DB, ma OFF resta consigliato.
- **M3.** **Creare account gestore via Admin API/dashboard** impostando il ruolo in **`app_metadata`** (NON `user_metadata`): Auth → Users → Add user → email+password, **Auto Confirm**, e impostare `app_metadata = {"ruolo":"gestore","nome":"Frody"}` (via Admin API / SQL `auth.users.raw_app_meta_data`). Il trigger crea il profilo. Verificare riga in `profili`.
- **M4.** Env: confermare `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`. **Nessuna nuova env.**
- **M5. (bootstrap)** Documentare nel README il primo avvio: se nessun gestore esiste, `/gestore/login` mostra solo l'errore credenziali + testo "Contatta l'amministratore"; opzionale uno **script seed** una-tantum che crea il primo gestore con `app_metadata` corretto.

**Ordine implementazione codice:**
1. `next.config.ts` (images) + `format.ts` (`parsePrezzoCents`) + `lib/gestore/slug.ts` + `lib/types.ts` (`Profilo`, `VarianteInput`).
2. **Layout (Strategia B):** ridurre `src/app/layout.tsx` a root minimale; creare `(vetrina)/layout.tsx` con `<Header/>`+`<main>`; creare `(gestore)/layout.tsx` (metadata noindex). **Build di verifica subito** (validare assenza di doppio `<html>` e i route group).
3. `src/proxy.ts` (refresh + gating + X-Robots-Tag).
4. `lib/gestore/auth.ts` (DAL) + `auth-actions.ts` (login/logout).
5. `/gestore/login` + `FormLogin`. Test login/logout + gating proxy.
6. `(app)/layout.tsx` (AdminShell + `requireGestore`) + `AdminNav` + `Toaster`.
7. `/gestore/prodotti` (lista, order+limit) + `ListaProdotti` + `ToggleAttivo` + `toggleAttivoAction`.
8. `FormProdotto` + `salvaProdottoAction` + route `nuovo`/`[id]`.
9. `EditorVarianti` + `salvaVariantiAction` (preferire RPC atomica; fallback refetch).
10. `UploaderFoto` (+ compressione obbligatoria) + `caricaFotoAction`/`rimuoviFotoAction`.
11. `eliminaProdottoAction` + `ConfermaDialog` (soft/hard delete).
12. Rifiniture UX: save-bar+dirty-tracking, skeleton, badge stock, safe-area, gestione errori di rete.

---

## 10) Verifica/test (anche da mobile)

- **RLS (SQL Editor/psql):** come anon, `select` su prodotto `attivo=false` → 0 righe; insert su `prodotti` → negato. Come gestore loggato → vede non-attivi, CRUD OK, **`select count from ordine_righe`** ora ritorna i valori reali. `select public.is_gestore()` true per gestore, false altrimenti.
- **Privilege escalation:** creare un utente con `raw_user_meta_data = {"ruolo":"gestore"}` (NON app_metadata) → verificare che **NON** compaia in `profili` (il trigger ignora user_metadata).
- **Layout:** build pulita, **un solo `<html>`** in output; navigazione vetrina↔gestore senza errori di idratazione; `/` ancora servita.
- **Proxy/SEO:** `/gestore/prodotti` da non loggato → redirect `/gestore/login`. Response su `/gestore/*` ha header `X-Robots-Tag: noindex, nofollow`. `view-source` di una pagina gestore → `<meta name="robots" content="noindex,nofollow">`. Authenticated **non-gestore** su `/gestore/login` → **nessun loop** (resta sulla login). Senza env → niente crash.
- **Auth:** credenziali errate → "Credenziali non valide"; utente senza profilo → "Account non abilitato" + signOut. Logout → cookie rimossi + redirect login.
- **Server Action authz:** POST diretto a un'action senza sessione (curl) → respinto da `verifySession`/RLS.
- **CRUD prodotto:** create → in lista + in vetrina se attivo (`revalidatePath('/')`); lista **ordinata per `creato_il` desc**. Edit prezzo `29,99`/`€ 1.299,00`/`,99` → cents corretti, anteprima inline. Slug duplicato → errore `slug gia in uso` (23505), no crash. Toggle → sparisce dal pubblico, resta in lista; **errore di rete → revert** dello switch.
- **Varianti:** SKU duplicato → errore mirato sulla riga (23505). Salvataggio parziale → refetch mostra stato reale + toast "alcune non salvate". Delete variante in carrello attivo → avviso CASCADE. Empty state visibile su prodotto senza varianti.
- **Foto:** upload da **fotocamera** (`capture`) di un HEIC/foto >5MB → **convertita/compressa** a WebP e accettata; anteprima istantanea, comparsa public URL con `?v=`, niente orfani (naming `cover.webp`). Rimozione → `ConfermaDialog` + placeholder ripristinato. `<Image>` carica (remotePattern host corretto).
- **Delete:** prodotto venduto → **soft-delete** (resta, attivo=false), storico ordini intatto; mai venduto → hard-delete + foto rimosse + varianti via CASCADE + ordini intatti.
- **Mobile reale:** `next dev` su IP LAN (`http://192.168.x.x:3000`) da telefono. Verificare: bottom-nav sopra notch (`env(safe-area-inset-bottom)`), save-bar nel pollice + disabilitata se form pulito, tastiera decimale sul prezzo/numerica sullo stock, sheet profilo, toast sopra bottom-nav, touch ≥44px, badge "Esaurito" visibile. Lighthouse mobile sulla lista. **noindex** confermato sul telefono via header di risposta.

---

## 11) Rischi e decisioni aperte

1. **Layout — RISOLTO (era critico).** `src/app/layout.tsx` esiste → **Strategia B vincolante** (root minimale + layout di gruppo nidificati, niente secondo `<html>`). Non più "da verificare in build".
2. **`dynamic` rimosso con Cache Components.** La lista si affida alla dinamicità implicita via `cookies()`. **Dipendenza esplicita:** vale finché `cacheComponents` è disabilitato (oggi lo è). Se abilitato in futuro → migrare a `'use cache'`/`connection()`.
3. **`revalidatePath` post-eventuale-migrazione vetrina.** Con la vetrina lasciata fuori da `(vetrina)/` (default Strategia B), `revalidatePath('/prodotti/[slug]','page')` con URL pubblico è corretto. Se si sposta in `(vetrina)/`, verificare e, se serve, usare la forma con gruppo `'/(vetrina)/prodotti/[slug]'`. Fallback `revalidatePath('/','layout')`.
4. **Storage single-tenant (MEDIA, accettato).** Policy non vincolano il path per-prodotto e la public-read espone tutto il bucket. Accettabile per admin single-tenant; mitigazione = naming deterministico + cleanup. Irrigidimento futuro: vincolo uuid nel path o upload service-role.
5. **Varianti atomiche.** Fallback (refetch + toast) per partire; **RPC plpgsql transazionale** consigliata per la robustezza definitiva.
6. **Compressione immagini = dipendenza client** (`browser-image-compression`). Necessaria per HEIC e limite 5MB → **obbligatoria**, non opzionale. Valutarne il peso bundle (lazy-import nel solo `UploaderFoto`).
7. **Bootstrap primo gestore.** Nessuna gestione in-app oltre allo step manuale M3/M5 + testo onboarding sulla login. Opzionale: script seed.
8. **Incoerenza brand pre-esistente** (`AddToCart`/`CartItem` zinc+dark). Non risolta qui per non allargare lo scope; l'area gestore segue i **token** (decisione esplicita). Eventuale allineamento futuro di quei due componenti è un task a parte.
9. **`crypto.randomUUID()`** non più necessario per le foto (naming deterministico `cover.webp`); resta disponibile nel runtime Node delle Server Action se servisse altrove.

---

## Modifiche rispetto alla bozza

**Next 16-API (priorità):**
- **Layout (critico) — RISOLTO:** `src/app/layout.tsx` **esiste** (verificato: `<html><body><Header/><main>`). Adottata **Strategia B vincolante** (root minimale + `(vetrina)/layout.tsx` con `<Header/>`/`<main>` + `(gestore)/layout.tsx` nidificato senza `<html>`). Eliminato il rischio di doppio `<html>`; rimosso dall'albero §2 ogni secondo root layout; il dubbio §11#1 è ora una decisione, non un'incognita.
- **`export const dynamic = 'force-dynamic'` rimosso** dalla lista: dinamicità implicita via `cookies()`; documentata la dipendenza da Cache Components disabilitato.
- **`revalidatePath`:** chiarita la forma da usare post-migrazione (URL pubblico, con fallback forma-gruppo `'/(vetrina)/…'` e `('/','layout')`).
- **Timestamp migration** corretto a **oggi** (`20260622210000`, dopo l'init `20260622194500`) invece di una data nel futuro.

**Sicurezza-RLS/Storage (priorità):**
- **(critico)** Aggiunta **policy SELECT su `ordine_righe`** per il gestore → il check "mai venduto" di `eliminaProdottoAction` ora funziona; senza, l'hard-delete scattava sempre e `ON DELETE SET NULL` spezzava lo storico ordini.
- **(media)** Provisioning ruolo spostato da **`raw_user_meta_data` → `raw_app_meta_data`** (impostabile solo via Admin API/service-role): elimina la privilege-escalation a gestore via signup; M2/M3 aggiornati di conseguenza.
- **(media)** Check ruolo nel login: da `rpc('is_gestore')` (fragile su `auth.uid()` nello stesso request) a **lettura diretta di `profili` con l'uid restituito da `signInWithPassword`**.
- **(bassa)** `set search_path = ''` aggiunto anche a `tocca_aggiornato_il()`.
- **(bassa)** Proxy: rimosso il redirect `/gestore/login → /gestore/prodotti` per utente loggato → niente loop per authenticated non-gestore; aggiunto **`X-Robots-Tag: noindex`** su `/gestore/*`.
- **(media)** Storage single-tenant esplicitamente documentato come limite accettato; naming deterministico `cover.webp` + cleanup per gli orfani.
- **`salvaVariantiAction`:** corretta l'affermazione errata "delete bloccato": la FK reale è **`carrello_righe ON DELETE CASCADE`** → il DB non blocca, cancella in cascata le righe di carrello; aggiunti pre-check + avviso.

**Completezza/UX:**
- **noindex/SEO** ora implementato: `metadata robots:{index:false}` sul gruppo `(gestore)` + `X-Robots-Tag` dal proxy + `robots.ts` opzionale.
- **Regola brand resa esplicita:** token light corretti, zinc+dark di `AddToCart`/`CartItem` riconosciuti come incoerenza pre-esistente da non propagare; riuso classi pill/`.wordmark`.
- **Lista:** aggiunti **`.order('creato_il', desc)` + `.limit(200)`** con fallback ricerca server-side; **badge Esaurito/Scorte basse**.
- **SKU:** suggerimento include il colore, validazione unicità client + mappatura **23505** "SKU gia in uso"; `sku` reso obbligatorio.
- **Varianti non atomiche:** mitigazione UX definita (RPC transazionale preferita; fallback refetch + toast righe fallite); **empty state** dedicato.
- **`parsePrezzoCents` robusto:** gestisce `€`, NBSP, separatori migliaia, valore iniziante con separatore; anteprima inline; validazione **prezzo > 0**.
- **Foto:** compressione/conversione client resa **obbligatoria** (HEIC + 5MB); naming deterministico `cover.webp` + `?v=` cache-bust; **conferma** sulla rimozione + placeholder ripristinato.
- **Slug:** vincolo unique come fonte di verità (23505) + **suffisso incrementale** nell'autogenerazione.
- **Errori di rete nelle action:** percorso UX definito (`{ok:false,error}` → toast; revert toggle; ripristino anteprima upload; form non si svuota).
- **Bootstrap primo gestore:** step M3/M5 + testo onboarding sulla login + script seed opzionale.
- **Save-bar:** **dirty-tracking** (Salva disabilitato senza modifiche).

**File reali verificati per questo piano:** `src/app/layout.tsx` (root con `<html><body><Header/><main>` — conferma Strategia B), `src/lib/supabase/server.ts` (`createServerSupabase`, setAll in try/catch), `src/lib/format.ts` (solo `formatPrezzo`), `next.config.ts` (vuoto), `supabase/schema.sql` (no policy `ordine_righe`/`ordini`; `carrello_righe→CASCADE`; `ordine_righe.prodotto_id→SET NULL`; `sku` unique NOT NULL; `prodotti.creato_il`), `src/components/{AddToCart,CartItem,ProductCard,Header}.tsx` (zinc+dark vs token), doc Next 16 (`proxy.md`, `layout.md`, `route-groups.md`, `route-segment-config/index.md`, `revalidatePath.md`).
