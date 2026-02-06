import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Image,
} from "@react-pdf/renderer";
import type { Invoice, InvoiceItem, Client, CompanySettings, BankAccount } from "@/types/database";

// Register default font
Font.register({
  family: "Helvetica",
  fonts: [
    { src: "Helvetica" },
    { src: "Helvetica-Bold", fontWeight: "bold" },
  ],
});

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    padding: 40,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  companyInfo: {
    width: "60%",
  },
  companyName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1a1a1a",
    marginBottom: 6,
  },
  companyDetails: {
    fontSize: 9,
    color: "#666666",
    lineHeight: 1.6,
  },
  headerRight: {
    alignItems: "flex-end",
    width: "35%",
  },
  companyLogo: {
    width: 70,
    height: 70,
    objectFit: "contain",
    marginBottom: 10,
  },
  invoiceTitle: {
    alignItems: "flex-end",
  },
  invoiceLabel: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1a1a1a",
    marginBottom: 4,
  },
  invoiceNumber: {
    fontSize: 11,
    color: "#666666",
    marginBottom: 2,
  },
  invoiceDate: {
    fontSize: 9,
    color: "#666666",
  },
  statusBadge: {
    marginTop: 8,
    padding: "4 10",
    borderRadius: 4,
  },
  statusText: {
    fontSize: 9,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    marginVertical: 20,
  },
  billTo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  billSection: {
    width: "45%",
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#888888",
    textTransform: "uppercase",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  clientName: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#1a1a1a",
    marginBottom: 4,
  },
  clientDetails: {
    fontSize: 9,
    color: "#666666",
    lineHeight: 1.5,
  },
  table: {
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f8f9fa",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e5e5e5",
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  colDescription: {
    width: "50%",
  },
  colQty: {
    width: "15%",
    textAlign: "center",
  },
  colPrice: {
    width: "17.5%",
    textAlign: "right",
  },
  colTotal: {
    width: "17.5%",
    textAlign: "right",
  },
  headerText: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#666666",
    textTransform: "uppercase",
  },
  cellText: {
    fontSize: 10,
    color: "#1a1a1a",
  },
  totalsSection: {
    marginTop: 10,
    alignItems: "flex-end",
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    width: 200,
    paddingVertical: 4,
  },
  totalsLabel: {
    width: "50%",
    fontSize: 10,
    color: "#666666",
  },
  totalsValue: {
    width: "50%",
    fontSize: 10,
    color: "#1a1a1a",
    textAlign: "right",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    width: 200,
    paddingVertical: 8,
    borderTopWidth: 2,
    borderTopColor: "#1a1a1a",
    marginTop: 4,
  },
  totalLabel: {
    width: "50%",
    fontSize: 12,
    fontWeight: "bold",
    color: "#1a1a1a",
  },
  totalValue: {
    width: "50%",
    fontSize: 12,
    fontWeight: "bold",
    color: "#1a1a1a",
    textAlign: "right",
  },
  notes: {
    marginTop: 30,
    padding: 15,
    backgroundColor: "#f8f9fa",
    borderRadius: 4,
  },
  notesTitle: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#888888",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  notesText: {
    fontSize: 9,
    color: "#666666",
    lineHeight: 1.5,
  },
  bankDetails: {
    marginTop: 20,
    padding: 15,
    backgroundColor: "#f0f7ff",
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: "#3b82f6",
  },
  bankTitle: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#3b82f6",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  bankText: {
    fontSize: 9,
    color: "#1a1a1a",
    lineHeight: 1.6,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 8,
    color: "#999999",
  },
});

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
    month: "long",
    year: "numeric",
  });
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "paid":
      return { bg: "#dcfce7", text: "#166534" };
    case "sent":
      return { bg: "#dbeafe", text: "#1e40af" };
    case "overdue":
      return { bg: "#fee2e2", text: "#991b1b" };
    case "cancelled":
      return { bg: "#f3f4f6", text: "#6b7280" };
    case "voided":
      return { bg: "#f3f4f6", text: "#6b7280" };
    default:
      return { bg: "#f3f4f6", text: "#374151" };
  }
};

const getDocumentTitle = (documentType: string) => {
  return documentType === "credit_note" ? "CREDIT NOTE" : "INVOICE";
};

const getDocumentColors = (documentType: string) => {
  if (documentType === "credit_note") {
    return {
      accent: "#f59e0b", // amber
      accentLight: "#fef3c7",
    };
  }
  return {
    accent: "#3b82f6", // blue
    accentLight: "#dbeafe",
  };
};

interface InvoicePDFProps {
  invoice: Invoice;
  items: InvoiceItem[];
  client: Client;
  company: CompanySettings | null;
  bankAccount: BankAccount | null;
}

export function InvoicePDF({ invoice, items, client, company, bankAccount }: InvoicePDFProps) {
  const statusColors = getStatusColor(invoice.status);
  const currency = invoice.currency || "BHD";
  const documentType = invoice.document_type || "invoice";
  const isCreditNote = documentType === "credit_note";
  const documentTitle = getDocumentTitle(documentType);
  const documentColors = getDocumentColors(documentType);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          {/* Left side - Company Info */}
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>
              {company?.company_name || "Your Company"}
            </Text>
            <Text style={styles.companyDetails}>
              {company?.address_line1 && `${company.address_line1}\n`}
              {company?.city && company?.country && `${company.city}, ${company.country}\n`}
              {company?.email && `${company.email}\n`}
              {company?.phone && `${company.phone}\n`}
              {company?.tax_registration_number && `CR: ${company.tax_registration_number}`}
              {company?.vat_id && `\nVAT: ${company.vat_id}`}
            </Text>
          </View>

          {/* Right side - Logo and Invoice Info */}
          <View style={styles.headerRight}>
            {company?.logo_url && (
              <Image
                style={styles.companyLogo}
                src={company.logo_url}
              />
            )}
            <View style={styles.invoiceTitle}>
              <Text style={[styles.invoiceLabel, isCreditNote ? { color: documentColors.accent } : {}]}>
                {documentTitle}
              </Text>
              <Text style={styles.invoiceNumber}>{invoice.invoice_number}</Text>
              <Text style={styles.invoiceDate}>
                Issued: {formatDate(invoice.issue_date)}
              </Text>
              {!isCreditNote && (
                <Text style={styles.invoiceDate}>
                  Due: {formatDate(invoice.due_date)}
                </Text>
              )}
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: isCreditNote ? documentColors.accentLight : statusColors.bg },
                ]}
              >
                <Text style={[styles.statusText, { color: isCreditNote ? documentColors.accent : statusColors.text }]}>
                  {isCreditNote ? "CREDIT NOTE" : invoice.status.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Credit Note Reference */}
        {isCreditNote && invoice.related_invoice_id && (
          <View style={{ backgroundColor: documentColors.accentLight, padding: 10, marginBottom: 10, borderRadius: 4 }}>
            <Text style={{ fontSize: 9, color: documentColors.accent }}>
              This credit note reverses the original invoice. Reason: {invoice.correction_reason || "N/A"}
            </Text>
          </View>
        )}

        <View style={styles.divider} />

        {/* Bill To */}
        <View style={styles.billTo}>
          <View style={styles.billSection}>
            <Text style={styles.sectionTitle}>Bill To</Text>
            <Text style={styles.clientName}>{client.name}</Text>
            <Text style={styles.clientDetails}>
              {client.address && `${client.address}\n`}
              {client.city && client.country && `${client.city}, ${client.country}\n`}
              {client.email && `${client.email}\n`}
              {client.phone && `${client.phone}`}
              {client.vat_id && `\nVAT: ${client.vat_id}`}
            </Text>
          </View>
          <View style={styles.billSection}>
            <Text style={styles.sectionTitle}>Payment Details</Text>
            <Text style={styles.clientDetails}>
              Invoice Date: {formatDate(invoice.issue_date)}{"\n"}
              Due Date: {formatDate(invoice.due_date)}{"\n"}
              Payment Terms: Net {Math.round(
                (new Date(invoice.due_date).getTime() -
                  new Date(invoice.issue_date).getTime()) /
                  (1000 * 60 * 60 * 24)
              )} days
            </Text>
          </View>
        </View>

        {/* Items Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerText, styles.colDescription]}>
              Description
            </Text>
            <Text style={[styles.headerText, styles.colQty]}>Qty</Text>
            <Text style={[styles.headerText, styles.colPrice]}>Unit Price</Text>
            <Text style={[styles.headerText, styles.colTotal]}>Total</Text>
          </View>
          {items.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={[styles.cellText, styles.colDescription]}>
                {item.description}
              </Text>
              <Text style={[styles.cellText, styles.colQty]}>{item.quantity}</Text>
              <Text style={[styles.cellText, styles.colPrice]}>
                {formatCurrency(item.unit_price, currency)}
              </Text>
              <Text style={[styles.cellText, styles.colTotal]}>
                {formatCurrency(item.total, currency)}
              </Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={[styles.totalsValue, isCreditNote ? { color: "#dc2626" } : {}]}>
              {formatCurrency(invoice.subtotal, currency)}
            </Text>
          </View>
          {invoice.tax_rate > 0 && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>VAT ({invoice.tax_rate}%)</Text>
              <Text style={[styles.totalsValue, isCreditNote ? { color: "#dc2626" } : {}]}>
                {formatCurrency(invoice.tax_amount, currency)}
              </Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{isCreditNote ? "Total Credit" : "Total Due"}</Text>
            <Text style={[styles.totalValue, isCreditNote ? { color: "#dc2626" } : {}]}>
              {formatCurrency(invoice.total, currency)}
            </Text>
          </View>
        </View>

        {/* Bank Details */}
        {bankAccount && (
          <View style={styles.bankDetails}>
            <Text style={styles.bankTitle}>Bank Details ({bankAccount.account_currency || currency})</Text>
            <Text style={styles.bankText}>
              {bankAccount.bank_name && `Bank: ${bankAccount.bank_name}`}
              {bankAccount.iban && `\nIBAN: ${bankAccount.iban}`}
              {bankAccount.swift_bic && `\nSWIFT/BIC: ${bankAccount.swift_bic}`}
              {bankAccount.account_holder_name && `\nAccount Holder: ${bankAccount.account_holder_name}`}
            </Text>
          </View>
        )}

        {/* Notes */}
        {invoice.notes && (
          <View style={styles.notes}>
            <Text style={styles.notesTitle}>Notes</Text>
            <Text style={styles.notesText}>{invoice.notes}</Text>
          </View>
        )}

        {/* Footer */}
        <Text style={styles.footer}>
          {isCreditNote 
            ? `This credit note has been issued to adjust your account. • ${company?.company_name || ""}`
            : `Thank you for your business! • ${company?.company_name || ""}`
          }
          {company?.website && ` • ${company.website}`}
        </Text>
      </Page>
    </Document>
  );
}
