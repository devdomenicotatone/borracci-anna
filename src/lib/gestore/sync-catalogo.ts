// Motore del sync giornaliero delle giacenze dal CSV di Ingrosso BLT.
// Flusso: login → scarica il CSV → confronta col catalogo del sito (match su
// codice+taglia) → calcola le variazioni → applica in un colpo via RPC.
// Non tocca nome, descrizione, foto, prezzo di vendita, ne la modalita di
// vendita (disponibilita_su_richiesta): solo giacenze e costo ingrosso.
//
// La chiave di match e `prodotti.codice` ≈ `sku_parent` del CSV (con recupero
// delle schede bambino "-B") + taglia normalizzata: gli SKU delle varianti sul
// sito sono generati e NON combaciano con quelli del fornitore. Vedi blt-csv.ts.

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminSupabase } from "@/lib/supabase/admin";
import { loginBlt } from "@/lib/gestore/fornitori/ingrossoblt";
import {
  giacenzaDisponibile,
  indicizzaCatalogoCsv,
  normalizzaTagliaBlt,
  parentDaCodice,
  scaricaCatalogoCsv,
} from "@/lib/gestore/fornitori/blt-csv";

// Valore di stock per un articolo "disponibile". BLT e una stamperia che
// produce on-demand (per questo usa i semafori, non le quantita): la giacenza
// non e un vincolo reale, quindi un tetto ampio uguale per In/Low stock. "No
// stock" → 0 = esaurito.
const STOCK_DISPONIBILE = 999;

// Lo schema evolve (costo_cents e la RPC arrivano con la migration applicata a
// mano): qui si usa il client come non-tipizzato per non dipendere dai types
// generati, ancora disallineati finche non si rigenerano.
type Db = SupabaseClient;

export interface AvvisoPrezzo {
  codice: string;
  nome: string;
  daCents: number | null;
  aCents: number;
}

export interface ReportSync {
  ok: boolean;
  error?: string;
  dryRun: boolean;
  durataMs: number;
  csv?: { righeDati: number; prodottiFornitore: number };
  prodotti?: { totali: number; agganciati: number; orfani: string[]; senzaCodice: number; nonBlt: number };
  varianti?: {
    analizzate: number;
    daAggiornare: number;
    accese: number;
    spente: number;
    invariate: number;
    senzaRiscontro: number;
  };
  avvisiPrezzo?: AvvisoPrezzo[];
}

interface RigaProdotto {
  id: string;
  codice: string | null;
  nome: string;
  costo_cents: number | null;
  fornitore: string | null;
}
interface RigaVariante {
  id: string;
  prodotto_id: string;
  taglia: string | null;
  stock: number | null;
}

/** Legge tutte le righe di una tabella a blocchi da 1000 (PostgREST tronca a 1000). */
async function leggiTutto<T>(sb: Db, tabella: string, colonne: string): Promise<T[]> {
  const acc: T[] = [];
  for (let da = 0; ; da += 1000) {
    const { data, error } = await sb.from(tabella).select(colonne).range(da, da + 999);
    if (error) throw new Error(`Lettura ${tabella} fallita: ${error.message}`);
    const righe = (data ?? []) as T[];
    acc.push(...righe);
    if (righe.length < 1000) break;
  }
  return acc;
}

/**
 * Esegue il sync completo. Con `dryRun: true` calcola tutto ma NON scrive:
 * ritorna il report dell'impatto (utile per il primo giro in produzione).
 * Mai throw verso il chiamante: sempre un ReportSync con ok/error.
 */
export async function eseguiSyncCatalogo(opts: { dryRun?: boolean } = {}): Promise<ReportSync> {
  const inizio = Date.now();
  const dryRun = opts.dryRun === true;
  const durataMs = () => Date.now() - inizio;

  const email = (process.env.BLT_EMAIL ?? "").trim();
  const password = (process.env.BLT_PASSWORD ?? "").trim();
  if (!email || !password) {
    return { ok: false, dryRun, durataMs: durataMs(), error: "Credenziali BLT (BLT_EMAIL/BLT_PASSWORD) non configurate." };
  }

  try {
    // 1. Login + download del CSV dall'area riservata.
    const cookie = await loginBlt(email, password);
    if (!cookie) {
      return { ok: false, dryRun, durataMs: durataMs(), error: "Login BLT fallito (credenziali o captcha)." };
    }
    const csvTesto = await scaricaCatalogoCsv(cookie);
    const idx = indicizzaCatalogoCsv(csvTesto);

    // 2. Stato attuale del catalogo (service role: vede anche le bozze).
    const sb = createAdminSupabase() as unknown as Db;
    const prodotti = await leggiTutto<RigaProdotto>(sb, "prodotti", "id, codice, nome, costo_cents, fornitore");
    const varianti = await leggiTutto<RigaVariante>(sb, "varianti", "id, prodotto_id, taglia, stock");

    // 3. Prodotti: aggancio codice→parent, costo ingrosso, avvisi prezzo.
    const parentPerProdotto = new Map<string, string | null>();
    const updProdotti: { id: string; costo_cents: number | null }[] = [];
    const avvisiPrezzo: AvvisoPrezzo[] = [];
    const orfani: string[] = [];
    let senzaCodice = 0;
    let agganciati = 0;
    let nonBlt = 0;

    for (const p of prodotti) {
      // Solo articoli BLT: i prodotti propri del negozio non si toccano mai.
      if (p.fornitore !== "BLT") { nonBlt++; continue; }
      const codice = (p.codice ?? "").trim();
      if (!codice) { senzaCodice++; parentPerProdotto.set(p.id, null); continue; }
      const parent = parentDaCodice(codice, idx.parents);
      parentPerProdotto.set(p.id, parent);
      if (!parent) { orfani.push(codice); continue; }
      agganciati++;
      const costo = idx.costoPerParent.get(parent) ?? null;
      // Avviso solo se avevamo gia registrato un costo e adesso e cambiato.
      if (costo !== null && p.costo_cents !== null && costo !== p.costo_cents) {
        avvisiPrezzo.push({ codice, nome: p.nome, daCents: p.costo_cents, aCents: costo });
      }
      updProdotti.push({ id: p.id, costo_cents: costo });
    }

    // 4. Varianti: giacenza target da semaforo, solo dove cambia.
    const updVarianti: { id: string; stock: number }[] = [];
    let accese = 0, spente = 0, invariate = 0, senzaRiscontro = 0;
    for (const v of varianti) {
      const parent = parentPerProdotto.get(v.prodotto_id);
      if (!parent) continue; // prodotto orfano o senza codice: non sincronizzabile
      const voce = idx.perVariante.get(`${parent}||${normalizzaTagliaBlt(v.taglia ?? "")}`);
      if (!voce) { senzaRiscontro++; continue; }
      const target = giacenzaDisponibile(voce.semaforo) ? STOCK_DISPONIBILE : 0;
      const attuale = v.stock ?? 0;
      if (target === attuale) { invariate++; continue; }
      if (attuale === 0) accese++;
      else if (target === 0) spente++;
      updVarianti.push({ id: v.id, stock: target });
    }

    // 5. Applica (salvo dry-run) in un solo round-trip transazionale.
    if (!dryRun && (updVarianti.length > 0 || updProdotti.length > 0)) {
      const { error } = await sb.rpc("applica_sync_catalogo", {
        p_varianti: updVarianti,
        p_prodotti: updProdotti,
      });
      if (error) {
        return { ok: false, dryRun, durataMs: durataMs(), error: `Applicazione fallita: ${error.message}` };
      }
    }

    return {
      ok: true,
      dryRun,
      durataMs: durataMs(),
      csv: { righeDati: idx.righeDati, prodottiFornitore: idx.prodotti },
      prodotti: { totali: prodotti.length, agganciati, orfani, senzaCodice, nonBlt },
      varianti: {
        analizzate: varianti.length,
        daAggiornare: updVarianti.length,
        accese,
        spente,
        invariate,
        senzaRiscontro,
      },
      avvisiPrezzo,
    };
  } catch (e) {
    return { ok: false, dryRun, durataMs: durataMs(), error: e instanceof Error ? e.message : "Errore imprevisto nel sync." };
  }
}

/** Ultimo esito del sync giacenze, per il banner della dashboard gestore. */
export interface UltimoSync {
  eseguitoIl: string;
  ok: boolean;
  report: ReportSync | null;
}

/**
 * Persiste l'esito dell'ultimo sync REALE (una sola riga, id fisso "giacenze"),
 * cosi il gestore puo vederlo. I dry-run non sovrascrivono l'ultimo sync reale.
 * Best effort: un problema nel salvataggio del log non deve rompere il sync.
 * Usa il service role (bypassa la RLS di sync_stato). La tabella non e nei types
 * generati: client non-tipizzato, come il resto del modulo.
 */
export async function salvaEsitoSync(report: ReportSync): Promise<void> {
  if (report.dryRun) return;
  try {
    const sb = createAdminSupabase() as Db;
    await sb.from("sync_stato").upsert({
      id: "giacenze",
      eseguito_il: new Date().toISOString(),
      ok: report.ok,
      report: report as unknown as Record<string, unknown>,
    });
  } catch {
    // log best effort.
  }
}

/**
 * Legge l'ultimo esito del sync giacenze per il gestore. Ritorna null se assente
 * (mai eseguito) o se la tabella non esiste ancora (migration non applicata).
 */
export async function leggiUltimoSync(supabase: Db): Promise<UltimoSync | null> {
  try {
    const { data, error } = await supabase
      .from("sync_stato")
      .select("eseguito_il, ok, report")
      .eq("id", "giacenze")
      .maybeSingle();
    if (error || !data) return null;
    const r = data as { eseguito_il: string; ok: boolean; report: ReportSync | null };
    return { eseguitoIl: r.eseguito_il, ok: r.ok, report: r.report };
  } catch {
    return null;
  }
}
