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

// Il catalogo cambia di rado: la CDN puo servirlo per 5 minuti e rinfrescarlo
// in background fino a un giorno (stale-while-revalidate).
const CACHE = "public, s-maxage=300, stale-while-revalidate=86400";

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
      const { data, error } = await supabase
        .from("prodotti")
        .select("slug, nome, prezzo_cents, valuta, immagine_url, solo_online")
        .eq("attivo", true)
        .order("nome", { ascending: true })
        .order("slug", { ascending: true }) // pareggio stabile tra pagine a parita di nome
        .range(da, da + PAGINA - 1);
      if (error) throw error;
      prodotti.push(...(data ?? []));
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
