import { createClient as createSupabaseClient } from "./server";
import type {
  Client,
  Invoice,
  InvoiceItem,
  InsertClient,
  UpdateClient,
  InsertInvoice,
  UpdateInvoice,
  InsertInvoiceItem,
  UpdateInvoiceItem,
} from "@/types/database";

// ============================================================================
// CLIENTS
// ============================================================================

export async function getClients(): Promise<Client[]> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("name");

  if (error) throw error;
  return data ?? [];
}

export async function getClientById(id: string): Promise<Client | null> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function getClientsByType(
  type: "customer" | "supplier" | "both"
): Promise<Client[]> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("type", type)
    .order("name");

  if (error) throw error;
  return data ?? [];
}

export async function insertClient(client: InsertClient): Promise<Client> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("clients")
    .insert(client)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateClient(
  id: string,
  updates: UpdateClient
): Promise<Client> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("clients")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteClient(id: string): Promise<void> {
  const supabase = createSupabaseClient();
  const { error } = await supabase.from("clients").delete().eq("id", id);

  if (error) throw error;
}

// ============================================================================
// INVOICES
// ============================================================================

export async function getInvoices(): Promise<Invoice[]> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .order("issue_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getInvoiceById(id: string): Promise<Invoice | null> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function getInvoiceWithItems(id: string): Promise<{
  invoice: Invoice;
  items: InvoiceItem[];
  client: Client;
} | null> {
  const supabase = createSupabaseClient();

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single();

  if (invoiceError) {
    if (invoiceError.code === "PGRST116") return null;
    throw invoiceError;
  }

  const { data: items, error: itemsError } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("sort_order");

  if (itemsError) throw itemsError;

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", invoice.client_id)
    .single();

  if (clientError) throw clientError;

  return {
    invoice,
    items: items ?? [],
    client,
  };
}

export async function getInvoicesByType(
  type: "inbound" | "outbound"
): Promise<Invoice[]> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("type", type)
    .order("issue_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getInvoicesByStatus(
  status: Invoice["status"]
): Promise<Invoice[]> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("status", status)
    .order("issue_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createInvoice(invoice: InsertInvoice): Promise<Invoice> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("invoices")
    .insert(invoice)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateInvoice(
  id: string,
  updates: UpdateInvoice
): Promise<Invoice> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("invoices")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteInvoice(id: string): Promise<void> {
  const supabase = createSupabaseClient();
  // Items will be deleted via CASCADE
  const { error } = await supabase.from("invoices").delete().eq("id", id);

  if (error) throw error;
}

// ============================================================================
// INVOICE ITEMS
// ============================================================================

export async function getInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("sort_order");

  if (error) throw error;
  return data ?? [];
}

export async function createInvoiceItem(
  item: InsertInvoiceItem
): Promise<InvoiceItem> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("invoice_items")
    .insert(item)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateInvoiceItem(
  id: string,
  updates: UpdateInvoiceItem
): Promise<InvoiceItem> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("invoice_items")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteInvoiceItem(id: string): Promise<void> {
  const supabase = createSupabaseClient();
  const { error } = await supabase.from("invoice_items").delete().eq("id", id);

  if (error) throw error;
}

export async function bulkCreateInvoiceItems(
  items: InsertInvoiceItem[]
): Promise<InvoiceItem[]> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("invoice_items")
    .insert(items)
    .select();

  if (error) throw error;
  return data ?? [];
}

// ============================================================================
// DASHBOARD STATS
// ============================================================================

export async function getDashboardStats(): Promise<{
  totalClients: number;
  totalOutboundRevenue: number;
  totalInboundExpenses: number;
  pendingInvoices: number;
}> {
  const supabase = createSupabaseClient();

  const [
    { count: totalClients },
    { data: outboundInvoices },
    { data: inboundInvoices },
    { count: pendingInvoices },
  ] = await Promise.all([
    supabase.from("clients").select("*", { count: "exact", head: true }),
    supabase
      .from("invoices")
      .select("total")
      .eq("type", "outbound")
      .eq("status", "paid"),
    supabase
      .from("invoices")
      .select("total")
      .eq("type", "inbound")
      .eq("status", "paid"),
    supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .in("status", ["draft", "sent"]),
  ]);

  const totalOutboundRevenue =
    outboundInvoices?.reduce((sum, inv) => sum + (inv.total || 0), 0) ?? 0;
  const totalInboundExpenses =
    inboundInvoices?.reduce((sum, inv) => sum + (inv.total || 0), 0) ?? 0;

  return {
    totalClients: totalClients ?? 0,
    totalOutboundRevenue,
    totalInboundExpenses,
    pendingInvoices: pendingInvoices ?? 0,
  };
}
