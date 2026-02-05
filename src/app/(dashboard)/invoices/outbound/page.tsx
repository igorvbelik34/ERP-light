"use client";

import { useState, useEffect, useCallback } from "react";
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
  Download,
  Printer,
} from "lucide-react";
import type { Client, Invoice, InvoiceItem, CompanySettings } from "@/types/database";

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";
type FilterStatus = "all" | InvoiceStatus;

interface InvoiceWithClient extends Invoice {
  client?: Client;
}

interface InvoiceFormData {
  client_id: string;
  invoice_number: string;
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
  draft: { label: "Draft", variant: "secondary", icon: FileText },
  sent: { label: "Sent", variant: "info", icon: Send },
  paid: { label: "Paid", variant: "success", icon: CheckCircle },
  overdue: { label: "Overdue", variant: "destructive", icon: AlertCircle },
  cancelled: { label: "Cancelled", variant: "secondary", icon: XCircle },
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-BH", {
    style: "currency",
    currency: "BHD",
    minimumFractionDigits: 3,
  }).format(amount);
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getEmptyFormData = (settings: CompanySettings | null): InvoiceFormData => {
  const today = new Date();
  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + (settings?.default_payment_terms ?? 14));

  const nextNumber = settings?.invoice_next_number ?? 1;
  const prefix = settings?.invoice_prefix ?? "INV";
  const year = today.getFullYear();
  const invoiceNumber = `${prefix}-${year}-${String(nextNumber).padStart(4, "0")}`;

  return {
    client_id: "",
    invoice_number: invoiceNumber,
    issue_date: today.toISOString().split("T")[0],
    due_date: dueDate.toISOString().split("T")[0],
    tax_rate: settings?.default_tax_rate ?? 0,
    notes: settings?.invoice_notes ?? "",
    items: [{ description: "", quantity: 1, unit_price: 0 }],
  };
};

export default function OutboundInvoicesPage() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<InvoiceWithClient[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
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

  // Load data
  const loadData = useCallback(async () => {
    if (!user) return;

    try {
      const supabase = createClient();

      // Load invoices with client info
      const { data: invoicesData, error: invoicesError } = await supabase
        .from("invoices")
        .select("*")
        .eq("type", "outbound")
        .order("issue_date", { ascending: false });

      if (invoicesError) throw invoicesError;

      // Load clients
      const { data: clientsData, error: clientsError } = await supabase
        .from("clients")
        .select("*")
        .in("type", ["customer", "both"])
        .order("name");

      if (clientsError) throw clientsError;

      // Load company settings
      const { data: settingsData } = await supabase
        .from("company_settings")
        .select("*")
        .limit(1)
        .single();

      // Map clients to invoices
      const clientsMap = new Map(clientsData?.map((c) => [c.id, c]) ?? []);
      const invoicesWithClients = (invoicesData ?? []).map((inv) => ({
        ...inv,
        client: clientsMap.get(inv.client_id),
      }));

      setInvoices(invoicesWithClients);
      setClients(clientsData ?? []);
      setCompanySettings(settingsData);
    } catch (err) {
      console.error("Error loading data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter and search invoices
  const filteredInvoices = invoices.filter((invoice) => {
    const matchesSearch =
      invoice.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      invoice.client?.name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = filterStatus === "all" || invoice.status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  // Calculate totals
  const calculateSubtotal = () => {
    return formData.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  };

  const calculateTax = () => {
    return calculateSubtotal() * (formData.tax_rate / 100);
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateTax();
  };

  // Open dialog for new invoice
  const handleNewInvoice = () => {
    setEditingInvoice(null);
    setFormData(getEmptyFormData(companySettings));
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

  // Download PDF
  const handleDownloadPDF = async (invoice: InvoiceWithClient) => {
    window.open(`/api/invoices/${invoice.id}/pdf`, "_blank");
  };

  // Print PDF
  const handlePrintPDF = async (invoice: InvoiceWithClient) => {
    const pdfWindow = window.open(`/api/invoices/${invoice.id}/pdf`, "_blank");
    if (pdfWindow) {
      pdfWindow.onload = () => {
        pdfWindow.print();
      };
    }
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
      const { error } = await supabase.from("invoices").delete().eq("id", invoiceToDelete.id);

      if (error) throw error;

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
    if (!user?.id || !formData.client_id || formData.items.length === 0) return;

    setIsSaving(true);

    try {
      const supabase = createClient();

      const invoiceData = {
        user_id: user.id,
        client_id: formData.client_id,
        invoice_number: formData.invoice_number,
        type: "outbound" as const,
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

        // Update next invoice number in settings
        if (companySettings) {
          await supabase
            .from("company_settings")
            .update({
              invoice_next_number: (companySettings.invoice_next_number ?? 1) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", companySettings.id);
        }
      }

      setIsDialogOpen(false);
      loadData();
    } catch (err) {
      console.error("Error saving invoice:", err);
      alert("Error saving invoice");
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
          <h2 className="text-2xl font-bold tracking-tight">Outbound Invoices</h2>
          <p className="text-muted-foreground">Create and manage invoices for your customers</p>
        </div>
        <Button onClick={handleNewInvoice} disabled={clients.length === 0}>
          <Plus className="mr-2 h-4 w-4" />
          New Invoice
        </Button>
      </div>

      {clients.length === 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="pt-6">
            <p className="text-sm text-amber-600">
              You need to add at least one customer contact before creating invoices.{" "}
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
            placeholder="Search by invoice number or client..."
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
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
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
              ? "Get started by creating your first invoice."
              : "Try adjusting your search or filter."}
          </p>
          {invoices.length === 0 && clients.length > 0 && (
            <Button className="mt-4" onClick={handleNewInvoice}>
              <Plus className="mr-2 h-4 w-4" />
              New Invoice
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Client</TableHead>
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
                return (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      <div className="font-medium">{invoice.invoice_number}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{invoice.client?.name ?? "Unknown"}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusConfig[invoice.status].variant}>
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {statusConfig[invoice.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatDate(invoice.issue_date)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatDate(invoice.due_date)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(invoice.total)}
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
                            View
                          </DropdownMenuItem>
                          {invoice.status === "draft" && (
                            <DropdownMenuItem onClick={() => handleEditInvoice(invoice)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDownloadPDF(invoice)}>
                            <Download className="mr-2 h-4 w-4" />
                            Download PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handlePrintPDF(invoice)}>
                            <Printer className="mr-2 h-4 w-4" />
                            Print
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {invoice.status === "draft" && (
                            <DropdownMenuItem onClick={() => handleStatusChange(invoice, "sent")}>
                              <Send className="mr-2 h-4 w-4" />
                              Mark as Sent
                            </DropdownMenuItem>
                          )}
                          {(invoice.status === "sent" || invoice.status === "overdue") && (
                            <DropdownMenuItem onClick={() => handleStatusChange(invoice, "paid")}>
                              <CheckCircle className="mr-2 h-4 w-4" />
                              Mark as Paid
                            </DropdownMenuItem>
                          )}
                          {invoice.status !== "cancelled" && invoice.status !== "paid" && (
                            <DropdownMenuItem
                              onClick={() => handleStatusChange(invoice, "cancelled")}
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              Cancel Invoice
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteClick(invoice)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
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

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Invoices</CardDescription>
            <CardTitle className="text-2xl">{invoices.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Draft</CardDescription>
            <CardTitle className="text-2xl">
              {formatCurrency(
                invoices.filter((i) => i.status === "draft").reduce((sum, i) => sum + i.total, 0)
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Outstanding</CardDescription>
            <CardTitle className="text-2xl">
              {formatCurrency(
                invoices
                  .filter((i) => i.status === "sent" || i.status === "overdue")
                  .reduce((sum, i) => sum + i.total, 0)
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Paid</CardDescription>
            <CardTitle className="text-2xl text-emerald-600">
              {formatCurrency(
                invoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.total, 0)
              )}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Create/Edit Invoice Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingInvoice ? "Edit Invoice" : "Create New Invoice"}</DialogTitle>
            <DialogDescription>
              {editingInvoice
                ? "Update the invoice details below."
                : "Fill in the details to create a new invoice."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            {/* Basic Info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="client_id">
                  Client <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.client_id}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, client_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoice_number">Invoice Number</Label>
                <Input
                  id="invoice_number"
                  name="invoice_number"
                  value={formData.invoice_number}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="issue_date">Issue Date</Label>
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
                  <span>{formatCurrency(calculateSubtotal())}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">VAT ({formData.tax_rate}%)</span>
                  <span>{formatCurrency(calculateTax())}</span>
                </div>
                <div className="flex justify-between font-medium text-lg border-t pt-2">
                  <span>Total</span>
                  <span>{formatCurrency(calculateTotal())}</span>
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
                placeholder="Additional notes for the invoice..."
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
              disabled={isSaving || !formData.client_id || formData.items.length === 0}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : editingInvoice ? (
                "Update Invoice"
              ) : (
                "Create Invoice"
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
            </DialogDescription>
          </DialogHeader>

          {viewingInvoice && (
            <div className="space-y-6 py-4">
              {/* Status */}
              <div className="flex items-center justify-between">
                <Badge variant={statusConfig[viewingInvoice.status].variant} className="text-sm">
                  {statusConfig[viewingInvoice.status].label}
                </Badge>
                <div className="text-sm text-muted-foreground">
                  Due: {formatDate(viewingInvoice.due_date)}
                </div>
              </div>

              {/* Items */}
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right w-[80px]">Qty</TableHead>
                      <TableHead className="text-right w-[100px]">Price</TableHead>
                      <TableHead className="text-right w-[100px]">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewingItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.description}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.unit_price)}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(item.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Totals */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(viewingInvoice.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    VAT ({viewingInvoice.tax_rate}%)
                  </span>
                  <span>{formatCurrency(viewingInvoice.tax_amount)}</span>
                </div>
                <div className="flex justify-between font-medium text-base border-t pt-2">
                  <span>Total</span>
                  <span>{formatCurrency(viewingInvoice.total)}</span>
                </div>
              </div>

              {/* Notes */}
              {viewingInvoice.notes && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Notes:</span>
                  <p className="mt-1">{viewingInvoice.notes}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={() => viewingInvoice && handleDownloadPDF(viewingInvoice)}
                className="flex-1 sm:flex-none"
              >
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </Button>
              <Button
                variant="outline"
                onClick={() => viewingInvoice && handlePrintPDF(viewingInvoice)}
                className="flex-1 sm:flex-none"
              >
                <Printer className="mr-2 h-4 w-4" />
                Print
              </Button>
            </div>
            <Button variant="default" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
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
              <strong>{invoiceToDelete?.invoice_number}</strong>? This action cannot be undone.
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
