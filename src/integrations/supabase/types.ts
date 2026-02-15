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
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      admin_tasks: {
        Row: {
          client_id: string | null
          commercial_id: string | null
          created_at: string
          description: string
          id: string
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          commercial_id?: string | null
          created_at?: string
          description: string
          id?: string
          status?: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          commercial_id?: string | null
          created_at?: string
          description?: string
          id?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_tasks_commercial_id_fkey"
            columns: ["commercial_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_approval_requests: {
        Row: {
          client_id: string
          commercial_id: string
          created_at: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          commercial_id: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          commercial_id?: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_approval_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_approval_requests_commercial_id_fkey"
            columns: ["commercial_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          codigo_postal: string | null
          created_at: string
          direccion: string
          dni: string | null
          email: string | null
          id: string
          latitude: number | null
          localidad: string | null
          longitude: number | null
          nombre_apellidos: string
          note: string | null
          prospect: boolean
          status: string
          telefono1: string | null
          telefono2: string | null
          updated_at: string
        }
        Insert: {
          codigo_postal?: string | null
          created_at?: string
          direccion: string
          dni?: string | null
          email?: string | null
          id?: string
          latitude?: number | null
          localidad?: string | null
          longitude?: number | null
          nombre_apellidos: string
          note?: string | null
          prospect?: boolean
          status?: string
          telefono1?: string | null
          telefono2?: string | null
          updated_at?: string
        }
        Update: {
          codigo_postal?: string | null
          created_at?: string
          direccion?: string
          dni?: string | null
          email?: string | null
          id?: string
          latitude?: number | null
          localidad?: string | null
          longitude?: number | null
          nombre_apellidos?: string
          note?: string | null
          prospect?: boolean
          status?: string
          telefono1?: string | null
          telefono2?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          id: string
          name: string | null
          phone: string | null
          email: string | null
          source: string
          campaign: string | null
          adset: string | null
          ad: string | null
          status: string
          owner_id: string | null
          tags: string[]
          custom_fields: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name?: string | null
          phone?: string | null
          email?: string | null
          source?: string
          campaign?: string | null
          adset?: string | null
          ad?: string | null
          status?: string
          owner_id?: string | null
          tags?: string[]
          custom_fields?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string | null
          phone?: string | null
          email?: string | null
          source?: string
          campaign?: string | null
          adset?: string | null
          ad?: string | null
          status?: string
          owner_id?: string | null
          tags?: string[]
          custom_fields?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_entries: {
        Row: {
          id: string
          lead_id: string
          source: string
          campaign: string | null
          adset: string | null
          ad: string | null
          custom_fields: Json
          created_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          source?: string
          campaign?: string | null
          adset?: string | null
          ad?: string | null
          custom_fields?: Json
          created_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          source?: string
          campaign?: string | null
          adset?: string | null
          ad?: string | null
          custom_fields?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_entries_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_conversations: {
        Row: {
          id: string
          lead_id: string
          channel: string
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          channel: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          channel?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_messages: {
        Row: {
          id: string
          conversation_id: string
          direction: string
          content: string | null
          status: string
          created_at: string
          user_id: string | null
        }
        Insert: {
          id?: string
          conversation_id: string
          direction: string
          content?: string | null
          status?: string
          created_at?: string
          user_id?: string | null
        }
        Update: {
          id?: string
          conversation_id?: string
          direction?: string
          content?: string | null
          status?: string
          created_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "lead_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          id: string
          last_name?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          id: string
          visit_id: string
          delivery_id: string
          status: string
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          visit_id: string
          delivery_id: string
          status?: string
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          visit_id?: string
          delivery_id?: string
          status?: string
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: true
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_repartidor_id_fkey"
            columns: ["repartidor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      renewal_reminders: {
        Row: {
          client_id: string
          created_at: string
          created_by: string
          id: string
          notes: string | null
          reminder_date: string
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          reminder_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          reminder_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewal_reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_lines: {
        Row: {
          created_at: string
          financiada: boolean
          id: string
          line_total: number | null
          nulo: boolean
          quantity: number
          sale_id: string
          transferencia: boolean
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          financiada?: boolean
          id?: string
          line_total?: number | null
          nulo?: boolean
          quantity?: number
          sale_id: string
          transferencia?: boolean
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          financiada?: boolean
          id?: string
          line_total?: number | null
          nulo?: boolean
          quantity?: number
          sale_id?: string
          transferencia?: boolean
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_sale_lines_sale_id"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_lines_products: {
        Row: {
          created_at: string
          id: string
          product_name: string
          sale_line_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_name: string
          sale_line_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          product_name?: string
          sale_line_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_sale_lines_products_sale_line_id"
            columns: ["sale_line_id"]
            isOneToOne: false
            referencedRelation: "sale_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount: number
          client_id: string
          commercial_id: string
          commission_amount: number | null
          commission_percentage: number | null
          company_id: string
          created_at: string
          id: string
          latitude: number | null
          location_accuracy: number | null
          longitude: number | null
          product_description: string | null
          sale_date: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          amount: number
          client_id: string
          commercial_id: string
          commission_amount?: number | null
          commission_percentage?: number | null
          company_id: string
          created_at?: string
          id?: string
          latitude?: number | null
          location_accuracy?: number | null
          longitude?: number | null
          product_description?: string | null
          sale_date?: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          amount?: number
          client_id?: string
          commercial_id?: string
          commission_amount?: number | null
          commission_percentage?: number | null
          company_id?: string
          created_at?: string
          id?: string
          latitude?: number | null
          location_accuracy?: number | null
          longitude?: number | null
          product_description?: string | null
          sale_date?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_sales_client_id"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_sales_visit_id"
            columns: ["visit_id"]
            isOneToOne: true
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visit_progress_history: {
        Row: {
          id: string
          visit_id: string
          commercial_id: string
          latitude: number | null
          longitude: number | null
          location_accuracy: number | null
          recorded_at: string
          visit_state_code: string | null
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          visit_id: string
          commercial_id: string
          latitude?: number | null
          longitude?: number | null
          location_accuracy?: number | null
          recorded_at?: string
          visit_state_code?: string | null
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          visit_id?: string
          commercial_id?: string
          latitude?: number | null
          longitude?: number | null
          location_accuracy?: number | null
          recorded_at?: string
          visit_state_code?: string | null
          note?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_progress_history_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_progress_history_visit_state_code_fkey"
            columns: ["visit_state_code"]
            isOneToOne: false
            referencedRelation: "visit_states"
            referencedColumns: ["code"]
          },
        ]
      }
      visit_states: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      visits: {
        Row: {
          approval_date: string | null
          approval_status:
            | Database["public"]["Enums"]["visit_approval_status"]
            | null
          approved_by: string | null
          batch_id: string | null
          client_id: string
          commercial_id: string
          company_id: string | null
          created_at: string
          id: string
          latitude: number | null
          location_accuracy: number | null
          longitude: number | null
          notes: string | null
          permission: string | null
          second_commercial_id: string | null
          status: Database["public"]["Enums"]["visit_status"]
          updated_at: string
          visit_date: string
          visit_state_code: string | null
        }
        Insert: {
          approval_date?: string | null
          approval_status?:
            | Database["public"]["Enums"]["visit_approval_status"]
            | null
          approved_by?: string | null
          batch_id?: string | null
          client_id: string
          commercial_id: string
          company_id?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          location_accuracy?: number | null
          longitude?: number | null
          notes?: string | null
          permission?: string | null
          second_commercial_id?: string | null
          status: Database["public"]["Enums"]["visit_status"]
          updated_at?: string
          visit_date?: string
          visit_state_code?: string | null
        }
        Update: {
          approval_date?: string | null
          approval_status?:
            | Database["public"]["Enums"]["visit_approval_status"]
            | null
          approved_by?: string | null
          batch_id?: string | null
          client_id?: string
          commercial_id?: string
          company_id?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          location_accuracy?: number | null
          longitude?: number | null
          notes?: string | null
          permission?: string | null
          second_commercial_id?: string | null
          status?: Database["public"]["Enums"]["visit_status"]
          updated_at?: string
          visit_date?: string
          visit_state_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visits_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_visit_state_code_fkey"
            columns: ["visit_state_code"]
            isOneToOne: false
            referencedRelation: "visit_states"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_sale_total: {
        Args: { sale_id_param: string }
        Returns: number
      }
      get_user_company: {
        Args: { _user_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "commercial" | "delivery"
      visit_approval_status:
        | "pending"
        | "approved"
        | "rejected"
        | "waiting_admin"
      visit_status:
        | "completed"
        | "no_answer"
        | "not_interested"
        | "postponed"
        | "in_progress"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "commercial", "delivery"],
      visit_approval_status: [
        "pending",
        "approved",
        "rejected",
        "waiting_admin",
      ],
      visit_status: [
        "completed",
        "no_answer",
        "not_interested",
        "postponed",
        "in_progress",
      ],
    },
  },
} as const
