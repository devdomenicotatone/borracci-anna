import type { Metadata } from "next";

import FormLogin from "@/components/gestore/FormLogin";

export const metadata: Metadata = {
  title: "Accesso gestore — by Frody",
};

// Pagina di login del gestore. Sta FUORI dalla shell autenticata (il sotto-group
// (app)): non chiama requireGestore(), qui ci si arriva da non loggati.
export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="wordmark text-3xl text-foreground">
            <span className="font-normal text-muted">by</span>
            <span className="ml-1 italic">
              <span className="text-[1.15em] font-bold">F</span>rody
            </span>
          </span>
          <p className="mt-2 text-sm text-muted">Area gestore</p>
        </div>
        <FormLogin />
      </div>
    </div>
  );
}
