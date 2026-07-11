"use client";

// Dopo l'eliminazione account l'utente viene rediretto a /?account=eliminato.
// Questo componente (montato nel layout vetrina, dentro Suspense per via di
// useSearchParams) mostra un toast di conferma UNA volta e ripulisce l'URL,
// senza costringere la home a leggere searchParams lato server (la
// renderebbe dinamica, rompendo la cache della vetrina).

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useToast } from "@/components/Toaster";

export default function AvvisoAccountEliminato() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { mostra } = useToast();
  const fatto = useRef(false);

  useEffect(() => {
    if (fatto.current) return;
    if (searchParams.get("account") !== "eliminato") return;
    fatto.current = true;
    mostra("Account eliminato. Grazie di essere passata/o da Anna Shop.", "ok");
    // Pulisce il parametro dall'URL (evita che un reload ri-mostri il toast).
    router.replace(pathname);
  }, [searchParams, pathname, router, mostra]);

  return null;
}
