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
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Users,
  Building2,
  Phone,
  Mail,
  MapPin,
} from "lucide-react";
import type { Client, InsertClient } from "@/types/database";

type ClientType = "customer" | "supplier" | "both";
type FilterType = "all" | ClientType;

const clientTypeLabels: Record<ClientType, string> = {
  customer: "Customer",
  supplier: "Supplier",
  both: "Customer & Supplier",
};

const clientTypeBadgeVariant: Record<ClientType, "info" | "warning" | "success"> = {
  customer: "info",
  supplier: "warning",
  both: "success",
};

const emptyFormData: Omit<InsertClient, "user_id"> = {
  name: "",
  email: "",
  vat_id: "",
  address: "",
  city: "",
  country: "Bahrain",
  phone: "",
  notes: "",
  type: "customer",
};

export default function ContactsPage() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");
  
  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Client | null>(null);
  const [contactToDelete, setContactToDelete] = useState<Client | null>(null);
  const [formData, setFormData] = useState(emptyFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load contacts
  const loadContacts = useCallback(async () => {
    if (!user) return;
    
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("name");
      
      if (error) throw error;
      setContacts(data ?? []);
    } catch (err) {
      console.error("Error loading contacts:", err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // Filter and search contacts
  const filteredContacts = contacts.filter((contact) => {
    const matchesSearch = 
      contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.phone?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = filterType === "all" || contact.type === filterType;
    
    return matchesSearch && matchesType;
  });

  // Open dialog for new contact
  const handleNewContact = () => {
    setEditingContact(null);
    setFormData(emptyFormData);
    setIsDialogOpen(true);
  };

  // Open dialog for editing
  const handleEditContact = (contact: Client) => {
    setEditingContact(contact);
    setFormData({
      name: contact.name,
      email: contact.email || "",
      vat_id: contact.vat_id || "",
      address: contact.address || "",
      city: contact.city || "",
      country: contact.country || "Bahrain",
      phone: contact.phone || "",
      notes: contact.notes || "",
      type: contact.type,
    });
    setIsDialogOpen(true);
  };

  // Open delete confirmation
  const handleDeleteClick = (contact: Client) => {
    setContactToDelete(contact);
    setIsDeleteDialogOpen(true);
  };

  // Handle form input changes
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Handle type select change
  const handleTypeChange = (value: ClientType) => {
    setFormData((prev) => ({ ...prev, type: value }));
  };

  // Save contact (create or update)
  const handleSave = async () => {
    if (!user?.id || !formData.name.trim()) return;
    
    setIsSaving(true);
    
    try {
      const supabase = createClient();
      
      if (editingContact) {
        // Update existing contact
        const { error } = await supabase
          .from("clients")
          .update({
            ...formData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingContact.id);
        
        if (error) throw error;
      } else {
        // Create new contact
        const { error } = await supabase
          .from("clients")
          .insert({
            ...formData,
            user_id: user.id,
          });
        
        if (error) throw error;
      }
      
      setIsDialogOpen(false);
      loadContacts();
    } catch (err) {
      console.error("Error saving contact:", err);
      alert("Error saving contact");
    } finally {
      setIsSaving(false);
    }
  };

  // Delete contact
  const handleDelete = async () => {
    if (!contactToDelete) return;
    
    setIsDeleting(true);
    
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("clients")
        .delete()
        .eq("id", contactToDelete.id);
      
      if (error) throw error;
      
      setIsDeleteDialogOpen(false);
      setContactToDelete(null);
      loadContacts();
    } catch (err) {
      console.error("Error deleting contact:", err);
      const error = err as { code?: string };
      if (error?.code === "23503") {
        alert("Cannot delete this contact because it has associated invoices.");
      } else {
        alert("Error deleting contact");
      }
    } finally {
      setIsDeleting(false);
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
          <h2 className="text-2xl font-bold tracking-tight">Contacts</h2>
          <p className="text-muted-foreground">
            Manage your customers and suppliers
          </p>
        </div>
        <Button onClick={handleNewContact}>
          <Plus className="mr-2 h-4 w-4" />
          Add Contact
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Contacts</SelectItem>
            <SelectItem value="customer">Customers</SelectItem>
            <SelectItem value="supplier">Suppliers</SelectItem>
            <SelectItem value="both">Both</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Contacts Table */}
      {filteredContacts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">No contacts found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {contacts.length === 0
              ? "Get started by adding your first contact."
              : "Try adjusting your search or filter."}
          </p>
          {contacts.length === 0 && (
            <Button className="mt-4" onClick={handleNewContact}>
              <Plus className="mr-2 h-4 w-4" />
              Add Contact
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="hidden md:table-cell">Phone</TableHead>
                <TableHead className="hidden lg:table-cell">Location</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredContacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <div className="font-medium">{contact.name}</div>
                        {contact.vat_id && (
                          <div className="text-xs text-muted-foreground">
                            VAT: {contact.vat_id}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={clientTypeBadgeVariant[contact.type]}>
                      {clientTypeLabels[contact.type]}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {contact.email ? (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        {contact.email}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {contact.phone ? (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        {contact.phone}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {contact.city || contact.country ? (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        {[contact.city, contact.country].filter(Boolean).join(", ")}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
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
                        <DropdownMenuItem onClick={() => handleEditContact(contact)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDeleteClick(contact)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Stats */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>Total: {contacts.length}</span>
        <span>•</span>
        <span>Customers: {contacts.filter(c => c.type === "customer" || c.type === "both").length}</span>
        <span>•</span>
        <span>Suppliers: {contacts.filter(c => c.type === "supplier" || c.type === "both").length}</span>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingContact ? "Edit Contact" : "Add New Contact"}
            </DialogTitle>
            <DialogDescription>
              {editingContact
                ? "Update the contact information below."
                : "Fill in the details to create a new contact."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Company or person name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select value={formData.type} onValueChange={handleTypeChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="supplier">Supplier</SelectItem>
                    <SelectItem value="both">Customer & Supplier</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email || ""}
                  onChange={handleInputChange}
                  placeholder="contact@company.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  name="phone"
                  value={formData.phone || ""}
                  onChange={handleInputChange}
                  placeholder="+973 1234 5678"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vat_id">VAT / Tax ID</Label>
              <Input
                id="vat_id"
                name="vat_id"
                value={formData.vat_id || ""}
                onChange={handleInputChange}
                placeholder="VAT registration number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                name="address"
                value={formData.address || ""}
                onChange={handleInputChange}
                placeholder="Street address"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  name="city"
                  value={formData.city || ""}
                  onChange={handleInputChange}
                  placeholder="Manama"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  name="country"
                  value={formData.country || ""}
                  onChange={handleInputChange}
                  placeholder="Bahrain"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                name="notes"
                value={formData.notes || ""}
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
            <Button onClick={handleSave} disabled={isSaving || !formData.name.trim()}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : editingContact ? (
                "Update Contact"
              ) : (
                "Add Contact"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Contact</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{contactToDelete?.name}</strong>?
              This action cannot be undone.
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
