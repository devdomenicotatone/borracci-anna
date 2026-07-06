import { ImageResponse } from "next/og";

import { fontOg } from "@/lib/og-fonts";
import { caricaProdottoCard, qrDataUrl } from "@/lib/social-card";

// Poster verticale (1080x1920, formato storia/post Instagram) del prodotto, con
// QR ben visibile: pensato per essere SCARICATO e pubblicato/stampato, li dove il
// link non e cliccabile (storie/feed IG, vetrina, volantini). Rotta pubblica come
// l'opengraph-image (solo catalogo attivo); il gestore la scarica con <a download>.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { nome, prezzo, immagine } = await caricaProdottoCard(slug);

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const qr = await qrDataUrl(`${site}/prodotti/${slug}`, 400);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          fontFamily: "Poppins",
        }}
      >
        {/* Foto in alto (cover), con sole di sfondo come fallback se manca. */}
        <div
          style={{
            display: "flex",
            position: "relative",
            width: 1080,
            height: 1120,
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #0077c8 0%, #00b4d8 100%)",
          }}
        >
          <svg width="300" height="300" viewBox="0 0 24 24" fill="none">
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
              width={1080}
              height={1120}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: 1080,
                height: 1120,
                objectFit: "cover",
              }}
            />
          ) : null}
        </div>

        {/* Pannello brand in basso. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: 1080,
            height: 800,
            padding: "68px 72px",
            background: "linear-gradient(160deg, #073a5e 0%, #0a1f33 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", fontSize: 60, fontWeight: 700 }}>
            <span style={{ color: "#ff5c5c" }}>Anna</span>
            <span style={{ color: "#ffffff", marginLeft: 14 }}>Shop</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 82, fontWeight: 700, color: "#ffffff", lineHeight: 1.04 }}>
              {nome}
            </div>
            {prezzo ? (
              <div style={{ display: "flex", marginTop: 22, fontSize: 72, fontWeight: 700, color: "#ffd166" }}>
                {prezzo}
              </div>
            ) : null}
          </div>

          {/* Riga in basso: invito all'azione a sinistra, QR grande a destra. */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column", paddingBottom: 8 }}>
              <div style={{ display: "flex", fontSize: 44, fontWeight: 700, color: "#ffffff" }}>
                Inquadra e acquista
              </div>
              <div style={{ display: "flex", marginTop: 14, fontSize: 33, fontWeight: 600, color: "rgba(255,255,255,0.74)" }}>
                online o in negozio · Rimini
              </div>
            </div>

            {qr ? (
              <div
                style={{
                  display: "flex",
                  position: "relative",
                  width: 320,
                  height: 320,
                  padding: 26,
                  borderRadius: 32,
                  background: "#ffffff",
                }}
              >
                <img src={qr} alt="" width={268} height={268} style={{ display: "flex" }} />
                {/* Logo brand al centro del QR (la correzione errori Q lo assorbe). */}
                <div
                  style={{
                    display: "flex",
                    position: "absolute",
                    top: 128,
                    left: 128,
                    width: 64,
                    height: 64,
                    borderRadius: 16,
                    background: "#ffffff",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: 52,
                      height: 52,
                      borderRadius: 13,
                      background: "#ff5c5c",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#ffffff",
                      fontSize: 32,
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
    { width: 1080, height: 1920, fonts: await fontOg() },
  );
}
