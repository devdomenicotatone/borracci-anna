import { ImageResponse } from "next/og";

import { fontOg } from "@/lib/og-fonts";

// Card di anteprima (Open Graph) per la home e tutte le pagine senza una propria:
// quella che si vede quando si condivide il link su WhatsApp/Facebook/Instagram.
// 1200x630 = formato standard, niente crop strani.
export const alt = "Anna Shop — abbigliamento mare a Rimini";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0077c8 0%, #00b4d8 100%)",
          fontFamily: "Poppins",
        }}
      >
        {/* Sigillo "Onda Sole": sole + onda, nei colori del brand. */}
        <div style={{ display: "flex", marginBottom: 26 }}>
          <svg width="136" height="136" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="9.5" r="4" fill="#ffd23f" />
            <g stroke="#ffd23f" strokeWidth="1.5" strokeLinecap="round">
              <path d="M12 2.5v1.7" />
              <path d="M4.5 9.5h1.7" />
              <path d="M17.8 9.5h1.7" />
              <path d="M6.6 4.1l1.2 1.2" />
              <path d="M16.2 4.1l-1.2 1.2" />
            </g>
            <path
              d="M2.5 17.5c2 0 2-1.6 4-1.6s2 1.6 4 1.6 2-1.6 4-1.6 2 1.6 4 1.6 2-1.6 3-1.6"
              stroke="#ffffff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Wordmark "Anna Shop": Anna corallo, Shop bianco. */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            fontSize: 142,
            fontWeight: 700,
            letterSpacing: -3,
          }}
        >
          <span style={{ color: "#ff5c5c" }}>Anna</span>
          <span style={{ color: "#ffffff", marginLeft: 24 }}>Shop</span>
        </div>

        {/* Tagline */}
        <div
          style={{
            display: "flex",
            marginTop: 12,
            fontSize: 42,
            fontWeight: 600,
            color: "rgba(255,255,255,0.92)",
          }}
        >
          abbigliamento mare · Rimini
        </div>
      </div>
    ),
    { ...size, fonts: await fontOg() },
  );
}
