"use server";

// Server Actions per la gestione delle categorie (area gestore).
// Gerarchia a 2 LIVELLI: radici (parent_id null, es. Uomo/Donna) + figli
// (parent_id valorizzato, es. Polo/Coreane). I consumatori (vetrina, FormProdotto,
// GeneraDaFoto) raggruppano per parent_id e ordinano per `ordine` asc: queste
// action tengono coerenti `ordine` (per gruppo) e `parent_id` (mai un 3o livello).
//
// Pattern obbligatorio (come actions.ts / galleria):
//   1) verifySession() -> early-return { ok:false, error:"Non autorizzato." };
//   2) mutazione via sessione.supabase (anon + RLS is_gestore) in try/catch;
//   3) ogni mutazione ritorna la LISTA CANONICA (categorie[]) per riallineare il
//      client (come le action galleria ritornano foto[]).

import { revalidatePath } from "next/cache";

import { verifySession } from "@/lib/gestore/auth";
import { slugify } from "@/lib/gestore/slug";
import type { Categoria } from "@/lib/types";

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
const TERZO_LIVELLO = "Non puoi creare un terzo livello di categorie.";
// Codice sollevato dal trigger DB categorie_max_due_livelli (check_violation):
// barriera autoritativa contro un 3o livello creato da mutazioni concorrenti.
const PG_CHECK_VIOLATION = "23514";

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
  // Pattern dinamico -> serve il type 'page' (non la URL letterale).
  revalidatePath("/prodotti/[slug]", "page");
}

/**
 * Crea una categoria. `parentId` null = categoria principale; valorizzato = figlia.
 * Anti-3o-livello: il padre deve essere una radice. Slug univoco garantito dal DB
 * (intercetta 23505 e ritenta col suffisso, niente pre-check soggetto a race).
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
  const slugBase = slugify(nome);
  if (!slugBase) return { ok: false, error: "Nome non valido." };
  const parentId = input.parentId ?? null;

  try {
    if (parentId !== null) {
      const { data: padre } = await supabase
        .from("categorie")
        .select("id, parent_id")
        .eq("id", parentId)
        .maybeSingle();
      if (!padre) return { ok: false, error: PADRE_SPARITO };
      if (padre.parent_id !== null) return { ok: false, error: TERZO_LIVELLO };
    }

    const ordine = await prossimoOrdine(supabase, parentId);

    let creato = false;
    for (let tent = 0; tent < 6; tent++) {
      const slug = tent === 0 ? slugBase : `${slugBase}-${tent + 1}`;
      const { error } = await supabase
        .from("categorie")
        .insert({ slug, nome, parent_id: parentId, ordine });
      if (!error) {
        creato = true;
        break;
      }
      if (error.code === "23505") continue; // slug gia in uso -> nuovo suffisso
      if (error.code === "23503") return { ok: false, error: PADRE_SPARITO };
      if (error.code === PG_CHECK_VIOLATION) return { ok: false, error: TERZO_LIVELLO };
      return { ok: false, error: error.message };
    }
    if (!creato) {
      return { ok: false, error: "Nome troppo simile a una categoria esistente." };
    }

    const categorie = await leggiCategorie(supabase);
    revalida();
    return { ok: true, categorie };
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
 * valorizzato = rendi figlia di quella radice. Doppia barriera anti-3o-livello:
 * la categoria spostata non deve avere figli e il nuovo padre dev'essere una radice.
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
      const { count } = await supabase
        .from("categorie")
        .select("id", { count: "exact", head: true })
        .eq("parent_id", id);
      if ((count ?? 0) > 0) {
        return { ok: false, error: "Sposta o promuovi prima le sottocategorie." };
      }
      const { data: padre } = await supabase
        .from("categorie")
        .select("id, parent_id")
        .eq("id", parentId)
        .maybeSingle();
      if (!padre) return { ok: false, error: PADRE_SPARITO };
      if (padre.parent_id !== null) return { ok: false, error: TERZO_LIVELLO };
    }

    const ordine = await prossimoOrdine(supabase, parentId);
    const { error } = await supabase
      .from("categorie")
      .update({ parent_id: parentId, ordine })
      .eq("id", id);
    if (error) {
      if (error.code === "23503") return { ok: false, error: PADRE_SPARITO };
      if (error.code === PG_CHECK_VIOLATION) return { ok: false, error: TERZO_LIVELLO };
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
 * Elimina una categoria (sempre hard-delete, a differenza dei prodotti): entrambe
 * le FK sono ON DELETE SET NULL, quindi i prodotti restano "senza categoria" e i
 * figli vengono promossi a radice dal DB. La conferma con l'impatto (prodotti +
 * sottocategorie) e UI lato client, non un secondo round-trip.
 */
export async function eliminaCategoriaAction(id: string): Promise<EsitoCategorie> {
  const sessione = await verifySession();
  if (!sessione) return NON_AUTORIZZATO;
  const { supabase } = sessione;

  try {
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
