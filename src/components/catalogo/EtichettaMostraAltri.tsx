"use client";

// Etichetta del link "Mostra altri" con stato di pending (useLinkStatus).
// Le navigazioni solo-searchParams NON mostrano il loading.tsx del segmento
// (verificato sul dev server: la griglia resta visibile — giusto cosi, e
// cumulativa), quindi senza questo feedback il click restava muto per tutto il
// round-trip: su rete lenta sembrava non registrato (finding 23, audit lug 2026).
// Va montata DENTRO il <Link> (requisito di useLinkStatus).

import { useLinkStatus } from "next/link";

export default function EtichettaMostraAltri() {
  const { pending } = useLinkStatus();
  if (pending) {
    return (
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-sea border-t-transparent"
        />
        Carico…
      </span>
    );
  }
  return <>Mostra altri</>;
}
