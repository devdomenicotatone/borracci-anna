import { ImageResponse } from "next/og";

import { fontOg } from "@/lib/og-fonts";
import { caricaProdottoCard, qrDataUrl } from "@/lib/social-card";

// Card di anteprima per la singola scheda prodotto: foto del capo a sinistra,
// pannello brand con nome + prezzo a destra. E quello che si vede condividendo
// il link del prodotto su WhatsApp/Facebook/Instagram.
export const alt = "Prodotto · Anna Shop";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Node.js (default): la conversione WebP->JPEG della copertina usa sharp.
export const runtime = "nodejs";
// Cache ISR di un giorno: senza, la query Supabase non cacheata rendeva la
// route dinamica (no-store) e OGNI scrape social rigenerava la card da zero
// (query + download foto + sharp + satori, ~1-3s) — oltre la pazienza dello
// scraper WhatsApp/FB, anteprime a intermittenza (audit SEO 2026-07).
export const revalidate = 86400;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { nome, prezzo, immagine } = await caricaProdottoCard(slug);
  // Nomi lunghi del merch licenziato: troncatura a fine parola, o il blocco
  // nome sfora il pannello (space-between collassa e la tagline esce dal
  // canvas — riprodotto coi nomi reali del catalogo, audit SEO 2026-07).
  const nomeCard =
    nome.length > 70 ? `${nome.slice(0, 70).replace(/\s+\S*$/, "")}…` : nome;

  // QR dell'URL prodotto (moduli navy + logo "A" centrale). Vedi qrDataUrl.
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const qr = await qrDataUrl(`${site}/prodotti/${slug}`);

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
            <circle cx="12" cy="9.5" r="4" fill="#ffd23f" />
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
              {nomeCard}
            </div>
            {prezzo ? (
              <div style={{ display: "flex", marginTop: 18, fontSize: 54, fontWeight: 700, color: "#ffd23f" }}>
                {prezzo}
              </div>
            ) : null}
          </div>

          {/* Riga in basso: testo a sinistra (flex:1 + minWidth:0 = va a capo
              invece di spingere il QR contro il bordo), QR a destra a margine
              costante. */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 28 }}>
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
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
                  flexShrink: 0,
                  position: "relative",
                  width: 150,
                  height: 150,
                  padding: 14,
                  borderRadius: 18,
                  background: "#ffffff",
                }}
              >
                <img src={qr} alt="" width={122} height={122} style={{ display: "flex" }} />
                {/* Logo brand al centro del QR (la correzione errori Q lo assorbe). */}
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
