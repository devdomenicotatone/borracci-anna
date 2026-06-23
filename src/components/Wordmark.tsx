// Wordmark "Borracci Anna" — concept "Onda Sole".
// Sigillo balneare (sole + raggi + onda) accanto al lockup bicolore.
// Componente unico e puramente presentazionale (server-compatible), riusato in
// header/footer/area gestore/login/empty-state. Lo stile vive in globals.css
// (.wordmark / .wm-text / .wm-mark / .wm-* + variante .on-dark).

import type { ReactNode } from "react";

// Il sigillo è DECORO: aria-hidden + focusable=false → ignorato dagli screen
// reader e non tabulabile. I colori arrivano dal CSS (.wm-sun/.wm-ray/.wm-wave);
// gli stroke="currentColor" inline sono solo un fallback se il CSS non carica.
function SigilloOndaSole() {
  return (
    <svg
      className="wm-mark"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="wm-sun" cx="12" cy="9.5" r="4" />
      <g
        className="wm-ray"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        <path d="M12 2.6v1.8" />
        <path d="M4.6 9.5h1.8" />
        <path d="M17.6 9.5h1.8" />
      </g>
      <path
        className="wm-wave"
        d="M2.5 17.5c2 0 2-1.6 4-1.6s2 1.6 4 1.6 2-1.6 4-1.6 2 1.6 4 1.6 2-1.6 3-1.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Wordmark({
  className,
  onDark = false,
  suffix,
  suffixClassName,
}: {
  className?: string;
  // true su fondo scuro (footer, sidebar gestore): attiva la variante .on-dark.
  onDark?: boolean;
  // suffisso opzionale accanto al nome (es. "· gestore").
  suffix?: ReactNode;
  suffixClassName?: string;
}) {
  const classi = ["wordmark", onDark ? "on-dark" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classi}>
      <SigilloOndaSole />
      <span className="wm-text">
        <span className="wm-lead">Borracci</span>
        <span className="wm-accent">Anna</span>
      </span>
      {suffix != null ? (
        <span className={suffixClassName}>{suffix}</span>
      ) : null}
    </span>
  );
}
