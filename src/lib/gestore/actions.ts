"use server";

// Server Actions del catalogo (area gestore).
// Pattern obbligatorio per OGNI action:
//   1) verifySession() -> early-return se non gestore (i POST sono raggiungibili
//      direttamente, quindi il check va ripetuto qui, non solo nel layout/proxy);
//   2) mutazione via anon key + sessione + RLS (is_gestore), in try/catch;
//   3) revalidatePath e/o redirect FUORI dal try/catch.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { verifySession } from "@/lib/gestore/auth";
import type { VarianteInput } from "@/lib/types";

/** Esito generico di un'azione che non redirige. */
export interface EsitoAzione {
  ok: boolean;
  error?: string;
}

/**
 * Attiva/disattiva un prodotto (soft-delete: sparisce dalla vetrina, resta
 * visibile al gestore). Ritorna l'esito per il revert ottimistico lato client.
 */
export async function toggleAttivoAction(
  id: string,
  attivo: boolean,
): Promise<EsitoAzione> {
  const sessione = await verifySession();
  if (!sessione) return { ok: false, error: "Non autorizzato." };

  try {
    const { error } = await sessione.supabase
      .from("prodotti")
      .update({ attivo })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/gestore/prodotti");
    revalidatePath("/");
    return { ok: true };
  } catch {
    return { ok: false, error: "Errore di rete. Riprova." };
  }
}

/** Stato del form prodotto (errori per campo o messaggio di esito). */
export interface StatoForm {
  ok?: boolean;
  message?: string;
  errors?: {
    nome?: string;
    slug?: string;
    prezzo?: string;
    generale?: string;
  };
}

/** Traduce un errore Postgres in un messaggio per il form. */
function mappaErroreProdotto(error: {
  code?: string;
  message: string;
}): StatoForm {
  // 23505 = unique_violation: qui puo solo essere lo slug (unico vincolo unique).
  if (error.code === "23505") {
    return { errors: { slug: "Questo slug e gia in uso da un altro prodotto." } };
  }
  return { errors: { generale: error.message } };
}

/**
 * Crea (se manca `id`) o aggiorna un prodotto. La univocita dello slug e
 * garantita dal vincolo unique del DB: intercettiamo il 23505 invece di
 * affidarci a un pre-check (che lascerebbe aperta una race).
 */
export async function salvaProdottoAction(
  _stato: StatoForm,
  formData: FormData,
): Promise<StatoForm> {
  const sessione = await verifySession();
  if (!sessione) return { errors: { generale: "Non autorizzato." } };

  const id = String(formData.get("id") ?? "").trim();
  const nome = String(formData.get("nome") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const descrizione = String(formData.get("descrizione") ?? "").trim();
  const prezzoCents = Number.parseInt(
    String(formData.get("prezzo_cents") ?? ""),
    10,
  );
  const attivo = formData.get("attivo") === "true";

  const errors: NonNullable<StatoForm["errors"]> = {};
  if (!nome) errors.nome = "Il nome e obbligatorio.";
  if (!/^[a-z0-9-]+$/.test(slug)) {
    errors.slug = "Solo minuscole, numeri e trattini.";
  }
  if (!Number.isInteger(prezzoCents) || prezzoCents <= 0) {
    errors.prezzo = "Inserisci un prezzo valido maggiore di zero.";
  }
  if (Object.keys(errors).length > 0) return { errors };

  const valori = {
    nome,
    slug,
    descrizione: descrizione || null,
    prezzo_cents: prezzoCents,
    attivo,
  };

  let nuovoId = id;
  try {
    if (id) {
      const { error } = await sessione.supabase
        .from("prodotti")
        .update(valori)
        .eq("id", id);
      if (error) return mappaErroreProdotto(error);
    } else {
      const { data, error } = await sessione.supabase
        .from("prodotti")
        .insert(valori)
        .select("id")
        .single();
      if (error) return mappaErroreProdotto(error);
      nuovoId = data.id;
    }
  } catch {
    return { errors: { generale: "Errore di rete. Riprova." } };
  }

  revalidatePath("/gestore/prodotti");
  revalidatePath("/");
  // PDP pubblica: rotta dinamica -> pattern + tipo 'page' (non la URL letterale).
  revalidatePath("/prodotti/[slug]", "page");

  // In creazione si va alla pagina di modifica (per foto/varianti).
  // redirect() lancia NEXT_REDIRECT: deve stare fuori dal try/catch.
  if (!id) redirect(`/gestore/prodotti/${nuovoId}`);
  return { ok: true, message: "Modifiche salvate." };
}

/** Una variante come persistita a DB (ritornata dopo il salvataggio). */
export interface VarianteSalvata {
  id: string;
  taglia: string | null;
  colore: string | null;
  sku: string;
  stock: number;
}

/** Esito del salvataggio varianti. */
export interface EsitoVarianti {
  ok: boolean;
  error?: string;
  /** Avviso non bloccante (es. righe di carrello svuotate da una CASCADE). */
  avviso?: string;
  /** Stato canonico dopo il salvataggio (per riallineare il client). */
  varianti?: VarianteSalvata[];
}

function mappaErroreSku(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "SKU gia in uso (deve essere univoco).";
  return error.message;
}

/**
 * Salva le varianti di un prodotto facendo il diff con lo stato a DB:
 * insert delle nuove, update delle esistenti, delete di quelle rimosse.
 * NON e atomico (il client JS non ha transazioni multi-statement): in caso di
 * errore interrompe e ritorna lo stato; il client poi riallinea col refetch.
 * Avvisa se l'eliminazione di una variante svuota righe di carrello (CASCADE).
 */
export async function salvaVariantiAction(
  prodottoId: string,
  righe: VarianteInput[],
): Promise<EsitoVarianti> {
  const sessione = await verifySession();
  if (!sessione) return { ok: false, error: "Non autorizzato." };
  const { supabase } = sessione;

  // Validazione.
  for (const r of righe) {
    if (!r.sku || !r.sku.trim()) {
      return { ok: false, error: "Ogni variante deve avere uno SKU." };
    }
    if (!Number.isInteger(r.stock) || r.stock < 0) {
      return { ok: false, error: "Lo stock deve essere un intero >= 0." };
    }
  }
  const skus = righe.map((r) => r.sku.trim());
  if (new Set(skus).size !== skus.length) {
    return { ok: false, error: "Ci sono SKU duplicati tra le varianti." };
  }

  try {
    const { data: attuali, error: errLeggi } = await supabase
      .from("varianti")
      .select("id")
      .eq("prodotto_id", prodottoId);
    if (errLeggi) return { ok: false, error: errLeggi.message };

    const idsAttuali = new Set((attuali ?? []).map((v) => v.id as string));
    const idsForm = new Set(
      righe.filter((r) => r.id).map((r) => r.id as string),
    );
    const daEliminare = [...idsAttuali].filter((id) => !idsForm.has(id));

    // Prima update e insert: un conflitto SKU (23505) interrompe QUI, prima di
    // qualunque delete distruttiva (CASCADE sui carrelli), evitando perdite
    // silenziose. `.eq("prodotto_id")` confina l'update al prodotto in editing.
    for (const r of righe.filter((x) => x.id)) {
      const { error } = await supabase
        .from("varianti")
        .update({
          taglia: r.taglia,
          colore: r.colore,
          sku: r.sku.trim(),
          stock: r.stock,
        })
        .eq("id", r.id as string)
        .eq("prodotto_id", prodottoId);
      if (error) return { ok: false, error: mappaErroreSku(error) };
    }

    const nuove = righe
      .filter((x) => !x.id)
      .map((r) => ({
        prodotto_id: prodottoId,
        taglia: r.taglia,
        colore: r.colore,
        sku: r.sku.trim(),
        stock: r.stock,
      }));
    if (nuove.length > 0) {
      const { error } = await supabase.from("varianti").insert(nuove);
      if (error) return { ok: false, error: mappaErroreSku(error) };
    }

    // Solo ora le delete (irreversibili: CASCADE su carrello_righe).
    let avviso: string | undefined;
    if (daEliminare.length > 0) {
      const { count } = await supabase
        .from("carrello_righe")
        .select("id", { count: "exact", head: true })
        .in("variante_id", daEliminare);
      if ((count ?? 0) > 0) {
        avviso = `${count} riga/he di carrello clienti rimossa/e con le varianti eliminate.`;
      }
      const { error: errDel } = await supabase
        .from("varianti")
        .delete()
        .in("id", daEliminare);
      if (errDel) return { ok: false, error: errDel.message };
    }

    const { data: finali } = await supabase
      .from("varianti")
      .select("id, taglia, colore, sku, stock")
      .eq("prodotto_id", prodottoId)
      .order("creato_il", { ascending: true });

    revalidatePath("/gestore/prodotti");
    revalidatePath(`/gestore/prodotti/${prodottoId}`);
    revalidatePath("/");

    return {
      ok: true,
      avviso,
      varianti: (finali as VarianteSalvata[] | null) ?? [],
    };
  } catch {
    return { ok: false, error: "Errore di rete. Riprova." };
  }
}

/**
 * Carica/sostituisce la foto del prodotto su Supabase Storage.
 * Naming deterministico `<prodottoId>/cover.webp` con upsert: niente file
 * orfani e nessun cleanup fragile. Alla public URL aggiunge `?v=<ts>` per
 * bustare la cache della CDN (la url e deterministica).
 * Accetta SOLO WebP: l'uploader converte sempre lato client, cosi il file
 * salvato (estensione .webp + content-type) e sempre coerente.
 */
export async function caricaFotoAction(
  prodottoId: string,
  formData: FormData,
): Promise<{ url?: string; error?: string }> {
  const sessione = await verifySession();
  if (!sessione) return { error: "Non autorizzato." };
  const { supabase } = sessione;

  const file = formData.get("foto");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Nessun file selezionato." };
  }
  if (file.type !== "image/webp") {
    return { error: "Formato non valido: l'immagine va convertita in WebP." };
  }

  const path = `${prodottoId}/cover.webp`;
  try {
    const { error: up } = await supabase.storage
      .from("prodotti")
      .upload(path, file, { upsert: true, contentType: "image/webp" });
    if (up) return { error: up.message };

    const { data } = supabase.storage.from("prodotti").getPublicUrl(path);
    const url = `${data.publicUrl}?v=${Date.now()}`;

    const { error: dbErr } = await supabase
      .from("prodotti")
      .update({ immagine_url: url })
      .eq("id", prodottoId);
    if (dbErr) return { error: dbErr.message };

    revalidatePath("/gestore/prodotti");
    revalidatePath(`/gestore/prodotti/${prodottoId}`);
    revalidatePath("/");
    revalidatePath("/prodotti/[slug]", "page");
    return { url };
  } catch {
    return { error: "Errore di rete durante il caricamento." };
  }
}

/** Rimuove la foto del prodotto (file su Storage + immagine_url a null). */
export async function rimuoviFotoAction(
  prodottoId: string,
): Promise<EsitoAzione> {
  const sessione = await verifySession();
  if (!sessione) return { ok: false, error: "Non autorizzato." };
  const { supabase } = sessione;

  try {
    // Svuota la cartella del prodotto (lo Storage non conosce il DB).
    const { data: files } = await supabase.storage
      .from("prodotti")
      .list(prodottoId);
    if (files && files.length > 0) {
      await supabase.storage
        .from("prodotti")
        .remove(files.map((f) => `${prodottoId}/${f.name}`));
    }

    const { error } = await supabase
      .from("prodotti")
      .update({ immagine_url: null })
      .eq("id", prodottoId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/gestore/prodotti");
    revalidatePath(`/gestore/prodotti/${prodottoId}`);
    revalidatePath("/");
    revalidatePath("/prodotti/[slug]", "page");
    return { ok: true };
  } catch {
    return { ok: false, error: "Errore di rete. Riprova." };
  }
}

/** Esito dell'eliminazione: `soft` = nascosto (gia venduto) invece di eliminato. */
export interface EsitoElimina {
  ok: boolean;
  error?: string;
  soft?: boolean;
}

/**
 * Elimina un prodotto. Strategia sicura rispetto allo storico ordini:
 * - se il prodotto e stato venduto (esistono ordine_righe) -> SOFT delete
 *   (attivo=false): ordine_righe.prodotto_id e ON DELETE SET NULL, quindi un
 *   hard-delete spezzerebbe il legame con gli ordini;
 * - se non e mai stato venduto -> hard delete (cleanup foto + delete; le
 *   varianti spariscono via ON DELETE CASCADE).
 * Il check su ordine_righe e possibile grazie alla policy SELECT per il gestore.
 */
export async function eliminaProdottoAction(id: string): Promise<EsitoElimina> {
  const sessione = await verifySession();
  if (!sessione) return { ok: false, error: "Non autorizzato." };
  const { supabase } = sessione;

  try {
    const { count } = await supabase
      .from("ordine_righe")
      .select("id", { count: "exact", head: true })
      .eq("prodotto_id", id);

    if ((count ?? 0) > 0) {
      const { error } = await supabase
        .from("prodotti")
        .update({ attivo: false })
        .eq("id", id);
      if (error) return { ok: false, error: error.message };
      revalidatePath("/gestore/prodotti");
      revalidatePath("/");
      return { ok: true, soft: true };
    }

    const { data: files } = await supabase.storage.from("prodotti").list(id);
    if (files && files.length > 0) {
      await supabase.storage
        .from("prodotti")
        .remove(files.map((f) => `${id}/${f.name}`));
    }
    const { error } = await supabase.from("prodotti").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/gestore/prodotti");
    revalidatePath("/");
    return { ok: true, soft: false };
  } catch {
    return { ok: false, error: "Errore di rete. Riprova." };
  }
}
