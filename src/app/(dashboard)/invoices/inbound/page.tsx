"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Loader2,
  FileText,
  Send,
  CheckCircle,
  XCircle,
  AlertCircle,
  X,
  Undo2,
  Archive,
} from "lucide-react";
import type { Client, Invoice, InvoiceItem, CompanySettings, BankAccount } from "@/types/database";

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled" | "voided";
type FilterStatus = "all" | InvoiceStatus | "deleted";

interface InvoiceWithClient extends Invoice {
  client?: Client;
}

interface InvoiceFormData {
  client_id: string;
  invoice_number: string;
  currency: string;
  issue_date: string;
  due_date: string;
  tax_rate: number;
  notes: string;
  items: {
    id?: string;
    description: string;
    quantity: number;
    unit_price: number;
  }[];
}

type BadgeVariant = "default" | "secondary" | "success" | "warning" | "destructive" | "info";

const statusConfig: Record<
  InvoiceStatus,
  { label: string; variant: BadgeVariant; icon: React.ElementType }
> = {
  draft: { label: "Pending", variant: "secondary", icon: FileText },
  sent: { label: "Received", variant: "info", icon: Send },
  paid: { label: "Paid", variant: "success", icon: CheckCircle },
  overdue: { label: "Overdue", variant: "destructive", icon: AlertCircle },
  cancelled: { label: "Cancelled", variant: "secondary", icon: XCircle },
  voided: { label: "Voided", variant: "secondary", icon: XCircle },
};

const formatCurrency = (amount: number, currency: string = "BHD") => {
  const decimals = currency === "BHD" ? 3 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: decimals,
  }).format(amount);
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getEmptyFormData = (settings: CompanySettings | null, bankAccounts: BankAccount[] = []): InvoiceFormData => {
  const today = new Date();
  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + (settings?.default_payment_terms ?? 14));

  const primaryAccount = bankAccounts.find(a => a.is_primary);
  const defaultCurrency = primaryAccount?.account_currency || bankAccounts[0]?.account_currency || "BHD";

  return {
    client_id: "",
    invoice_number: "", // Manually entered for inbound invoices
    currency: defaultCurrency,
    issue_date: today.toISOString().split("T")[0],
    due_date: dueDate.toISOString().split("T")[0],
    tax_rate: settings?.default_tax_rate ?? 0,
    notes: "",
    items: [{ description: "", quantity: 1, unit_price: 0 }],
  };
};

export default function InboundInvoicesPage() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<InvoiceWithClient[]>([]);
  const [suppliers, setSuppliers] = useState<Client[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceWithClient | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<InvoiceWithClient | null>(null);
  const [viewingItems, setViewingItems] = useState<InvoiceItem[]>([]);
  const [invoiceToDelete, setInvoiceToDelete] = useState<InvoiceWithClient | null>(null);
  const [formData, setFormData] = useState<InvoiceFormData>(getEmptyFormData(null));
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load data - parallel queries for performance
  const loadData = useCallback(async () => {
    if (!user) return;

    try {
      const supabase = createClient();

      // Execute all queries in parallel
      const [invoicesResult, suppliersResult, settingsResult, bankAccountsResult] = await Promise.all([
        supabase
          .from("invoices")
          .select("*")
          .eq("type", "inbound")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("clients")
          .select("*")
          .in("type", ["supplier", "both"])
          .order("name"),
        supabase
          .from("company_settings")
          .select("*")
          .limit(1)
          .single(),
        supabase
          .from("bank_accounts")
          .select("*")
          .eq("is_active", true)
          .order("is_primary", { ascending: false }),
      ]);

      if (invoicesResult.error) throw invoicesResult.error;
      if (suppliersResult.error) throw suppliersResult.error;

      // Map suppliers to invoices
      const suppliersMap = new Map(suppliersResult.data?.map((s) => [s.id, s]) ?? []);
      const invoicesWithSuppliers = (invoicesResult.data ?? []).map((inv) => ({
        ...inv,
        client: suppliersMap.get(inv.client_id),
      }));

      setInvoices(invoicesWithSuppliers);
      setSuppliers(suppliersResult.data ?? []);
      setCompanySettings(settingsResult.data);
      setBankAccounts(bankAccountsResult.data ?? []);
    } catch (err) {
      console.error("Error loading data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter and search invoices - memoized
  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      const matchesSearch =
        invoice.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        invoice.client?.name?.toLowerCase().includes(searchQuery.toLowerCase());

      if (filterStatus === "deleted") {
        return matchesSearch && invoice.is_deleted;
      }

      const matchesStatus = filterStatus === "all" || invoice.status === filterStatus;
      const notDeleted = filterStatus === "all" ? true : !invoice.is_deleted;

      return matchesSearch && matchesStatus && notDeleted;
    });
  }, [invoices, searchQuery, filterStatus]);

  // Memoized summary stats
  const invoiceStats = useMemo(() => {
    const active = invoices.filter((i) => !i.is_deleted);
    return {
      totalActive: active.length,
      pending: active.filter((i) => i.status === "draft").length,
      outstanding: active.filter((i) => i.status === "sent" || i.status === "overdue").length,
      paid: active.filter((i) => i.status === "paid").length,
      totalDue: active
        .filter((i) => i.status === "draft" || i.status === "sent" || i.status === "overdue")
        .reduce((sum, i) => sum + (i.total_bhd || i.total), 0),
    };
  }, [invoices]);

  // Calculate totals - memoized
  const formTotals = useMemo(() => {
    const subtotal = formData.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const tax = subtotal * (formData.tax_rate / 100);
    return { subtotal, tax, total: subtotal + tax };
  }, [formData.items, formData.tax_rate]);

  // Get unique currencies from bank accounts - memoized
  const availableCurrencies = useMemo(() => {
    return Array.from(new Set(
      bankAccounts
        .filter(a => a.account_currency)
        .map(a => a.account_currency!)
    ));
  }, [bankAccounts]);

  // Open dialog for new invoice
  const handleNewInvoice = () => {
    setEditingInvoice(null);
    setFormData(getEmptyFormData(companySettings, bankAccounts));
    setIsDialogOpen(true);
  };

  // Open dialog for editing
  const handleEditInvoice = async (invoice: InvoiceWithClient) => {
    const supabase = createClient();
    const { data: items } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id)
      .order("sort_order");

    setEditingInvoice(invoice);
    setFormData({
      client_id: invoice.client_id,
      invoice_number: invoice.invoice_number,
      currency: invoice.currency || "BHD",
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      tax_rate: invoice.tax_rate,
      notes: invoice.notes ?? "",
      items:
        items?.map((item) => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })) ?? [{ description: "", quantity: 1, unit_price: 0 }],
    });
    setIsDialogOpen(true);
  };

  // View invoice details
  const handleViewInvoice = async (invoice: InvoiceWithClient) => {
    const supabase = createClient();
    const { data: items } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id)
      .order("sort_order");

    setViewingInvoice(invoice);
    setViewingItems(items ?? []);
    setIsViewDialogOpen(true);
  };

  // Change invoice status
  const handleStatusChange = async (invoice: InvoiceWithClient, newStatus: InvoiceStatus) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("invoices")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", invoice.id);

    if (error) {
      console.error("Error updating status:", error);
      return;
    }

    loadData();
  };

  // Delete invoice
  const handleDeleteClick = (invoice: InvoiceWithClient) => {
    setInvoiceToDelete(invoice);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!invoiceToDelete) return;

    setIsDeleting(true);

    try {
      const supabase = createClient();

      const { data, error } = await supabase
        .rpc("soft_delete_invoice", { p_invoice_id: invoiceToDelete.id });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; message?: string };

      if (!result.success) {
        alert(result.error || "Cannot delete invoice");
        return;
      }

      setIsDeleteDialogOpen(false);
      setInvoiceToDelete(null);
      loadData();
    } catch (err) {
      console.error("Error deleting invoice:", err);
      alert("Error deleting invoice");
    } finally {
      setIsDeleting(false);
    }
  };

  // Restore soft-deleted invoice
  const handleRestore = async (invoice: InvoiceWithClient) => {
    try {
      const supabase = createClient();

      const { data, error } = await supabase
        .rpc("restore_invoice", { p_invoice_id: invoice.id });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; message?: string };

      if (!result.success) {
        alert(result.error || "Cannot restore invoice");
        return;
      }

      loadData();
    } catch (err) {
      console.error("Error restoring invoice:", err);
      alert("Error restoring invoice");
    }
  };

  // Handle form changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "number" ? parseFloat(value) || 0 : value,
    }));
  };

  // Handle item changes
  const handleItemChange = (index: number, field: string, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { description: "", quantity: 1, unit_price: 0 }],
    }));
  };

  const removeItem = (index: number) => {
    if (formData.items.length <= 1) return;
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  // Save invoice
  const handleSave = async () => {
    if (!user?.id || !formData.client_id || !formData.invoice_number.trim() || formData.items.length === 0) {
      alert("Please fill in all required fields (Supplier, Invoice Number, and at least one item)");
      return;
    }

    setIsSaving(true);

    try {
      const supabase = createClient();

      const invoiceData = {
        user_id: user.id,
        client_id: formData.client_id,
        invoice_number: formData.invoice_number.trim(),
        currency: formData.currency,
        type: "inbound" as const,
        document_type: "invoice" as const,
        status: "draft" as const,
        issue_date: formData.issue_date,
        due_date: formData.due_date,
        tax_rate: formData.tax_rate,
        notes: formData.notes || null,
      };

      if (editingInvoice) {
        // Update existing invoice
        const { error: invoiceError } = await supabase
          .from("invoices")
          .update({
            ...invoiceData,
            status: editingInvoice.status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingInvoice.id);

        if (invoiceError) throw invoiceError;

        // Delete old items and insert new ones
        await supabase.from("invoice_items").delete().eq("invoice_id", editingInvoice.id);

        const itemsToInsert = formData.items.map((item, index) => ({
          invoice_id: editingInvoice.id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          sort_order: index,
        }));

        const { error: itemsError } = await supabase.from("invoice_items").insert(itemsToInsert);

        if (itemsError) throw itemsError;
      } else {
        // Create new invoice
        const { data: newInvoice, error: invoiceError } = await supabase
          .from("invoices")
          .insert(invoiceData)
          .select()
          .single();

        if (invoiceError) throw invoiceError;

        // Insert items
        const itemsToInsert = formData.items.map((item, index) => ({
          invoice_id: newInvoice.id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          sort_order: index,
        }));

        const { error: itemsError } = await supabase.from("invoice_items").insert(itemsToInsert);

        if (itemsError) throw itemsError;
      }

      setIsDialogOpen(false);
      loadData();
    } catch (err: unknown) {
      console.error("Error saving invoice:", err);
      const errorMessage = err instanceof Error ? err.message :
        (typeof err === 'object' && err !== null && 'message' in err) ? String((err as {message: unknown}).message) :
        'Unknown error';
      alert(`Error saving invoice: ${errorMessage}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Inbound Invoices</h2>
          <p className="text-muted-foreground">Track invoices from your suppliers</p>
        </div>
        <Button onClick={handleNewInvoice} disabled={suppliers.length === 0}>
          <Plus className="mr-2 h-4 w-4" />
          Add Invoice
        </Button>
      </div>

      {suppliers.length === 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="pt-6">
            <p className="text-sm text-amber-600">
              You need to add at least one supplier contact before recording invoices.{" "}
              <a href="/contacts" className="underline font-medium">
                Add a contact →
              </a>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by invoice number or supplier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as FilterStatus)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Pending</SelectItem>
            <SelectItem value="sent">Received</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="deleted">Deleted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Invoices Table */}
      {filteredInvoices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">No invoices found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {invoices.length === 0
              ? "Start by adding your first supplier invoice."
              : "Try adjusting your search or filter."}
          </p>
          {invoices.length === 0 && suppliers.length > 0 && (
            <Button className="mt-4" onClick={handleNewInvoice}>
              <Plus className="mr-2 h-4 w-4" />
              Add Invoice
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Issue Date</TableHead>
                <TableHead className="hidden md:table-cell">Due Date</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.map((invoice) => {
                const StatusIcon = statusConfig[invoice.status].icon;
                const isDeleted = invoice.is_deleted;
                return (
                  <TableRow
                    key={invoice.id}
                    className={isDeleted ? "opacity-40 bg-gray-50" : ""}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`font-medium ${isDeleted ? "line-through" : ""}`}>
                          {invoice.invoice_number}
                        </div>
                        {isDeleted && (
                          <Badge variant="secondary" className="text-xs">
                            <Archive className="mr-1 h-3 w-3" />
                            Deleted
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{invoice.client?.name ?? "Unknown"}</div>
                    </TableCell>
                    <TableCell>
                      {isDeleted ? (
                        <Badge variant="secondary">
                          <Archive className="mr-1 h-3 w-3" />
                          Deleted
                        </Badge>
                      ) : (
                        <Badge variant={statusConfig[invoice.status].variant}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {statusConfig[invoice.status].label}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatDate(invoice.issue_date)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatDate(invoice.due_date)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(invoice.total, invoice.currency)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewInvoice(invoice)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          {/* Edit - only drafts, not deleted */}
                          {invoice.status === "draft" && !invoice.is_locked && !isDeleted && (
                            <DropdownMenuItem onClick={() => handleEditInvoice(invoice)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          {/* Restore deleted invoice */}
                          {isDeleted && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleRestore(invoice)}>
                                <Undo2 className="mr-2 h-4 w-4" />
                                Restore Invoice
                              </DropdownMenuItem>
                            </>
                          )}
                          {/* Status change actions */}
                          {!isDeleted && invoice.status === "draft" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleStatusChange(invoice, "sent")}>
                                <Send className="mr-2 h-4 w-4" />
                                Mark as Received
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusChange(invoice, "paid")}>
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Mark as Paid
                              </DropdownMenuItem>
                            </>
                          )}
                          {!isDeleted && (invoice.status === "sent" || invoice.status === "overdue") && (
                            <DropdownMenuItem onClick={() => handleStatusChange(invoice, "paid")}>
                              <CheckCircle className="mr-2 h-4 w-4" />
                              Mark as Paid
                            </DropdownMenuItem>
                          )}
                          {/* Delete - for drafts and cancelled */}
                          {!isDeleted && !invoice.is_locked && (invoice.status === "draft" || invoice.status === "cancelled") && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => handleDeleteClick(invoice)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Summary Stats - using memoized values */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Active</CardDescription>
            <CardTitle className="text-2xl">{invoiceStats.totalActive}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending</CardDescription>
            <CardTitle className="text-2xl">{invoiceStats.pending}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Outstanding</CardDescription>
            <CardTitle className="text-2xl">{invoiceStats.outstanding}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Paid</CardDescription>
            <CardTitle className="text-2xl text-emerald-600">{invoiceStats.paid}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Due</CardDescription>
            <CardTitle className="text-xl text-red-600">
              {formatCurrency(invoiceStats.totalDue, "BHD")}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Create/Edit Invoice Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingInvoice ? "Edit Invoice" : "Add Supplier Invoice"}</DialogTitle>
            <DialogDescription>
              {editingInvoice
                ? "Update the invoice details below."
                : "Enter the details from your supplier's invoice."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            {/* Basic Info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="client_id">
                  Supplier <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.client_id}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, client_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoice_number">
                  Invoice Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="invoice_number"
                  name="invoice_number"
                  value={formData.invoice_number}
                  onChange={handleInputChange}
                  placeholder="Enter supplier's invoice number"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  The invoice number from your supplier
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, currency: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCurrencies.length > 0 ? (
                      availableCurrencies.map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))
                    ) : (
                      <>
                        <SelectItem value="BHD">BHD</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="issue_date">Invoice Date</Label>
                <Input
                  id="issue_date"
                  name="issue_date"
                  type="date"
                  value={formData.issue_date}
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="due_date">Due Date</Label>
                <Input
                  id="due_date"
                  name="due_date"
                  type="date"
                  value={formData.due_date}
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax_rate">VAT Rate (%)</Label>
                <Input
                  id="tax_rate"
                  name="tax_rate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={formData.tax_rate}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Line Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="mr-1 h-3 w-3" />
                  Add Item
                </Button>
              </div>

              <div className="space-y-3">
                {formData.items.map((item, index) => (
                  <div key={index} className="grid gap-3 sm:grid-cols-[1fr_100px_120px_40px] items-end">
                    <div className="space-y-1">
                      {index === 0 && <Label className="text-xs">Description</Label>}
                      <Input
                        placeholder="Item description"
                        value={item.description}
                        onChange={(e) => handleItemChange(index, "description", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      {index === 0 && <Label className="text-xs">Qty</Label>}
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.quantity}
                        onChange={(e) =>
                          handleItemChange(index, "quantity", parseFloat(e.target.value) || 0)
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      {index === 0 && <Label className="text-xs">Unit Price</Label>}
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unit_price}
                        onChange={(e) =>
                          handleItemChange(index, "unit_price", parseFloat(e.target.value) || 0)
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(index)}
                      disabled={formData.items.length <= 1}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(formTotals.subtotal, formData.currency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">VAT ({formData.tax_rate}%)</span>
                  <span>{formatCurrency(formTotals.tax, formData.currency)}</span>
                </div>
                <div className="flex justify-between font-medium text-lg border-t pt-2">
                  <span>Total</span>
                  <span>{formatCurrency(formTotals.total, formData.currency)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                placeholder="Additional notes..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !formData.client_id || !formData.invoice_number.trim() || formData.items.length === 0}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : editingInvoice ? (
                "Update Invoice"
              ) : (
                "Add Invoice"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Invoice Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Invoice {viewingInvoice?.invoice_number}</DialogTitle>
            <DialogDescription>
              {viewingInvoice?.client?.name} •{" "}
              {viewingInvoice && formatDate(viewingInvoice.issue_date)}
              {viewingInvoice && (
                <Badge
                  variant={statusConfig[viewingInvoice.status].variant}
                  className="ml-2"
                >
                  {statusConfig[viewingInvoice.status].label}
                </Badge>
              )}
            </DialogDescription>
          </DialogHeader>

          {viewingInvoice && (
            <div className="space-y-6 py-4">
              {/* Invoice Details */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Supplier</p>
                  <p className="font-medium">{viewingInvoice.client?.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Currency</p>
                  <p className="font-medium">{viewingInvoice.currency}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Invoice Date</p>
                  <p className="font-medium">{formatDate(viewingInvoice.issue_date)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Due Date</p>
                  <p className="font-medium">{formatDate(viewingInvoice.due_date)}</p>
                </div>
              </div>

              {/* Items */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">Line Items</p>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {viewingItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.description}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(item.unit_price, viewingInvoice.currency)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(item.quantity * item.unit_price, viewingInvoice.currency)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Totals */}
              <div className="space-y-2 text-right">
                <div className="flex justify-end gap-8 text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="w-32">{formatCurrency(viewingInvoice.subtotal, viewingInvoice.currency)}</span>
                </div>
                <div className="flex justify-end gap-8 text-sm">
                  <span className="text-muted-foreground">VAT ({viewingInvoice.tax_rate}%)</span>
                  <span className="w-32">{formatCurrency(viewingInvoice.tax_amount, viewingInvoice.currency)}</span>
                </div>
                <div className="flex justify-end gap-8 font-medium text-lg border-t pt-2">
                  <span>Total</span>
                  <span className="w-32">{formatCurrency(viewingInvoice.total, viewingInvoice.currency)}</span>
                </div>
                {viewingInvoice.total_bhd && viewingInvoice.currency !== "BHD" && (
                  <div className="flex justify-end gap-8 text-sm text-muted-foreground">
                    <span>Equivalent</span>
                    <span className="w-32">{formatCurrency(viewingInvoice.total_bhd, "BHD")}</span>
                  </div>
                )}
              </div>

              {viewingInvoice.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="text-sm mt-1">{viewingInvoice.notes}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setIsViewDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Invoice</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete invoice{" "}
              <strong>{invoiceToDelete?.invoice_number}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
