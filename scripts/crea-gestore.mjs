// Crea (una tantum) un account abilitato all'area gestore.
//
// Uso:
//   node scripts/crea-gestore.mjs <email> <password> ["Nome"]
//
// Imposta il ruolo in app_metadata (modificabile solo lato server): il trigger
// on_auth_user_created creera la riga in public.profili. ESEGUI DOPO aver
// applicato la migration 20260622210000_area_gestore.sql.
//
// Legge NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY da .env.local.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function leggiEnv(file) {
  try {
    const txt = readFileSync(file, "utf8");
    const env = {};
    for (const riga of txt.split(/\r?\n/)) {
      const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return env;
  } catch {
    return {};
  }
}

const [, , email, password, nome = "Frody"] = process.argv;
if (!email || !password) {
  console.error("Uso: node scripts/crea-gestore.mjs <email> <password> [Nome]");
  process.exit(1);
}

const env = { ...leggiEnv(".env.local"), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { ruolo: "gestore", nome },
});

if (error) {
  console.error("Errore:", error.message);
  process.exit(1);
}

console.log(`Account gestore creato: ${data.user?.email} (id: ${data.user?.id})`);
console.log("Profilo creato dal trigger. Ora puoi accedere su /gestore/login.");
