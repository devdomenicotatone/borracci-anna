// Tipi del database Supabase (schema `public`).
//
// Scritti a mano a partire da supabase/schema.sql (fonte di verita). In presenza
// della Supabase CLI collegata al progetto si possono rigenerare con:
//   supabase gen types typescript --linked > src/lib/supabase/database.types.ts
// Tenere allineato con le migration quando lo schema cambia.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      prodotti: {
        Row: {
          id: string;
          slug: string;
          nome: string;
          descrizione: string | null;
          prezzo_cents: number;
          valuta: string;
          immagine_url: string | null;
          attivo: boolean;
          disponibilita_su_richiesta: boolean;
          solo_online: boolean;
          categoria_id: string | null;
          codice: string | null;
          tema: string | null;
          creato_il: string;
        };
        Insert: {
          id?: string;
          slug: string;
          nome: string;
          descrizione?: string | null;
          prezzo_cents: number;
          valuta?: string;
          immagine_url?: string | null;
          attivo?: boolean;
          disponibilita_su_richiesta?: boolean;
          solo_online?: boolean;
          categoria_id?: string | null;
          codice?: string | null;
          tema?: string | null;
          creato_il?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          nome?: string;
          descrizione?: string | null;
          prezzo_cents?: number;
          valuta?: string;
          immagine_url?: string | null;
          attivo?: boolean;
          disponibilita_su_richiesta?: boolean;
          solo_online?: boolean;
          categoria_id?: string | null;
          codice?: string | null;
          tema?: string | null;
          creato_il?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prodotti_categoria_id_fkey";
            columns: ["categoria_id"];
            referencedRelation: "categorie";
            referencedColumns: ["id"];
          },
        ];
      };
      varianti: {
        Row: {
          id: string;
          prodotto_id: string;
          taglia: string | null;
          colore: string | null;
          sku: string;
          stock: number;
          creato_il: string;
        };
        Insert: {
          id?: string;
          prodotto_id: string;
          taglia?: string | null;
          colore?: string | null;
          sku: string;
          stock?: number;
          creato_il?: string;
        };
        Update: {
          id?: string;
          prodotto_id?: string;
          taglia?: string | null;
          colore?: string | null;
          sku?: string;
          stock?: number;
          creato_il?: string;
        };
        Relationships: [
          {
            foreignKeyName: "varianti_prodotto_id_fkey";
            columns: ["prodotto_id"];
            referencedRelation: "prodotti";
            referencedColumns: ["id"];
          },
        ];
      };
      carrelli: {
        Row: { id: string; creato_il: string };
        Insert: { id?: string; creato_il?: string };
        Update: { id?: string; creato_il?: string };
        Relationships: [];
      };
      carrello_righe: {
        Row: {
          id: string;
          carrello_id: string;
          prodotto_id: string;
          variante_id: string;
          quantita: number;
          creato_il: string;
        };
        Insert: {
          id?: string;
          carrello_id: string;
          prodotto_id: string;
          variante_id: string;
          quantita?: number;
          creato_il?: string;
        };
        Update: {
          id?: string;
          carrello_id?: string;
          prodotto_id?: string;
          variante_id?: string;
          quantita?: number;
          creato_il?: string;
        };
        Relationships: [
          {
            foreignKeyName: "carrello_righe_carrello_id_fkey";
            columns: ["carrello_id"];
            referencedRelation: "carrelli";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "carrello_righe_prodotto_id_fkey";
            columns: ["prodotto_id"];
            referencedRelation: "prodotti";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "carrello_righe_variante_id_fkey";
            columns: ["variante_id"];
            referencedRelation: "varianti";
            referencedColumns: ["id"];
          },
        ];
      };
      ordini: {
        Row: {
          id: string;
          stato: string;
          totale_cents: number;
          email: string | null;
          nome: string | null;
          telefono: string | null;
          note: string | null;
          token: string | null;
          confermato_il: string | null;
          stripe_session_id: string | null;
          stock_scalato: boolean;
          stock_mancante: Json | null;
          costo_spedizione_cents: number | null;
          spedizione_indirizzo: Json | null;
          user_id: string | null;
          numero: number | null;
          creato_il: string;
        };
        Insert: {
          id?: string;
          stato?: string;
          totale_cents: number;
          email?: string | null;
          nome?: string | null;
          telefono?: string | null;
          note?: string | null;
          token?: string | null;
          confermato_il?: string | null;
          stripe_session_id?: string | null;
          stock_scalato?: boolean;
          stock_mancante?: Json | null;
          costo_spedizione_cents?: number | null;
          spedizione_indirizzo?: Json | null;
          user_id?: string | null;
          numero?: number | null;
          creato_il?: string;
        };
        Update: {
          id?: string;
          stato?: string;
          totale_cents?: number;
          email?: string | null;
          nome?: string | null;
          telefono?: string | null;
          note?: string | null;
          token?: string | null;
          confermato_il?: string | null;
          stripe_session_id?: string | null;
          stock_scalato?: boolean;
          stock_mancante?: Json | null;
          costo_spedizione_cents?: number | null;
          spedizione_indirizzo?: Json | null;
          user_id?: string | null;
          numero?: number | null;
          creato_il?: string;
        };
        Relationships: [];
      };
      ordine_righe: {
        Row: {
          id: string;
          ordine_id: string;
          prodotto_id: string | null;
          variante_id: string | null;
          nome_prodotto: string;
          sku: string | null;
          taglia: string | null;
          colore: string | null;
          prezzo_cents: number;
          quantita: number;
          immagine_url: string | null;
          rimossa_il: string | null;
          rimossa_motivo: string | null;
        };
        Insert: {
          id?: string;
          ordine_id: string;
          prodotto_id?: string | null;
          variante_id?: string | null;
          nome_prodotto: string;
          sku?: string | null;
          taglia?: string | null;
          colore?: string | null;
          prezzo_cents: number;
          quantita: number;
          immagine_url?: string | null;
          rimossa_il?: string | null;
          rimossa_motivo?: string | null;
        };
        Update: {
          id?: string;
          ordine_id?: string;
          prodotto_id?: string | null;
          variante_id?: string | null;
          nome_prodotto?: string;
          sku?: string | null;
          taglia?: string | null;
          colore?: string | null;
          prezzo_cents?: number;
          quantita?: number;
          immagine_url?: string | null;
          rimossa_il?: string | null;
          rimossa_motivo?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ordine_righe_ordine_id_fkey";
            columns: ["ordine_id"];
            referencedRelation: "ordini";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordine_righe_prodotto_id_fkey";
            columns: ["prodotto_id"];
            referencedRelation: "prodotti";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordine_righe_variante_id_fkey";
            columns: ["variante_id"];
            referencedRelation: "varianti";
            referencedColumns: ["id"];
          },
        ];
      };
      profili: {
        Row: {
          id: string;
          ruolo: string;
          nome: string | null;
          creato_il: string;
          aggiornato_il: string;
        };
        Insert: {
          id: string;
          ruolo?: string;
          nome?: string | null;
          creato_il?: string;
          aggiornato_il?: string;
        };
        Update: {
          id?: string;
          ruolo?: string;
          nome?: string | null;
          creato_il?: string;
          aggiornato_il?: string;
        };
        Relationships: [];
      };
      categorie: {
        Row: {
          id: string;
          slug: string;
          nome: string;
          parent_id: string | null;
          ordine: number;
          creato_il: string;
        };
        Insert: {
          id?: string;
          slug: string;
          nome: string;
          parent_id?: string | null;
          ordine?: number;
          creato_il?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          nome?: string;
          parent_id?: string | null;
          ordine?: number;
          creato_il?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categorie_parent_id_fkey";
            columns: ["parent_id"];
            referencedRelation: "categorie";
            referencedColumns: ["id"];
          },
        ];
      };
      prodotto_foto: {
        Row: {
          id: string;
          prodotto_id: string;
          variante_id: string | null;
          colore: string | null;
          url: string;
          ordine: number;
          blur_data_url: string | null;
          creato_il: string;
        };
        Insert: {
          id?: string;
          prodotto_id: string;
          variante_id?: string | null;
          colore?: string | null;
          url: string;
          ordine?: number;
          blur_data_url?: string | null;
          creato_il?: string;
        };
        Update: {
          id?: string;
          prodotto_id?: string;
          variante_id?: string | null;
          colore?: string | null;
          url?: string;
          ordine?: number;
          blur_data_url?: string | null;
          creato_il?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prodotto_foto_prodotto_id_fkey";
            columns: ["prodotto_id"];
            referencedRelation: "prodotti";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prodotto_foto_variante_id_fkey";
            columns: ["variante_id"];
            referencedRelation: "varianti";
            referencedColumns: ["id"];
          },
        ];
      };
      vetrina_sezioni: {
        Row: {
          id: string;
          tipo: string;
          titolo: string | null;
          sottotitolo: string | null;
          ordine: number;
          visibile: boolean;
          config: Json;
          creato_il: string;
        };
        Insert: {
          id?: string;
          tipo: string;
          titolo?: string | null;
          sottotitolo?: string | null;
          ordine?: number;
          visibile?: boolean;
          config?: Json;
          creato_il?: string;
        };
        Update: {
          id?: string;
          tipo?: string;
          titolo?: string | null;
          sottotitolo?: string | null;
          ordine?: number;
          visibile?: boolean;
          config?: Json;
          creato_il?: string;
        };
        Relationships: [];
      };
      vetrina_sezione_prodotti: {
        Row: {
          id: string;
          sezione_id: string;
          prodotto_id: string;
          ordine: number;
          creato_il: string;
        };
        Insert: {
          id?: string;
          sezione_id: string;
          prodotto_id: string;
          ordine?: number;
          creato_il?: string;
        };
        Update: {
          id?: string;
          sezione_id?: string;
          prodotto_id?: string;
          ordine?: number;
          creato_il?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vetrina_sezione_prodotti_sezione_id_fkey";
            columns: ["sezione_id"];
            referencedRelation: "vetrina_sezioni";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vetrina_sezione_prodotti_prodotto_id_fkey";
            columns: ["prodotto_id"];
            referencedRelation: "prodotti";
            referencedColumns: ["id"];
          },
        ];
      };
      prodotto_embedding: {
        Row: {
          prodotto_id: string;
          /** pgvector serializzato ("[0.1,0.2,...]"): PostgREST lo espone come stringa. */
          embedding: string;
          testo: string;
          modello: string;
          aggiornato_il: string;
        };
        Insert: {
          prodotto_id: string;
          embedding: string;
          testo: string;
          modello: string;
          aggiornato_il?: string;
        };
        Update: {
          prodotto_id?: string;
          embedding?: string;
          testo?: string;
          modello?: string;
          aggiornato_il?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prodotto_embedding_prodotto_id_fkey";
            columns: ["prodotto_id"];
            referencedRelation: "prodotti";
            referencedColumns: ["id"];
          },
        ];
      };
      clienti: {
        Row: {
          id: string;
          email: string | null;
          nome: string | null;
          stripe_customer_id: string | null;
          stripe_customer_ambiente: string | null;
          creato_il: string;
          aggiornato_il: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          nome?: string | null;
          stripe_customer_id?: string | null;
          stripe_customer_ambiente?: string | null;
          creato_il?: string;
          aggiornato_il?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          nome?: string | null;
          stripe_customer_id?: string | null;
          stripe_customer_ambiente?: string | null;
          creato_il?: string;
          aggiornato_il?: string;
        };
        Relationships: [];
      };
      indirizzi: {
        Row: {
          id: string;
          user_id: string;
          etichetta: string | null;
          nome: string;
          telefono: string | null;
          line1: string;
          line2: string | null;
          cap: string;
          citta: string;
          provincia: string;
          paese: string;
          predefinito: boolean;
          creato_il: string;
          aggiornato_il: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          etichetta?: string | null;
          nome: string;
          telefono?: string | null;
          line1: string;
          line2?: string | null;
          cap: string;
          citta: string;
          provincia: string;
          paese?: string;
          predefinito?: boolean;
          creato_il?: string;
          aggiornato_il?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          etichetta?: string | null;
          nome?: string;
          telefono?: string | null;
          line1?: string;
          line2?: string | null;
          cap?: string;
          citta?: string;
          provincia?: string;
          paese?: string;
          predefinito?: boolean;
          creato_il?: string;
          aggiornato_il?: string;
        };
        Relationships: [
          {
            foreignKeyName: "indirizzi_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "clienti";
            referencedColumns: ["id"];
          },
        ];
      };
      preferiti: {
        Row: {
          user_id: string;
          prodotto_id: string;
          creato_il: string;
        };
        Insert: {
          user_id: string;
          prodotto_id: string;
          creato_il?: string;
        };
        Update: {
          user_id?: string;
          prodotto_id?: string;
          creato_il?: string;
        };
        Relationships: [
          {
            foreignKeyName: "preferiti_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "clienti";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "preferiti_prodotto_id_fkey";
            columns: ["prodotto_id"];
            referencedRelation: "prodotti";
            referencedColumns: ["id"];
          },
        ];
      };
      auth_richieste: {
        Row: {
          id: string;
          email: string;
          ip: string | null;
          tipo: string;
          creato_il: string;
        };
        Insert: {
          id?: string;
          email: string;
          ip?: string | null;
          tipo: string;
          creato_il?: string;
        };
        Update: {
          id?: string;
          email?: string;
          ip?: string | null;
          tipo?: string;
          creato_il?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_gestore: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      finalizza_ordine_pagato: {
        Args: {
          p_session_id: string;
          p_email: string | null;
          p_total: number;
          p_righe: Json;
          p_shipping_cents?: number | null;
          p_indirizzo?: Json | null;
        };
        /** true SOLO alla prima finalizzazione (guida l'invio email una tantum). */
        Returns: boolean;
      };
      aggancia_ordini_cliente: {
        Args: { p_user_id: string };
        Returns: number;
      };
      imposta_indirizzo_predefinito: {
        Args: { p_id: string };
        Returns: undefined;
      };
      segna_ordine_pagato_manuale: {
        Args: { p_ordine_id: string };
        Returns: undefined;
      };
      cerca_prodotti_gestore: {
        Args: {
          p_q?: string;
          p_stato?: string;
          p_categorie?: string[] | null;
          p_senza_categoria?: boolean;
          p_ordina?: string;
          p_offset?: number;
          p_limit?: number;
        };
        Returns: {
          id: string;
          slug: string;
          nome: string;
          prezzo_cents: number;
          valuta: string;
          immagine_url: string | null;
          attivo: boolean;
          disponibilita_su_richiesta: boolean;
          categoria_id: string | null;
          num_varianti: number;
          stock_totale: number;
          totale: number;
        }[];
      };
      ids_prodotti_gestore: {
        Args: {
          p_q?: string;
          p_stato?: string;
          p_categorie?: string[] | null;
          p_senza_categoria?: boolean;
        };
        Returns: { id: string }[];
      };
      conteggi_categorie_gestore: {
        Args: Record<string, never>;
        Returns: { categoria_id: string | null; n: number }[];
      };
      norm_nome_prodotto: {
        Args: { p: string };
        Returns: string;
      };
      conta_temi_catalogo: {
        Args: { p_categoria_ids?: string[] | null };
        Returns: { tema: string | null; n: number }[];
      };
      prodotti_correlati: {
        Args: { p_slug: string; p_limit?: number };
        Returns: {
          id: string;
          slug: string;
          nome: string;
          descrizione: string | null;
          prezzo_cents: number;
          valuta: string;
          immagine_url: string | null;
          attivo: boolean;
          solo_online: boolean;
          categoria_id: string | null;
        }[];
      };
      ricerca_semantica_catalogo: {
        Args: {
          /** pgvector serializzato ("[0.1,0.2,...]"), 1536 dimensioni. */
          p_embedding: string;
          /** Testo della query per l'aggancio lessicale trigram (ibrida). */
          p_query?: string | null;
          p_limite?: number;
          p_max_distanza?: number;
        };
        Returns: { id: string; distanza: number }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
