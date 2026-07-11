"use server";

// Server Actions dei preferiti sincronizzati. Il client (localStorage) resta
// la fonte della UI; la tabella `preferiti` e la copia d'autorita per i
// loggati. Scritture col client di SESSIONE: RLS own-row + cap 500 nel DB.

import { verificaSessioneCliente } from "@/lib/account/auth";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PREFERITI = 500;

export interface EsitoPreferiti {
  ok: boolean;
  /** Lista completa (piu recente per primo) dopo l'operazione. */
  ids?: string[];
  error?: string;
}

/** Ripulisce l'input del client: solo uuid, dedup, cap. */
function normalizzaIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [
    ...new Set(
      ids.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)),
    ),
  ].slice(0, MAX_PREFERITI);
}

/** Lista server (piu recente per primo). */
async function leggiIdsServer(
  sessione: NonNullable<Awaited<ReturnType<typeof verificaSessioneCliente>>>,
): Promise<string[]> {
  const { data } = await sessione.supabase
    .from("preferiti")
    .select("prodotto_id, creato_il")
    .order("creato_il", { ascending: false })
    .limit(MAX_PREFERITI);
  return (data ?? []).map((r) => r.prodotto_id);
}

/**
 * Merge una tantum al login: UNIONE tra i preferiti del dispositivo e quelli
 * dell'account. Ritorna la lista fusa, che il client riscrive in localStorage.
 */
export async function sincronizzaPreferitiAction(
  idsLocali: string[],
): Promise<EsitoPreferiti> {
  const sessione = await verificaSessioneCliente();
  if (!sessione) return { ok: false, error: "Non autorizzato." };

  try {
    const locali = normalizzaIds(idsLocali);
    if (locali.length > 0) {
      // Gli id gia sul server NON vanno reinseriti: il trigger cap 500 e
      // BEFORE INSERT e scatta anche sull'upsert che finirebbe in ON CONFLICT
      // DO NOTHING, facendo fallire ogni sync a rubrica piena.
      const attuali = new Set(await leggiIdsServer(sessione));
      const nuovi = locali.filter((id) => !attuali.has(id));
      if (nuovi.length > 0) {
        // La FK su prodotti farebbe fallire l'INTERO batch per un id fantasma
        // (rimasto in localStorage dopo un delete prodotto): prima si filtra.
        const { data: esistenti } = await sessione.supabase
          .from("prodotti")
          .select("id")
          .in("id", nuovi);
        const validi = new Set((esistenti ?? []).map((p) => p.id));
        const daInserire = nuovi
          .filter((id) => validi.has(id))
          .map((prodotto_id) => ({ user_id: sessione.userId, prodotto_id }));
        if (daInserire.length > 0) {
          const { error } = await sessione.supabase
            .from("preferiti")
            .upsert(daInserire, {
              onConflict: "user_id,prodotto_id",
              ignoreDuplicates: true,
            });
          if (error) throw error;
        }
      }
    }
    return { ok: true, ids: await leggiIdsServer(sessione) };
  } catch (err) {
    console.error("[account] merge preferiti fallito:", err);
    return { ok: false, error: "Sincronizzazione non riuscita." };
  }
}

/** Pull: la lista dell'account (server autoritativo dopo il primo merge). */
export async function leggiPreferitiAction(): Promise<EsitoPreferiti> {
  const sessione = await verificaSessioneCliente();
  if (!sessione) return { ok: false, error: "Non autorizzato." };
  try {
    return { ok: true, ids: await leggiIdsServer(sessione) };
  } catch (err) {
    console.error("[account] lettura preferiti fallita:", err);
    return { ok: false, error: "Lettura non riuscita." };
  }
}

/**
 * Replica di una scrittura locale: porta il server allo stato `ids`
 * (aggiunte E rimozioni). Idempotente.
 */
export async function salvaPreferitiServerAction(
  ids: string[],
): Promise<EsitoPreferiti> {
  const sessione = await verificaSessioneCliente();
  if (!sessione) return { ok: false, error: "Non autorizzato." };

  try {
    const desiderati = normalizzaIds(ids);
    const attuali = await leggiIdsServer(sessione);
    const setDesiderati = new Set(desiderati);
    const setAttuali = new Set(attuali);

    const daRimuovere = attuali.filter((id) => !setDesiderati.has(id));
    if (daRimuovere.length > 0) {
      const { error } = await sessione.supabase
        .from("preferiti")
        .delete()
        .eq("user_id", sessione.userId)
        .in("prodotto_id", daRimuovere);
      if (error) throw error;
    }

    const nuovi = desiderati.filter((id) => !setAttuali.has(id));
    if (nuovi.length > 0) {
      // Stesso filtro anti-id-fantasma del merge.
      const { data: esistenti } = await sessione.supabase
        .from("prodotti")
        .select("id")
        .in("id", nuovi);
      const validi = new Set((esistenti ?? []).map((p) => p.id));
      const daInserire = nuovi
        .filter((id) => validi.has(id))
        .map((prodotto_id) => ({ user_id: sessione.userId, prodotto_id }));
      if (daInserire.length > 0) {
        const { error } = await sessione.supabase
          .from("preferiti")
          .upsert(daInserire, {
            onConflict: "user_id,prodotto_id",
            ignoreDuplicates: true,
          });
        if (error) throw error;
      }
    }
    return { ok: true };
  } catch (err) {
    console.error("[account] replica preferiti fallita:", err);
    return { ok: false, error: "Sincronizzazione non riuscita." };
  }
}
