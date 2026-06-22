import { requireGestore } from "@/lib/gestore/auth";
import AdminNav from "@/components/gestore/AdminNav";
import { ToasterProvider } from "@/components/gestore/Toaster";

// Shell autenticata dell'area gestore. requireGestore() risolve profilo/ruolo
// e redirige a /gestore/login se non autorizzato (redirect UX; la barriera di
// sicurezza resta RLS + verifySession in ogni action). Il sotto-group (app)
// tiene la pagina di login FUORI da questa shell.
export default async function AppGestoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profilo } = await requireGestore();

  return (
    <ToasterProvider>
      <div className="min-h-screen bg-background md:pl-60">
        <AdminNav nome={profilo.nome} ruolo={profilo.ruolo} />
        <main className="px-4 pb-24 pt-4 md:px-8 md:pb-10 md:pt-8">
          {children}
        </main>
      </div>
    </ToasterProvider>
  );
}
