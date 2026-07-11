// Chip di stato ordine, condiviso tra /ordine/[token] e l'area utente.

import { STATO_ORDINE_UI } from "@/lib/ordini-ui";
import type { StatoOrdine } from "@/lib/types";

export default function BadgeStatoOrdine({
  stato,
  className = "",
}: {
  stato: StatoOrdine;
  className?: string;
}) {
  const ui = STATO_ORDINE_UI[stato];
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold ${ui.chipCls} ${className}`}
    >
      {ui.chip}
    </span>
  );
}
