import { ImageResponse } from "next/og";

import { fontOg } from "@/lib/og-fonts";
import { caricaProdottoCard, qrDataUrl, taglineDisponibilita } from "@/lib/social-card";

// Immagine social verticale del prodotto, con QR ben visibile: pensata per
// essere SCARICATA e pubblicata/stampata, li dove il link non e cliccabile
// (storie/feed IG, vetrina, volantini). Due formati via ?formato=:
//   story (default) = 1080x1920 (9:16, storia)   post = 1080x1350 (4:5, feed)
// Rotta pubblica come l'opengraph-image (solo catalogo attivo); il gestore la
// scarica con <a download>.

// Misure per formato: entrambi larghi 1080, cambia l'altezza (e quindi la foto)
// e la scala di testo/QR, cosi il pannello resta bilanciato in ognuno.
const FORMATI = {
  story: {
    altezza: 1920, foto: 1120, padY: 64,
    brand: 60, nome: 82, prezzo: 72, cta: 44, tagline: 33,
    qrChip: 320, qrImg: 268, qrPad: 26, logo: 64, logoRosso: 52, logoA: 32, logoTop: 128,
  },
  post: {
    altezza: 1350, foto: 760, padY: 52,
    brand: 52, nome: 64, prezzo: 56, cta: 38, tagline: 29,
    qrChip: 240, qrImg: 196, qrPad: 22, logo: 48, logoRosso: 38, logoA: 24, logoTop: 96,
  },
} as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { nome, prezzo, immagine, soloOnline } = await caricaProdottoCard(slug);

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const qr = await qrDataUrl(`${site}/prodotti/${slug}`, 400);

  const formato =
    new URL(request.url).searchParams.get("formato") === "post" ? "post" : "story";
  const c = FORMATI[formato];
  const pannello = c.altezza - c.foto;

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
            height: c.foto,
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
              height={c.foto}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: 1080,
                height: c.foto,
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
            height: pannello,
            padding: `${c.padY}px 72px`,
            background: "linear-gradient(160deg, #073a5e 0%, #0a1f33 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", fontSize: c.brand, fontWeight: 700 }}>
            <span style={{ color: "#ff5c5c" }}>Anna</span>
            <span style={{ color: "#ffffff", marginLeft: 14 }}>Shop</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: c.nome, fontWeight: 700, color: "#ffffff", lineHeight: 1.04 }}>
              {nome}
            </div>
            {prezzo ? (
              <div style={{ display: "flex", marginTop: 20, fontSize: c.prezzo, fontWeight: 700, color: "#ffd166" }}>
                {prezzo}
              </div>
            ) : null}
          </div>

          {/* Riga in basso: invito a sinistra (va a capo, non spinge il QR), QR a destra. */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 32 }}>
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, paddingBottom: 8 }}>
              <div style={{ display: "flex", fontSize: c.cta, fontWeight: 700, color: "#ffffff" }}>
                Inquadra e acquista
              </div>
              <div style={{ display: "flex", marginTop: 12, fontSize: c.tagline, fontWeight: 600, color: "rgba(255,255,255,0.74)" }}>
                {taglineDisponibilita(soloOnline)}
              </div>
            </div>

            {qr ? (
              <div
                style={{
                  display: "flex",
                  flexShrink: 0,
                  position: "relative",
                  width: c.qrChip,
                  height: c.qrChip,
                  padding: c.qrPad,
                  borderRadius: 32,
                  background: "#ffffff",
                }}
              >
                <img src={qr} alt="" width={c.qrImg} height={c.qrImg} style={{ display: "flex" }} />
                {/* Logo brand al centro del QR (la correzione errori Q lo assorbe). */}
                <div
                  style={{
                    display: "flex",
                    position: "absolute",
                    top: c.logoTop,
                    left: c.logoTop,
                    width: c.logo,
                    height: c.logo,
                    borderRadius: 16,
                    background: "#ffffff",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: c.logoRosso,
                      height: c.logoRosso,
                      borderRadius: 13,
                      background: "#ff5c5c",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#ffffff",
                      fontSize: c.logoA,
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
    { width: 1080, height: c.altezza, fonts: await fontOg() },
  );
}
