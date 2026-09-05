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
      contact_enquiries: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
        }
        Relationships: []
      }
      discover_failed_candidates: {
        Row: {
          failed_at: string
          id: string
          reason: string
          university_name: string
          user_id: string
        }
        Insert: {
          failed_at?: string
          id?: string
          reason: string
          university_name: string
          user_id: string
        }
        Update: {
          failed_at?: string
          id?: string
          reason?: string
          university_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discover_failed_candidates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discover_jobs: {
        Row: {
          completed_at: string | null
          error: string | null
          id: string
          requested_at: string
          status: Database["public"]["Enums"]["discover_job_status"]
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          error?: string | null
          id?: string
          requested_at?: string
          status?: Database["public"]["Enums"]["discover_job_status"]
          user_id: string
        }
        Update: {
          completed_at?: string | null
          error?: string | null
          id?: string
          requested_at?: string
          status?: Database["public"]["Enums"]["discover_job_status"]
          user_id?: string
        }
        Relationships: []
      }
      entry_status_history: {
        Row: {
          changed_at: string
          entry_id: string
          id: string
          new_status: Database["public"]["Enums"]["entry_status"]
          old_status: Database["public"]["Enums"]["entry_status"] | null
          user_id: string
        }
        Insert: {
          changed_at?: string
          entry_id: string
          id?: string
          new_status: Database["public"]["Enums"]["entry_status"]
          old_status?: Database["public"]["Enums"]["entry_status"] | null
          user_id: string
        }
        Update: {
          changed_at?: string
          entry_id?: string
          id?: string
          new_status?: Database["public"]["Enums"]["entry_status"]
          old_status?: Database["public"]["Enums"]["entry_status"] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_status_history_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "user_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_comments: {
        Row: {
          body: string
          created_at: string
          edited_at: string | null
          id: string
          is_anonymous: boolean
          is_flagged: boolean
          is_removed: boolean
          like_count: number
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          edited_at?: string | null
          id?: string
          is_anonymous?: boolean
          is_flagged?: boolean
          is_removed?: boolean
          like_count?: number
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          is_anonymous?: boolean
          is_flagged?: boolean
          is_removed?: boolean
          like_count?: number
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_flags: {
        Row: {
          comment_id: string | null
          created_at: string
          details: string | null
          id: string
          post_id: string | null
          reason: string
          reporter_user_id: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          post_id?: string | null
          reason: string
          reporter_user_id: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          post_id?: string | null
          reason?: string
          reporter_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_flags_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "forum_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_flags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_likes: {
        Row: {
          comment_id: string | null
          created_at: string
          id: string
          post_id: string | null
          user_id: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          user_id: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "forum_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_posts: {
        Row: {
          body: string
          created_at: string
          edited_at: string | null
          id: string
          is_anonymous: boolean
          is_flagged: boolean
          is_removed: boolean
          like_count: number
          tag_type: string
          tag_university_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          edited_at?: string | null
          id?: string
          is_anonymous?: boolean
          is_flagged?: boolean
          is_removed?: boolean
          like_count?: number
          tag_type: string
          tag_university_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          is_anonymous?: boolean
          is_flagged?: boolean
          is_removed?: boolean
          like_count?: number
          tag_type?: string
          tag_university_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_posts_tag_university_id_fkey"
            columns: ["tag_university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_rate_limits: {
        Row: {
          comments_last_hour: number
          last_reset_at: string
          posts_last_hour: number
          user_id: string
        }
        Insert: {
          comments_last_hour?: number
          last_reset_at?: string
          posts_last_hour?: number
          user_id: string
        }
        Update: {
          comments_last_hour?: number
          last_reset_at?: string
          posts_last_hour?: number
          user_id?: string
        }
        Relationships: []
      }
      payment_history: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          hosted_invoice_url: string | null
          id: string
          invoice_pdf: string | null
          paid_at: string | null
          status: string
          stripe_invoice_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf?: string | null
          paid_at?: string | null
          status: string
          stripe_invoice_id?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf?: string | null
          paid_at?: string | null
          status?: string
          stripe_invoice_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      preference_vectors: {
        Row: {
          updated_at: string
          user_id: string
          weights: Json
        }
        Insert: {
          updated_at?: string
          user_id: string
          weights?: Json
        }
        Update: {
          updated_at?: string
          user_id?: string
          weights?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ai_bullets_used: number
          budget_ceiling: number | null
          budget_currency: string | null
          cancel_at_period_end: boolean
          country_of_origin: string | null
          created_at: string
          discover_runs_used: number
          full_name: string | null
          funding_preference: Database["public"]["Enums"]["funding_pref"] | null
          gpa: number | null
          id: string
          last_visited_forum_at: string | null
          onboarding_complete: boolean
          payment_method_attached: boolean
          sandbox_ai_bullets_used: number
          sandbox_cancel_at_period_end: boolean
          sandbox_discover_runs_used: number
          sandbox_stripe_customer_id: string | null
          sandbox_stripe_subscription_id: string | null
          sandbox_subscription_current_period_end: string | null
          sandbox_subscription_start_date: string | null
          sandbox_subscription_status: string | null
          sandbox_subscription_tier: string
          sandbox_trial_end_date: string | null
          sandbox_trial_used: boolean
          sandbox_update_data_used: number
          sandbox_usage_reset_at: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_current_period_end: string | null
          subscription_start_date: string | null
          subscription_status: string | null
          subscription_tier: string
          target_countries: string[] | null
          target_country: string | null
          target_degree_level: string | null
          target_intake: string | null
          target_major: string | null
          target_tier: string | null
          test_scores: Json | null
          trial_end_date: string | null
          trial_used: boolean
          update_data_used: number
          updated_at: string
          usage_reset_at: string
          work_exp_years: number | null
        }
        Insert: {
          ai_bullets_used?: number
          budget_ceiling?: number | null
          budget_currency?: string | null
          cancel_at_period_end?: boolean
          country_of_origin?: string | null
          created_at?: string
          discover_runs_used?: number
          full_name?: string | null
          funding_preference?:
            | Database["public"]["Enums"]["funding_pref"]
            | null
          gpa?: number | null
          id: string
          last_visited_forum_at?: string | null
          onboarding_complete?: boolean
          payment_method_attached?: boolean
          sandbox_ai_bullets_used?: number
          sandbox_cancel_at_period_end?: boolean
          sandbox_discover_runs_used?: number
          sandbox_stripe_customer_id?: string | null
          sandbox_stripe_subscription_id?: string | null
          sandbox_subscription_current_period_end?: string | null
          sandbox_subscription_start_date?: string | null
          sandbox_subscription_status?: string | null
          sandbox_subscription_tier?: string
          sandbox_trial_end_date?: string | null
          sandbox_trial_used?: boolean
          sandbox_update_data_used?: number
          sandbox_usage_reset_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_start_date?: string | null
          subscription_status?: string | null
          subscription_tier?: string
          target_countries?: string[] | null
          target_country?: string | null
          target_degree_level?: string | null
          target_intake?: string | null
          target_major?: string | null
          target_tier?: string | null
          test_scores?: Json | null
          trial_end_date?: string | null
          trial_used?: boolean
          update_data_used?: number
          updated_at?: string
          usage_reset_at?: string
          work_exp_years?: number | null
        }
        Update: {
          ai_bullets_used?: number
          budget_ceiling?: number | null
          budget_currency?: string | null
          cancel_at_period_end?: boolean
          country_of_origin?: string | null
          created_at?: string
          discover_runs_used?: number
          full_name?: string | null
          funding_preference?:
            | Database["public"]["Enums"]["funding_pref"]
            | null
          gpa?: number | null
          id?: string
          last_visited_forum_at?: string | null
          onboarding_complete?: boolean
          payment_method_attached?: boolean
          sandbox_ai_bullets_used?: number
          sandbox_cancel_at_period_end?: boolean
          sandbox_discover_runs_used?: number
          sandbox_stripe_customer_id?: string | null
          sandbox_stripe_subscription_id?: string | null
          sandbox_subscription_current_period_end?: string | null
          sandbox_subscription_start_date?: string | null
          sandbox_subscription_status?: string | null
          sandbox_subscription_tier?: string
          sandbox_trial_end_date?: string | null
          sandbox_trial_used?: boolean
          sandbox_update_data_used?: number
          sandbox_usage_reset_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_start_date?: string | null
          subscription_status?: string | null
          subscription_tier?: string
          target_countries?: string[] | null
          target_country?: string | null
          target_degree_level?: string | null
          target_intake?: string | null
          target_major?: string | null
          target_tier?: string | null
          test_scores?: Json | null
          trial_end_date?: string | null
          trial_used?: boolean
          update_data_used?: number
          updated_at?: string
          usage_reset_at?: string
          work_exp_years?: number | null
        }
        Relationships: []
      }
      program_admissions: {
        Row: {
          accepted_english_tests: Json | null
          application_fee: number | null
          application_fee_currency: string | null
          apply_url: string | null
          deadline_raw_text: string | null
          deadline_type: string | null
          deadlines: Json | null
          english_test_requirement: string | null
          gmat_required: string | null
          gre_gmat_notes: string | null
          gre_gmat_requirement: string | null
          gre_required: string | null
          program_id: string
          required_materials: Json | null
          test_requirement_status: string | null
          updated_at: string
        }
        Insert: {
          accepted_english_tests?: Json | null
          application_fee?: number | null
          application_fee_currency?: string | null
          apply_url?: string | null
          deadline_raw_text?: string | null
          deadline_type?: string | null
          deadlines?: Json | null
          english_test_requirement?: string | null
          gmat_required?: string | null
          gre_gmat_notes?: string | null
          gre_gmat_requirement?: string | null
          gre_required?: string | null
          program_id: string
          required_materials?: Json | null
          test_requirement_status?: string | null
          updated_at?: string
        }
        Update: {
          accepted_english_tests?: Json | null
          application_fee?: number | null
          application_fee_currency?: string | null
          apply_url?: string | null
          deadline_raw_text?: string | null
          deadline_type?: string | null
          deadlines?: Json | null
          english_test_requirement?: string | null
          gmat_required?: string | null
          gre_gmat_notes?: string | null
          gre_gmat_requirement?: string | null
          gre_required?: string | null
          program_id?: string
          required_materials?: Json | null
          test_requirement_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_admissions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: true
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_career_stats: {
        Row: {
          avg_salary: number | null
          avg_salary_currency: string | null
          avg_salary_note: string | null
          intl_student_salary_note: string | null
          placement_rate_pct: number | null
          program_id: string
          salary_breakdown_notes: string | null
          top_employers: Json | null
          top_industries: Json | null
          updated_at: string
        }
        Insert: {
          avg_salary?: number | null
          avg_salary_currency?: string | null
          avg_salary_note?: string | null
          intl_student_salary_note?: string | null
          placement_rate_pct?: number | null
          program_id: string
          salary_breakdown_notes?: string | null
          top_employers?: Json | null
          top_industries?: Json | null
          updated_at?: string
        }
        Update: {
          avg_salary?: number | null
          avg_salary_currency?: string | null
          avg_salary_note?: string | null
          intl_student_salary_note?: string | null
          placement_rate_pct?: number | null
          program_id?: string
          salary_breakdown_notes?: string | null
          top_employers?: Json | null
          top_industries?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_career_stats_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: true
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_city_info: {
        Row: {
          city_name: string | null
          city_vibe: string | null
          distance_to_major_city_km: number | null
          nearest_major_city: string | null
          program_id: string
          travel_time_to_major_city: string | null
          updated_at: string
        }
        Insert: {
          city_name?: string | null
          city_vibe?: string | null
          distance_to_major_city_km?: number | null
          nearest_major_city?: string | null
          program_id: string
          travel_time_to_major_city?: string | null
          updated_at?: string
        }
        Update: {
          city_name?: string | null
          city_vibe?: string | null
          distance_to_major_city_km?: number | null
          nearest_major_city?: string | null
          program_id?: string
          travel_time_to_major_city?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_city_info_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: true
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_class_profile: {
        Row: {
          avg_gmat: number | null
          avg_gmat_note: string | null
          avg_gpa: number | null
          avg_gpa_note: string | null
          avg_gre: number | null
          avg_gre_quant: number | null
          avg_gre_quant_note: string | null
          avg_gre_verbal: number | null
          avg_gre_verbal_note: string | null
          avg_ielts: number | null
          avg_ielts_note: string | null
          avg_toefl: number | null
          avg_toefl_note: string | null
          avg_work_exp_note: string | null
          avg_work_exp_years: number | null
          class_size: number | null
          gre_quant: number | null
          gre_quant_range: string | null
          gre_total: number | null
          gre_total_note: string | null
          gre_total_range: string | null
          gre_verbal: number | null
          gre_verbal_range: string | null
          intl_pct: number | null
          intl_student_pct_note: string | null
          is_stem: boolean | null
          profile_scope: string | null
          program_id: string
          updated_at: string
        }
        Insert: {
          avg_gmat?: number | null
          avg_gmat_note?: string | null
          avg_gpa?: number | null
          avg_gpa_note?: string | null
          avg_gre?: number | null
          avg_gre_quant?: number | null
          avg_gre_quant_note?: string | null
          avg_gre_verbal?: number | null
          avg_gre_verbal_note?: string | null
          avg_ielts?: number | null
          avg_ielts_note?: string | null
          avg_toefl?: number | null
          avg_toefl_note?: string | null
          avg_work_exp_note?: string | null
          avg_work_exp_years?: number | null
          class_size?: number | null
          gre_quant?: number | null
          gre_quant_range?: string | null
          gre_total?: number | null
          gre_total_note?: string | null
          gre_total_range?: string | null
          gre_verbal?: number | null
          gre_verbal_range?: string | null
          intl_pct?: number | null
          intl_student_pct_note?: string | null
          is_stem?: boolean | null
          profile_scope?: string | null
          program_id: string
          updated_at?: string
        }
        Update: {
          avg_gmat?: number | null
          avg_gmat_note?: string | null
          avg_gpa?: number | null
          avg_gpa_note?: string | null
          avg_gre?: number | null
          avg_gre_quant?: number | null
          avg_gre_quant_note?: string | null
          avg_gre_verbal?: number | null
          avg_gre_verbal_note?: string | null
          avg_ielts?: number | null
          avg_ielts_note?: string | null
          avg_toefl?: number | null
          avg_toefl_note?: string | null
          avg_work_exp_note?: string | null
          avg_work_exp_years?: number | null
          class_size?: number | null
          gre_quant?: number | null
          gre_quant_range?: string | null
          gre_total?: number | null
          gre_total_note?: string | null
          gre_total_range?: string | null
          gre_verbal?: number | null
          gre_verbal_range?: string | null
          intl_pct?: number | null
          intl_student_pct_note?: string | null
          is_stem?: boolean | null
          profile_scope?: string | null
          program_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_class_profile_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: true
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_contacts: {
        Row: {
          added_by: string | null
          country: string | null
          discovered_at: string
          graduation_year: string | null
          headline: string | null
          id: string
          last_verified_at: string
          linkedin_url: string
          name: string
          program_id: string
          source: string
        }
        Insert: {
          added_by?: string | null
          country?: string | null
          discovered_at?: string
          graduation_year?: string | null
          headline?: string | null
          id?: string
          last_verified_at?: string
          linkedin_url: string
          name: string
          program_id: string
          source?: string
        }
        Update: {
          added_by?: string | null
          country?: string | null
          discovered_at?: string
          graduation_year?: string | null
          headline?: string | null
          id?: string
          last_verified_at?: string
          linkedin_url?: string
          name?: string
          program_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_contacts_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_funding: {
        Row: {
          accommodation_currency: string | null
          avg_salary_note: string | null
          est_accommodation_high: number | null
          est_accommodation_low: number | null
          est_total_cost_of_attendance: number | null
          ga_ta_availability: string | null
          ga_ta_gra_available: boolean | null
          ga_ta_gra_notes: string | null
          program_id: string
          scholarship_notes: string | null
          tuition_amount: number | null
          tuition_as_of: string | null
          tuition_currency: string | null
          tuition_note: string | null
          tuition_per: string | null
          tuition_waiver_with_assistantship: boolean | null
          updated_at: string
        }
        Insert: {
          accommodation_currency?: string | null
          avg_salary_note?: string | null
          est_accommodation_high?: number | null
          est_accommodation_low?: number | null
          est_total_cost_of_attendance?: number | null
          ga_ta_availability?: string | null
          ga_ta_gra_available?: boolean | null
          ga_ta_gra_notes?: string | null
          program_id: string
          scholarship_notes?: string | null
          tuition_amount?: number | null
          tuition_as_of?: string | null
          tuition_currency?: string | null
          tuition_note?: string | null
          tuition_per?: string | null
          tuition_waiver_with_assistantship?: boolean | null
          updated_at?: string
        }
        Update: {
          accommodation_currency?: string | null
          avg_salary_note?: string | null
          est_accommodation_high?: number | null
          est_accommodation_low?: number | null
          est_total_cost_of_attendance?: number | null
          ga_ta_availability?: string | null
          ga_ta_gra_available?: boolean | null
          ga_ta_gra_notes?: string | null
          program_id?: string
          scholarship_notes?: string | null
          tuition_amount?: number | null
          tuition_as_of?: string | null
          tuition_currency?: string | null
          tuition_note?: string | null
          tuition_per?: string | null
          tuition_waiver_with_assistantship?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_funding_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: true
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_research_sources: {
        Row: {
          created_at: string
          id: string
          program_id: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          program_id: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          program_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_research_sources_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          apply_url: string | null
          created_at: string
          degree_level: string | null
          degree_type: string | null
          department: string | null
          duration_months: number | null
          enrichment_started_at: string | null
          id: string
          is_stem: boolean | null
          last_verified_at: string | null
          name: string
          name_normalized: string | null
          program_description: string | null
          program_url: string | null
          school_ranking: number | null
          university_id: string
          us_news_ranking: number | null
        }
        Insert: {
          apply_url?: string | null
          created_at?: string
          degree_level?: string | null
          degree_type?: string | null
          department?: string | null
          duration_months?: number | null
          enrichment_started_at?: string | null
          id?: string
          is_stem?: boolean | null
          last_verified_at?: string | null
          name: string
          name_normalized?: string | null
          program_description?: string | null
          program_url?: string | null
          school_ranking?: number | null
          university_id: string
          us_news_ranking?: number | null
        }
        Update: {
          apply_url?: string | null
          created_at?: string
          degree_level?: string | null
          degree_type?: string | null
          department?: string | null
          duration_months?: number | null
          enrichment_started_at?: string | null
          id?: string
          is_stem?: boolean | null
          last_verified_at?: string | null
          name?: string
          name_normalized?: string | null
          program_description?: string | null
          program_url?: string | null
          school_ranking?: number | null
          university_id?: string
          us_news_ranking?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "programs_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          expires_at: string | null
          id: string
          max_redemptions: number | null
          stripe_coupon_id: string
          times_redeemed: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          max_redemptions?: number | null
          stripe_coupon_id: string
          times_redeemed?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          max_redemptions?: number | null
          stripe_coupon_id?: string
          times_redeemed?: number
        }
        Relationships: []
      }
      qs_rankings: {
        Row: {
          country: string
          created_at: string
          id: string
          name: string
          overall_score: string | null
          rank_display: string
          rank_value: number
        }
        Insert: {
          country: string
          created_at?: string
          id?: string
          name: string
          overall_score?: string | null
          rank_display: string
          rank_value: number
        }
        Update: {
          country?: string
          created_at?: string
          id?: string
          name?: string
          overall_score?: string | null
          rank_display?: string
          rank_value?: number
        }
        Relationships: []
      }
      resume_ai_suggestions: {
        Row: {
          accepted_suggestion: string | null
          created_at: string
          id: string
          raw_input: string | null
          resume_id: string
          section: string
          suggestions: Json
          user_id: string
        }
        Insert: {
          accepted_suggestion?: string | null
          created_at?: string
          id?: string
          raw_input?: string | null
          resume_id: string
          section: string
          suggestions?: Json
          user_id: string
        }
        Update: {
          accepted_suggestion?: string | null
          created_at?: string
          id?: string
          raw_input?: string | null
          resume_id?: string
          section?: string
          suggestions?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_ai_suggestions_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_templates: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          layout_schema: Json
          name: string
          preview_image_url: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          layout_schema?: Json
          name: string
          preview_image_url?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          layout_schema?: Json
          name?: string
          preview_image_url?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      resumes: {
        Row: {
          content: Json
          created_at: string
          id: string
          is_active: boolean
          original_file_url: string | null
          parse_status: string | null
          source: string
          template_id: string | null
          updated_at: string
          user_id: string
          version_name: string
        }
        Insert: {
          content?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          original_file_url?: string | null
          parse_status?: string | null
          source: string
          template_id?: string | null
          updated_at?: string
          user_id: string
          version_name?: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          original_file_url?: string | null
          parse_status?: string | null
          source?: string
          template_id?: string | null
          updated_at?: string
          user_id?: string
          version_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "resumes_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "resume_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      universities: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          id: string
          name: string
          name_normalized: string | null
          qs_ranking: number | null
          qs_ranking_band: string | null
          website_url: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          name: string
          name_normalized?: string | null
          qs_ranking?: number | null
          qs_ranking_band?: string | null
          website_url?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          name_normalized?: string | null
          qs_ranking?: number | null
          qs_ranking_band?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      user_entries: {
        Row: {
          created_at: string
          id: string
          is_archived: boolean
          is_disliked: boolean
          is_favorite: boolean
          is_liked: boolean
          match_rationale: string | null
          notes: string | null
          program_id: string | null
          score: number | null
          source: Database["public"]["Enums"]["entry_source"]
          status: Database["public"]["Enums"]["entry_status"]
          university_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_archived?: boolean
          is_disliked?: boolean
          is_favorite?: boolean
          is_liked?: boolean
          match_rationale?: string | null
          notes?: string | null
          program_id?: string | null
          score?: number | null
          source?: Database["public"]["Enums"]["entry_source"]
          status?: Database["public"]["Enums"]["entry_status"]
          university_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_archived?: boolean
          is_disliked?: boolean
          is_favorite?: boolean
          is_liked?: boolean
          match_rationale?: string | null
          notes?: string | null
          program_id?: string | null
          score?: number | null
          source?: Database["public"]["Enums"]["entry_source"]
          status?: Database["public"]["Enums"]["entry_status"]
          university_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_entries_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_entries_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      user_promo_usage: {
        Row: {
          id: string
          promo_code_id: string
          redeemed_at: string
          user_id: string
        }
        Insert: {
          id?: string
          promo_code_id: string
          redeemed_at?: string
          user_id: string
        }
        Update: {
          id?: string
          promo_code_id?: string
          redeemed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_promo_usage_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_saved_contacts: {
        Row: {
          id: string
          last_updated_at: string
          notes: string | null
          program_contact_id: string
          program_id: string
          saved_at: string
          status: string
          university_id: string
          user_id: string
        }
        Insert: {
          id?: string
          last_updated_at?: string
          notes?: string | null
          program_contact_id: string
          program_id: string
          saved_at?: string
          status?: string
          university_id: string
          user_id: string
        }
        Update: {
          id?: string
          last_updated_at?: string
          notes?: string | null
          program_contact_id?: string
          program_id?: string
          saved_at?: string
          status?: string
          university_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_saved_contacts_program_contact_id_fkey"
            columns: ["program_contact_id"]
            isOneToOne: false
            referencedRelation: "program_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_saved_contacts_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_saved_contacts_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      discover_job_status: "pending" | "running" | "done" | "failed"
      entry_source: "scored" | "manual" | "discover_more"
      entry_status:
        | "scored"
        | "planning"
        | "in_review"
        | "in_progress"
        | "applied"
        | "interview"
        | "offer"
        | "rejected"
        | "waitlisted"
        | "enrolled"
        | "archived"
      funding_pref: "fully_funded" | "partial_ok" | "self_funded_ok"
      tier_pref: "top_10" | "top_50" | "top_100" | "no_preference"
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
    Enums: {
      discover_job_status: ["pending", "running", "done", "failed"],
      entry_source: ["scored", "manual", "discover_more"],
      entry_status: [
        "scored",
        "planning",
        "in_review",
        "in_progress",
        "applied",
        "interview",
        "offer",
        "rejected",
        "waitlisted",
        "enrolled",
        "archived",
      ],
      funding_pref: ["fully_funded", "partial_ok", "self_funded_ok"],
      tier_pref: ["top_10", "top_50", "top_100", "no_preference"],
    },
  },
} as const
