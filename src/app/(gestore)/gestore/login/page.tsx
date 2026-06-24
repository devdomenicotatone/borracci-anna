import type { Metadata } from "next";

import FormLogin from "@/components/gestore/FormLogin";
import Wordmark from "@/components/Wordmark";

export const metadata: Metadata = {
  title: "Accesso gestore — Anna Shop",
};

// Pagina di login del gestore. Sta FUORI dalla shell autenticata (il sotto-group
// (app)): non chiama requireGestore(), qui ci si arriva da non loggati.
export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-sea-gradient px-5 py-10">
      {/* Decoro balneare: puntini bianchi + sole sfumato */}
      <div className="dots-overlay pointer-events-none absolute inset-0 opacity-50" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(255,210,63,.9), rgba(255,210,63,0) 70%)",
        }}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-sm">
        <div className="rounded-3xl bg-white p-7 shadow-soft sm:p-8">
          <div className="mb-7 text-center">
            <Wordmark className="text-3xl" />
            <p className="mt-2 text-sm font-display font-bold uppercase tracking-wide text-lagoon">
              Area gestore
            </p>
          </div>
          <FormLogin />
        </div>
      </div>
    </div>
  );
}
