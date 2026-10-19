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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      account_modes: {
        Row: {
          created_at: string
          mode: string
          user_id: string
        }
        Insert: {
          created_at?: string
          mode: string
          user_id: string
        }
        Update: {
          created_at?: string
          mode?: string
          user_id?: string
        }
        Relationships: []
      }
      account_pins: {
        Row: {
          pin: string
          updated_at: string
          user_id: string
        }
        Insert: {
          pin: string
          updated_at?: string
          user_id: string
        }
        Update: {
          pin?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_auth_state: {
        Row: {
          migrated_at: string
          user_id: string
        }
        Insert: {
          migrated_at?: string
          user_id: string
        }
        Update: {
          migrated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_login_sessions: {
        Row: {
          created_at: string
          expires_at: string
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      app_gate: {
        Row: {
          id: number
          login_id: string
          pass_hash: string
          pass_salt: string
          updated_at: string
        }
        Insert: {
          id?: number
          login_id: string
          pass_hash: string
          pass_salt: string
          updated_at?: string
        }
        Update: {
          id?: number
          login_id?: string
          pass_hash?: string
          pass_salt?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          password_skip_days: number
          trash_retention_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          password_skip_days?: number
          trash_retention_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          password_skip_days?: number
          trash_retention_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      equipment: {
        Row: {
          after_breakdown: boolean
          assignee: string | null
          content: string | null
          created_at: string
          cycle_unit: string | null
          cycle_value: number | null
          deleted_at: string | null
          first_date: string | null
          id: string
          name: string
          next_date: string | null
          planned_on: string | null
          repair_content: string
          stopped: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          after_breakdown?: boolean
          assignee?: string | null
          content?: string | null
          created_at?: string
          cycle_unit?: string | null
          cycle_value?: number | null
          deleted_at?: string | null
          first_date?: string | null
          id?: string
          name: string
          next_date?: string | null
          planned_on?: string | null
          repair_content?: string
          stopped?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          after_breakdown?: boolean
          assignee?: string | null
          content?: string | null
          created_at?: string
          cycle_unit?: string | null
          cycle_value?: number | null
          deleted_at?: string | null
          first_date?: string | null
          id?: string
          name?: string
          next_date?: string | null
          planned_on?: string | null
          repair_content?: string
          stopped?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      equipment_display_settings: {
        Row: {
          show_assignee: boolean
          show_name: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          show_assignee?: boolean
          show_name?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          show_assignee?: boolean
          show_name?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      equipment_history: {
        Row: {
          comment: string | null
          created_at: string
          deleted_at: string | null
          equipment_id: string
          id: string
          performed_on: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          deleted_at?: string | null
          equipment_id: string
          id?: string
          performed_on: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          deleted_at?: string | null
          equipment_id?: string
          id?: string
          performed_on?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_history_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_history_attachments: {
        Row: {
          created_at: string
          history_id: string
          id: string
          photo_id: string | null
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          history_id: string
          id?: string
          photo_id?: string | null
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          history_id?: string
          id?: string
          photo_id?: string | null
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_history_attachments_history_id_fkey"
            columns: ["history_id"]
            isOneToOne: false
            referencedRelation: "equipment_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_history_attachments_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_names: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      photo_folder_items: {
        Row: {
          created_at: string
          folder_id: string
          id: string
          photo_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          folder_id: string
          id?: string
          photo_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          folder_id?: string
          id?: string
          photo_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_folder_items_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "photo_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_folder_items_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_folders: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      photos: {
        Row: {
          checked: boolean
          comment: string | null
          created_at: string
          deleted_at: string | null
          folder_id: string | null
          history_id: string | null
          id: string
          schedule_id: string | null
          storage_path: string
          taken_at: string
          user_id: string
        }
        Insert: {
          checked?: boolean
          comment?: string | null
          created_at?: string
          deleted_at?: string | null
          folder_id?: string | null
          history_id?: string | null
          id?: string
          schedule_id?: string | null
          storage_path: string
          taken_at?: string
          user_id: string
        }
        Update: {
          checked?: boolean
          comment?: string | null
          created_at?: string
          deleted_at?: string | null
          folder_id?: string | null
          history_id?: string | null
          id?: string
          schedule_id?: string | null
          storage_path?: string
          taken_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "photo_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_history_id_fkey"
            columns: ["history_id"]
            isOneToOne: false
            referencedRelation: "equipment_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          disabled_at: string | null
          id: string
          name: string
          slug: string
          workplace: string | null
        }
        Insert: {
          created_at?: string
          disabled_at?: string | null
          id: string
          name: string
          slug: string
          workplace?: string | null
        }
        Update: {
          created_at?: string
          disabled_at?: string | null
          id?: string
          name?: string
          slug?: string
          workplace?: string | null
        }
        Relationships: []
      }
      purchase_admin_fields: {
        Row: {
          estimate_no: string | null
          inspection_no: string | null
          purchase_id: string
          updated_at: string
          vendor_no: string | null
        }
        Insert: {
          estimate_no?: string | null
          inspection_no?: string | null
          purchase_id: string
          updated_at?: string
          vendor_no?: string | null
        }
        Update: {
          estimate_no?: string | null
          inspection_no?: string | null
          purchase_id?: string
          updated_at?: string
          vendor_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_admin_fields_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: true
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_attachments: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          photo_id: string | null
          purchase_id: string
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          photo_id?: string | null
          purchase_id: string
          storage_path: string
          user_id?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          photo_id?: string | null
          purchase_id?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_attachments_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_attachments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_suppliers: {
        Row: {
          created_at: string
          id: string
          name: string
          vendor_no: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          vendor_no?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          vendor_no?: string
        }
        Relationships: []
      }
      purchase_writers: {
        Row: {
          created_at: string
          id: string
          kana: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          kana?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          kana?: string
          name?: string
        }
        Relationships: []
      }
      purchases: {
        Row: {
          amount: number | null
          check_reason: string | null
          created_at: string
          deleted_at: string | null
          delivered_on: string | null
          id: string
          item_name: string
          model: string | null
          note: string | null
          quantity: number | null
          status: string
          supplier: string | null
          unit: string | null
          updated_at: string
          user_id: string
          workplace: string | null
          writer: string
          written_on: string
        }
        Insert: {
          amount?: number | null
          check_reason?: string | null
          created_at?: string
          deleted_at?: string | null
          delivered_on?: string | null
          id?: string
          item_name?: string
          model?: string | null
          note?: string | null
          quantity?: number | null
          status?: string
          supplier?: string | null
          unit?: string | null
          updated_at?: string
          user_id: string
          workplace?: string | null
          writer?: string
          written_on?: string
        }
        Update: {
          amount?: number | null
          check_reason?: string | null
          created_at?: string
          deleted_at?: string | null
          delivered_on?: string | null
          id?: string
          item_name?: string
          model?: string | null
          note?: string | null
          quantity?: number | null
          status?: string
          supplier?: string | null
          unit?: string | null
          updated_at?: string
          user_id?: string
          workplace?: string | null
          writer?: string
          written_on?: string
        }
        Relationships: []
      }
      schedule_day_marks: {
        Row: {
          gray: boolean
          mark_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          gray: boolean
          mark_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          gray?: boolean
          mark_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      schedules: {
        Row: {
          comment_category: string | null
          created_at: string
          deleted_at: string | null
          entry_date: string
          id: string
          new_effort: string | null
          operation_comment: string | null
          personal_plan: string | null
          quality: string | null
          repair_item: string | null
          size: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          comment_category?: string | null
          created_at?: string
          deleted_at?: string | null
          entry_date: string
          id?: string
          new_effort?: string | null
          operation_comment?: string | null
          personal_plan?: string | null
          quality?: string | null
          repair_item?: string | null
          size?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          comment_category?: string | null
          created_at?: string
          deleted_at?: string | null
          entry_date?: string
          id?: string
          new_effort?: string | null
          operation_comment?: string | null
          personal_plan?: string | null
          quality?: string | null
          repair_item?: string | null
          size?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_perm: { Args: { _perm: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_purchases: { Args: { _rows: Json }; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      is_admin_account: { Args: { _id: string }; Returns: boolean }
      mark_purchase_checked: { Args: { _id: string }; Returns: undefined }
      my_workplace: { Args: never; Returns: string }
      purchase_rows: { Args: never; Returns: Json }
      purchase_visible: { Args: { _id: string }; Returns: boolean }
      save_inspection_numbers: {
        Args: {
          _id: string
          _inspection: string
          _set_vendor?: boolean
          _vendor?: string
        }
        Returns: undefined
      }
      save_purchase_estimate: {
        Args: { _id: string; _value: string }
        Returns: undefined
      }
      set_my_pin: { Args: { _pin: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
