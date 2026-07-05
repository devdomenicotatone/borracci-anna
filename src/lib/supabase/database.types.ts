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
          costo_spedizione_cents: number | null;
          spedizione_indirizzo: Json | null;
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
          costo_spedizione_cents?: number | null;
          spedizione_indirizzo?: Json | null;
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
          costo_spedizione_cents?: number | null;
          spedizione_indirizzo?: Json | null;
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
        Returns: undefined;
      };
      segna_ordine_pagato_manuale: {
        Args: { p_ordine_id: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
