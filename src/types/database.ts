export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Document type enum
export type DocumentType = 'invoice' | 'credit_note';

export type Database = {
  public: {
    Tables: {
      bank_accounts: {
        Row: {
          id: string;
          company_id: string;          // FK to company_settings
          user_id: string;             // Denormalized for RLS
          bank_name: string | null;
          iban: string;                // Renamed from bank_account
          swift_bic: string | null;    // Renamed from bank_bic
          account_holder_name: string | null;
          account_currency: string | null;
          bank_address: string | null;
          bank_country: string | null;
          bank_letter_url: string | null;
          is_primary: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          user_id: string;
          bank_name?: string | null;
          iban: string;
          swift_bic?: string | null;
          account_holder_name?: string | null;
          account_currency?: string | null;
          bank_address?: string | null;
          bank_country?: string | null;
          bank_letter_url?: string | null;
          is_primary?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          user_id?: string;
          bank_name?: string | null;
          iban?: string;
          swift_bic?: string | null;
          account_holder_name?: string | null;
          account_currency?: string | null;
          bank_address?: string | null;
          bank_country?: string | null;
          bank_letter_url?: string | null;
          is_primary?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bank_accounts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "company_settings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_accounts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      exchange_rates: {
        Row: {
          id: string;
          user_id: string;
          from_currency: string;
          to_currency: string;
          rate: number;
          effective_date: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          from_currency: string;
          to_currency: string;
          rate: number;
          effective_date?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          from_currency?: string;
          to_currency?: string;
          rate?: number;
          effective_date?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exchange_rates_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
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
          document_type: "invoice" | "credit_note";
          status: "draft" | "sent" | "paid" | "overdue" | "cancelled" | "voided";
          currency: string;
          issue_date: string;
          due_date: string;
          subtotal: number;
          tax_rate: number;
          tax_amount: number;
          total: number;
          total_bhd: number | null;
          total_usd: number | null;
          rate_to_bhd: number | null;
          rate_to_usd: number | null;
          notes: string | null;
          related_invoice_id: string | null;
          correction_reason: string | null;
          is_locked: boolean;
          is_deleted: boolean;
          deleted_at: string | null;
          deleted_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          client_id: string;
          invoice_number: string;
          type: "inbound" | "outbound";
          document_type?: "invoice" | "credit_note";
          status?: "draft" | "sent" | "paid" | "overdue" | "cancelled" | "voided";
          currency?: string;
          issue_date: string;
          due_date: string;
          subtotal?: number;
          tax_rate?: number;
          tax_amount?: number;
          total?: number;
          total_bhd?: number | null;
          total_usd?: number | null;
          rate_to_bhd?: number | null;
          rate_to_usd?: number | null;
          notes?: string | null;
          related_invoice_id?: string | null;
          correction_reason?: string | null;
          is_locked?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          client_id?: string;
          invoice_number?: string;
          type?: "inbound" | "outbound";
          document_type?: "invoice" | "credit_note";
          status?: "draft" | "sent" | "paid" | "overdue" | "cancelled" | "voided";
          currency?: string;
          issue_date?: string;
          due_date?: string;
          subtotal?: number;
          tax_rate?: number;
          tax_amount?: number;
          total?: number;
          total_bhd?: number | null;
          total_usd?: number | null;
          rate_to_bhd?: number | null;
          rate_to_usd?: number | null;
          notes?: string | null;
          related_invoice_id?: string | null;
          correction_reason?: string | null;
          is_locked?: boolean;
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
          bank_letter_url: string | null;
          bank_address: string | null;
          bank_country: string | null;
          account_currency: string | null;
          account_holder_name: string | null;
          logo_url: string | null;
          cr_certificate_url: string | null;
          invoice_prefix: string;
          invoice_next_number: number;
          credit_note_prefix: string;
          credit_note_next_number: number;
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
          bank_letter_url?: string | null;
          bank_address?: string | null;
          bank_country?: string | null;
          account_currency?: string | null;
          account_holder_name?: string | null;
          logo_url?: string | null;
          cr_certificate_url?: string | null;
          invoice_prefix?: string;
          invoice_next_number?: number;
          credit_note_prefix?: string;
          credit_note_next_number?: number;
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
          bank_letter_url?: string | null;
          bank_address?: string | null;
          bank_country?: string | null;
          account_currency?: string | null;
          account_holder_name?: string | null;
          logo_url?: string | null;
          cr_certificate_url?: string | null;
          invoice_prefix?: string;
          invoice_next_number?: number;
          credit_note_prefix?: string;
          credit_note_next_number?: number;
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
      preview_next_invoice_number: {
        Args: {
          p_user_id: string;
          p_document_type?: "invoice" | "credit_note";
        };
        Returns: string | null;
      };
      generate_invoice_number: {
        Args: {
          p_user_id: string;
          p_document_type?: "invoice" | "credit_note";
          p_related_invoice_number?: string | null;
        };
        Returns: string;
      };
      soft_delete_invoice: {
        Args: {
          p_invoice_id: string;
        };
        Returns: {
          success: boolean;
          error?: string;
          message?: string;
        };
      };
      restore_invoice: {
        Args: {
          p_invoice_id: string;
        };
        Returns: {
          success: boolean;
          error?: string;
          message?: string;
        };
      };
      get_exchange_rate: {
        Args: {
          p_user_id: string;
          p_from_currency: string;
          p_to_currency: string;
          p_date?: string;
        };
        Returns: number | null;
      };
      get_dashboard_stats: {
        Args: {
          p_currency?: string;
        };
        Returns: DashboardStats;
      };
    };
    Enums: {
      client_type: "customer" | "supplier" | "both";
      invoice_type: "inbound" | "outbound";
      document_type: "invoice" | "credit_note";
      invoice_status: "draft" | "sent" | "paid" | "overdue" | "cancelled" | "voided";
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
export type BankAccount = Tables<"bank_accounts">;

export type InsertClient = InsertTables<"clients">;
export type UpdateClient = UpdateTables<"clients">;
export type InsertInvoice = InsertTables<"invoices">;
export type UpdateInvoice = UpdateTables<"invoices">;
export type InsertInvoiceItem = InsertTables<"invoice_items">;
export type UpdateInvoiceItem = UpdateTables<"invoice_items">;
export type InsertCompanySettings = InsertTables<"company_settings">;
export type UpdateCompanySettings = UpdateTables<"company_settings">;
export type InsertBankAccount = InsertTables<"bank_accounts">;
export type UpdateBankAccount = UpdateTables<"bank_accounts">;

// Audit log type (read-only)
export interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  user_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE" | "SOFT_DELETE";
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  changed_fields: string[] | null;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// Dashboard statistics returned by get_dashboard_stats RPC
export interface DashboardStats {
  // Contacts
  total_contacts: number;
  customer_count: number;
  supplier_count: number;
  both_count: number;

  // Outbound invoices (revenue)
  outbound_total: number;
  outbound_paid: number;
  outbound_pending: number;
  outbound_overdue: number;

  // Inbound invoices (expenses)
  inbound_total: number;
  inbound_paid: number;
  inbound_pending: number;
  inbound_overdue: number;

  // Invoice status counts
  draft_count: number;
  sent_count: number;
  paid_count: number;
  overdue_count: number;
  cancelled_count: number;

  // Net position
  net_balance: number;

  // Currency used for display
  display_currency: string;
}

// Exchange rate type
export type ExchangeRate = Tables<"exchange_rates">;
export type InsertExchangeRate = InsertTables<"exchange_rates">;
export type UpdateExchangeRate = UpdateTables<"exchange_rates">;

// Bank transaction type (for Tarabut integration)
export interface BankTransaction {
  id: string;
  bank_account_id: string;
  user_id: string;
  tarabut_transaction_id: string | null;
  transaction_date: string;
  booking_date: string | null;
  value_date: string | null;
  amount: number;
  currency: string;
  description: string | null;
  reference: string | null;
  merchant_name: string | null;
  transaction_type: 'credit' | 'debit';
  category: string | null;
  balance_after: number | null;
  matched_invoice_id: string | null;
  is_reconciled: boolean;
  reconciled_at: string | null;
  reconciled_by: string | null;
  reconciliation_notes: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// Tarabut consent type
export interface TarabutConsent {
  id: string;
  user_id: string;
  consent_id: string;
  consent_token: string | null;
  refresh_token: string | null;
  provider_id: string;
  provider_name: string | null;
  status: 'pending' | 'authorized' | 'active' | 'expired' | 'revoked';
  scope: string[] | null;
  authorized_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  linked_account_ids: string[] | null;
  created_at: string;
  updated_at: string;
}

// Bank sync log type
export interface BankSyncLog {
  id: string;
  user_id: string;
  bank_account_id: string | null;
  sync_type: 'transactions' | 'balances' | 'accounts';
  status: 'started' | 'success' | 'error';
  records_fetched: number;
  records_created: number;
  records_updated: number;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  request_data: Record<string, unknown> | null;
  response_data: Record<string, unknown> | null;
}