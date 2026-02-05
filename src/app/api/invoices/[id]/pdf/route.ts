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

    // Get invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Get invoice items
    const { data: items, error: itemsError } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("sort_order");

    if (itemsError) {
      return NextResponse.json({ error: "Error fetching items" }, { status: 500 });
    }

    // Get client
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", invoice.client_id)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Get company settings
    const { data: company } = await supabase
      .from("company_settings")
      .select("*")
      .limit(1)
      .single();

    // Get bank account matching invoice currency
    let bankAccount = null;
    if (company) {
      // First try to find account with matching currency
      const { data: matchingAccount } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("company_id", company.id)
        .eq("account_currency", invoice.currency || "BHD")
        .eq("is_active", true)
        .limit(1)
        .single();

      if (matchingAccount) {
        bankAccount = matchingAccount;
      } else {
        // Fallback to primary account
        const { data: primaryAccount } = await supabase
          .from("bank_accounts")
          .select("*")
          .eq("company_id", company.id)
          .eq("is_primary", true)
          .eq("is_active", true)
          .limit(1)
          .single();
        
        bankAccount = primaryAccount;
      }
    }

    // Generate PDF
    const pdfBuffer = await renderToBuffer(
      InvoicePDF({
        invoice,
        items: items ?? [],
        client,
        company,
        bankAccount,
      })
    );

    // Return PDF - convert Buffer to Uint8Array for NextResponse
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.invoice_number}.pdf"`,
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
