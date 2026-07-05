import { ImageResponse } from "next/og";

import { fontOg } from "@/lib/og-fonts";

// Icona apple-touch (180x180): quella salvata sulla home screen iOS.
// A questa dimensione l'intero wordmark "Anna Shop" sarebbe illeggibile:
// usiamo la sola iniziale del brand, grande e centrata, in corallo sul blu mare.
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
          background: "linear-gradient(135deg, #0077c8 0%, #00b4d8 100%)",
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
