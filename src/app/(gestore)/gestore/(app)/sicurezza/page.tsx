import type { Metadata } from "next";

import GestioneAuthenticator from "@/components/gestore/GestioneAuthenticator";

export const metadata: Metadata = {
  title: "Sicurezza — gestore",
};

// Sicurezza dell'account gestore: verifica in due passaggi (TOTP).
// La lista fattori e tutte le operazioni MFA (enroll/verify/unenroll) vivono
// nel client component: parlano con GoTrue direttamente dal browser, come il
// meccanismo gemello di GestiShop. La shell (app) garantisce che qui si
// arrivi solo con sessione valida (aal2 se esistono fattori).
export default function SicurezzaPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-sea">
        Account
      </p>
      <h1 className="mt-1 font-display text-2xl font-extrabold text-foreground">
        Sicurezza
      </h1>
      <p className="mt-1 text-sm text-muted">
        Verifica in due passaggi con app authenticator.
      </p>
      <div className="mt-6">
        <GestioneAuthenticator />
      </div>
    </div>
  );
}
