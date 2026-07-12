import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Catalogo pubblico in JSON: i prodotti ATTIVI con i soli campi gia mostrati
// in vetrina (slug, nome, prezzo, foto) — nessuna informazione in piu di
// quanto qualsiasi visitatore vede sul sito. Nato per i cartellini stampati
// da GestiShop (QR "inquadra e acquista"); riusabile da ogni integrazione
// read-only. Lettura cookieless con la anon key come le card social
// (lib/social-card.ts): la RLS lascia passare solo attivo=true.
// La rotta e fuori dal proxy (matcher esclude /api/*) quindi e pubblica,
// come l'opengraph-image e il poster social.

export const runtime = "nodejs";

// Il catalogo cambia di rado: la CDN lo serve per 5 minuti; alla scadenza puo
// servire la copia vecchia per ALTRI 10 minuti al massimo mentre rinfresca in
// background. La finestra stale era di un giorno: dopo un cambio prezzi in
// blocco, GestiShop (che legge da qui per i cartellini) poteva stampare
// prezzi vecchi anche a distanza di ore.
const CACHE = "public, s-maxage=300, stale-while-revalidate=600";

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Servizio non configurato." }, { status: 503 });
  }

  // Base degli URL prodotto (per QR/link): il dominio pubblico configurato,
  // con l'origin della richiesta come ripiego (dev e deploy di preview).
  const sito = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;

  try {
    const supabase = createClient(url, anon);
    // A pagine: PostgREST serve al massimo 1000 righe per richiesta e il
    // catalogo e gia oltre (1825 attivi al 2026-07-08). Si scorre con .range()
    // fino alla pagina corta, con un tetto di sicurezza a 10 pagine.
    const PAGINA = 1000;
    const prodotti: unknown[] = [];
    for (let da = 0; da < PAGINA * 10; da += PAGINA) {
      // prodotto_foto in embed: la galleria e pubblica (RLS: solo prodotti
      // attivi) ed e gia mostrata per intero nella pagina prodotto.
      const { data, error } = await supabase
        .from("prodotti")
        .select("slug, nome, prezzo_cents, valuta, immagine_url, solo_online, prodotto_foto(url, ordine)")
        .eq("attivo", true)
        .order("nome", { ascending: true })
        .order("slug", { ascending: true }) // pareggio stabile tra pagine a parita di nome
        .range(da, da + PAGINA - 1);
      if (error) throw error;
      // `foto` = galleria in ordine sito (la prima e la copertina: le action
      // del gestore tengono immagine_url sincronizzata con foto[0]). Esposta
      // solo quando le foto sono ALMENO DUE — serve a chi deve scegliere una
      // foto alternativa (i cartellini GestiShop); per il resto del catalogo
      // il payload resta quello di prima. Dedup per path senza query: la
      // copertina porta un ?v= che una riga galleria potrebbe non avere.
      for (const riga of data ?? []) {
        const { prodotto_foto, ...campi } = riga as {
          immagine_url: string | null;
          prodotto_foto: { url: string | null; ordine: number | null }[] | null;
        } & Record<string, unknown>;
        const galleria = [...(prodotto_foto ?? [])]
          .sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0))
          .map((f) => f.url)
          .filter((u): u is string => typeof u === "string" && u !== "");
        const visti = new Set<string>();
        const foto: string[] = [];
        for (const u of [campi.immagine_url, ...galleria]) {
          if (typeof u !== "string" || u === "") continue;
          const chiave = u.split("?")[0];
          if (visti.has(chiave)) continue;
          visti.add(chiave);
          foto.push(u);
        }
        prodotti.push(foto.length >= 2 ? { ...campi, foto } : campi);
      }
      if (!data || data.length < PAGINA) break;
    }
    return NextResponse.json(
      { sito, prodotti },
      { headers: { "Cache-Control": CACHE } },
    );
  } catch {
    return NextResponse.json({ error: "Errore lettura catalogo." }, { status: 500 });
  }
}
