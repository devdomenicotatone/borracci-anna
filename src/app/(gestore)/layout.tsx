import type { Metadata } from "next";

// Layout del route group (gestore): nessun header/impaginazione della vetrina.
// L'intera area /gestore e esclusa dall'indicizzazione (in aggiunta all'header
// X-Robots-Tag impostato dal proxy). Non e un root layout: niente <html>/<body>.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function GestoreLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
