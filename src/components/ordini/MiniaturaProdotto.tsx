// Miniatura di una riga d'ordine: snapshot foto salvato sull'ordine, fallback
// tile con l'icona maglietta (stessa di ListaProdotti). Estratta dalla pagina
// /ordine/[token] per il riuso nell'area utente (lista e dettaglio ordini).

import Image from "next/image";

export default function MiniaturaProdotto({
  url,
  className = "h-12 w-12",
}: {
  url: string | null;
  /** Dimensioni/anello esterni (default riga ordine: h-12 w-12). */
  className?: string;
}) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-lg bg-surface ring-1 ring-line ${className}`}
    >
      {url ? (
        <Image src={url} alt="" fill sizes="48px" className="object-cover" />
      ) : (
        <div className="tile-cyan grid h-full w-full place-items-center text-white">
          <svg
            viewBox="0 0 100 100"
            fill="currentColor"
            aria-hidden="true"
            className="w-1/2 drop-shadow-[0_4px_8px_rgba(0,40,70,0.25)]"
          >
            <path d="M32 18 L18 28 L24 40 L31 35 L31 84 L69 84 L69 35 L76 40 L82 28 L68 18 C64 24 56 26 50 26 C44 26 36 24 32 18 Z" />
          </svg>
        </div>
      )}
    </div>
  );
}
