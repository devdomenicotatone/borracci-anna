import { ImageResponse } from "next/og";

import { fontOg } from "@/lib/og-fonts";

// Favicon delle pagine /gestore: stessa "A" corallo della vetrina ma su blu
// notte (il tema del gestionale), cosi le tab di vetrina e gestore si
// distinguono a colpo d'occhio. Vale per tutto il segmento, login incluso.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default async function Icon() {
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
        <span style={{ fontSize: 23, fontWeight: 700, color: "#ff5c5c" }}>
          A
        </span>
      </div>
    ),
    { ...size, fonts: await fontOg() },
  );
}
