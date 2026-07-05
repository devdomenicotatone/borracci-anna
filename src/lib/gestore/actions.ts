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
import { slugify } from "@/lib/gestore/slug";
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
  /** Avviso non bloccante (es. righe di carrello svuotate da una CASCADE). */
  avviso?: string;
  errors?: {
    nome?: string;
    slug?: string;
    codice?: string;
    prezzo?: string;
    generale?: string;
  };
}

/** Traduce un errore Postgres in un messaggio per il form. */
function mappaErroreProdotto(error: {
  code?: string;
  message: string;
}): StatoForm {
  // 23505 = unique_violation: puo essere lo slug o il codice (i due vincoli
  // unique su prodotti). Il nome del vincolo nel messaggio distingue quale.
  if (error.code === "23505") {
    if (error.message.includes("codice")) {
      return {
        errors: { codice: "Questo codice e gia in uso da un altro prodotto." },
      };
    }
    return { errors: { slug: "Questo slug e gia in uso da un altro prodotto." } };
  }
  // 23503 = foreign_key_violation: categoria_id che non esiste piu (es. categoria
  // cancellata tra il render del form e il submit).
  if (error.code === "23503") {
    return {
      errors: {
        generale: "La categoria selezionata non esiste piu. Aggiorna la pagina e riprova.",
      },
    };
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
  const codice = String(formData.get("codice") ?? "").trim();
  const descrizione = String(formData.get("descrizione") ?? "").trim();
  const categoriaIdRaw = String(formData.get("categoria_id") ?? "").trim();
  const categoriaId = categoriaIdRaw || null;
  const prezzoCents = Number.parseInt(
    String(formData.get("prezzo_cents") ?? ""),
    10,
  );
  const attivo = formData.get("attivo") === "true";
  const disponibilitaSuRichiesta =
    formData.get("disponibilita_su_richiesta") === "true";
  const soloOnline = formData.get("solo_online") === "true";

  // Varianti serializzate dal form (JSON). Presenti solo in modifica: in
  // creazione il prodotto non ha ancora un id a cui agganciarle.
  let variantiInput: VarianteInput[] | null = null;
  const variantiRaw = formData.get("varianti");
  if (typeof variantiRaw === "string" && variantiRaw.trim()) {
    try {
      variantiInput = JSON.parse(variantiRaw) as VarianteInput[];
    } catch {
      return { errors: { generale: "Dati varianti non validi." } };
    }
  }

  const errors: NonNullable<StatoForm["errors"]> = {};
  if (!nome) errors.nome = "Il nome e obbligatorio.";
  if (!/^[a-z0-9-]+$/.test(slug)) {
    errors.slug = "Solo minuscole, numeri e trattini.";
  }
  if (codice && slugify(codice) === "") {
    errors.codice = "Codice non valido: usa lettere o numeri.";
  }
  if (!Number.isInteger(prezzoCents) || prezzoCents <= 0) {
    errors.prezzo = "Inserisci un prezzo valido maggiore di zero.";
  }
  if (Object.keys(errors).length > 0) return { errors };

  const valori = {
    nome,
    slug,
    codice: codice || null,
    descrizione: descrizione || null,
    categoria_id: categoriaId,
    prezzo_cents: prezzoCents,
    attivo,
    disponibilita_su_richiesta: disponibilitaSuRichiesta,
    solo_online: soloOnline,
  };

  let nuovoId = id;
  let avviso: string | undefined;
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
    // Varianti applicate nello stesso salvataggio (solo in modifica). Il diff
    // preserva id/giacenze; un conflitto SKU non tocca i dati gia salvati.
    if (id && variantiInput) {
      const esito = await applicaVarianti(
        sessione.supabase,
        id,
        variantiInput,
      );
      if (!esito.ok) return { errors: { generale: esito.error } };
      avviso = esito.avviso;
    }
  } catch {
    return { errors: { generale: "Errore di rete. Riprova." } };
  }

  revalidatePath("/gestore/prodotti");
  revalidatePath(`/gestore/prodotti/${nuovoId}`);
  revalidatePath("/");
  // PDP pubblica: rotta dinamica -> pattern + tipo 'page' (non la URL letterale).
  revalidatePath("/prodotti/[slug]", "page");

  // In creazione si va alla pagina di modifica (per foto/varianti).
  // redirect() lancia NEXT_REDIRECT: deve stare fuori dal try/catch.
  if (!id) redirect(`/gestore/prodotti/${nuovoId}`);
  return { ok: true, message: "Modifiche salvate.", avviso };
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
 * Applica il diff delle varianti di un prodotto (insert nuove, update esistenti,
 * delete rimosse) preservando id e giacenze. Update e insert PRIMA delle delete:
 * un conflitto SKU (23505) interrompe prima di qualunque delete distruttiva
 * (CASCADE sui carrelli), evitando perdite silenziose. NON e atomico (il client
 * JS non ha transazioni multi-statement). Ritorna lo stato canonico + un
 * eventuale avviso (righe di carrello svuotate). Riusato da `salvaProdottoAction`
 * (salvataggio unico) e da `salvaVariantiAction`.
 */
async function applicaVarianti(
  supabase: SupabaseClient,
  prodottoId: string,
  righe: VarianteInput[],
): Promise<
  | { ok: true; avviso?: string; varianti: VarianteSalvata[] }
  | { ok: false; error: string }
> {
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

  const { data: attuali, error: errLeggi } = await supabase
    .from("varianti")
    .select("id")
    .eq("prodotto_id", prodottoId);
  if (errLeggi) return { ok: false, error: errLeggi.message };

  const idsAttuali = new Set((attuali ?? []).map((v) => v.id as string));
  const idsForm = new Set(righe.filter((r) => r.id).map((r) => r.id as string));
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

  return {
    ok: true,
    avviso,
    varianti: (finali as VarianteSalvata[] | null) ?? [],
  };
}

/**
 * Salva SOLO le varianti (usata da flussi che non passano dal form prodotto).
 * Il form di modifica prodotto le salva insieme al resto (salvaProdottoAction).
 */
export async function salvaVariantiAction(
  prodottoId: string,
  righe: VarianteInput[],
): Promise<EsitoVarianti> {
  const sessione = await verifySession();
  if (!sessione) return { ok: false, error: "Non autorizzato." };

  try {
    const esito = await applicaVarianti(sessione.supabase, prodottoId, righe);
    if (!esito.ok) return { ok: false, error: esito.error };

    revalidatePath("/gestore/prodotti");
    revalidatePath(`/gestore/prodotti/${prodottoId}`);
    revalidatePath("/");
    return { ok: true, avviso: esito.avviso, varianti: esito.varianti };
  } catch {
    return { ok: false, error: "Errore di rete. Riprova." };
  }
}

// ===========================================================================
// GALLERIA FOTO (prodotto_foto) — piu foto per prodotto, associabili a un colore.
// Convenzione: la COPERTINA (prodotti.immagine_url) e sempre la prima foto della
// galleria (ordine piu basso), tenuta in sync ad ogni mutazione.
// ===========================================================================

/** Una foto della galleria come persistita a DB. */
export interface FotoGalleriaRow {
  id: string;
  prodotto_id: string;
  variante_id: string | null;
  /** Colore rappresentato dalla foto (testo, dalla palette). null = generica. */
  colore: string | null;
  url: string;
  ordine: number;
}

/** Esito delle azioni galleria: ritorna lo stato canonico per riallineare il client. */
export interface EsitoGalleria {
  ok: boolean;
  error?: string;
  foto?: FotoGalleriaRow[];
}

/** Estrae il path Storage (`<prodottoId>/<file>`) dalla public URL. */
function storagePathDaUrl(url: string): string | null {
  const marker = "/prodotti/";
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return url.slice(i + marker.length).split("?")[0];
}

type SupabaseClient = Awaited<
  ReturnType<typeof verifySession>
> extends infer S
  ? S extends { supabase: infer C }
    ? C
    : never
  : never;

async function leggiGalleria(
  supabase: SupabaseClient,
  prodottoId: string,
): Promise<FotoGalleriaRow[]> {
  const { data, error } = await supabase
    .from("prodotto_foto")
    .select("id, prodotto_id, variante_id, colore, url, ordine")
    .eq("prodotto_id", prodottoId)
    .order("ordine", { ascending: true });
  // Distinguere read-fallita da galleria-vuota: un throw evita di azzerare la
  // copertina (sincronizzaCopertina) su un errore transitorio. Lo catturano i
  // try/catch delle action, che ritornano ok:false.
  if (error) throw error;
  return (data as FotoGalleriaRow[] | null) ?? [];
}

/** Copertina = prima foto della galleria (o null se vuota). */
async function sincronizzaCopertina(
  supabase: SupabaseClient,
  prodottoId: string,
  foto: FotoGalleriaRow[],
): Promise<void> {
  await supabase
    .from("prodotti")
    .update({ immagine_url: foto[0]?.url ?? null })
    .eq("id", prodottoId);
}

function revalidaProdotto(prodottoId: string): void {
  revalidatePath("/gestore/prodotti");
  revalidatePath(`/gestore/prodotti/${prodottoId}`);
  revalidatePath("/");
  revalidatePath("/prodotti/[slug]", "page");
}

/** Carica una foto WebP nella galleria del prodotto (in coda). */
export async function aggiungiFotoGalleriaAction(
  prodottoId: string,
  formData: FormData,
): Promise<EsitoGalleria> {
  const sessione = await verifySession();
  if (!sessione) return { ok: false, error: "Non autorizzato." };
  const { supabase } = sessione;

  const file = formData.get("foto");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Nessun file selezionato." };
  }
  if (file.type !== "image/webp") {
    return { ok: false, error: "Formato non valido: l'immagine va convertita in WebP." };
  }

  // LQIP generata lato client (facoltativa): accettata solo se e una data URL.
  const blurRaw = formData.get("blur");
  const blur =
    typeof blurRaw === "string" && blurRaw.startsWith("data:image/")
      ? blurRaw
      : null;

  // Colore opzionale: il flusso "Genera da foto" carica le foto gia taggate per
  // colore. Dalla galleria manuale non viene inviato -> resta null.
  const coloreRaw = formData.get("colore");
  const colore =
    typeof coloreRaw === "string" && coloreRaw.trim() ? coloreRaw.trim() : null;

  const path = `${prodottoId}/${crypto.randomUUID()}.webp`;
  try {
    const { error: up } = await supabase.storage
      .from("prodotti")
      .upload(path, file, { upsert: false, contentType: "image/webp" });
    if (up) return { ok: false, error: up.message };

    const { data } = supabase.storage.from("prodotti").getPublicUrl(path);
    const url = `${data.publicUrl}?v=${Date.now()}`;

    const attuali = await leggiGalleria(supabase, prodottoId);
    const ordine = attuali.length
      ? Math.max(...attuali.map((f) => f.ordine)) + 1
      : 0;

    const { error: ins } = await supabase
      .from("prodotto_foto")
      .insert({ prodotto_id: prodottoId, variante_id: null, colore, url, ordine, blur_data_url: blur });
    if (ins) {
      // rollback del file appena caricato per non lasciare orfani
      await supabase.storage.from("prodotti").remove([path]);
      return { ok: false, error: ins.message };
    }

    const foto = await leggiGalleria(supabase, prodottoId);
    await sincronizzaCopertina(supabase, prodottoId, foto);
    revalidaProdotto(prodottoId);
    return { ok: true, foto };
  } catch {
    return { ok: false, error: "Errore di rete durante il caricamento." };
  }
}

/**
 * Sostituisce il FILE di una foto mantenendo la riga (id/ordine/colore): carica
 * il nuovo file, aggiorna `url` + `blur_data_url`, poi cancella il vecchio file.
 * Usata dall'editor immagini. Niente sovrascrittura sullo stesso path -> nessuna
 * cache CDN stantia (il nuovo url ha un nuovo `?v=`).
 */
export async function sostituisciFotoAction(
  prodottoId: string,
  fotoId: string,
  formData: FormData,
): Promise<EsitoGalleria> {
  const sessione = await verifySession();
  if (!sessione) return { ok: false, error: "Non autorizzato." };
  const { supabase } = sessione;

  const file = formData.get("foto");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Nessun file selezionato." };
  }
  if (file.type !== "image/webp") {
    return { ok: false, error: "Formato non valido: l'immagine va convertita in WebP." };
  }
  // Blur rigenerato lato client dall'immagine modificata: se manca (generazione
  // fallita) salviamo null, cosi non resta il placeholder della foto vecchia.
  const blurRaw = formData.get("blur");
  const blur =
    typeof blurRaw === "string" && blurRaw.startsWith("data:image/")
      ? blurRaw
      : null;

  try {
    // Riga esistente: serve il vecchio path e conferma l'appartenenza al prodotto.
    const { data: riga } = await supabase
      .from("prodotto_foto")
      .select("id, url")
      .eq("id", fotoId)
      .eq("prodotto_id", prodottoId)
      .maybeSingle();
    if (!riga) return { ok: false, error: "Foto non trovata." };

    const path = `${prodottoId}/${crypto.randomUUID()}.webp`;
    const { error: up } = await supabase.storage
      .from("prodotti")
      .upload(path, file, { upsert: false, contentType: "image/webp" });
    if (up) return { ok: false, error: up.message };

    const { data: pub } = supabase.storage.from("prodotti").getPublicUrl(path);
    const url = `${pub.publicUrl}?v=${Date.now()}`;

    const { error: upd } = await supabase
      .from("prodotto_foto")
      .update({ url, blur_data_url: blur })
      .eq("id", fotoId)
      .eq("prodotto_id", prodottoId);
    if (upd) {
      // rollback del nuovo file per non lasciare orfani
      await supabase.storage.from("prodotti").remove([path]);
      return { ok: false, error: upd.message };
    }

    // Cancella il vecchio file (best-effort: un orfano e innocuo, non blocca).
    const vecchio = storagePathDaUrl(riga.url as string);
    if (vecchio) await supabase.storage.from("prodotti").remove([vecchio]);

    const foto = await leggiGalleria(supabase, prodottoId);
    await sincronizzaCopertina(supabase, prodottoId, foto);
    revalidaProdotto(prodottoId);
    return { ok: true, foto };
  } catch {
    return { ok: false, error: "Errore di rete durante la modifica." };
  }
}

/** Rimuove una foto dalla galleria (riga DB + file Storage). */
export async function rimuoviFotoGalleriaAction(
  prodottoId: string,
  fotoId: string,
): Promise<EsitoGalleria> {
  const sessione = await verifySession();
  if (!sessione) return { ok: false, error: "Non autorizzato." };
  const { supabase } = sessione;

  try {
    const { data: riga } = await supabase
      .from("prodotto_foto")
      .select("id, url")
      .eq("id", fotoId)
      .eq("prodotto_id", prodottoId)
      .maybeSingle();
    if (!riga) return { ok: false, error: "Foto non trovata." };

    const { error: del } = await supabase
      .from("prodotto_foto")
      .delete()
      .eq("id", fotoId)
      .eq("prodotto_id", prodottoId);
    if (del) return { ok: false, error: del.message };

    // Pulizia Storage best-effort (un orfano e innocuo, non blocca).
    const path = storagePathDaUrl(riga.url as string);
    if (path) await supabase.storage.from("prodotti").remove([path]);

    const foto = await leggiGalleria(supabase, prodottoId);
    await sincronizzaCopertina(supabase, prodottoId, foto);
    revalidaProdotto(prodottoId);
    return { ok: true, foto };
  } catch {
    return { ok: false, error: "Errore di rete. Riprova." };
  }
}

/** Riordina le foto (l'ordine determina anche la copertina = prima). */
export async function riordinaFotoGalleriaAction(
  prodottoId: string,
  idsInOrdine: string[],
): Promise<EsitoGalleria> {
  const sessione = await verifySession();
  if (!sessione) return { ok: false, error: "Non autorizzato." };
  const { supabase } = sessione;

  try {
    for (let i = 0; i < idsInOrdine.length; i++) {
      const { error } = await supabase
        .from("prodotto_foto")
        .update({ ordine: i })
        .eq("id", idsInOrdine[i])
        .eq("prodotto_id", prodottoId);
      if (error) return { ok: false, error: error.message };
    }
    const foto = await leggiGalleria(supabase, prodottoId);
    await sincronizzaCopertina(supabase, prodottoId, foto);
    revalidaProdotto(prodottoId);
    return { ok: true, foto };
  } catch {
    return { ok: false, error: "Errore di rete. Riprova." };
  }
}

/** Associa (o scollega) una foto a un COLORE del prodotto. */
export async function associaColoreFotoAction(
  prodottoId: string,
  fotoId: string,
  colore: string | null,
): Promise<EsitoGalleria> {
  const sessione = await verifySession();
  if (!sessione) return { ok: false, error: "Non autorizzato." };
  const { supabase } = sessione;

  const coloreNorm = colore?.trim() || null;
  try {
    const { error } = await supabase
      .from("prodotto_foto")
      .update({ colore: coloreNorm })
      .eq("id", fotoId)
      .eq("prodotto_id", prodottoId);
    if (error) return { ok: false, error: error.message };

    const foto = await leggiGalleria(supabase, prodottoId);
    revalidaProdotto(prodottoId);
    return { ok: true, foto };
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

/**
 * Assegna (o toglie, con null) la categoria a piu prodotti in un colpo solo.
 * Usata dalla selezione multipla della lista prodotti: un unico UPDATE con
 * .in(), niente N round-trip. Ritorna quante righe sono state aggiornate.
 */
export async function assegnaCategoriaBulkAction(
  ids: string[],
  categoriaId: string | null,
): Promise<EsitoAzione & { aggiornati?: number }> {
  const sessione = await verifySession();
  if (!sessione) return { ok: false, error: "Non autorizzato." };

  const unici = [...new Set(ids)].filter(Boolean);
  if (unici.length === 0) {
    return { ok: false, error: "Nessun prodotto selezionato." };
  }

  try {
    const { data, error } = await sessione.supabase
      .from("prodotti")
      .update({ categoria_id: categoriaId })
      .in("id", unici)
      .select("id");
    if (error) {
      // 23503 = categoria cancellata tra il render della lista e il submit.
      if (error.code === "23503") {
        return {
          ok: false,
          error: "La categoria selezionata non esiste più. Aggiorna la pagina.",
        };
      }
      return { ok: false, error: error.message };
    }

    revalidatePath("/gestore/prodotti");
    revalidatePath("/");
    return { ok: true, aggiornati: data?.length ?? 0 };
  } catch {
    return { ok: false, error: "Errore di rete. Riprova." };
  }
}
