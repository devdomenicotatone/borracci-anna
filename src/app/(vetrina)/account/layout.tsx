// Shell dell'area account: guard requireCliente() (redirect UX; la barriera
// vera resta la coppia RLS + verifica sessione dentro OGNI Server Action,
// pattern a doppia barriera come nel gestore) + intestazione e navigazione.
// Vive nel group (vetrina): eredita Header/Footer/CartProvider.

import type { Metadata } from "next";

import IntestazioneAccount from "@/components/account/IntestazioneAccount";
import AccountNav from "@/components/account/AccountNav";
import { requireCliente } from "@/lib/account/auth";

// Tutta l'area contiene dati personali: mai indicizzata (in coppia con
// l'X-Robots-Tag del proxy).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AccountLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const sessione = await requireCliente();

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">
      <IntestazioneAccount sessione={sessione} />
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[230px_1fr] lg:gap-8">
        <AccountNav />
        <section className="min-w-0">{children}</section>
      </div>
    </div>
  );
}
