/**
 * Supabase database types — GENERATED. Do not edit by hand.
 *
 * Regenerate after every migration (Supabase MCP `generate_typescript_types`,
 * or `supabase gen types typescript --project-id <ref>`).
 * Last generated: 2026-10-29, after migration 0008_live_feed.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      api_usage: {
        Row: {
          count: number
          metric: string
          period: string
          updated_at: string
        }
        Insert: {
          count?: number
          metric: string
          period: string
          updated_at?: string
        }
        Update: {
          count?: number
          metric?: string
          period?: string
          updated_at?: string
        }
        Relationships: []
      }
      ballot_resolutions: {
        Row: {
          ballot: Json
          ballot_key: string
          election_id: string
          expires_at: string
          location: Json
          provider: string
          retrieved_at: string
          status: string
        }
        Insert: {
          ballot: Json
          ballot_key: string
          election_id: string
          expires_at: string
          location?: Json
          provider: string
          retrieved_at: string
          status: string
        }
        Update: {
          ballot?: Json
          ballot_key?: string
          election_id?: string
          expires_at?: string
          location?: Json
          provider?: string
          retrieved_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ballot_resolutions_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: false
            referencedRelation: "elections"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_link_checks: {
        Row: {
          checked_at: string
          contest_candidate_id: string
          found: boolean
        }
        Insert: {
          checked_at?: string
          contest_candidate_id: string
          found?: boolean
        }
        Update: {
          checked_at?: string
          contest_candidate_id?: string
          found?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "candidate_link_checks_contest_candidate_id_fkey"
            columns: ["contest_candidate_id"]
            isOneToOne: true
            referencedRelation: "contest_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_links: {
        Row: {
          checked_at: string
          contest_candidate_id: string
          id: string
          kind: string
          url: string
          verified_from: string
        }
        Insert: {
          checked_at?: string
          contest_candidate_id: string
          id?: string
          kind: string
          url: string
          verified_from: string
        }
        Update: {
          checked_at?: string
          contest_candidate_id?: string
          id?: string
          kind?: string
          url?: string
          verified_from?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_links_contest_candidate_id_fkey"
            columns: ["contest_candidate_id"]
            isOneToOne: false
            referencedRelation: "contest_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          background: string
          bottom_line: string
          campaign_suspended: Json | null
          created_at: string
          criticisms: Json
          current_position: string
          headshot_url: string | null
          history: Json
          id: string
          issues: Json
          last_synced_at: string
          major: boolean
          name: string
          party: string
          past_roles: Json
          polling_pct: number | null
          polling_status: string
          priorities: Json
          race_id: string
          sort_order: number
          stances: Json
          strengths: Json
          trend: string | null
          updated_at: string
          vote_for_if: Json
          withdrawn: boolean
        }
        Insert: {
          background?: string
          bottom_line?: string
          campaign_suspended?: Json | null
          created_at?: string
          criticisms?: Json
          current_position?: string
          headshot_url?: string | null
          history?: Json
          id: string
          issues?: Json
          last_synced_at?: string
          major?: boolean
          name: string
          party: string
          past_roles?: Json
          polling_pct?: number | null
          polling_status?: string
          priorities?: Json
          race_id: string
          sort_order?: number
          stances?: Json
          strengths?: Json
          trend?: string | null
          updated_at?: string
          vote_for_if?: Json
          withdrawn?: boolean
        }
        Update: {
          background?: string
          bottom_line?: string
          campaign_suspended?: Json | null
          created_at?: string
          criticisms?: Json
          current_position?: string
          headshot_url?: string | null
          history?: Json
          id?: string
          issues?: Json
          last_synced_at?: string
          major?: boolean
          name?: string
          party?: string
          past_roles?: Json
          polling_pct?: number | null
          polling_status?: string
          priorities?: Json
          race_id?: string
          sort_order?: number
          stances?: Json
          strengths?: Json
          trend?: string | null
          updated_at?: string
          vote_for_if?: Json
          withdrawn?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "candidates_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_candidates: {
        Row: {
          ballot_name: string
          campaign_url: string | null
          contest_id: string
          created_at: string
          designation: string | null
          display_name: string | null
          id: string
          incumbent: boolean | null
          legacy_candidate_id: string | null
          normalized_name: string
          order_on_ballot: number | null
          party: string | null
          provider_ids: Json
          source_id: string | null
        }
        Insert: {
          ballot_name: string
          campaign_url?: string | null
          contest_id: string
          created_at?: string
          designation?: string | null
          display_name?: string | null
          id?: string
          incumbent?: boolean | null
          legacy_candidate_id?: string | null
          normalized_name: string
          order_on_ballot?: number | null
          party?: string | null
          provider_ids?: Json
          source_id?: string | null
        }
        Update: {
          ballot_name?: string
          campaign_url?: string | null
          contest_id?: string
          created_at?: string
          designation?: string | null
          display_name?: string | null
          id?: string
          incumbent?: boolean | null
          legacy_candidate_id?: string | null
          normalized_name?: string
          order_on_ballot?: number | null
          party?: string | null
          provider_ids?: Json
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contest_candidates_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_candidates_legacy_candidate_id_fkey"
            columns: ["legacy_candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_candidates_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_measures: {
        Row: {
          contest_id: string
          measure_id: string
        }
        Insert: {
          contest_id: string
          measure_id: string
        }
        Update: {
          contest_id?: string
          measure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contest_measures_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_measures_measure_id_fkey"
            columns: ["measure_id"]
            isOneToOne: false
            referencedRelation: "measures"
            referencedColumns: ["id"]
          },
        ]
      }
      contests: {
        Row: {
          ballot_order: number | null
          ballot_title: string | null
          contest_type: string
          created_at: string
          division_key: string
          election_id: string
          id: string
          kind: string
          normalized_title: string
          number_elected: number | null
          partisan: boolean | null
          provider_ids: Json
          special: boolean
          title: string
          updated_at: string
          verification_source_id: string | null
          verified_at: string | null
          vote_for: number | null
        }
        Insert: {
          ballot_order?: number | null
          ballot_title?: string | null
          contest_type?: string
          created_at?: string
          division_key: string
          election_id: string
          id?: string
          kind: string
          normalized_title: string
          number_elected?: number | null
          partisan?: boolean | null
          provider_ids?: Json
          special?: boolean
          title: string
          updated_at?: string
          verification_source_id?: string | null
          verified_at?: string | null
          vote_for?: number | null
        }
        Update: {
          ballot_order?: number | null
          ballot_title?: string | null
          contest_type?: string
          created_at?: string
          division_key?: string
          election_id?: string
          id?: string
          kind?: string
          normalized_title?: string
          number_elected?: number | null
          partisan?: boolean | null
          provider_ids?: Json
          special?: boolean
          title?: string
          updated_at?: string
          verification_source_id?: string | null
          verified_at?: string | null
          vote_for?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contests_division_key_fkey"
            columns: ["division_key"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "contests_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: false
            referencedRelation: "elections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contests_verification_source_id_fkey"
            columns: ["verification_source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      divisions: {
        Row: {
          county: string | null
          created_at: string
          key: string
          metadata: Json
          name: string
          ocd_id: string | null
          parent_key: string | null
          scope: string | null
          state: string | null
        }
        Insert: {
          county?: string | null
          created_at?: string
          key: string
          metadata?: Json
          name: string
          ocd_id?: string | null
          parent_key?: string | null
          scope?: string | null
          state?: string | null
        }
        Update: {
          county?: string | null
          created_at?: string
          key?: string
          metadata?: Json
          name?: string
          ocd_id?: string | null
          parent_key?: string | null
          scope?: string | null
          state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "divisions_parent_key_fkey"
            columns: ["parent_key"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["key"]
          },
        ]
      }
      elections: {
        Row: {
          created_at: string
          cycle_start: string | null
          date: string
          external_ids: Json
          id: string
          name: string
          scope_ocd_id: string | null
          slug: string | null
          state: string
          status: string
          type: string
        }
        Insert: {
          created_at?: string
          cycle_start?: string | null
          date: string
          external_ids?: Json
          id: string
          name: string
          scope_ocd_id?: string | null
          slug?: string | null
          state: string
          status?: string
          type?: string
        }
        Update: {
          created_at?: string
          cycle_start?: string | null
          date?: string
          external_ids?: Json
          id?: string
          name?: string
          scope_ocd_id?: string | null
          slug?: string | null
          state?: string
          status?: string
          type?: string
        }
        Relationships: []
      }
      endorsements: {
        Row: {
          candidate_id: string
          category: string
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          candidate_id: string
          category: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          candidate_id?: string
          category?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "endorsements_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_article_reads: {
        Row: {
          matched: boolean
          outcome: string
          read_at: string
          url: string
        }
        Insert: {
          matched?: boolean
          outcome: string
          read_at?: string
          url: string
        }
        Update: {
          matched?: boolean
          outcome?: string
          read_at?: string
          url?: string
        }
        Relationships: []
      }
      feed_item_checks: {
        Row: {
          checked_at: string
          item_id: string
          last_status: number | null
        }
        Insert: {
          checked_at?: string
          item_id: string
          last_status?: number | null
        }
        Update: {
          checked_at?: string
          item_id?: string
          last_status?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "feed_item_checks_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "feed_items"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_items: {
        Row: {
          candidate_ids: string[]
          contest_ids: string[]
          election_id: string
          excerpt: string | null
          held_reason: string | null
          id: string
          image_url: string | null
          ingested_at: string
          match: Json
          payload: Json
          published_at: string
          publisher: string
          source_key: string
          status: string
          title: string
          type: string
          updated_at: string
          url: string
        }
        Insert: {
          candidate_ids?: string[]
          contest_ids?: string[]
          election_id: string
          excerpt?: string | null
          held_reason?: string | null
          id?: string
          image_url?: string | null
          ingested_at?: string
          match?: Json
          payload?: Json
          published_at: string
          publisher: string
          source_key: string
          status?: string
          title: string
          type: string
          updated_at?: string
          url: string
        }
        Update: {
          candidate_ids?: string[]
          contest_ids?: string[]
          election_id?: string
          excerpt?: string | null
          held_reason?: string | null
          id?: string
          image_url?: string | null
          ingested_at?: string
          match?: Json
          payload?: Json
          published_at?: string
          publisher?: string
          source_key?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_items_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: false
            referencedRelation: "elections"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_source_state: {
        Row: {
          etag: string | null
          failures: number
          items_seen: number
          last_error: string | null
          last_fetched_at: string | null
          last_modified: string | null
          last_status: number | null
          resolved_url: string | null
          retry_at: string | null
          source_key: string
        }
        Insert: {
          etag?: string | null
          failures?: number
          items_seen?: number
          last_error?: string | null
          last_fetched_at?: string | null
          last_modified?: string | null
          last_status?: number | null
          resolved_url?: string | null
          retry_at?: string | null
          source_key: string
        }
        Update: {
          etag?: string | null
          failures?: number
          items_seen?: number
          last_error?: string | null
          last_fetched_at?: string | null
          last_modified?: string | null
          last_status?: number | null
          resolved_url?: string | null
          retry_at?: string | null
          source_key?: string
        }
        Relationships: []
      }
      fetch_hosts: {
        Row: {
          host: string
          next_free_at: string
          robots_fetched_at: string | null
          robots_txt: string | null
          slow_factor: number
          updated_at: string
        }
        Insert: {
          host: string
          next_free_at?: string
          robots_fetched_at?: string | null
          robots_txt?: string | null
          slow_factor?: number
          updated_at?: string
        }
        Update: {
          host?: string
          next_free_at?: string
          robots_fetched_at?: string | null
          robots_txt?: string | null
          slow_factor?: number
          updated_at?: string
        }
        Relationships: []
      }
      jurisdictions: {
        Row: {
          city: string | null
          county: string | null
          districts: Json
          state: string
          updated_at: string
          zip: string
        }
        Insert: {
          city?: string | null
          county?: string | null
          districts: Json
          state: string
          updated_at?: string
          zip: string
        }
        Update: {
          city?: string | null
          county?: string | null
          districts?: Json
          state?: string
          updated_at?: string
          zip?: string
        }
        Relationships: []
      }
      manual_overrides: {
        Row: {
          active: boolean
          corrected_value: Json
          created_at: string
          created_by: string
          entity_id: string
          entity_type: string
          field: string
          id: string
          original_value: Json | null
          reason: string
          source_id: string | null
        }
        Insert: {
          active?: boolean
          corrected_value: Json
          created_at?: string
          created_by: string
          entity_id: string
          entity_type: string
          field: string
          id?: string
          original_value?: Json | null
          reason: string
          source_id?: string | null
        }
        Update: {
          active?: boolean
          corrected_value?: Json
          created_at?: string
          created_by?: string
          entity_id?: string
          entity_type?: string
          field?: string
          id?: string
          original_value?: Json | null
          reason?: string
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manual_overrides_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      material_events: {
        Row: {
          candidate_id: string | null
          detected_at: string
          event_type: string
          id: string
          metadata: Json
          occurred_at: string | null
          race_id: string | null
          severity: string
          source_ids: string[]
          status: string
          summary: string
        }
        Insert: {
          candidate_id?: string | null
          detected_at?: string
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string | null
          race_id?: string | null
          severity?: string
          source_ids?: string[]
          status?: string
          summary: string
        }
        Update: {
          candidate_id?: string | null
          detected_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string | null
          race_id?: string | null
          severity?: string
          source_ids?: string[]
          status?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_events_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_events_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
      measures: {
        Row: {
          analysis_url: string | null
          created_at: string
          division_key: string
          election_id: string
          full_text_url: string | null
          id: string
          identifier: string | null
          normalized_ident: string
          official_url: string | null
          passage_threshold: string | null
          source_id: string | null
          summary: string | null
          title: string
          verified_at: string | null
        }
        Insert: {
          analysis_url?: string | null
          created_at?: string
          division_key: string
          election_id: string
          full_text_url?: string | null
          id?: string
          identifier?: string | null
          normalized_ident: string
          official_url?: string | null
          passage_threshold?: string | null
          source_id?: string | null
          summary?: string | null
          title: string
          verified_at?: string | null
        }
        Update: {
          analysis_url?: string | null
          created_at?: string
          division_key?: string
          election_id?: string
          full_text_url?: string | null
          id?: string
          identifier?: string | null
          normalized_ident?: string
          official_url?: string | null
          passage_threshold?: string | null
          source_id?: string | null
          summary?: string | null
          title?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "measures_division_key_fkey"
            columns: ["division_key"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "measures_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: false
            referencedRelation: "elections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measures_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      news_items: {
        Row: {
          candidate_id: string | null
          excerpt: string | null
          id: string
          ingested_at: string
          published_at: string
          race_id: string | null
          social: Json | null
          source: string
          title: string
          type: string
          url: string | null
        }
        Insert: {
          candidate_id?: string | null
          excerpt?: string | null
          id: string
          ingested_at?: string
          published_at: string
          race_id?: string | null
          social?: Json | null
          source: string
          title: string
          type: string
          url?: string | null
        }
        Update: {
          candidate_id?: string | null
          excerpt?: string | null
          id?: string
          ingested_at?: string
          published_at?: string
          race_id?: string | null
          social?: Json | null
          source?: string
          title?: string
          type?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "news_items_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_items_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          conducted_at: string
          created_at: string
          id: string
          race_id: string
          results: Json
          sample_size: number | null
          source: string
          url: string | null
        }
        Insert: {
          conducted_at: string
          created_at?: string
          id?: string
          race_id: string
          results: Json
          sample_size?: number | null
          source: string
          url?: string | null
        }
        Update: {
          conducted_at?: string
          created_at?: string
          id?: string
          race_id?: string
          results?: Json
          sample_size?: number | null
          source?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "polls_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_records: {
        Row: {
          entity_id: string
          entity_type: string
          external_id: string | null
          fetched_at: string
          id: string
          normalizer_version: string | null
          payload_hash: string | null
          provider: string
        }
        Insert: {
          entity_id: string
          entity_type: string
          external_id?: string | null
          fetched_at?: string
          id?: string
          normalizer_version?: string | null
          payload_hash?: string | null
          provider: string
        }
        Update: {
          entity_id?: string
          entity_type?: string
          external_id?: string | null
          fetched_at?: string
          id?: string
          normalizer_version?: string | null
          payload_hash?: string | null
          provider?: string
        }
        Relationships: []
      }
      races: {
        Row: {
          created_at: string
          election_id: string
          format: string
          format_explainer: string
          id: string
          intro: Json
          issues: Json
          jurisdiction_label: string
          meta: Json
          office: string
          scope_type: string
          scope_value: string | null
          sort_order: number
          unopposed: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          election_id: string
          format: string
          format_explainer: string
          id: string
          intro: Json
          issues?: Json
          jurisdiction_label: string
          meta?: Json
          office: string
          scope_type: string
          scope_value?: string | null
          sort_order?: number
          unopposed?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          election_id?: string
          format?: string
          format_explainer?: string
          id?: string
          intro?: Json
          issues?: Json
          jurisdiction_label?: string
          meta?: Json
          office?: string
          scope_type?: string
          scope_value?: string | null
          sort_order?: number
          unopposed?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "races_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: false
            referencedRelation: "elections"
            referencedColumns: ["id"]
          },
        ]
      }
      research_state: {
        Row: {
          discovered: Json | null
          failures: number
          input_hash: string | null
          key: string
          last_outcome: string | null
          locked_until: string | null
          next_check_at: string
          target: Json
          updated_at: string
        }
        Insert: {
          discovered?: Json | null
          failures?: number
          input_hash?: string | null
          key: string
          last_outcome?: string | null
          locked_until?: string | null
          next_check_at?: string
          target: Json
          updated_at?: string
        }
        Update: {
          discovered?: Json | null
          failures?: number
          input_hash?: string | null
          key?: string
          last_outcome?: string | null
          locked_until?: string | null
          next_check_at?: string
          target?: Json
          updated_at?: string
        }
        Relationships: []
      }
      qa_runs: {
        Row: {
          categories: Json
          contest_count: number
          error: string | null
          id: string
          inventory: Json
          label: string
          run_at: string
          run_id: string
          state: string | null
          status: string
          warnings: Json
        }
        Insert: {
          categories?: Json
          contest_count?: number
          error?: string | null
          id?: string
          inventory?: Json
          label: string
          run_at?: string
          run_id: string
          state?: string | null
          status: string
          warnings?: Json
        }
        Update: {
          categories?: Json
          contest_count?: number
          error?: string | null
          id?: string
          inventory?: Json
          label?: string
          run_at?: string
          run_id?: string
          state?: string | null
          status?: string
          warnings?: Json
        }
        Relationships: []
      }
      resolution_events: {
        Row: {
          cache_hit: boolean
          contest_count: number | null
          election_id: string | null
          id: number
          latency_ms: number | null
          occurred_at: string
          provider: string
          state: string | null
          status: string
          warning_codes: string[]
        }
        Insert: {
          cache_hit?: boolean
          contest_count?: number | null
          election_id?: string | null
          id?: never
          latency_ms?: number | null
          occurred_at?: string
          provider: string
          state?: string | null
          status: string
          warning_codes?: string[]
        }
        Update: {
          cache_hit?: boolean
          contest_count?: number | null
          election_id?: string | null
          id?: never
          latency_ms?: number | null
          occurred_at?: string
          provider?: string
          state?: string | null
          status?: string
          warning_codes?: string[]
        }
        Relationships: []
      }
      source_evidence_links: {
        Row: {
          claim: string | null
          created_at: string
          field_name: string | null
          id: string
          source_id: string
          target_id: string
          target_type: string
        }
        Insert: {
          claim?: string | null
          created_at?: string
          field_name?: string | null
          id?: string
          source_id: string
          target_id: string
          target_type: string
        }
        Update: {
          claim?: string | null
          created_at?: string
          field_name?: string | null
          id?: string
          source_id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_evidence_links_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          author: string | null
          canonical_url: string | null
          content_text: string | null
          created_at: string
          excerpt: string | null
          fetched_at: string
          id: string
          metadata: Json
          published_at: string | null
          publisher: string | null
          raw_hash: string | null
          source_type: string
          status: string
          title: string | null
          trust_tier: string
          url: string
        }
        Insert: {
          author?: string | null
          canonical_url?: string | null
          content_text?: string | null
          created_at?: string
          excerpt?: string | null
          fetched_at?: string
          id?: string
          metadata?: Json
          published_at?: string | null
          publisher?: string | null
          raw_hash?: string | null
          source_type: string
          status?: string
          title?: string | null
          trust_tier?: string
          url: string
        }
        Update: {
          author?: string | null
          canonical_url?: string | null
          content_text?: string | null
          created_at?: string
          excerpt?: string | null
          fetched_at?: string
          id?: string
          metadata?: Json
          published_at?: string | null
          publisher?: string | null
          raw_hash?: string | null
          source_type?: string
          status?: string
          title?: string | null
          trust_tier?: string
          url?: string
        }
        Relationships: []
      }
      synthesis_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          field_name: string
          id: string
          input_hash: string | null
          material_event_id: string | null
          metadata: Json
          model: string | null
          output_hash: string | null
          prompt_version: string | null
          source_ids: string[]
          started_at: string | null
          status: string
          target_id: string
          target_type: string
          trigger_type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          field_name: string
          id?: string
          input_hash?: string | null
          material_event_id?: string | null
          metadata?: Json
          model?: string | null
          output_hash?: string | null
          prompt_version?: string | null
          source_ids?: string[]
          started_at?: string | null
          status?: string
          target_id: string
          target_type: string
          trigger_type?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          field_name?: string
          id?: string
          input_hash?: string | null
          material_event_id?: string | null
          metadata?: Json
          model?: string | null
          output_hash?: string | null
          prompt_version?: string | null
          source_ids?: string[]
          started_at?: string | null
          status?: string
          target_id?: string
          target_type?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "synthesis_runs_material_event_id_fkey"
            columns: ["material_event_id"]
            isOneToOne: false
            referencedRelation: "material_events"
            referencedColumns: ["id"]
          },
        ]
      }
      synthesized_field_versions: {
        Row: {
          content: string
          created_at: string
          field_name: string
          held_reason: string | null
          id: string
          is_current: boolean
          payload: Json | null
          source_ids: string[]
          status: string
          synthesis_run_id: string | null
          target_id: string
          target_type: string
        }
        Insert: {
          content: string
          created_at?: string
          field_name: string
          held_reason?: string | null
          id?: string
          is_current?: boolean
          payload?: Json | null
          source_ids?: string[]
          status?: string
          synthesis_run_id?: string | null
          target_id: string
          target_type: string
        }
        Update: {
          content?: string
          created_at?: string
          field_name?: string
          held_reason?: string | null
          id?: string
          is_current?: boolean
          payload?: Json | null
          source_ids?: string[]
          status?: string
          synthesis_run_id?: string | null
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "synthesized_field_versions_synthesis_run_id_fkey"
            columns: ["synthesis_run_id"]
            isOneToOne: false
            referencedRelation: "synthesis_runs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_api_spend: {
        Args: { p_amount: number; p_metric: string; p_period: string }
        Returns: number
      }
      ballot_feed: {
        Args: {
          p_contest_ids: string[]
          p_election_id: string
          p_per_contest?: number
        }
        Returns: {
          candidate_ids: string[]
          contest_ids: string[]
          excerpt: string
          id: string
          ingested_at: string
          payload: Json
          published_at: string
          publisher: string
          status: string
          title: string
          type: string
          url: string
        }[]
      }
      claim_research_jobs: {
        Args: { p_keys: string[]; p_limit: number; p_lock_seconds: number }
        Returns: string[]
      }
      consume_api_quota: {
        Args: { p_limit: number; p_metric: string; p_period: string }
        Returns: boolean
      }
      feed_page: {
        Args: {
          p_before_at: string | null
          p_before_id: string | null
          p_candidate_id: string | null
          p_contest_id: string | null
          p_election_id: string
          p_limit?: number
        }
        Returns: {
          candidate_ids: string[]
          contest_ids: string[]
          excerpt: string
          id: string
          ingested_at: string
          payload: Json
          published_at: string
          publisher: string
          status: string
          title: string
          type: string
          url: string
        }[]
      }
      reserve_host_slot:
        | {
            Args: { p_host: string; p_spacing_ms: number }
            Returns: number
          }
        | {
            Args: { p_host: string; p_max_wait_ms: number; p_spacing_ms: number }
            Returns: number
          }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
