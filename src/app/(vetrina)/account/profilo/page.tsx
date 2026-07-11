// Profilo del cliente: dati personali, email, password, eliminazione account.

import type { Metadata } from "next";

import FormProfilo from "@/components/account/FormProfilo";
import FormCambioEmail from "@/components/account/FormCambioEmail";
import FormCambioPassword from "@/components/account/FormCambioPassword";
import DialogEliminaAccount from "@/components/account/DialogEliminaAccount";
import { logoutClienteAction } from "@/lib/account/auth-actions";
import { requireCliente } from "@/lib/account/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profilo",
};

const CARD_CLS = "rounded-3xl bg-white p-6 shadow-soft ring-1 ring-line";

export default async function PaginaProfilo({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const [{ email: esitoEmail }, sessione] = await Promise.all([
    searchParams,
    requireCliente(),
  ]);

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h2 className="font-display text-xl font-extrabold text-foreground">
        Profilo
      </h2>

      {esitoEmail === "aggiornata" && (
        <p
          role="status"
          className="animate-pop-in rounded-2xl bg-sea/10 px-4 py-3 text-sm text-sea-ink ring-1 ring-sea/20"
        >
          Email aggiornata! Da ora accedi con il nuovo indirizzo.
        </p>
      )}

      <section className={CARD_CLS}>
        <h3 className="font-display text-base font-extrabold text-foreground">
          Dati personali
        </h3>
        <div className="mt-4">
          <FormProfilo nome={sessione.cliente.nome} />
        </div>
      </section>

      <section className={CARD_CLS}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-base font-extrabold text-foreground">
            Email
          </h3>
          <span className="inline-flex items-center gap-1 rounded-full bg-sea/15 px-2.5 py-0.5 text-xs font-bold text-sea-ink">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3 w-3"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Verificata
          </span>
        </div>
        <p className="mt-2 text-sm text-foreground">{sessione.email}</p>
        <p className="mt-1 text-xs text-muted">
          L&apos;email è il tuo accesso e il collegamento con i tuoi ordini.
        </p>
        <div className="mt-4">
          <FormCambioEmail />
        </div>
      </section>

      <section className={CARD_CLS}>
        <h3 className="font-display text-base font-extrabold text-foreground">
          Password
        </h3>
        <div className="mt-4">
          <FormCambioPassword />
        </div>
      </section>

      <section className={`${CARD_CLS} ring-coral/30`}>
        <h3 className="font-display text-base font-extrabold text-coral-ink">
          Zona delicata
        </h3>
        <p className="mt-2 text-sm text-muted">
          Eliminare l&apos;account rimuove accesso, indirizzi e preferiti. Gli
          ordini già fatti restano nel registro del negozio.
        </p>
        <div className="mt-4">
          <DialogEliminaAccount />
        </div>
      </section>

      <form action={logoutClienteAction}>
        <button
          type="submit"
          className="h-12 rounded-full px-6 font-display font-bold text-coral-ink ring-2 ring-line transition hover:bg-coral/10"
        >
          Esci da questo dispositivo
        </button>
      </form>
    </div>
  );
}
