// Layout della vetrina pubblica: header del brand + contenitore principale.
// Vive nel route group (vetrina) cosi che l'area /gestore (nel group (gestore))
// non erediti header e impaginazione della vetrina. Non e un root layout:
// niente <html>/<body> (quelli stanno in src/app/layout.tsx).

import Header from "@/components/Header";

export default function VetrinaLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
    </div>
  );
}
