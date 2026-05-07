/**
 * Supabase database type definitions.
 *
 * Auto-generated from the live schema. To regenerate after a migration:
 *   npx supabase gen types typescript --project-id fwuiwkfsqkppmdxvlcac \
 *     > src/lib/supabase/types.ts
 *
 * Do not hand-edit this file — it will be overwritten next time.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.5" };
  public: {
    Tables: {
      candidates: {
        Row: {
          background: string;
          bottom_line: string;
          campaign_suspended: Json | null;
          created_at: string;
          criticisms: Json;
          current_position: string;
          headshot_url: string | null;
          history: Json;
          id: string;
          issues: Json;
          last_synced_at: string;
          major: boolean;
          name: string;
          party: string;
          past_roles: Json;
          polling_pct: number | null;
          polling_status: string;
          priorities: Json;
          race_id: string;
          sort_order: number;
          stances: Json;
          strengths: Json;
          trend: string | null;
          updated_at: string;
          vote_for_if: Json;
          withdrawn: boolean;
        };
        Insert: Omit<Database["public"]["Tables"]["candidates"]["Row"], "created_at" | "updated_at" | "last_synced_at"> & {
          created_at?: string;
          updated_at?: string;
          last_synced_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["candidates"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "candidates_race_id_fkey";
            columns: ["race_id"];
            isOneToOne: false;
            referencedRelation: "races";
            referencedColumns: ["id"];
          }
        ];
      };
      elections: {
        Row: { created_at: string; date: string; id: string; name: string; state: string; type: string };
        Insert: Omit<Database["public"]["Tables"]["elections"]["Row"], "created_at" | "type"> & {
          created_at?: string;
          type?: string;
        };
        Update: Partial<Database["public"]["Tables"]["elections"]["Insert"]>;
        Relationships: [];
      };
      endorsements: {
        Row: {
          candidate_id: string;
          category: string;
          created_at: string;
          id: string;
          name: string;
          sort_order: number;
        };
        Insert: Omit<Database["public"]["Tables"]["endorsements"]["Row"], "id" | "created_at" | "sort_order"> & {
          id?: string;
          created_at?: string;
          sort_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["endorsements"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "endorsements_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          }
        ];
      };
      jurisdictions: {
        Row: {
          city: string | null;
          county: string | null;
          districts: Json;
          state: string;
          updated_at: string;
          zip: string;
        };
        Insert: Omit<Database["public"]["Tables"]["jurisdictions"]["Row"], "updated_at"> & { updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["jurisdictions"]["Insert"]>;
        Relationships: [];
      };
      news_items: {
        Row: {
          candidate_id: string | null;
          excerpt: string | null;
          id: string;
          ingested_at: string;
          published_at: string;
          race_id: string | null;
          social: Json | null;
          source: string;
          title: string;
          type: string;
          url: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["news_items"]["Row"], "ingested_at"> & { ingested_at?: string };
        Update: Partial<Database["public"]["Tables"]["news_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "news_items_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "news_items_race_id_fkey";
            columns: ["race_id"];
            isOneToOne: false;
            referencedRelation: "races";
            referencedColumns: ["id"];
          }
        ];
      };
      polls: {
        Row: {
          conducted_at: string;
          created_at: string;
          id: string;
          race_id: string;
          results: Json;
          sample_size: number | null;
          source: string;
          url: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["polls"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["polls"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "polls_race_id_fkey";
            columns: ["race_id"];
            isOneToOne: false;
            referencedRelation: "races";
            referencedColumns: ["id"];
          }
        ];
      };
      races: {
        Row: {
          created_at: string;
          election_id: string;
          format: string;
          format_explainer: string;
          id: string;
          intro: Json;
          issues: Json;
          jurisdiction_label: string;
          meta: Json;
          office: string;
          scope_type: string;
          scope_value: string | null;
          sort_order: number;
          unopposed: boolean;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["races"]["Row"], "created_at" | "updated_at"> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["races"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "races_election_id_fkey";
            columns: ["election_id"];
            isOneToOne: false;
            referencedRelation: "elections";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
