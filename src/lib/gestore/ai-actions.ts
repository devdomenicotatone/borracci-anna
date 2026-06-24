"use server";

// Feature AI "Genera scheda da foto" (Claude Sonnet 4.6, vision + tool use).
// 1) generaSchedaDaFotoAction: manda le foto (prodotto + etichetta) a Claude e
//    riceve una bozza strutturata (nome, descrizione, composizione, lavaggio,
//    prezzo, colori con gli indici delle foto). NON salva nulla.
// 2) creaSchedaDaFotoAction: dalla bozza (eventualmente corretta dal gestore) +
//    le foto prodotto, crea un PRODOTTO BOZZA (attivo=false) con varianti colore
//    (stock 1) e galleria foto taggata per colore. Il gestore poi rivede/pubblica.

import Anthropic from "@anthropic-ai/sdk";

import { verifySession } from "@/lib/gestore/auth";
import { slugify } from "@/lib/gestore/slug";
import { revalidatePath } from "next/cache";

const MODELLO = "claude-sonnet-4-6";

// --- Tipi della bozza --------------------------------------------------------
export interface BozzaColore {
  nome: string;
  /** Indici 0-based delle foto prodotto che mostrano questo colore. */
  foto_indici: number[];
}
export interface BozzaScheda {
  nome: string;
  /** Descrizione gia assemblata nel formato a 3 paragrafi del catalogo. */
  descrizione: string;
  composizione: string;
  lavaggio: string[];
  prezzo_cents: number;
  colori: BozzaColore[];
}
export interface EsitoGenera {
  ok: boolean;
  error?: string;
  bozza?: BozzaScheda;
  /** Numero di foto prodotto inviate (per la mappatura colore->foto nel client). */
  numFotoProdotto?: number;
}

// --- Schema dello strumento (output strutturato) -----------------------------
const SCHEMA_SCHEDA = {
  type: "object" as const,
  properties: {
    nome: {
      type: "string",
      description:
        "Nome commerciale breve del capo in italiano (es. 'Polo colletto rigato').",
    },
    descrizione_commerciale: {
      type: "string",
      description:
        "1-2 frasi invitanti sul capo, tono fresco da negozio al mare. NON ripetere composizione o lavaggio.",
    },
    composizione: {
      type: "string",
      description:
        "Composizione del tessuto come sull'etichetta, es. '94% cotone, 6% elastane'. Stringa vuota se non leggibile.",
    },
    lavaggio: {
      type: "array",
      items: { type: "string" },
      description:
        "Istruzioni di lavaggio dai simboli/testo dell'etichetta, brevi e in italiano (es. 'lavare in lavatrice a 30°C', 'non candeggiare'). Array vuoto se non leggibile.",
    },
    prezzo_euro_suggerito: {
      type: "number",
      description: "Prezzo di vendita suggerito in euro (stima ragionevole).",
    },
    colori: {
      type: "array",
      description:
        "Un elemento per ogni colore distinto del capo visibile nelle foto prodotto.",
      items: {
        type: "object",
        properties: {
          nome: {
            type: "string",
            description: "Nome del colore in italiano (es. Blu, Bianca, Bluette).",
          },
          foto_prodotto_indici: {
            type: "array",
            items: { type: "integer" },
            description:
              "Indici 0-based delle foto prodotto che mostrano questo colore.",
          },
        },
        required: ["nome", "foto_prodotto_indici"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "nome",
    "descrizione_commerciale",
    "composizione",
    "lavaggio",
    "prezzo_euro_suggerito",
    "colori",
  ],
  additionalProperties: false,
};

const SYSTEM = `Sei l'assistente di catalogo di "Borracci Anna", un negozio di abbigliamento sul lungomare di Rimini (stile fresco, estivo, "pop mare").
Ricevi foto di un capo (eventualmente in piu colori) e, separatamente, foto della sua etichetta.
Compila una scheda prodotto in ITALIANO chiamando lo strumento compila_scheda.
Regole:
- identifica il tipo di capo e i COLORI distinti dalle foto prodotto;
- leggi COMPOSIZIONE e istruzioni di LAVAGGIO dalle foto etichetta (interpreta sia i simboli sia il testo);
- se un dato non e leggibile lascialo vuoto (stringa vuota o array vuoto): NON inventare;
- il prezzo e una stima ragionevole per un capo da negozio al mare;
- la descrizione commerciale e breve e invitante, senza ripetere composizione o lavaggio;
- associa ogni foto prodotto al colore che mostra usando gli indici 0-based, nell'ordine in cui ti sono date.`;

type MediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

async function bloccoImmagine(file: File): Promise<Anthropic.ImageBlockParam> {
  const buf = Buffer.from(await file.arrayBuffer());
  const tipi: Record<string, MediaType> = {
    "image/jpeg": "image/jpeg",
    "image/png": "image/png",
    "image/gif": "image/gif",
    "image/webp": "image/webp",
  };
  const media_type: MediaType = tipi[file.type] ?? "image/webp";
  return {
    type: "image",
    source: { type: "base64", media_type, data: buf.toString("base64") },
  };
}

/** Manda le foto a Claude e ritorna la bozza strutturata. Non salva nulla. */
export async function generaSchedaDaFotoAction(
  formData: FormData,
): Promise<EsitoGenera> {
  const sessione = await verifySession();
  if (!sessione) return { ok: false, error: "Non autorizzato." };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "ANTHROPIC_API_KEY non configurata sul server." };
  }

  const prodotto = formData
    .getAll("prodotto")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const etichetta = formData
    .getAll("etichetta")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (prodotto.length === 0) {
    return { ok: false, error: "Carica almeno una foto del prodotto." };
  }

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: "Foto del PRODOTTO (per tipo di capo e colori), in ordine di indice:",
    },
  ];
  for (let i = 0; i < prodotto.length; i++) {
    content.push({ type: "text", text: `— foto prodotto indice ${i}:` });
    content.push(await bloccoImmagine(prodotto[i]));
  }
  if (etichetta.length > 0) {
    content.push({
      type: "text",
      text: "Foto dell'ETICHETTA (per composizione e lavaggio):",
    });
    for (const f of etichetta) content.push(await bloccoImmagine(f));
  } else {
    content.push({
      type: "text",
      text: "(Nessuna foto etichetta fornita: lascia composizione e lavaggio vuoti se non deducibili.)",
    });
  }

  try {
    // Timeout esplicito piu corto del cap della piattaforma (Vercel), cosi un
    // ritardo viene gestito qui dal catch invece di un 504 opaco.
    const client = new Anthropic({ timeout: 55_000 });
    const msg = await client.messages.create({
      model: MODELLO,
      max_tokens: 4096,
      system: SYSTEM,
      tools: [
        {
          name: "compila_scheda",
          description:
            "Compila la scheda prodotto strutturata dai dati estratti dalle foto.",
          input_schema: SCHEMA_SCHEDA,
        },
      ],
      tool_choice: { type: "tool", name: "compila_scheda" },
      messages: [{ role: "user", content }],
    });

    if (msg.stop_reason === "max_tokens") {
      return {
        ok: false,
        error: "Scheda troppo lunga: riduci il numero di foto e riprova.",
      };
    }
    const blocco = msg.content.find((b) => b.type === "tool_use");
    if (!blocco || blocco.type !== "tool_use") {
      return { ok: false, error: "La AI non ha restituito una scheda valida." };
    }
    const raw = blocco.input as {
      nome?: string;
      descrizione_commerciale?: string;
      composizione?: string;
      lavaggio?: string[];
      prezzo_euro_suggerito?: number;
      colori?: { nome?: string; foto_prodotto_indici?: number[] }[];
    };

    const composizione = (raw.composizione ?? "").trim();
    const lavaggio = (raw.lavaggio ?? []).filter((s) => s && s.trim());
    const parti = [(raw.descrizione_commerciale ?? "").trim()];
    if (composizione) parti.push("", `Composizione: ${composizione}.`);
    if (lavaggio.length) {
      parti.push("", `Lavaggio consigliato: ${lavaggio.join(" · ")}.`);
    }
    const descrizione = parti.join("\n").trim();

    const prezzo_cents = Math.max(
      0,
      Math.round((raw.prezzo_euro_suggerito ?? 0) * 100),
    );
    const colori: BozzaColore[] = (raw.colori ?? [])
      .filter((c) => c && c.nome && c.nome.trim())
      .map((c) => ({
        nome: (c.nome ?? "").trim(),
        foto_indici: (c.foto_prodotto_indici ?? []).filter(
          (n) => Number.isInteger(n) && n >= 0 && n < prodotto.length,
        ),
      }));

    return {
      ok: true,
      numFotoProdotto: prodotto.length,
      bozza: {
        nome: (raw.nome ?? "").trim(),
        descrizione,
        composizione,
        lavaggio,
        prezzo_cents,
        colori,
      },
    };
  } catch (e) {
    const messaggio = e instanceof Error ? e.message : "Errore sconosciuto.";
    return { ok: false, error: `Generazione AI non riuscita: ${messaggio}` };
  }
}

// --- Creazione del prodotto bozza dalla scheda -------------------------------
export interface ColoreInput {
  nome: string;
  foto_indici: number[];
}
export interface DatiCreaScheda {
  nome: string;
  slug: string;
  descrizione: string;
  prezzo_cents: number;
  categoria_id: string | null;
  colori: ColoreInput[];
}
export interface EsitoCrea {
  ok: boolean;
  error?: string;
  id?: string;
}

/**
 * Crea un prodotto BOZZA (attivo=false) dalla scheda: varianti colore (stock 1)
 * + galleria foto taggata per colore. Il `formData` porta `dati` (JSON) e le
 * foto prodotto in campo "prodotto", nello stesso ordine degli indici.
 */
export async function creaSchedaDaFotoAction(
  formData: FormData,
): Promise<EsitoCrea> {
  const sessione = await verifySession();
  if (!sessione) return { ok: false, error: "Non autorizzato." };
  const { supabase } = sessione;

  let dati: DatiCreaScheda;
  try {
    dati = JSON.parse(String(formData.get("dati") ?? "")) as DatiCreaScheda;
  } catch {
    return { ok: false, error: "Dati della scheda non validi." };
  }

  const nome = (dati.nome ?? "").trim();
  if (!nome) return { ok: false, error: "Il nome e obbligatorio." };
  if (!Number.isInteger(dati.prezzo_cents) || dati.prezzo_cents <= 0) {
    return { ok: false, error: "Inserisci un prezzo valido maggiore di zero." };
  }
  const files = formData
    .getAll("prodotto")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "Nessuna foto prodotto." };

  // Blur LQIP allineati per indice ai file "prodotto" (vedi GeneraDaFoto).
  const blurs = formData
    .getAll("blur")
    .map((b) => (typeof b === "string" ? b : ""));

  const slugBase = slugify(dati.slug || nome) || "prodotto";

  // Fuori dal try: se un passo successivo lancia, il catch sa che la bozza e gia
  // stata creata e fa comunque navigare alla scheda (niente bozza "fantasma").
  let prodottoId: string | null = null;
  let slug = slugBase;

  try {
    // 1. Inserisci il prodotto bozza, ritentando lo slug su conflitto (23505).
    for (let tent = 0; tent < 6 && !prodottoId; tent++) {
      const slugTry = tent === 0 ? slugBase : `${slugBase}-${tent + 1}`;
      const { data, error } = await supabase
        .from("prodotti")
        .insert({
          slug: slugTry,
          nome,
          descrizione: dati.descrizione?.trim() || null,
          categoria_id: dati.categoria_id ?? null,
          prezzo_cents: dati.prezzo_cents,
          attivo: false,
        })
        .select("id")
        .single();
      if (!error && data) {
        prodottoId = data.id;
        slug = slugTry;
      } else if (error && error.code !== "23505") {
        return { ok: false, error: error.message };
      }
    }
    if (!prodottoId) {
      return { ok: false, error: "Slug gia in uso: rinomina il prodotto." };
    }

    // 2. Varianti colore (stock 1) + mappa indice-foto -> variante.
    const fotoToVariante = new Map<number, string>();
    const fotoToColore = new Map<number, string>();
    const skuUsati = new Set<string>();
    for (const c of dati.colori ?? []) {
      const nomeColore = (c.nome ?? "").trim();
      if (!nomeColore) continue;
      const cs = slugify(nomeColore) || "colore";
      let sku = `${slug}-${cs}`;
      let n = 2;
      while (skuUsati.has(sku)) sku = `${slug}-${cs}-${n++}`;
      skuUsati.add(sku);

      const { data: v, error } = await supabase
        .from("varianti")
        .insert({
          prodotto_id: prodottoId,
          taglia: null,
          colore: nomeColore,
          sku,
          stock: 1,
        })
        .select("id")
        .single();
      if (error || !v) {
        return {
          ok: true,
          id: prodottoId,
          error: `Prodotto creato come bozza, ma una variante non e stata salvata (${error?.message ?? "?"}). Completala dalla scheda.`,
        };
      }
      for (const idx of c.foto_indici ?? []) {
        fotoToVariante.set(idx, v.id);
        fotoToColore.set(idx, nomeColore);
      }
    }

    // 3. Carica le foto prodotto in galleria, taggate per colore.
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.type !== "image/webp") continue;
      const path = `${prodottoId}/${crypto.randomUUID()}.webp`;
      const { error: up } = await supabase.storage
        .from("prodotti")
        .upload(path, f, { upsert: false, contentType: "image/webp" });
      if (up) continue; // salta la singola foto fallita, non bloccare
      const { data: pub } = supabase.storage.from("prodotti").getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`;
      await supabase.from("prodotto_foto").insert({
        prodotto_id: prodottoId,
        variante_id: fotoToVariante.get(i) ?? null,
        colore: fotoToColore.get(i) ?? null,
        url,
        ordine: i,
        blur_data_url: blurs[i]?.startsWith("data:image/") ? blurs[i] : null,
      });
    }

    // 4. Copertina = prima foto della galleria.
    const { data: foto } = await supabase
      .from("prodotto_foto")
      .select("url")
      .eq("prodotto_id", prodottoId)
      .order("ordine", { ascending: true })
      .limit(1);
    await supabase
      .from("prodotti")
      .update({ immagine_url: foto?.[0]?.url ?? null })
      .eq("id", prodottoId);

    revalidatePath("/gestore/prodotti");
    revalidatePath("/");
    return { ok: true, id: prodottoId };
  } catch {
    // Se la bozza era gia stata creata, falla aprire comunque (niente fantasma).
    if (prodottoId) {
      return {
        ok: true,
        id: prodottoId,
        error: "Bozza creata, ma con un intoppo a meta: completala dalla scheda.",
      };
    }
    return { ok: false, error: "Errore di rete durante la creazione." };
  }
}
