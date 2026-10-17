// Hand-written to match supabase/migrations. Once the Supabase CLI is linked,
// regenerate with: npx supabase gen types typescript --linked

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AppRole = "admin" | "member" | "viewer";
export type TeamKind = "media" | "receiving";
export type DriveFolderStatus = "pending" | "ready" | "failed";
export type GoogleConnectionStatus = "connected" | "expired";
export type UploadStatus = "uploading" | "complete" | "failed";
export type UploadSource = "app" | "import";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          avatar_url: string | null;
          role: AppRole;
          active: boolean;
          created_at: string;
          telegram_user_id: number | null;
          telegram_name: string | null;
        };
        Insert: never;
        Update: {
          full_name?: string;
          role?: AppRole;
          active?: boolean;
          telegram_user_id?: number | null;
          telegram_name?: string | null;
        };
        Relationships: [];
      };
      invites: {
        Row: {
          email: string;
          role: AppRole;
          team_id: string | null;
          invited_by: string | null;
          created_at: string;
          accepted_at: string | null;
          region_id: string | null;
          region_admin: boolean;
        };
        Insert: {
          email: string;
          role?: AppRole;
          team_id?: string | null;
          invited_by?: string | null;
          region_id?: string | null;
          region_admin?: boolean;
        };
        Update: {
          role?: AppRole;
          team_id?: string | null;
          region_id?: string | null;
          region_admin?: boolean;
        };
        Relationships: [];
      };
      teams: {
        Row: {
          id: string;
          name: string;
          kind: TeamKind;
          created_at: string;
        };
        Insert: {
          name: string;
          kind?: TeamKind;
        };
        Update: {
          name?: string;
          kind?: TeamKind;
        };
        Relationships: [];
      };
      team_members: {
        Row: {
          team_id: string;
          profile_id: string;
          added_at: string;
        };
        Insert: {
          team_id: string;
          profile_id: string;
        };
        Update: never;
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          slug: string;
          name: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          slug: string;
          name: string;
          sort_order?: number;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          sort_order?: number;
          is_active?: boolean;
        };
        Relationships: [];
      };
      services: {
        Row: {
          id: string;
          name: string;
          starts_at: string;
          drive_folder_id: string | null;
          drive_folder_status: DriveFolderStatus;
          drive_error: string | null;
          created_by: string | null;
          created_at: string;
          series_id: string | null;
          series_slot: string | null;
          region_id: string;
          drive_region_id: string | null;
        };
        Insert: {
          name: string;
          starts_at: string;
          created_by?: string | null;
          series_id?: string | null;
          series_slot?: string | null;
          region_id?: string;
        };
        Update: {
          name?: string;
          starts_at?: string;
          region_id?: string;
          drive_region_id?: string | null;
          drive_folder_id?: string | null;
          drive_folder_status?: DriveFolderStatus;
          drive_error?: string | null;
        };
        Relationships: [];
      };
      service_series: {
        Row: {
          id: string;
          name: string;
          weekday: number;
          local_time: string;
          active: boolean;
          created_by: string | null;
          created_at: string;
          interval_weeks: number;
          anchor_date: string | null;
          region_id: string;
        };
        Insert: {
          name: string;
          weekday: number;
          local_time: string;
          created_by?: string | null;
          interval_weeks?: number;
          anchor_date?: string | null;
          region_id?: string;
        };
        Update: { name?: string; active?: boolean };
        Relationships: [];
      };
      service_series_skips: {
        Row: { series_id: string; series_slot: string; created_at: string };
        Insert: { series_id: string; series_slot: string };
        Update: never;
        Relationships: [];
      };
      service_folders: {
        Row: {
          service_id: string;
          category_id: string;
          drive_folder_id: string;
          created_at: string;
        };
        Insert: {
          service_id: string;
          category_id: string;
          drive_folder_id: string;
        };
        Update: never;
        Relationships: [];
      };
      category_teams: {
        Row: {
          category_id: string;
          team_id: string;
          deadline_hours: number;
          created_at: string;
        };
        Insert: {
          category_id: string;
          team_id: string;
          deadline_hours?: number;
        };
        Update: {
          deadline_hours?: number;
        };
        Relationships: [];
      };
      uploads: {
        Row: {
          id: string;
          service_id: string;
          category_id: string;
          uploaded_by: string | null;
          drive_file_id: string | null;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          status: UploadStatus;
          source: UploadSource;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          service_id: string;
          category_id: string;
          uploaded_by: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
        };
        // Only the server (secret key) updates uploads.
        Update: {
          drive_file_id?: string | null;
          size_bytes?: number;
          status?: UploadStatus;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "uploads_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      duty_roles: {
        Row: { id: string; name: string; sort_order: number };
        Insert: { name: string; sort_order?: number };
        Update: { name?: string; sort_order?: number };
        Relationships: [];
      };
      assignments: {
        Row: {
          id: string;
          service_id: string;
          profile_id: string;
          duty_role_id: string;
          created_at: string;
        };
        Insert: {
          service_id: string;
          profile_id: string;
          duty_role_id: string;
        };
        Update: never;
        Relationships: [];
      };
      assignment_categories: {
        Row: {
          assignment_id: string;
          category_id: string;
          done_at: string | null;
        };
        Insert: { assignment_id: string; category_id: string };
        // Marking done goes through the set_task_done function.
        Update: never;
        Relationships: [];
      };
      // Changed only by database triggers and set_handoff_received.
      handoffs: {
        Row: {
          id: string;
          service_id: string;
          category_id: string;
          team_id: string;
          due_at: string;
          ready_at: string | null;
          received_at: string | null;
          received_by: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      // The next three are readable only with the secret key.
      app_settings: {
        Row: {
          id: boolean;
          telegram_chat_id: number | null;
          telegram_chat_title: string | null;
          telegram_linked_by: string | null;
          telegram_linked_at: string | null;
          last_job_run_at: string | null;
          last_job_result: Json | null;
        };
        Insert: never;
        Update: {
          telegram_chat_id?: number | null;
          telegram_chat_title?: string | null;
          telegram_linked_by?: string | null;
          telegram_linked_at?: string | null;
          last_job_run_at?: string | null;
          last_job_result?: Json | null;
        };
        Relationships: [];
      };
      telegram_link_tokens: {
        Row: {
          token_hash: string;
          kind: "person" | "group";
          telegram_user_id: number | null;
          telegram_chat_id: number | null;
          display_name: string;
          expires_at: string;
          used_at: string | null;
          created_at: string;
          region_id: string | null;
        };
        Insert: {
          token_hash: string;
          kind: "person" | "group";
          telegram_user_id?: number | null;
          telegram_chat_id?: number | null;
          display_name: string;
          expires_at: string;
        };
        Update: { used_at?: string | null };
        Relationships: [];
      };
      notification_log: {
        Row: {
          id: string;
          kind: string;
          dedupe_key: string;
          service_id: string | null;
          sent_at: string;
          telegram_chat_id: number | null;
          telegram_message_id: number | null;
          body: string | null;
        };
        Insert: {
          kind: string;
          dedupe_key: string;
          service_id?: string | null;
          telegram_chat_id?: number | null;
          telegram_message_id?: number | null;
          body?: string | null;
        };
        Update: {
          telegram_chat_id?: number | null;
          telegram_message_id?: number | null;
          body?: string | null;
        };
        Relationships: [];
      };
      share_links: {
        Row: {
          id: string;
          token: string;
          label: string;
          service_id: string | null;
          category_id: string | null;
          allow_download: boolean;
          expires_at: string | null;
          revoked_at: string | null;
          created_by: string | null;
          created_at: string;
          last_viewed_at: string | null;
          view_count: number;
          region_id: string | null;
          visitor_count: number;
          download_count: number;
        };
        Insert: {
          token: string;
          label: string;
          region_id?: string | null;
          service_id?: string | null;
          category_id?: string | null;
          allow_download?: boolean;
          expires_at?: string | null;
          created_by?: string | null;
        };
        Update: { revoked_at?: string | null };
        Relationships: [];
      };
      // Readable only with the secret key. See lib/share/drive.ts.
      share_file_grants: {
        Row: {
          drive_file_id: string;
          permission_id: string;
          share_link_id: string;
          created_at: string;
          drive_region_id: string | null;
        };
        Insert: {
          drive_file_id: string;
          permission_id: string;
          share_link_id: string;
          drive_region_id?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      // Readable only with the secret key. See lib/google/grants.ts.
      drive_grants: {
        Row: {
          profile_id: string;
          drive_folder_id: string;
          permission_id: string;
          created_at: string;
          revoke_requested_at: string | null;
          drive_region_id: string | null;
        };
        Insert: {
          profile_id: string;
          drive_folder_id: string;
          permission_id: string;
          revoke_requested_at?: string | null;
          drive_region_id?: string | null;
        };
        Update: {
          permission_id?: string;
          revoke_requested_at?: string | null;
        };
        Relationships: [];
      };
      regions: {
        // Signed-in users can read only id, name, sort_order, is_active and
        // created_at. The rest is read with the secret key.
        Row: {
          id: string;
          name: string;
          sort_order: number;
          is_active: boolean;
          church_folder_id: string | null;
          telegram_chat_id: number | null;
          telegram_chat_title: string | null;
          telegram_linked_at: string | null;
          created_at: string;
        };
        Insert: { name: string; sort_order?: number };
        Update: {
          name?: string;
          sort_order?: number;
          is_active?: boolean;
          church_folder_id?: string | null;
          telegram_chat_id?: number | null;
          telegram_chat_title?: string | null;
          telegram_linked_at?: string | null;
        };
        Relationships: [];
      };
      region_members: {
        Row: {
          region_id: string;
          profile_id: string;
          is_region_admin: boolean;
          added_at: string;
        };
        Insert: { region_id: string; profile_id: string; is_region_admin?: boolean };
        Update: { is_region_admin?: boolean };
        Relationships: [];
      };
      // Readable only with the secret key. See lib/google/connection.ts.
      region_google_connections: {
        Row: {
          region_id: string;
          account_email: string;
          refresh_token_encrypted: string;
          root_folder_id: string;
          status: GoogleConnectionStatus;
          last_error: string | null;
          for_new_services: boolean;
          connected_by: string | null;
          connected_at: string;
        };
        Insert: {
          region_id: string;
          for_new_services?: boolean;
          account_email: string;
          refresh_token_encrypted: string;
          root_folder_id: string;
          status?: GoogleConnectionStatus;
          last_error?: string | null;
          connected_by?: string | null;
          connected_at?: string;
        };
        Update: {
          status?: GoogleConnectionStatus;
          last_error?: string | null;
          for_new_services?: boolean;
        };
        Relationships: [];
      };
      // Readable only with the secret key. See lib/google/connection.ts.
      google_connection: {
        Row: {
          id: boolean;
          account_email: string;
          refresh_token_encrypted: string;
          root_folder_id: string;
          status: GoogleConnectionStatus;
          last_error: string | null;
          connected_by: string | null;
          connected_at: string;
        };
        Insert: {
          id?: boolean;
          account_email: string;
          refresh_token_encrypted: string;
          root_folder_id: string;
          status?: GoogleConnectionStatus;
          last_error?: string | null;
          connected_by?: string | null;
          connected_at?: string;
        };
        Update: {
          account_email?: string;
          refresh_token_encrypted?: string;
          root_folder_id?: string;
          status?: GoogleConnectionStatus;
          last_error?: string | null;
          connected_by?: string | null;
          connected_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      set_task_done: {
        Args: { p_assignment_id: string; p_category_id: string; p_done: boolean };
        Returns: undefined;
      };
      record_share_view: {
        Args: { p_share_id: string; p_visitor_id?: string | null };
        Returns: undefined;
      };
      record_share_download: {
        Args: { p_share_id: string };
        Returns: undefined;
      };
      upload_analytics: {
        Args: { p_since: string };
        Returns: Json;
      };
      set_handoff_received: {
        Args: { p_handoff_id: string; p_received: boolean };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: AppRole;
      team_kind: TeamKind;
      drive_folder_status: DriveFolderStatus;
      google_connection_status: GoogleConnectionStatus;
      upload_status: UploadStatus;
      upload_source: UploadSource;
      telegram_link_kind: "person" | "group";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Invite = Database["public"]["Tables"]["invites"]["Row"];
export type Team = Database["public"]["Tables"]["teams"]["Row"];
export type TeamMember = Database["public"]["Tables"]["team_members"]["Row"];
export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type Service = Database["public"]["Tables"]["services"]["Row"];
export type ServiceFolder =
  Database["public"]["Tables"]["service_folders"]["Row"];
export type Upload = Database["public"]["Tables"]["uploads"]["Row"];
export type CategoryTeam =
  Database["public"]["Tables"]["category_teams"]["Row"];
export type DutyRole = Database["public"]["Tables"]["duty_roles"]["Row"];
export type Assignment = Database["public"]["Tables"]["assignments"]["Row"];
export type AssignmentCategory =
  Database["public"]["Tables"]["assignment_categories"]["Row"];
export type Handoff = Database["public"]["Tables"]["handoffs"]["Row"];
export type ServiceSeries =
  Database["public"]["Tables"]["service_series"]["Row"];
export type ShareLink = Database["public"]["Tables"]["share_links"]["Row"];
