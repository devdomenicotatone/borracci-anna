import { ImageResponse } from "next/og";

import { fontOg } from "@/lib/og-fonts";

// Icona apple-touch (180x180) dell'area gestore: variante blu notte della "A"
// di vetrina (vedi src/app/apple-icon.tsx) — su iOS "Aggiungi alla schermata
// Home" da una pagina /gestore usa questa, e le due app si distinguono subito.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0a1f33 0%, #16324f 100%)",
          fontFamily: "Poppins",
        }}
      >
        <span
          style={{
            fontSize: 132,
            fontWeight: 700,
            color: "#ff5c5c",
            letterSpacing: -4,
          }}
        >
          A
        </span>
      </div>
    ),
    { ...size, fonts: await fontOg() },
  );
}
