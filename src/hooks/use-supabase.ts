"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Client, Invoice, InvoiceItem, Profile } from "@/types/database";

type DataRow = Profile | Client | Invoice | InvoiceItem;

interface BaseQueryOptions {
  select?: string;
  orderBy?: { column: string; ascending?: boolean };
  enabled?: boolean;
}

/**
 * Hook for fetching clients
 */
export function useClients(options?: BaseQueryOptions & { type?: Client["type"] }) {
  const [data, setData] = useState<Client[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (options?.enabled === false) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const supabase = createClient();
      let query = supabase.from("clients").select(options?.select ?? "*");

      if (options?.type) {
        query = query.eq("type", options.type);
      }

      const { data: result, error: queryError } = await query;

      if (queryError) throw queryError;
      setData(result as unknown as Client[]);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setIsLoading(false);
    }
  }, [options?.select, options?.type, options?.enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}

/**
 * Hook for fetching invoices
 */
export function useInvoices(options?: BaseQueryOptions & { type?: Invoice["type"]; status?: Invoice["status"] }) {
  const [data, setData] = useState<Invoice[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (options?.enabled === false) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const supabase = createClient();
      let query = supabase.from("invoices").select(options?.select ?? "*");

      if (options?.type) {
        query = query.eq("type", options.type);
      }

      if (options?.status) {
        query = query.eq("status", options.status);
      }

      const { data: result, error: queryError } = await query;

      if (queryError) throw queryError;
      setData(result as unknown as Invoice[]);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setIsLoading(false);
    }
  }, [options?.select, options?.type, options?.status, options?.enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}

/**
 * Hook for fetching invoice items
 */
export function useInvoiceItems(invoiceId: string | null) {
  const [data, setData] = useState<InvoiceItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!invoiceId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const supabase = createClient();
      const { data: result, error: queryError } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", invoiceId);

      if (queryError) throw queryError;
      setData(result as unknown as InvoiceItem[]);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setIsLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}

/**
 * Hook for real-time subscriptions
 */
export function useSupabaseRealtime(
  table: "clients" | "invoices" | "invoice_items" | "profiles",
  options?: {
    event?: "INSERT" | "UPDATE" | "DELETE" | "*";
    filter?: string;
  }
) {
  const [changes, setChanges] = useState<{
    eventType: "INSERT" | "UPDATE" | "DELETE";
    new: DataRow | null;
    old: DataRow | null;
  } | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`${table}-changes`)
      .on(
        "postgres_changes",
        {
          event: options?.event ?? "*",
          schema: "public",
          table: table,
          filter: options?.filter,
        },
        (payload) => {
          setChanges({
            eventType: payload.eventType as "INSERT" | "UPDATE" | "DELETE",
            new: payload.new as DataRow | null,
            old: payload.old as DataRow | null,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, options?.event, options?.filter]);

  return changes;
}
