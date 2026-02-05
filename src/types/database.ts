export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          company_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          company_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          company_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      clients: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          email: string | null;
          vat_id: string | null;
          address: string | null;
          city: string | null;
          country: string | null;
          phone: string | null;
          notes: string | null;
          type: "customer" | "supplier" | "both";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          email?: string | null;
          vat_id?: string | null;
          address?: string | null;
          city?: string | null;
          country?: string | null;
          phone?: string | null;
          notes?: string | null;
          type?: "customer" | "supplier" | "both";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          email?: string | null;
          vat_id?: string | null;
          address?: string | null;
          city?: string | null;
          country?: string | null;
          phone?: string | null;
          notes?: string | null;
          type?: "customer" | "supplier" | "both";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clients_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      invoices: {
        Row: {
          id: string;
          user_id: string;
          client_id: string;
          invoice_number: string;
          type: "inbound" | "outbound";
          status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
          issue_date: string;
          due_date: string;
          subtotal: number;
          tax_rate: number;
          tax_amount: number;
          total: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          client_id: string;
          invoice_number: string;
          type: "inbound" | "outbound";
          status?: "draft" | "sent" | "paid" | "overdue" | "cancelled";
          issue_date: string;
          due_date: string;
          subtotal?: number;
          tax_rate?: number;
          tax_amount?: number;
          total?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          client_id?: string;
          invoice_number?: string;
          type?: "inbound" | "outbound";
          status?: "draft" | "sent" | "paid" | "overdue" | "cancelled";
          issue_date?: string;
          due_date?: string;
          subtotal?: number;
          tax_rate?: number;
          tax_amount?: number;
          total?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          }
        ];
      };
      invoice_items: {
        Row: {
          id: string;
          invoice_id: string;
          description: string;
          quantity: number;
          unit_price: number;
          total: number;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          description: string;
          quantity?: number;
          unit_price?: number;
          total?: number;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          invoice_id?: string;
          description?: string;
          quantity?: number;
          unit_price?: number;
          total?: number;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          }
        ];
      };
      company_settings: {
        Row: {
          id: string;
          user_id: string;
          company_name: string | null;
          legal_name: string | null;
          vat_id: string | null;
          tax_registration_number: string | null;
          email: string | null;
          phone: string | null;
          website: string | null;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          country: string | null;
          bank_name: string | null;
          bank_account: string | null;
          bank_bic: string | null;
          bank_correspondent_account: string | null;
          logo_url: string | null;
          cr_certificate_url: string | null;
          invoice_prefix: string;
          invoice_next_number: number;
          default_tax_rate: number;
          default_payment_terms: number;
          invoice_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_name?: string | null;
          legal_name?: string | null;
          vat_id?: string | null;
          tax_registration_number?: string | null;
          email?: string | null;
          phone?: string | null;
          website?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          country?: string | null;
          bank_name?: string | null;
          bank_account?: string | null;
          bank_bic?: string | null;
          bank_correspondent_account?: string | null;
          logo_url?: string | null;
          cr_certificate_url?: string | null;
          invoice_prefix?: string;
          invoice_next_number?: number;
          default_tax_rate?: number;
          default_payment_terms?: number;
          invoice_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          company_name?: string | null;
          legal_name?: string | null;
          vat_id?: string | null;
          tax_registration_number?: string | null;
          email?: string | null;
          phone?: string | null;
          website?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          country?: string | null;
          bank_name?: string | null;
          bank_account?: string | null;
          bank_bic?: string | null;
          bank_correspondent_account?: string | null;
          logo_url?: string | null;
          cr_certificate_url?: string | null;
          invoice_prefix?: string;
          invoice_next_number?: number;
          default_tax_rate?: number;
          default_payment_terms?: number;
          invoice_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_settings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      client_type: "customer" | "supplier" | "both";
      invoice_type: "inbound" | "outbound";
      invoice_status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

// Helper types for easier usage
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type InsertTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type UpdateTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

// Convenient type aliases
export type Profile = Tables<"profiles">;
export type Client = Tables<"clients">;
export type Invoice = Tables<"invoices">;
export type InvoiceItem = Tables<"invoice_items">;
export type CompanySettings = Tables<"company_settings">;

export type InsertClient = InsertTables<"clients">;
export type UpdateClient = UpdateTables<"clients">;
export type InsertInvoice = InsertTables<"invoices">;
export type UpdateInvoice = UpdateTables<"invoices">;
export type InsertInvoiceItem = InsertTables<"invoice_items">;
export type UpdateInvoiceItem = UpdateTables<"invoice_items">;
export type InsertCompanySettings = InsertTables<"company_settings">;
export type UpdateCompanySettings = UpdateTables<"company_settings">;
