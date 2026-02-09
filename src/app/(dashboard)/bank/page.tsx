"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Plus,
  RefreshCw,
  Building2,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  Circle,
  MoreHorizontal,
  Link2,
  Link2Off,
  AlertCircle,
  Wallet,
  TrendingUp,
  TrendingDown,
  Search,
  Filter,
  Upload,
  FileSpreadsheet,
} from "lucide-react";

// Types
interface BankAccount {
  id: string;
  bank_name: string | null;
  iban: string;
  account_currency: string | null;
  account_holder_name: string | null;
  tarabut_account_id: string | null;
  consent_status: string | null;
  last_sync_at: string | null;
  is_primary: boolean;
  balance?: {
    amount: number;
    currency: string;
    type: string;
    dateTime: string;
  } | null;
  balanceError?: string | null;
}

interface BankTransaction {
  id: string;
  bank_account_id: string;
  transaction_date: string;
  amount: number;
  currency: string;
  description: string | null;
  reference: string | null;
  merchant_name: string | null;
  transaction_type: "credit" | "debit";
  is_reconciled: boolean;
  reconciled_at: string | null;
  matched_invoice_id: string | null;
  bank_account?: {
    bank_name: string;
    iban: string;
  };
  matched_invoice?: {
    id: string;
    invoice_number: string;
    total: number;
    currency: string;
    status: string;
    client?: {
      name: string;
    };
  };
}

interface TransactionSummary {
  total_unreconciled: number;
  total_credits: number;
  total_debits: number;
  oldest_transaction: string | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  total: number;
  currency: string;
  client_id: string;
  status: string;
  client?: {
    name: string;
  };
}

function formatCurrency(amount: number, currency: string = "BHD"): string {
  const decimals = currency === "BHD" ? 3 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BankPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  
  // State
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  
  // Filters
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [reconciledFilter, setReconciledFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Reconciliation dialog
  const [reconcileDialog, setReconcileDialog] = useState<{
    open: boolean;
    transaction: BankTransaction | null;
  }>({ open: false, transaction: null });
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const [isReconciling, setIsReconciling] = useState(false);
  
  // Import dialog
  const [importDialog, setImportDialog] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    message: string;
    details?: {
      bankName: string;
      iban: string;
      imported: number;
      skipped: number;
    };
  } | null>(null);
  
  // Notifications from URL params
  const successMessage = searchParams.get("success");
  const errorMessage = searchParams.get("error");

  // Fetch accounts with balances
  const fetchAccounts = useCallback(async () => {
    try {
      const response = await fetch("/api/bank/accounts");
      const data = await response.json();
      if (data.accounts) {
        setAccounts(data.accounts);
      }
    } catch (error) {
      console.error("Error fetching accounts:", error);
    }
  }, []);

  // Fetch transactions
  const fetchTransactions = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedAccount !== "all") {
        params.set("accountId", selectedAccount);
      }
      if (reconciledFilter !== "all") {
        params.set("reconciled", reconciledFilter);
      }
      
      const response = await fetch(`/api/bank/transactions?${params.toString()}`);
      const data = await response.json();
      
      if (data.transactions) {
        setTransactions(data.transactions);
      }
      if (data.summary) {
        setSummary(data.summary);
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
    }
  }, [selectedAccount, reconciledFilter]);

  // Fetch unpaid invoices for reconciliation
  const fetchInvoices = useCallback(async () => {
    try {
      const response = await fetch("/api/invoices?status=sent,overdue&type=outbound");
      const data = await response.json();
      if (Array.isArray(data)) {
        setInvoices(data);
      }
    } catch (error) {
      console.error("Error fetching invoices:", error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchAccounts(), fetchTransactions(), fetchInvoices()]);
      setIsLoading(false);
    };
    
    if (user) {
      loadData();
    }
  }, [user, fetchAccounts, fetchTransactions, fetchInvoices]);

  // Refetch transactions when filters change
  useEffect(() => {
    if (!isLoading) {
      fetchTransactions();
    }
  }, [selectedAccount, reconciledFilter, fetchTransactions, isLoading]);

  // Connect bank via Tarabut
  const handleConnectBank = async () => {
    setIsConnecting(true);
    try {
      const response = await fetch("/api/bank/connect");
      const data = await response.json();
      
      if (data.connectUrl) {
        window.location.href = data.connectUrl;
      } else {
        alert("Failed to initiate bank connection");
      }
    } catch (error) {
      console.error("Error connecting bank:", error);
      alert("Failed to connect bank");
    } finally {
      setIsConnecting(false);
    }
  };

  // Sync transactions
  const handleSync = async (accountId?: string) => {
    setIsSyncing(true);
    try {
      const response = await fetch("/api/bank/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        await Promise.all([fetchAccounts(), fetchTransactions()]);
        alert(`Synced ${data.newTransactions} new transactions`);
      } else {
        alert(data.message || "Sync failed");
      }
    } catch (error) {
      console.error("Sync error:", error);
      alert("Failed to sync transactions");
    } finally {
      setIsSyncing(false);
    }
  };

  // Import statement from file
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/bank/import", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setImportResult({
          success: true,
          message: data.message,
          details: data.details,
        });
        // Refresh data
        await Promise.all([fetchAccounts(), fetchTransactions()]);
      } else {
        setImportResult({
          success: false,
          message: data.error || "Import failed",
        });
      }
    } catch (error) {
      console.error("Import error:", error);
      setImportResult({
        success: false,
        message: "Failed to import statement",
      });
    } finally {
      setIsImporting(false);
      // Reset file input
      event.target.value = "";
    }
  };

  // Reconcile transaction
  const handleReconcile = async () => {
    if (!reconcileDialog.transaction) return;
    
    setIsReconciling(true);
    try {
      const response = await fetch("/api/bank/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: reconcileDialog.transaction.id,
          invoiceId: selectedInvoiceId || null,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setReconcileDialog({ open: false, transaction: null });
        setSelectedInvoiceId("");
        await fetchTransactions();
      } else {
        alert(data.error || "Failed to reconcile");
      }
    } catch (error) {
      console.error("Reconcile error:", error);
      alert("Failed to reconcile transaction");
    } finally {
      setIsReconciling(false);
    }
  };

  // Filter transactions by search
  const filteredTransactions = transactions.filter((tx) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      tx.description?.toLowerCase().includes(query) ||
      tx.reference?.toLowerCase().includes(query) ||
      tx.merchant_name?.toLowerCase().includes(query) ||
      tx.matched_invoice?.invoice_number?.toLowerCase().includes(query)
    );
  });

  // Calculate totals
  const totalBalance = accounts.reduce((sum, acc) => {
    if (acc.balance?.amount) {
      return sum + acc.balance.amount;
    }
    return sum;
  }, 0);

  const connectedAccounts = accounts.filter(
    (a) => a.tarabut_account_id && a.consent_status === "active"
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5" />
          {decodeURIComponent(successMessage)}
        </div>
      )}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          {decodeURIComponent(errorMessage)}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Bank</h2>
          <p className="text-muted-foreground">
            Manage bank accounts and reconcile transactions with invoices
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => handleSync()}
            disabled={isSyncing || connectedAccounts.length === 0}
          >
            {isSyncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync All
          </Button>
          <Button
            variant="outline"
            onClick={() => setImportDialog(true)}
          >
            <Upload className="mr-2 h-4 w-4" />
            Import Statement
          </Button>
          <Button onClick={handleConnectBank} disabled={isConnecting}>
            {isConnecting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Connect Bank
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalBalance, "BHD")}
            </div>
            <p className="text-xs text-muted-foreground">
              {connectedAccounts.length} connected account(s)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unreconciled</CardTitle>
            <Circle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.total_unreconciled || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              transactions to match
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Credits</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(summary?.total_credits || 0, "BHD")}
            </div>
            <p className="text-xs text-muted-foreground">unreconciled income</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Debits</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(summary?.total_debits || 0, "BHD")}
            </div>
            <p className="text-xs text-muted-foreground">unreconciled expenses</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="transactions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
        </TabsList>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search transactions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.bank_name || account.iban}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={reconciledFilter} onValueChange={setReconciledFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="All status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Transactions</SelectItem>
                <SelectItem value="false">Unreconciled</SelectItem>
                <SelectItem value="true">Reconciled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Transactions Table */}
          {filteredTransactions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-medium">No transactions</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {connectedAccounts.length === 0
                    ? "Connect a bank account to start syncing transactions"
                    : "Click 'Sync All' to fetch latest transactions"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="font-medium">
                        {formatDate(tx.transaction_date)}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {tx.merchant_name || tx.description || "—"}
                          </div>
                          {tx.reference && (
                            <div className="text-xs text-muted-foreground">
                              Ref: {tx.reference}
                            </div>
                          )}
                          {tx.matched_invoice && (
                            <div className="text-xs text-green-600 flex items-center gap-1 mt-1">
                              <Link2 className="h-3 w-3" />
                              {tx.matched_invoice.invoice_number}
                              {tx.matched_invoice.client?.name && (
                                <span className="text-muted-foreground">
                                  — {tx.matched_invoice.client.name}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {tx.bank_account?.bank_name || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div
                          className={`font-medium ${
                            tx.transaction_type === "credit"
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          <span className="inline-flex items-center gap-1">
                            {tx.transaction_type === "credit" ? (
                              <ArrowDownLeft className="h-3 w-3" />
                            ) : (
                              <ArrowUpRight className="h-3 w-3" />
                            )}
                            {formatCurrency(Math.abs(tx.amount), tx.currency)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {tx.is_reconciled ? (
                          <Badge variant="success" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Reconciled
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <Circle className="h-3 w-3" />
                            Pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {!tx.is_reconciled && tx.transaction_type === "credit" && (
                              <DropdownMenuItem
                                onClick={() =>
                                  setReconcileDialog({ open: true, transaction: tx })
                                }
                              >
                                <Link2 className="mr-2 h-4 w-4" />
                                Match with Invoice
                              </DropdownMenuItem>
                            )}
                            {tx.is_reconciled && (
                              <DropdownMenuItem
                                onClick={() =>
                                  setReconcileDialog({ open: true, transaction: tx })
                                }
                              >
                                <Link2Off className="mr-2 h-4 w-4" />
                                Unreconcile
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* Accounts Tab */}
        <TabsContent value="accounts" className="space-y-4">
          {accounts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-medium">No bank accounts</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Connect your first bank account via Tarabut Open Banking
                </p>
                <Button className="mt-4" onClick={handleConnectBank} disabled={isConnecting}>
                  {isConnecting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Connect Bank
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {accounts.map((account) => (
                <Card key={account.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">
                            {account.bank_name || "Bank Account"}
                          </CardTitle>
                          <CardDescription className="font-mono text-xs">
                            {account.iban}
                          </CardDescription>
                        </div>
                      </div>
                      {account.is_primary && (
                        <Badge variant="secondary">Primary</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Balance */}
                    {account.balance ? (
                      <div>
                        <div className="text-2xl font-bold">
                          {formatCurrency(account.balance.amount, account.balance.currency)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          as of {formatDateTime(account.balance.dateTime)}
                        </p>
                      </div>
                    ) : account.balanceError ? (
                      <div className="text-sm text-destructive flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        {account.balanceError}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Balance not available
                      </div>
                    )}

                    {/* Connection Status */}
                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="flex items-center gap-2">
                        {account.consent_status === "active" ? (
                          <>
                            <div className="h-2 w-2 rounded-full bg-green-500" />
                            <span className="text-xs text-muted-foreground">Connected</span>
                          </>
                        ) : account.consent_status === "expired" ? (
                          <>
                            <div className="h-2 w-2 rounded-full bg-yellow-500" />
                            <span className="text-xs text-muted-foreground">Reconnect required</span>
                          </>
                        ) : (
                          <>
                            <div className="h-2 w-2 rounded-full bg-gray-300" />
                            <span className="text-xs text-muted-foreground">Not connected</span>
                          </>
                        )}
                      </div>
                      {account.tarabut_account_id && account.consent_status === "active" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSync(account.id)}
                          disabled={isSyncing}
                        >
                          <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
                        </Button>
                      )}
                    </div>

                    {/* Last Sync */}
                    {account.last_sync_at && (
                      <p className="text-xs text-muted-foreground">
                        Last synced: {formatDateTime(account.last_sync_at)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}

              {/* Add Account Card */}
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Button variant="outline" onClick={handleConnectBank} disabled={isConnecting}>
                    {isConnecting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    Add Account
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Reconciliation Dialog */}
      <Dialog
        open={reconcileDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setReconcileDialog({ open: false, transaction: null });
            setSelectedInvoiceId("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {reconcileDialog.transaction?.is_reconciled
                ? "Unreconcile Transaction"
                : "Match Transaction with Invoice"}
            </DialogTitle>
            <DialogDescription>
              {reconcileDialog.transaction?.is_reconciled
                ? "Remove the link between this transaction and the invoice?"
                : "Select an invoice to match with this bank transaction."}
            </DialogDescription>
          </DialogHeader>

          {reconcileDialog.transaction && (
            <div className="space-y-4">
              {/* Transaction Details */}
              <div className="rounded-lg bg-muted p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Date</span>
                  <span className="font-medium">
                    {formatDate(reconcileDialog.transaction.transaction_date)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Amount</span>
                  <span className="font-medium text-green-600">
                    {formatCurrency(
                      Math.abs(reconcileDialog.transaction.amount),
                      reconcileDialog.transaction.currency
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Description</span>
                  <span className="font-medium">
                    {reconcileDialog.transaction.description || "—"}
                  </span>
                </div>
                {reconcileDialog.transaction.reference && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Reference</span>
                    <span className="font-medium font-mono text-xs">
                      {reconcileDialog.transaction.reference}
                    </span>
                  </div>
                )}
              </div>

              {/* Invoice Selection (only for non-reconciled) */}
              {!reconcileDialog.transaction.is_reconciled && (
                <div className="space-y-2">
                  <Label>Select Invoice</Label>
                  <Select
                    value={selectedInvoiceId}
                    onValueChange={setSelectedInvoiceId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose an invoice..." />
                    </SelectTrigger>
                    <SelectContent>
                      {invoices
                        .filter(
                          (inv) =>
                            Math.abs(inv.total - Math.abs(reconcileDialog.transaction!.amount)) < 0.01
                        )
                        .map((inv) => (
                          <SelectItem key={inv.id} value={inv.id}>
                            <div className="flex items-center gap-2">
                              <Badge variant="success" className="text-xs">
                                Exact match
                              </Badge>
                              {inv.invoice_number} — {formatCurrency(inv.total, inv.currency)}
                              {inv.client?.name && (
                                <span className="text-muted-foreground">
                                  ({inv.client.name})
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      {invoices
                        .filter(
                          (inv) =>
                            Math.abs(inv.total - Math.abs(reconcileDialog.transaction!.amount)) >= 0.01
                        )
                        .map((inv) => (
                          <SelectItem key={inv.id} value={inv.id}>
                            {inv.invoice_number} — {formatCurrency(inv.total, inv.currency)}
                            {inv.client?.name && (
                              <span className="text-muted-foreground">
                                ({inv.client.name})
                              </span>
                            )}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReconcileDialog({ open: false, transaction: null })}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReconcile}
              disabled={
                isReconciling ||
                (!reconcileDialog.transaction?.is_reconciled && !selectedInvoiceId)
              }
            >
              {isReconciling ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : reconcileDialog.transaction?.is_reconciled ? (
                "Unreconcile"
              ) : (
                "Match Invoice"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Statement Dialog */}
      <Dialog open={importDialog} onOpenChange={setImportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Import Bank Statement
            </DialogTitle>
            <DialogDescription>
              Upload an Excel file (.xlsx) exported from your bank&apos;s internet banking.
              Supported banks: Ithmaar Bank
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* File Input */}
            <div className="space-y-2">
              <Label htmlFor="statement-file">Select Statement File</Label>
              <Input
                id="statement-file"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleImport}
                disabled={isImporting}
                className="cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">
                Accepted formats: .xlsx, .xls
              </p>
            </div>

            {/* Loading State */}
            {isImporting && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing transactions...
              </div>
            )}

            {/* Result */}
            {importResult && (
              <div
                className={`rounded-lg p-4 ${
                  importResult.success
                    ? "bg-green-50 border border-green-200"
                    : "bg-red-50 border border-red-200"
                }`}
              >
                <div className="flex items-start gap-2">
                  {importResult.success ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  )}
                  <div>
                    <p
                      className={`font-medium ${
                        importResult.success ? "text-green-800" : "text-red-800"
                      }`}
                    >
                      {importResult.message}
                    </p>
                    {importResult.details && (
                      <div className="mt-2 text-sm text-green-700 space-y-1">
                        <p>Bank: {importResult.details.bankName}</p>
                        <p>IBAN: {importResult.details.iban}</p>
                        <p>
                          Imported: {importResult.details.imported} transactions
                        </p>
                        {importResult.details.skipped > 0 && (
                          <p>Skipped: {importResult.details.skipped} duplicates</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setImportDialog(false);
                setImportResult(null);
              }}
            >
              {importResult?.success ? "Done" : "Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
