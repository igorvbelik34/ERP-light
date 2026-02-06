"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  FileOutput,
  FileInput,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  FileText,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { DashboardStats } from "@/types/database";

type DisplayCurrency = "BHD" | "USD";

function formatCurrency(amount: number, currency: DisplayCurrency): string {
  const decimals = currency === "BHD" ? 3 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [currency, setCurrency] = useState<DisplayCurrency>("BHD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      setError(null);

      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("get_dashboard_stats", {
        p_currency: currency,
      });

      if (rpcError) {
        console.error("Error fetching dashboard stats:", rpcError);
        setError(rpcError.message);
        setStats(null);
      } else {
        setStats(data as DashboardStats);
      }

      setLoading(false);
    }

    fetchStats();
  }, [currency]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 w-24 bg-muted rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-20 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-destructive">Error: {error}</p>
        </div>
      </div>
    );
  }

  const s = stats!;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Overview of your business at a glance.
          </p>
        </div>
        <Select value={currency} onValueChange={(v) => setCurrency(v as DisplayCurrency)}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Currency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="BHD">BHD</SelectItem>
            <SelectItem value="USD">USD</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Main metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s.total_contacts}</div>
            <p className="text-xs text-muted-foreground">
              {s.customer_count} customers, {s.supplier_count} suppliers
              {s.both_count > 0 && `, ${s.both_count} both`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outbound (Revenue)</CardTitle>
            <FileOutput className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(s.outbound_total, currency)}
            </div>
            <p className="text-xs text-muted-foreground">
              Paid: {formatCurrency(s.outbound_paid, currency)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inbound (Expenses)</CardTitle>
            <FileInput className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(s.inbound_total, currency)}
            </div>
            <p className="text-xs text-muted-foreground">
              Paid: {formatCurrency(s.inbound_paid, currency)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Balance</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                s.net_balance >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatCurrency(s.net_balance, currency)}
            </div>
            <p className="text-xs text-muted-foreground">Paid revenue - paid expenses</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending & Overdue */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pending Invoices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-600" />
                <span className="text-sm">Outbound Pending</span>
              </div>
              <span className="font-medium">
                {formatCurrency(s.outbound_pending, currency)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-600" />
                <span className="text-sm">Inbound Pending</span>
              </div>
              <span className="font-medium">
                {formatCurrency(s.inbound_pending, currency)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Overdue Invoices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm">Outbound Overdue</span>
              </div>
              <span className="font-medium text-red-600">
                {formatCurrency(s.outbound_overdue, currency)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm">Inbound Overdue</span>
              </div>
              <span className="font-medium text-red-600">
                {formatCurrency(s.inbound_overdue, currency)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invoice Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Invoice Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Badge variant="secondary" className="text-sm py-1 px-3">
              <Clock className="h-3 w-3 mr-1" />
              Draft: {s.draft_count}
            </Badge>
            <Badge variant="outline" className="text-sm py-1 px-3">
              <FileOutput className="h-3 w-3 mr-1" />
              Sent: {s.sent_count}
            </Badge>
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-sm py-1 px-3">
              <CheckCircle className="h-3 w-3 mr-1" />
              Paid: {s.paid_count}
            </Badge>
            <Badge variant="destructive" className="text-sm py-1 px-3">
              <AlertCircle className="h-3 w-3 mr-1" />
              Overdue: {s.overdue_count}
            </Badge>
            {s.cancelled_count > 0 && (
              <Badge variant="secondary" className="text-sm py-1 px-3 opacity-60">
                Cancelled: {s.cancelled_count}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
