// Client Supabase lato server (Server Components, Route Handler, Server Actions).
// Usa i cookie per la sessione. Se le env non sono configurate ritorna null,
// cosi i chiamanti possono degradare con grazia (es. dati di esempio o stato vuoto)
// e il progetto compila/builda anche senza env.

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Crea un client Supabase lato server legato ai cookie della richiesta.
 * Ritorna `null` se NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY mancano.
 *
 * Next 16: cookies() e ASYNC, quindi va atteso.
 */
export async function createServerSupabase(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // setAll puo lanciare quando chiamato da un Server Component:
          // in quel contesto i cookie sono di sola lettura. E sicuro ignorarlo
          // se il refresh della sessione e gestito dal middleware.
        }
      },
    },
  });
}
