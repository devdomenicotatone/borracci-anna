"use server";

// Server Actions per la gestione delle categorie (area gestore).
// Gerarchia a 3 LIVELLI: radici (parent_id null, es. Uomo/Donna), figli
// (es. T-shirt/Polo) e nipoti (es. Manga/Calcio sotto T-shirt). I consumatori
// (vetrina, FormProdotto, GeneraDaFoto) raggruppano per parent_id e ordinano per
// `ordine` asc: queste action tengono coerenti `ordine` (per gruppo) e
// `parent_id` (mai un 4o livello).
//
// Pattern obbligatorio (come actions.ts / galleria):
//   1) verifySession() -> early-return { ok:false, error:"Non autorizzato." };
//   2) mutazione via sessione.supabase (anon + RLS is_gestore) in try/catch;
//   3) ogni mutazione ritorna la LISTA CANONICA (categorie[]) per riallineare il
//      client (come le action galleria ritornano foto[]).

import { revalidatePath, revalidateTag } from "next/cache";

import { TAG_VETRINA_HOME } from "@/lib/vetrina-home";

import { percorsoCategoria } from "@/lib/categorie-albero";
import { verifySession } from "@/lib/gestore/auth";
import { slugGerarchico, slugify } from "@/lib/gestore/slug";
import type { Categoria, ConfigVetrina } from "@/lib/types";

/** Esito di un'azione categorie: su `ok` ritorna la lista canonica aggiornata. */
export interface EsitoCategorie {
  ok: boolean;
  error?: string;
  categorie?: Categoria[];
}

// Tipo del client Supabase di sessione (gestisce il `| null` di verifySession).
type SupabaseGestore = Awaited<ReturnType<typeof verifySession>> extends infer S
  ? S extends { supabase: infer C }
    ? C
    : never
  : never;

const NON_AUTORIZZATO: EsitoCategorie = { ok: false, error: "Non autorizzato." };
const ERRORE_RETE: EsitoCategorie = { ok: false, error: "Errore di rete. Riprova." };
const PADRE_SPARITO =
  "La categoria principale non esiste piu. Aggiorna la pagina.";
const QUARTO_LIVELLO = "Non puoi creare un quarto livello di categorie.";
// Codice sollevato dal trigger DB categorie_max_tre_livelli (check_violation):
// barriera autoritativa contro un 4o livello creato da mutazioni concorrenti.
const PG_CHECK_VIOLATION = "23514";

/**
 * Profondita di una categoria (1 = radice, 2 = figlia, 3 = nipote), risalendo
 * i parent con due letture al massimo. Null se la categoria non esiste.
 * Throw su errore di lettura (il try/catch del chiamante ritorna ok:false):
 * un errore di rete non deve passare per "riga assente" o "radice".
 */
async function profonditaCategoria(
  supabase: SupabaseGestore,
  id: string,
): Promise<number | null> {
  const { data: riga, error: errRiga } = await supabase
    .from("categorie")
    .select("id, parent_id")
    .eq("id", id)
    .maybeSingle();
  if (errRiga) throw errRiga;
  if (!riga) return null;
  if (riga.parent_id === null) return 1;
  const { data: padre, error: errPadre } = await supabase
    .from("categorie")
    .select("id, parent_id")
    .eq("id", riga.parent_id)
    .maybeSingle();
  if (errPadre) throw errPadre;
  // Padre sparito nel frattempo (FK on delete set null): trattala come radice.
  if (!padre) return 1;
  return padre.parent_id === null ? 2 : 3;
}

/** Legge tutte le categorie ordinate. Throw su errore (il try/catch ritorna ok:false). */
async function leggiCategorie(supabase: SupabaseGestore): Promise<Categoria[]> {
  const { data, error } = await supabase
    .from("categorie")
    .select("id, slug, nome, parent_id, ordine")
    .order("parent_id", { ascending: true, nullsFirst: true })
    .order("ordine", { ascending: true })
    // Tie-break stabile: con `ordine` duplicati (race) l'ordine resta deterministico.
    .order("id", { ascending: true });
  if (error) throw error;
  return (data as Categoria[] | null) ?? [];
}

/** Ordine in coda al gruppo: max(ordine) dei fratelli con lo stesso parent + 1. */
async function prossimoOrdine(
  supabase: SupabaseGestore,
  parentId: string | null,
): Promise<number> {
  const filtro = supabase.from("categorie").select("ordine");
  const conFiltro =
    parentId === null ? filtro.is("parent_id", null) : filtro.eq("parent_id", parentId);
  const { data, error } = await conFiltro
    .order("ordine", { ascending: false })
    .limit(1);
  // Propaga l'errore (il try/catch del chiamante ritorna ok:false) invece di
  // scrivere silenziosamente ordine=0 mettendo la categoria in testa al gruppo.
  if (error) throw error;
  const max = data?.[0]?.ordine;
  return typeof max === "number" ? max + 1 : 0;
}

/** Invalida le cache che dipendono dalle categorie (pannello + vetrina + PDP). */
function revalida(): void {
  revalidatePath("/gestore/categorie");
  revalidatePath("/");
  revalidateTag(TAG_VETRINA_HOME, "max"); // le fasce home usano gli href categoria
  // Pattern dinamico -> serve il type 'page' (non la URL letterale).
  revalidatePath("/prodotti/[slug]", "page");
}

/**
 * Crea una categoria. `parentId` null = categoria principale; valorizzato =
 * figlia o nipote. Anti-4o-livello: il padre deve stare al massimo al 2o livello.
 * Slug LEGGIBILE dal percorso completo (es. "uomo-t-shirt-anime-manga"), reso
 * univoco dal vincolo DB: si parte dal primo suffisso libero e si ritenta sul
 * conflitto 23505. Rami diversi danno basi diverse (collisioni rare); due
 * omonime sotto lo stesso padre restano disambiguate dal suffisso numerico.
 */
export async function creaCategoriaAction(input: {
  nome: string;
  parentId: string | null;
}): Promise<EsitoCategorie> {
  const sessione = await verifySession();
  if (!sessione) return NON_AUTORIZZATO;
  const { supabase } = sessione;

  const nome = (input?.nome ?? "").trim();
  if (!nome) return { ok: false, error: "Il nome e obbligatorio." };
  if (!slugify(nome)) return { ok: false, error: "Nome non valido." };
  const parentId = input.parentId ?? null;

  try {
    // Tutte le categorie in un colpo: servono sia per il percorso (da cui lo
    // slug gerarchico) sia per gli slug gia presi. Poche righe -> costo minimo.
    const categorie = await leggiCategorie(supabase);

    // Percorso dei nomi dalla radice al nuovo nodo. La profondita del padre
    // (lunghezza del suo percorso) fa da guardia anti-4o-livello lato app; il
    // trigger DB categorie_max_tre_livelli resta la barriera autoritativa.
    let nomiPercorso = [nome];
    if (parentId !== null) {
      const percorsoPadre = percorsoCategoria(categorie, parentId);
      if (percorsoPadre.length === 0) return { ok: false, error: PADRE_SPARITO };
      if (percorsoPadre.length >= 3) return { ok: false, error: QUARTO_LIVELLO };
      nomiPercorso = [...percorsoPadre.map((c) => c.nome), nome];
    }
    // Slug leggibile dal percorso completo, es. "uomo-t-shirt-anime-manga".
    const slugBase = slugGerarchico(nomiPercorso);

    const ordine = await prossimoOrdine(supabase, parentId);

    // Suffisso numerico (0 => "base", k>=1 => "base-(k+1)") solo per disambiguare
    // eventuali omonime sotto lo stesso padre: rami diversi danno gia basi
    // diverse. Si parte dal primo libero (slug in memoria); l'unicita la
    // garantisce il vincolo DB, quindi sul conflitto si ritenta col successivo.
    const slugConSuffisso = (k: number) =>
      k === 0 ? slugBase : `${slugBase}-${k + 1}`;
    const presi = new Set(categorie.map((c) => c.slug));
    let inizio = 0;
    while (presi.has(slugConSuffisso(inizio))) inizio++;

    let creato = false;
    // Margine di ritentativi oltre il primo libero: assorbe un'eventuale insert
    // concorrente che occupa lo slug tra la lettura e la nostra insert (race).
    for (let tent = 0; tent < 20; tent++) {
      const slug = slugConSuffisso(inizio + tent);
      const { error } = await supabase
        .from("categorie")
        .insert({ slug, nome, parent_id: parentId, ordine });
      if (!error) {
        creato = true;
        break;
      }
      if (error.code === "23505") continue; // slug gia in uso -> nuovo suffisso
      if (error.code === "23503") return { ok: false, error: PADRE_SPARITO };
      if (error.code === PG_CHECK_VIOLATION) return { ok: false, error: QUARTO_LIVELLO };
      return { ok: false, error: error.message };
    }
    if (!creato) {
      return {
        ok: false,
        error: "Conflitto nell'assegnare l'indirizzo della categoria. Riprova.",
      };
    }

    const aggiornate = await leggiCategorie(supabase);
    revalida();
    return { ok: true, categorie: aggiornate };
  } catch {
    return ERRORE_RETE;
  }
}

/**
 * DISATTIVATA sul sito pubblicato. Riscriveva in blocco gli slug di TUTTE le
 * categorie (forma gerarchica leggibile, es. "uomo-t-shirt-anime-manga"), ma
 * NON crea redirect dai vecchi indirizzi: su un sito gia online ogni URL
 * /categoria/* indicizzato (Google/social) e ogni link condiviso finirebbe in
 * 404, e una passata fallita a meta lascerebbe categorie su slug tmp-... rotti.
 * Il pulsante nel pannello e stato rimosso; questa guardia server-side blocca
 * l'action anche se venisse invocata comunque. Per riabilitarla serve prima un
 * sistema di redirect stabile dai vecchi slug ai nuovi (fuori scope qui).
 */
export async function rigeneraSlugCategorieAction(): Promise<EsitoCategorie> {
  const sessione = await verifySession();
  if (!sessione) return NON_AUTORIZZATO;

  return {
    ok: false,
    error:
      "Funzione non disponibile: il sito e pubblicato e rigenerare gli indirizzi romperebbe i link gia indicizzati.",
  };
}

// Ordine di priorita dei TEMI di terzo livello (le licenze ricorrenti sotto ogni
// tipo di prodotto). Calcio sempre per primo: e il forte del negozio.
const PRIORITA_TEMI = [
  "Calcio",
  "Motorsport",
  "Gaming",
  "Anime & Manga",
  "Film & Serie TV",
  "Musica",
];

/** Indice di priorita di un tema (case-insensitive), o +Inf se non e un tema. */
function indiceTema(nome: string): number {
  const n = nome.trim().toLowerCase();
  const i = PRIORITA_TEMI.findIndex((t) => t.toLowerCase() === n);
  return i === -1 ? Number.POSITIVE_INFINITY : i;
}

/**
 * Ordina i TEMI di terzo livello (Calcio, Motorsport, ...) secondo PRIORITA_TEMI
 * in TUTTI i gruppi in cui compaiono, cosi la navigazione e coerente ovunque
 * (stesso ordine, Calcio sempre primo). Tocca solo i gruppi che contengono
 * almeno un tema noto: i figli non tematici (es. Ciclismo > T-shirt/Salopette) e
 * le categorie principali/di 2o livello NON vengono riordinati. Operazione
 * manuale (pulsante nel pannello); aggiorna `ordine` solo dove cambia davvero.
 */
export async function riordinaTemiAction(): Promise<EsitoCategorie> {
  const sessione = await verifySession();
  if (!sessione) return NON_AUTORIZZATO;
  const { supabase } = sessione;

  try {
    const categorie = await leggiCategorie(supabase);

    const perParent = new Map<string, Categoria[]>();
    for (const c of categorie) {
      if (!c.parent_id) continue;
      const arr = perParent.get(c.parent_id);
      if (arr) arr.push(c);
      else perParent.set(c.parent_id, [c]);
    }

    for (const figli of perParent.values()) {
      // Salta i gruppi senza alcun tema noto (non li tocchiamo).
      if (!figli.some((f) => Number.isFinite(indiceTema(f.nome)))) continue;

      // Temi per priorita; i non-temi restano dopo, nel loro ordine attuale.
      const ordinati = [...figli].sort((a, b) => {
        const ia = indiceTema(a.nome);
        const ib = indiceTema(b.nome);
        if (ia !== ib) return ia - ib;
        return a.ordine - b.ordine || a.id.localeCompare(b.id);
      });

      for (let i = 0; i < ordinati.length; i++) {
        if (ordinati[i].ordine === i) continue;
        const { error } = await supabase
          .from("categorie")
          .update({ ordine: i })
          .eq("id", ordinati[i].id);
        if (error) {
          return {
            ok: false,
            error: error.message,
            categorie: await leggiCategorie(supabase),
          };
        }
      }
    }

    const aggiornate = await leggiCategorie(supabase);
    revalida();
    return { ok: true, categorie: aggiornate };
  } catch {
    return ERRORE_RETE;
  }
}

/**
 * Rinomina una categoria. Aggiorna SOLO `nome`, mai lo slug: lo slug e un
 * identificatore stabile (URL/SEO/consumatori) e rigenerarlo li romperebbe.
 */
export async function rinominaCategoriaAction(
  id: string,
  nome: string,
): Promise<EsitoCategorie> {
  const sessione = await verifySession();
  if (!sessione) return NON_AUTORIZZATO;
  const { supabase } = sessione;

  const nuovoNome = (nome ?? "").trim();
  if (!nuovoNome) return { ok: false, error: "Il nome e obbligatorio." };

  try {
    const { error } = await supabase
      .from("categorie")
      .update({ nome: nuovoNome })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    const categorie = await leggiCategorie(supabase);
    revalida();
    return { ok: true, categorie };
  } catch {
    return ERRORE_RETE;
  }
}

/**
 * Sposta una categoria nella gerarchia: nuovoParentId null = promuovi a principale;
 * valorizzato = rendi figlia di quella categoria (radice o 2o livello). Barriera
 * anti-4o-livello: profondita(nuovo padre) + altezza(sottoalbero spostato) <= 3.
 */
export async function spostaCategoriaAction(
  id: string,
  nuovoParentId: string | null,
): Promise<EsitoCategorie> {
  const sessione = await verifySession();
  if (!sessione) return NON_AUTORIZZATO;
  const { supabase } = sessione;

  if (id === nuovoParentId) {
    return { ok: false, error: "Una categoria non puo essere figlia di se stessa." };
  }
  const parentId = nuovoParentId ?? null;

  try {
    const { data: riga } = await supabase
      .from("categorie")
      .select("id, parent_id")
      .eq("id", id)
      .maybeSingle();
    if (!riga) return { ok: false, error: "Categoria non trovata. Aggiorna la pagina." };

    // Nessun cambiamento reale: no-op (ritorna comunque il canonico).
    if ((riga.parent_id ?? null) === parentId) {
      const categorie = await leggiCategorie(supabase);
      return { ok: true, categorie };
    }

    if (parentId !== null) {
      const profonditaPadre = await profonditaCategoria(supabase, parentId);
      if (profonditaPadre === null) return { ok: false, error: PADRE_SPARITO };
      if (profonditaPadre >= 3) return { ok: false, error: QUARTO_LIVELLO };

      // Figli e nipoti seguono la categoria spostata: l'altezza del suo
      // sottoalbero decide dove puo andare senza sforare il 3o livello.
      const { data: figli, error: errFigli } = await supabase
        .from("categorie")
        .select("id")
        .eq("parent_id", id);
      if (errFigli) return { ok: false, error: errFigli.message };
      const idsFigli = (figli ?? []).map((f) => f.id);
      if (idsFigli.length > 0) {
        if (profonditaPadre >= 2) {
          return {
            ok: false,
            error:
              "Le sue sottocategorie finirebbero al quarto livello: puo stare solo sotto una categoria principale.",
          };
        }
        const { count, error: errNipoti } = await supabase
          .from("categorie")
          .select("id", { count: "exact", head: true })
          .in("parent_id", idsFigli);
        if (errNipoti) return { ok: false, error: errNipoti.message };
        if ((count ?? 0) > 0) {
          return {
            ok: false,
            error:
              "Ha gia due livelli di sottocategorie: puo restare solo principale.",
          };
        }
      }
    }

    const ordine = await prossimoOrdine(supabase, parentId);
    const { error } = await supabase
      .from("categorie")
      .update({ parent_id: parentId, ordine })
      .eq("id", id);
    if (error) {
      if (error.code === "23503") return { ok: false, error: PADRE_SPARITO };
      if (error.code === PG_CHECK_VIOLATION) return { ok: false, error: QUARTO_LIVELLO };
      return { ok: false, error: error.message };
    }

    const categorie = await leggiCategorie(supabase);
    revalida();
    return { ok: true, categorie };
  } catch {
    return ERRORE_RETE;
  }
}

/**
 * Riordina i fratelli di UN gruppo (stesso parent). Come riordinaFotoGalleriaAction
 * ma con guardia sul parent: l'update tocca solo righe di quel gruppo (un id
 * reparentato altrove finisce su 0 righe = innocuo).
 */
export async function riordinaCategorieAction(
  parentId: string | null,
  idsInOrdine: string[],
): Promise<EsitoCategorie> {
  const sessione = await verifySession();
  if (!sessione) return NON_AUTORIZZATO;
  const { supabase } = sessione;

  try {
    for (let i = 0; i < idsInOrdine.length; i++) {
      const upd = supabase
        .from("categorie")
        .update({ ordine: i })
        .eq("id", idsInOrdine[i]);
      const { error } = await (parentId === null
        ? upd.is("parent_id", null)
        : upd.eq("parent_id", parentId));
      // Il loop non e atomico: su errore a meta riordino ritorno comunque il
      // canonico, cosi il client si riallinea allo stato reale (annulla l'ottimistico).
      if (error) {
        const categorie = await leggiCategorie(supabase);
        return { ok: false, error: error.message, categorie };
      }
    }

    const categorie = await leggiCategorie(supabase);
    revalida();
    return { ok: true, categorie };
  } catch {
    return ERRORE_RETE;
  }
}

/**
 * Fasce home 'prodotti_auto' che agganciano una categoria. La regola 'categoria'
 * salva l'id in config.categoriaId, un valore jsonb e NON una FK: nessun
 * ON DELETE lo ripulisce, quindi quando la categoria sparisce il riferimento
 * resta appeso, la fascia trova 0 prodotti e svanisce dalla home senza avviso.
 * Vanno sganciate a mano. Throw su errore (il try/catch del chiamante ritorna
 * ok:false).
 */
async function fasceConCategoria(
  supabase: SupabaseGestore,
  categoriaId: string,
): Promise<{ id: string; config: ConfigVetrina }[]> {
  // Le fasce sono poche (vetrina curata a mano): leggo le prodotti_auto e
  // filtro in memoria, evitando un filtro jsonb (config->>categoriaId) piu
  // fragile da tipizzare sul client generato.
  const { data, error } = await supabase
    .from("vetrina_sezioni")
    .select("id, config")
    .eq("tipo", "prodotti_auto");
  if (error) throw error;
  return (data ?? [])
    .map((r) => ({
      id: r.id as string,
      config: (r.config ?? {}) as ConfigVetrina,
    }))
    .filter((r) => r.config.categoriaId === categoriaId);
}

/**
 * Quante fasce home puntano a questa categoria: avviso pre-eliminazione per il
 * pannello (il dato non e in pagina come prodotti/sottocategorie). Best-effort:
 * su errore ritorna 0, non deve bloccare la conferma di eliminazione.
 */
export async function contaFasceVetrinaCategoriaAction(
  id: string,
): Promise<number> {
  const sessione = await verifySession();
  if (!sessione) return 0;
  try {
    return (await fasceConCategoria(sessione.supabase, id)).length;
  } catch {
    return 0;
  }
}

/**
 * Elimina una categoria (sempre hard-delete, a differenza dei prodotti): entrambe
 * le FK sono ON DELETE SET NULL, quindi i prodotti restano "senza categoria".
 * I figli risalgono di un livello (sotto il padre della eliminata; a radice se
 * era una radice): il re-parent esplicito prima del delete evita che le nipoti
 * saltino a principali via SET NULL. La conferma con l'impatto (prodotti +
 * sottocategorie) e UI lato client, non un secondo round-trip.
 */
export async function eliminaCategoriaAction(id: string): Promise<EsitoCategorie> {
  const sessione = await verifySession();
  if (!sessione) return NON_AUTORIZZATO;
  const { supabase } = sessione;

  try {
    // Errore di lettura esplicito: degradare a null promuoverebbe i figli a
    // radice invece di farli risalire sotto il nonno.
    const { data: riga, error: errRiga } = await supabase
      .from("categorie")
      .select("id, parent_id")
      .eq("id", id)
      .maybeSingle();
    if (errRiga) return { ok: false, error: errRiga.message };
    const nuovoParent = riga?.parent_id ?? null;

    const { data: figli, error: errFigli } = await supabase
      .from("categorie")
      .select("id")
      .eq("parent_id", id)
      .order("ordine", { ascending: true })
      .order("id", { ascending: true });
    if (errFigli) return { ok: false, error: errFigli.message };

    // Accoda i figli al gruppo di destinazione conservando il loro ordine
    // relativo. Non atomico col delete: se il delete poi fallisce i figli
    // restano spostati, il canonico riallinea comunque la UI.
    if (figli && figli.length > 0) {
      const base = await prossimoOrdine(supabase, nuovoParent);
      for (let i = 0; i < figli.length; i++) {
        const { error } = await supabase
          .from("categorie")
          .update({ parent_id: nuovoParent, ordine: base + i })
          .eq("id", figli[i].id);
        if (error) return { ok: false, error: error.message };
      }
    }

    // Sgancia le fasce home agganciate a questa categoria PRIMA del delete:
    // config.categoriaId e jsonb, non una FK, quindi nessun SET NULL lo
    // ripulisce. Azzerandolo la fascia ricade sul default (novita) invece di
    // trovare 0 prodotti e sparire dalla home in silenzio. Non atomico col
    // delete: il canonico riallinea comunque la UI.
    const fasce = await fasceConCategoria(supabase, id);
    for (const f of fasce) {
      const { error } = await supabase
        .from("vetrina_sezioni")
        .update({ config: { ...f.config, categoriaId: null } })
        .eq("id", f.id);
      if (error) return { ok: false, error: error.message };
    }

    const { error } = await supabase.from("categorie").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") {
        return { ok: false, error: "Impossibile eliminare: categoria in uso." };
      }
      return { ok: false, error: error.message };
    }

    const categorie = await leggiCategorie(supabase);
    revalida();
    return { ok: true, categorie };
  } catch {
    return ERRORE_RETE;
  }
}
