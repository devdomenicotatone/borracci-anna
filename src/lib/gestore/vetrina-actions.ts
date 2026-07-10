"use server";

// Server Actions per la VETRINA curata (area gestore): sezioni della home e
// prodotti pinnati a mano. Stesso pattern di categorie-actions:
//   1) verifySession() -> early-return { ok:false, error:"Non autorizzato." };
//   2) mutazione via sessione.supabase (anon + RLS is_gestore) in try/catch;
//   3) ritorno della LISTA CANONICA (sezioni[]) per riallineare il client;
//   4) revalidatePath("/") + ("/gestore/vetrina").

import { revalidatePath, revalidateTag } from "next/cache";

import { verifySession } from "@/lib/gestore/auth";
import { leggiSezioniAdmin, type EsitoVetrina } from "@/lib/gestore/vetrina";
import { TAG_VETRINA_HOME } from "@/lib/vetrina-home";
import {
  TIPI_SEZIONE_VETRINA,
  type ConfigVetrina,
  type RegolaProdottiAuto,
  type TipoSezioneVetrina,
} from "@/lib/types";

const NON_AUTORIZZATO: EsitoVetrina = { ok: false, error: "Non autorizzato." };
const ERRORE_RETE: EsitoVetrina = { ok: false, error: "Errore di rete. Riprova." };

const REGOLE: readonly RegolaProdottiAuto[] = ["novita", "categoria", "solo_online"];
const LIMITE_MIN = 1;
const LIMITE_MAX = 24;

/** Tipo del client Supabase di sessione (come in categorie-actions). */
type SupabaseGestore = Awaited<ReturnType<typeof verifySession>> extends infer S
  ? S extends { supabase: infer C }
    ? C
    : never
  : never;

function revalida(): void {
  revalidatePath("/"); //                     la home (vetrina pubblica)
  revalidateTag(TAG_VETRINA_HOME, "max"); //  la cache delle fasce home
  revalidatePath("/gestore/vetrina"); //      il pannello
}

/** Stringa ripulita, oppure undefined se vuota (per non sporcare il jsonb). */
function testo(v: unknown, max = 200): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().slice(0, max);
  return s || undefined;
}

/** Limite intero nel range consentito, default 12. */
function limite(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 12;
  return Math.min(LIMITE_MAX, Math.max(LIMITE_MIN, Math.floor(n)));
}

/** Titolo/config di partenza per una nuova sezione, per tipo. */
function defaultSezione(tipo: TipoSezioneVetrina): {
  titolo: string;
  config: ConfigVetrina;
} {
  switch (tipo) {
    case "hero":
      return {
        titolo: "L'estate si veste da Anna Shop.",
        config: {
          ctaPrimariaLabel: "Scopri la collezione",
          ctaPrimariaHref: "/prodotti",
        },
      };
    case "banner":
      return {
        titolo: "Novità in negozio",
        config: { tono: "coral", ctaLabel: "Scopri", ctaHref: "/prodotti" },
      };
    case "categorie":
      return {
        titolo: "Compra per categoria",
        config: { occhiello: "Trova il tuo stile" },
      };
    case "prodotti_manuale":
      return {
        titolo: "In evidenza",
        config: { occhiello: "La nostra selezione", limite: 12 },
      };
    case "prodotti_auto":
      return {
        titolo: "Novità",
        config: {
          occhiello: "Fresche di stagione",
          regola: "novita",
          limite: 12,
        },
      };
  }
}

/**
 * Ripulisce la config in arrivo dal client tenendo SOLO i campi pertinenti al
 * tipo: il jsonb resta prevedibile e un client manomesso non inietta chiavi.
 */
function sanificaConfig(
  tipo: TipoSezioneVetrina,
  raw: ConfigVetrina,
): ConfigVetrina {
  const c: ConfigVetrina = {};
  const occhiello = testo(raw.occhiello, 60);
  if (occhiello) c.occhiello = occhiello;

  switch (tipo) {
    case "hero":
      c.ctaPrimariaLabel = testo(raw.ctaPrimariaLabel, 40);
      c.ctaPrimariaHref = testo(raw.ctaPrimariaHref, 300);
      c.ctaSecondariaLabel = testo(raw.ctaSecondariaLabel, 40);
      c.ctaSecondariaHref = testo(raw.ctaSecondariaHref, 300);
      c.stickerAlto = testo(raw.stickerAlto, 30);
      c.stickerBasso = testo(raw.stickerBasso, 30);
      c.immagineUrl = testo(raw.immagineUrl, 500);
      break;
    case "banner":
      c.testo = testo(raw.testo, 300);
      c.ctaLabel = testo(raw.ctaLabel, 40);
      c.ctaHref = testo(raw.ctaHref, 300);
      c.immagineUrl = testo(raw.immagineUrl, 500);
      c.tono = testo(raw.tono, 20);
      break;
    case "categorie":
      break; // solo occhiello
    case "prodotti_manuale":
      c.limite = limite(raw.limite);
      break;
    case "prodotti_auto": {
      const regola: RegolaProdottiAuto = REGOLE.includes(
        raw.regola as RegolaProdottiAuto,
      )
        ? (raw.regola as RegolaProdottiAuto)
        : "novita";
      c.regola = regola;
      c.limite = limite(raw.limite);
      if (regola === "categoria") {
        c.categoriaId = testo(raw.categoriaId, 40) ?? null;
      }
      break;
    }
  }
  // Via le chiavi undefined: jsonb pulito.
  return JSON.parse(JSON.stringify(c)) as ConfigVetrina;
}

/** Prossimo `ordine` in coda (max + 1) su una tabella/filtro. */
async function prossimoOrdineSezioni(
  supabase: SupabaseGestore,
): Promise<number> {
  const { data, error } = await supabase
    .from("vetrina_sezioni")
    .select("ordine")
    .order("ordine", { ascending: false })
    .limit(1);
  if (error) throw error;
  const max = data?.[0]?.ordine;
  return typeof max === "number" ? max + 1 : 0;
}

async function prossimoOrdinePivot(
  supabase: SupabaseGestore,
  sezioneId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("vetrina_sezione_prodotti")
    .select("ordine")
    .eq("sezione_id", sezioneId)
    .order("ordine", { ascending: false })
    .limit(1);
  if (error) throw error;
  const max = data?.[0]?.ordine;
  return typeof max === "number" ? max + 1 : 0;
}

/** Crea una sezione del tipo dato (nasce NASCOSTA: bozza da configurare). */
export async function creaSezioneAction(
  tipo: TipoSezioneVetrina,
): Promise<EsitoVetrina> {
  const sessione = await verifySession();
  if (!sessione) return NON_AUTORIZZATO;
  const { supabase } = sessione;

  if (!(TIPI_SEZIONE_VETRINA as readonly string[]).includes(tipo)) {
    return { ok: false, error: "Tipo di sezione non valido." };
  }

  try {
    const { titolo, config } = defaultSezione(tipo);
    const ordine = await prossimoOrdineSezioni(supabase);
    const { error } = await supabase.from("vetrina_sezioni").insert({
      tipo,
      titolo,
      config,
      ordine,
      visibile: false,
    });
    if (error) return { ok: false, error: error.message };

    const sezioni = await leggiSezioniAdmin(supabase);
    revalida();
    return { ok: true, sezioni };
  } catch {
    return ERRORE_RETE;
  }
}

/** Salva i campi editabili di una sezione (titolo, sottotitolo, config). */
export async function salvaSezioneAction(
  id: string,
  dati: {
    titolo: string;
    sottotitolo: string;
    config: ConfigVetrina;
  },
): Promise<EsitoVetrina> {
  const sessione = await verifySession();
  if (!sessione) return NON_AUTORIZZATO;
  const { supabase } = sessione;

  try {
    // Il tipo autoritativo e quello a DB (non lo manda il client): guida la
    // sanificazione della config.
    const { data: riga, error: errLeggi } = await supabase
      .from("vetrina_sezioni")
      .select("tipo")
      .eq("id", id)
      .maybeSingle();
    if (errLeggi) return { ok: false, error: errLeggi.message };
    if (!riga) {
      return { ok: false, error: "Sezione non trovata. Aggiorna la pagina." };
    }
    const tipo = riga.tipo as TipoSezioneVetrina;
    if (!(TIPI_SEZIONE_VETRINA as readonly string[]).includes(tipo)) {
      return { ok: false, error: "Tipo di sezione non valido." };
    }

    const config = sanificaConfig(tipo, dati.config ?? {});
    // Regola "Una categoria" senza categoria scelta: configurazione incompleta.
    // Senza questo blocco il salvataggio riusciva ("Sezione salvata") e in home
    // la fascia degradava in silenzio a TUTTO il catalogo sotto un titolo
    // sbagliato (il CategoriaSelect parte proprio da "Nessuna categoria").
    if (
      tipo === "prodotti_auto" &&
      config.regola === "categoria" &&
      !config.categoriaId
    ) {
      return { ok: false, error: "Scegli la categoria per questa fascia." };
    }

    const { error } = await supabase
      .from("vetrina_sezioni")
      .update({
        titolo: testo(dati.titolo, 120) ?? null,
        sottotitolo: testo(dati.sottotitolo, 300) ?? null,
        config,
      })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    const sezioni = await leggiSezioniAdmin(supabase);
    revalida();
    return { ok: true, sezioni };
  } catch {
    return ERRORE_RETE;
  }
}

/** Mostra/nasconde una sezione (toggle rapido, senza aprire l'editor). */
export async function toggleVisibileSezioneAction(
  id: string,
  visibile: boolean,
): Promise<EsitoVetrina> {
  const sessione = await verifySession();
  if (!sessione) return NON_AUTORIZZATO;
  const { supabase } = sessione;

  try {
    const { error } = await supabase
      .from("vetrina_sezioni")
      .update({ visibile: visibile === true })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    const sezioni = await leggiSezioniAdmin(supabase);
    revalida();
    return { ok: true, sezioni };
  } catch {
    return ERRORE_RETE;
  }
}

/** Elimina una sezione (i prodotti pinnati vanno via in cascata). */
export async function eliminaSezioneAction(id: string): Promise<EsitoVetrina> {
  const sessione = await verifySession();
  if (!sessione) return NON_AUTORIZZATO;
  const { supabase } = sessione;

  try {
    const { error } = await supabase
      .from("vetrina_sezioni")
      .delete()
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    const sezioni = await leggiSezioniAdmin(supabase);
    revalida();
    return { ok: true, sezioni };
  } catch {
    return ERRORE_RETE;
  }
}

/** Riordina le sezioni: `ordine` = posizione nell'elenco ricevuto. */
export async function riordinaSezioniAction(
  idsInOrdine: string[],
): Promise<EsitoVetrina> {
  const sessione = await verifySession();
  if (!sessione) return NON_AUTORIZZATO;
  const { supabase } = sessione;

  try {
    for (let i = 0; i < idsInOrdine.length; i++) {
      const { error } = await supabase
        .from("vetrina_sezioni")
        .update({ ordine: i })
        .eq("id", idsInOrdine[i]);
      // Non atomico: su errore a meta ritorno comunque il canonico per
      // riallineare il client (annulla l'ottimistico).
      if (error) {
        const sezioni = await leggiSezioniAdmin(supabase);
        return { ok: false, error: error.message, sezioni };
      }
    }

    const sezioni = await leggiSezioniAdmin(supabase);
    revalida();
    return { ok: true, sezioni };
  } catch {
    return ERRORE_RETE;
  }
}

/** Aggiunge un prodotto pinnato in coda a una fascia "a mano" (idempotente). */
export async function aggiungiProdottoSezioneAction(
  sezioneId: string,
  prodottoId: string,
): Promise<EsitoVetrina> {
  const sessione = await verifySession();
  if (!sessione) return NON_AUTORIZZATO;
  const { supabase } = sessione;

  try {
    const ordine = await prossimoOrdinePivot(supabase, sezioneId);
    const { error } = await supabase
      .from("vetrina_sezione_prodotti")
      .insert({ sezione_id: sezioneId, prodotto_id: prodottoId, ordine });
    // Gia presente (unique sezione+prodotto): non e un errore, si riallinea.
    if (error && error.code !== "23505") {
      if (error.code === "23503") {
        return { ok: false, error: "Prodotto o sezione non più esistente." };
      }
      return { ok: false, error: error.message };
    }

    const sezioni = await leggiSezioniAdmin(supabase);
    revalida();
    return { ok: true, sezioni };
  } catch {
    return ERRORE_RETE;
  }
}

/** Toglie un prodotto pinnato da una fascia "a mano". */
export async function rimuoviProdottoSezioneAction(
  sezioneId: string,
  prodottoId: string,
): Promise<EsitoVetrina> {
  const sessione = await verifySession();
  if (!sessione) return NON_AUTORIZZATO;
  const { supabase } = sessione;

  try {
    const { error } = await supabase
      .from("vetrina_sezione_prodotti")
      .delete()
      .eq("sezione_id", sezioneId)
      .eq("prodotto_id", prodottoId);
    if (error) return { ok: false, error: error.message };

    const sezioni = await leggiSezioniAdmin(supabase);
    revalida();
    return { ok: true, sezioni };
  } catch {
    return ERRORE_RETE;
  }
}

/** Riordina i prodotti pinnati di una fascia (guardia sul sezione_id). */
export async function riordinaProdottiSezioneAction(
  sezioneId: string,
  prodottoIdsInOrdine: string[],
): Promise<EsitoVetrina> {
  const sessione = await verifySession();
  if (!sessione) return NON_AUTORIZZATO;
  const { supabase } = sessione;

  try {
    for (let i = 0; i < prodottoIdsInOrdine.length; i++) {
      const { error } = await supabase
        .from("vetrina_sezione_prodotti")
        .update({ ordine: i })
        .eq("sezione_id", sezioneId)
        .eq("prodotto_id", prodottoIdsInOrdine[i]);
      if (error) {
        const sezioni = await leggiSezioniAdmin(supabase);
        return { ok: false, error: error.message, sezioni };
      }
    }

    const sezioni = await leggiSezioniAdmin(supabase);
    revalida();
    return { ok: true, sezioni };
  } catch {
    return ERRORE_RETE;
  }
}
