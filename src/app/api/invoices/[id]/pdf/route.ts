import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { InvoicePDF } from "@/lib/invoice-pdf";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const invoiceId = params.id;

    // Fetch invoice and items in parallel (first batch)
    const [invoiceResult, itemsResult, companyResult] = await Promise.all([
      supabase.from("invoices").select("*").eq("id", invoiceId).single(),
      supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("sort_order"),
      supabase.from("company_settings").select("*").limit(1).single(),
    ]);

    if (invoiceResult.error || !invoiceResult.data) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const invoice = invoiceResult.data;
    const items = itemsResult.data ?? [];
    const company = companyResult.data;

    // Fetch client and bank account in parallel (second batch - depends on first)
    const [clientResult, bankAccountResult] = await Promise.all([
      supabase.from("clients").select("*").eq("id", invoice.client_id).single(),
      company
        ? supabase
            .from("bank_accounts")
            .select("*")
            .eq("company_id", company.id)
            .eq("is_active", true)
            .or(`account_currency.eq.${invoice.currency || "BHD"},is_primary.eq.true`)
            .order("account_currency", { ascending: false }) // Prefer matching currency
            .limit(1)
            .single()
        : Promise.resolve({ data: null }),
    ]);

    if (clientResult.error || !clientResult.data) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Generate PDF
    const pdfBuffer = await renderToBuffer(
      InvoicePDF({
        invoice,
        items,
        client: clientResult.data,
        company,
        bankAccount: bankAccountResult.data,
      })
    );

    // Return PDF with caching headers for locked invoices
    const cacheControl = invoice.is_locked
      ? "public, max-age=86400, immutable" // Cache locked invoices for 24h
      : "private, no-cache"; // Don't cache drafts

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.invoice_number}.pdf"`,
        "Cache-Control": cacheControl,
      },
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return NextResponse.json(
      { error: "Error generating PDF" },
      { status: 500 }
    );
  }
}
