// Avatar a iniziali su gradiente mare: la firma visiva dell'area account.
// Server component, riusato dall'header (sm) e dalla shell account (md).

export function inizialiCliente(nome: string | null, email: string): string {
  const base = (nome ?? "").trim();
  if (base) {
    const parole = base.split(/\s+/).filter(Boolean);
    const prima = parole[0]?.[0] ?? "";
    const seconda = parole.length > 1 ? (parole[parole.length - 1]?.[0] ?? "") : "";
    return (prima + seconda).toUpperCase() || "?";
  }
  return (email[0] ?? "?").toUpperCase();
}

export default function AvatarCliente({
  nome,
  email,
  dimensione = "md",
}: {
  nome: string | null;
  email: string;
  dimensione?: "sm" | "md";
}) {
  const cls =
    dimensione === "sm" ? "h-9 w-9 text-xs" : "h-14 w-14 text-lg";
  return (
    <span
      aria-hidden="true"
      className={`grid ${cls} shrink-0 select-none place-items-center rounded-full bg-sea-gradient font-display font-bold text-white shadow-sea`}
    >
      {inizialiCliente(nome, email)}
    </span>
  );
}
