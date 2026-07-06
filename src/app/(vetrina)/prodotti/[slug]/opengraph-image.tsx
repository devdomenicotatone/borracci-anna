import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";

import { fontOg } from "@/lib/og-fonts";
import { formatPrezzo } from "@/lib/format";

// Card di anteprima per la singola scheda prodotto: foto del capo a sinistra,
// pannello brand con nome + prezzo a destra. E quello che si vede condividendo
// il link del prodotto su WhatsApp/Facebook/Instagram. Generata al volo (cache).
export const alt = "Prodotto · Anna Shop";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let nome = "Anna Shop";
  let prezzo: string | null = null;
  let immagine: string | null = null;

  // Lettura pubblica senza cookie (cacheable): RLS consente l'anon sui prodotti attivi.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anon) {
    try {
      const supabase = createClient(url, anon);
      const { data } = await supabase
        .from("prodotti")
        .select("nome, prezzo_cents, valuta, immagine_url")
        .eq("slug", slug)
        .eq("attivo", true)
        .maybeSingle();
      if (data) {
        nome = (data.nome as string) ?? nome;
        immagine = (data.immagine_url as string | null) ?? null;
        if (typeof data.prezzo_cents === "number") {
          prezzo = formatPrezzo(data.prezzo_cents, (data.valuta as string) ?? "EUR");
        }
      }
    } catch {
      // degrada a card brand senza dati prodotto
    }
  }

  // QR dell'URL prodotto (PNG data URL) da mostrare nella card. Correzione errori
  // Q (25%): assorbe comodamente il piccolo logo "A" al centro (~6% dell'area)
  // restando meno denso di H, quindi piu leggibile da lontano/in stampa.
  // Degrada a null (card senza QR) se manca l'URL del sito o la generazione fallisce.
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  let qr: string | null = null;
  try {
    qr = await QRCode.toDataURL(`${site}/prodotti/${slug}`, {
      margin: 0,
      errorCorrectionLevel: "Q",
      width: 264,
      color: { dark: "#0a1f33", light: "#ffffff" },
    });
  } catch {
    qr = null;
  }

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", fontFamily: "Poppins" }}>
        {/* Foto (quadrata): cover, con sole di sfondo come fallback se manca. */}
        <div
          style={{
            display: "flex",
            position: "relative",
            width: 630,
            height: 630,
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #0077c8 0%, #00b4d8 100%)",
          }}
        >
          <svg width="150" height="150" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="9.5" r="4" fill="#ffd166" />
            <path
              d="M2.5 17.5c2 0 2-1.6 4-1.6s2 1.6 4 1.6 2-1.6 4-1.6 2 1.6 4 1.6 2-1.6 3-1.6"
              stroke="#ffffff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {immagine ? (
            <img
              src={immagine}
              alt=""
              width={630}
              height={630}
              style={{ position: "absolute", top: 0, left: 0, width: 630, height: 630, objectFit: "cover" }}
            />
          ) : null}
        </div>

        {/* Pannello brand a destra. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: 570,
            height: 630,
            padding: "54px 50px",
            background: "linear-gradient(160deg, #073a5e 0%, #0a1f33 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", fontSize: 52, fontWeight: 700 }}>
            <span style={{ color: "#ff5c5c" }}>Anna</span>
            <span style={{ color: "#ffffff", marginLeft: 12 }}>Shop</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 60, fontWeight: 700, color: "#ffffff", lineHeight: 1.08 }}>
              {nome}
            </div>
            {prezzo ? (
              <div style={{ display: "flex", marginTop: 18, fontSize: 54, fontWeight: 700, color: "#ffd166" }}>
                {prezzo}
              </div>
            ) : null}
          </div>

          {/* Riga in basso: tagline (+ invito) a sinistra, QR a destra. */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {qr ? (
                <div style={{ display: "flex", fontSize: 25, fontWeight: 600, color: "rgba(255,255,255,0.92)" }}>
                  Inquadra per aprire
                </div>
              ) : null}
              <div
                style={{
                  display: "flex",
                  marginTop: qr ? 6 : 0,
                  fontSize: 26,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.72)",
                }}
              >
                abbigliamento mare · Rimini
              </div>
            </div>

            {qr ? (
              <div
                style={{
                  display: "flex",
                  position: "relative",
                  width: 150,
                  height: 150,
                  padding: 14,
                  borderRadius: 18,
                  background: "#ffffff",
                }}
              >
                <img src={qr} alt="" width={122} height={122} style={{ display: "flex" }} />
                {/* Logo brand al centro del QR (la correzione errori H lo assorbe). */}
                <div
                  style={{
                    display: "flex",
                    position: "absolute",
                    top: 60,
                    left: 60,
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: "#ffffff",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: "#ff5c5c",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#ffffff",
                      fontSize: 15,
                      fontWeight: 700,
                    }}
                  >
                    A
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: await fontOg() },
  );
}
