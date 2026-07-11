// Rate limit DB-backed delle richieste auth (registrazione, recupero password,
// reinvio conferma): stesso approccio del rate limit ordini in lib/ordini.ts
// (finestre su tabella condivisa tra le istanze serverless), su una tabella
// dedicata `auth_richieste` accessibile solo col service role.
//
// E la PRIMA rete: la seconda sono i rate limit built-in di Supabase Auth.
// Senza env admin si degrada con grazia (consenti), coerente col progetto.

import "server-only";
import { headers } from "next/headers";

import { createAdminSupabase } from "@/lib/supabase/admin";

export type TipoRichiestaAuth =
  | "registrazione"
  | "recupero"
  | "reinvio_conferma";

const FINESTRA_MS = 60 * 60 * 1000; // 1 ora
const MAX_PER_EMAIL = 3;
const MAX_PER_IP = 10;

/** Primo hop di x-forwarded-for (il client), o null fuori da una richiesta. */
async function ipRichiesta(): Promise<string | null> {
  try {
    const h = await headers(); // async in Next 16
    const xff = h.get("x-forwarded-for");
    return xff ? (xff.split(",")[0]?.trim() ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * true se la richiesta puo procedere; false se la finestra e satura.
 * Registra l'evento SOLO quando consente (i tentativi bloccati non allungano
 * la finestra all'infinito).
 */
export async function consentiRichiestaAuth(
  tipo: TipoRichiestaAuth,
  email: string,
): Promise<boolean> {
  try {
    const admin = createAdminSupabase();
    const emailNorm = email.trim().toLowerCase();
    const ip = await ipRichiesta();
    const daUnOraIso = new Date(Date.now() - FINESTRA_MS).toISOString();

    const [perEmail, perIp] = await Promise.all([
      admin
        .from("auth_richieste")
        .select("id", { count: "exact", head: true })
        .eq("email", emailNorm)
        .eq("tipo", tipo)
        .gte("creato_il", daUnOraIso),
      ip
        ? admin
            .from("auth_richieste")
            .select("id", { count: "exact", head: true })
            .eq("ip", ip)
            .eq("tipo", tipo)
            .gte("creato_il", daUnOraIso)
        : Promise.resolve({ count: 0 }),
    ]);
    if ((perEmail.count ?? 0) >= MAX_PER_EMAIL) return false;
    if ((perIp.count ?? 0) >= MAX_PER_IP) return false;

    await admin.from("auth_richieste").insert({ email: emailNorm, ip, tipo });

    // Pulizia best effort del log (>7 giorni): economica con l'indice su
    // creato_il, non deve mai bloccare la richiesta.
    const setteGiorniFaIso = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    void (async () => {
      try {
        await admin
          .from("auth_richieste")
          .delete()
          .lt("creato_il", setteGiorniFaIso);
      } catch {
        // Solo pulizia: mai propagare.
      }
    })();

    return true;
  } catch {
    // Senza env admin (o DB irraggiungibile) si degrada: restano i limiti
    // built-in di Supabase Auth.
    return true;
  }
}
