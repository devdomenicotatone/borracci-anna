// Intestazione della shell /account: saluto col primo nome + email.

import AvatarCliente from "@/components/account/AvatarCliente";
import type { SessioneCliente } from "@/lib/account/auth";

/** Primo nome dal nome completo, fallback sulla parte locale dell'email. */
function nomeProprio(sessione: SessioneCliente): string {
  const nome = (sessione.cliente.nome ?? "").trim();
  if (nome) return nome.split(/\s+/)[0] ?? nome;
  return sessione.email.split("@")[0] ?? sessione.email;
}

export default function IntestazioneAccount({
  sessione,
}: {
  sessione: SessioneCliente;
}) {
  return (
    <div className="flex items-center gap-4">
      <AvatarCliente
        nome={sessione.cliente.nome}
        email={sessione.email}
        dimensione="md"
      />
      <div className="min-w-0">
        <h1 className="truncate font-display text-3xl font-extrabold tracking-tight text-foreground">
          Ciao, {nomeProprio(sessione)}
        </h1>
        <p className="truncate text-sm text-muted">{sessione.email}</p>
      </div>
    </div>
  );
}
