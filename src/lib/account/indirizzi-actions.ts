"use server";

// Server Actions della rubrica indirizzi. Ogni action riverifica la sessione
// (i POST sono raggiungibili direttamente) e scrive col client di SESSIONE:
// le RLS own-row sono la barriera vera, i CHECK SQL il cap di lunghezza.
// Come per il carrello (EsitoCarrello), ogni mutazione ritorna la rubrica
// aggiornata: il client si riallinea senza un secondo round-trip.

import { verificaSessioneCliente } from "@/lib/account/auth";
import { leggiIndirizzi } from "@/lib/account/dati";
import { sincronizzaIndirizzoClienteStripe } from "@/lib/account/stripe-cliente";
import type { Indirizzo } from "@/lib/types";

export type CampoIndirizzo =
  | "etichetta"
  | "nome"
  | "telefono"
  | "line1"
  | "line2"
  | "cap"
  | "citta"
  | "provincia";

export interface EsitoIndirizzi {
  ok: boolean;
  error?: string;
  errors?: Partial<Record<CampoIndirizzo, string>>;
  /** Rubrica aggiornata dopo la mutazione (su ok). */
  indirizzi?: Indirizzo[];
  /** Valori inseriti da ripristinare dopo un errore (React 19 azzera i campi). */
  valori?: Partial<Record<CampoIndirizzo, string>>;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NON_AUTORIZZATO: EsitoIndirizzi = {
  ok: false,
  error: "Sessione scaduta: accedi di nuovo.",
};

/** Crea o aggiorna un indirizzo (campo hidden `id` presente = aggiornamento). */
export async function salvaIndirizzoAction(
  _stato: EsitoIndirizzi,
  formData: FormData,
): Promise<EsitoIndirizzi> {
  const sessione = await verificaSessioneCliente();
  if (!sessione) return NON_AUTORIZZATO;

  const id = String(formData.get("id") ?? "").trim();
  const etichetta = String(formData.get("etichetta") ?? "").trim().slice(0, 40);
  const nome = String(formData.get("nome") ?? "").trim().slice(0, 200);
  const telefono = String(formData.get("telefono") ?? "").trim().slice(0, 40);
  const line1 = String(formData.get("line1") ?? "").trim().slice(0, 200);
  const line2 = String(formData.get("line2") ?? "").trim().slice(0, 200);
  const cap = String(formData.get("cap") ?? "").trim();
  const citta = String(formData.get("citta") ?? "").trim().slice(0, 120);
  const provincia = String(formData.get("provincia") ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  const predefinitoRichiesto = formData.get("predefinito") === "on";

  const valori = { etichetta, nome, telefono, line1, line2, cap, citta, provincia };
  const errors: NonNullable<EsitoIndirizzi["errors"]> = {};
  if (!nome) errors.nome = "Inserisci il destinatario.";
  if (!line1) errors.line1 = "Inserisci via e numero civico.";
  if (!/^\d{5}$/.test(cap)) errors.cap = "CAP di 5 cifre.";
  if (!citta) errors.citta = "Inserisci la città.";
  if (!/^[A-Z]{2}$/.test(provincia)) {
    errors.provincia = "Sigla di 2 lettere (es. RN).";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors, valori };

  if (id && !UUID_RE.test(id)) {
    return { ok: false, error: "Indirizzo non valido.", valori };
  }

  try {
    const valori = {
      etichetta: etichetta || null,
      nome,
      telefono: telefono || null,
      line1,
      line2: line2 || null,
      cap,
      citta,
      provincia,
      paese: "IT",
    };

    let idSalvato = id;
    if (id) {
      const { error } = await sessione.supabase
        .from("indirizzi")
        .update(valori)
        .eq("id", id)
        .eq("user_id", sessione.userId);
      if (error) throw error;
    } else {
      // Il primo indirizzo diventa predefinito d'ufficio (inserto diretto:
      // non puo violare l'indice parziale, non esistono altre righe).
      const esistenti = await leggiIndirizzi(sessione);
      const { data, error } = await sessione.supabase
        .from("indirizzi")
        .insert({
          ...valori,
          user_id: sessione.userId,
          predefinito: esistenti.length === 0,
        })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("insert fallita");
      idSalvato = data.id;
    }

    // Predefinito richiesto: RPC atomica (mai due predefiniti in transizione).
    if (predefinitoRichiesto && idSalvato) {
      const { error } = await sessione.supabase.rpc(
        "imposta_indirizzo_predefinito",
        { p_id: idSalvato },
      );
      if (error) throw error;
    }

    // Il predefinito puo essere cambiato: sync best effort verso Stripe.
    await sincronizzaIndirizzoClienteStripe(sessione);

    return { ok: true, indirizzi: await leggiIndirizzi(sessione) };
  } catch (err) {
    console.error("[account] salvataggio indirizzo fallito:", err);
    // Il messaggio del trigger cap (10 indirizzi) e gia in italiano: inoltralo.
    const msg = err instanceof Error ? err.message : "";
    return {
      ok: false,
      error: msg.includes("numero massimo di indirizzi")
        ? "Hai raggiunto il numero massimo di indirizzi (10)."
        : "Non è stato possibile salvare l'indirizzo. Riprova.",
      valori,
    };
  }
}

/** Elimina un indirizzo. */
export async function eliminaIndirizzoAction(
  id: string,
): Promise<EsitoIndirizzi> {
  const sessione = await verificaSessioneCliente();
  if (!sessione) return NON_AUTORIZZATO;
  if (!UUID_RE.test(id)) return { ok: false, error: "Indirizzo non valido." };

  try {
    const { error } = await sessione.supabase
      .from("indirizzi")
      .delete()
      .eq("id", id)
      .eq("user_id", sessione.userId);
    if (error) throw error;
    await sincronizzaIndirizzoClienteStripe(sessione);
    return { ok: true, indirizzi: await leggiIndirizzi(sessione) };
  } catch (err) {
    console.error("[account] eliminazione indirizzo fallita:", err);
    return {
      ok: false,
      error: "Non è stato possibile eliminare l'indirizzo. Riprova.",
    };
  }
}

/** Promuove un indirizzo a predefinito (RPC atomica). */
export async function impostaPredefinitoAction(
  id: string,
): Promise<EsitoIndirizzi> {
  const sessione = await verificaSessioneCliente();
  if (!sessione) return NON_AUTORIZZATO;
  if (!UUID_RE.test(id)) return { ok: false, error: "Indirizzo non valido." };

  try {
    const { error } = await sessione.supabase.rpc(
      "imposta_indirizzo_predefinito",
      { p_id: id },
    );
    if (error) throw error;
    await sincronizzaIndirizzoClienteStripe(sessione);
    return { ok: true, indirizzi: await leggiIndirizzi(sessione) };
  } catch (err) {
    console.error("[account] imposta predefinito fallita:", err);
    return {
      ok: false,
      error: "Non è stato possibile impostare il predefinito. Riprova.",
    };
  }
}
