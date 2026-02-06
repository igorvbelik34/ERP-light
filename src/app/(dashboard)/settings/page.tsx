"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Building2,
  CreditCard,
  FileText,
  Upload,
  Loader2,
  Check,
  FileCheck,
  Eye,
  Sparkles,
  X,
  Trash2,
  Star,
  Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CompanySettings, BankAccount, InsertBankAccount } from "@/types/database";

type SettingsFormData = Omit<CompanySettings, "id" | "user_id" | "created_at" | "updated_at">;

const defaultSettings: SettingsFormData = {
  company_name: "",
  legal_name: "",
  vat_id: "",
  tax_registration_number: "",
  email: "",
  phone: "",
  website: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "Bahrain",
  bank_name: "",
  bank_account: "",
  bank_bic: "",
  bank_correspondent_account: "",
  bank_letter_url: "",
  bank_address: "",
  bank_country: "Bahrain",
  account_currency: "BHD",
  account_holder_name: "",
  logo_url: "",
  cr_certificate_url: "",
  invoice_prefix: "INV",
  invoice_next_number: 1,
  credit_note_prefix: "CN",
  credit_note_next_number: 1,
  default_tax_rate: 0,
  default_payment_terms: 14,
  invoice_notes: "",
};

interface ParsedCertificate {
  company_name: string | null;
  legal_name: string | null;
  cr_number: string | null;
  registration_date: string | null;
  due_date: string | null;
  registration_type: string | null;
  status: string | null;
  address: {
    building: string | null;
    road: string | null;
    block: string | null;
    flat: string | null;
    area: string | null;
    city: string | null;
  };
  activities: string[];
}

interface ParsedBankLetter {
  bank_name: string | null;
  bank_account: string | null;  // Will be mapped to 'iban'
  bank_bic: string | null;      // Will be mapped to 'swift_bic'
  bank_address: string | null;
  bank_country: string | null;
  account_currency: string | null;
  account_holder_name: string | null;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SettingsFormData>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const certificateInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCertificate, setUploadingCertificate] = useState(false);
  const [parsingCertificate, setParsingCertificate] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedCertificate | null>(null);
  const [showParsedData, setShowParsedData] = useState(false);
  
  // Bank accounts state (multiple accounts)
  const bankLetterInputRef = useRef<HTMLInputElement>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loadingBankAccounts, setLoadingBankAccounts] = useState(true);
  const [uploadingBankLetter, setUploadingBankLetter] = useState(false);
  const [parsingBankLetter, setParsingBankLetter] = useState(false);
  const [parsedBankData, setParsedBankData] = useState<ParsedBankLetter | null>(null);
  const [showParsedBankData, setShowParsedBankData] = useState(false);
  const [pendingBankLetterUrl, setPendingBankLetterUrl] = useState<string | null>(null);
  const [savingBankAccount, setSavingBankAccount] = useState(false);

  // Load settings on mount
  useEffect(() => {
    async function loadSettings() {
      if (!user) return;

      try {
        const supabase = createClient();
        
        // Get the first company settings record (single user for now)
        const { data, error } = await supabase
          .from("company_settings")
          .select("*")
          .limit(1)
          .single();

        if (error && error.code !== "PGRST116") {
          console.error("Error loading settings:", error);
          return;
        }

        if (data) {
          setSettingsId(data.id);
          setSettings({
            company_name: data.company_name || "",
            legal_name: data.legal_name || "",
            vat_id: data.vat_id || "",
            tax_registration_number: data.tax_registration_number || "",
            email: data.email || "",
            phone: data.phone || "",
            website: data.website || "",
            address_line1: data.address_line1 || "",
            address_line2: data.address_line2 || "",
            city: data.city || "",
            state: data.state || "",
            postal_code: data.postal_code || "",
            country: data.country || "Bahrain",
            bank_name: data.bank_name || "",
            bank_account: data.bank_account || "",
            bank_bic: data.bank_bic || "",
            bank_correspondent_account: data.bank_correspondent_account || "",
            bank_letter_url: data.bank_letter_url || "",
            bank_address: data.bank_address || "",
            bank_country: data.bank_country || "Bahrain",
            account_currency: data.account_currency || "BHD",
            account_holder_name: data.account_holder_name || "",
            logo_url: data.logo_url || "",
            cr_certificate_url: data.cr_certificate_url || "",
            invoice_prefix: data.invoice_prefix || "INV",
            invoice_next_number: data.invoice_next_number || 1,
            credit_note_prefix: data.credit_note_prefix || "CN",
            credit_note_next_number: data.credit_note_next_number || 1,
            default_tax_rate: data.default_tax_rate || 0,
            default_payment_terms: data.default_payment_terms || 14,
            invoice_notes: data.invoice_notes || "",
          });
        }
      } catch (err) {
        console.error("Error:", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadSettings();
  }, [user]);

  // Load bank accounts (after settingsId is loaded)
  useEffect(() => {
    async function loadBankAccounts() {
      if (!user || !settingsId) return;

      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("bank_accounts")
          .select("*")
          .eq("company_id", settingsId)  // Filter by company
          .eq("is_active", true)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Error loading bank accounts:", error);
          return;
        }

        if (data) {
          setBankAccounts(data as BankAccount[]);
        }
      } catch (err) {
        console.error("Error:", err);
      } finally {
        setLoadingBankAccounts(false);
      }
    }

    loadBankAccounts();
  }, [user, settingsId]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    setSettings((prev) => ({
      ...prev,
      [name]: type === "number" ? parseFloat(value) || 0 : value,
    }));
  };

  const handleSave = async () => {
    if (!user?.id) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const supabase = createClient();

      if (settingsId) {
        const { error } = await supabase
          .from("company_settings")
          .update({
            ...settings,
            updated_at: new Date().toISOString(),
          })
          .eq("id", settingsId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("company_settings")
          .insert({
            user_id: user.id,
            ...settings,
          })
          .select()
          .single();

        if (error) throw error;
        if (data) setSettingsId(data.id);
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error("Error saving settings:", err);
      alert("Error saving settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    setUploadingLogo(true);

    try {
      const supabase = createClient();
      const timestamp = Date.now();
      const fileExt = file.name.split(".").pop()?.toLowerCase();
      // Path: company/{userId}/logo/{timestamp}_logo.{ext}
      const filePath = `company/${user.id}/logo/${timestamp}_logo.${fileExt}`;

      console.log("Uploading logo:", { filePath, fileSize: file.size, fileType: file.type });

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("erpfiles")
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        console.error("Upload error details:", uploadError);
        throw uploadError;
      }
      
      console.log("Upload successful:", uploadData);

      const { data: urlData } = supabase.storage
        .from("erpfiles")
        .getPublicUrl(filePath);

      const newLogoUrl = urlData.publicUrl;
      
      setSettings((prev) => ({
        ...prev,
        logo_url: newLogoUrl,
      }));

      // Auto-save logo to database immediately
      if (settingsId) {
        await supabase
          .from("company_settings")
          .update({ logo_url: newLogoUrl, updated_at: new Date().toISOString() })
          .eq("id", settingsId);
      } else {
        const { data } = await supabase
          .from("company_settings")
          .insert({ user_id: user.id, logo_url: newLogoUrl })
          .select()
          .single();
        if (data) setSettingsId(data.id);
      }

      alert("Logo uploaded successfully!");
      
      // Refresh page to update header
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      console.error("Error uploading logo:", err);
      const error = err as { message?: string; error_description?: string };
      const errorMsg = error?.message || error?.error_description || "Unknown error";
      alert(`Error uploading logo: ${errorMsg}\n\nMake sure the 'erpfiles' bucket exists in Supabase Storage and policies are set up correctly.`);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleCertificateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    setUploadingCertificate(true);
    setParsingCertificate(true);

    try {
      // First, parse the PDF
      const formData = new FormData();
      formData.append("file", file);

      console.log("Uploading certificate for parsing:", file.name, file.size);

      const parseResponse = await fetch("/api/parse-certificate", {
        method: "POST",
        body: formData,
      });

      if (!parseResponse.ok) {
        const errorData = await parseResponse.json().catch(() => ({}));
        console.error("Parse API error:", parseResponse.status, errorData);
        throw new Error(errorData.error || "Failed to parse certificate");
      }

      const parseResult = await parseResponse.json();
      console.log("Parse result:", parseResult);
      console.log("Parsed data:", parseResult.parsed);
      
      if (!parseResult.parsed || (!parseResult.parsed.company_name && !parseResult.parsed.cr_number)) {
        console.warn("No data extracted from certificate. Raw text:", parseResult.rawText?.substring(0, 500));
        alert("Could not extract data from this certificate. Please check that it's a valid Bahrain CR Certificate.");
      }
      
      setParsedData(parseResult.parsed);
      setShowParsedData(true);
      setParsingCertificate(false);

      // Upload to Supabase Storage with organized path
      const supabase = createClient();
      const timestamp = Date.now();
      const fileExt = file.name.split(".").pop()?.toLowerCase();
      // Path: company/{userId}/certificate/{timestamp}_cr_certificate.{ext}
      const filePath = `company/${user.id}/certificate/${timestamp}_cr_certificate.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("erpfiles")
        .upload(filePath, file, { upsert: false });

      if (uploadError) {
        console.warn("Storage upload failed:", uploadError);
        alert("File uploaded for parsing, but storage save failed. Check bucket permissions.");
      } else {
        const { data: urlData } = supabase.storage
          .from("erpfiles")
          .getPublicUrl(filePath);

        setSettings((prev) => ({
          ...prev,
          cr_certificate_url: urlData.publicUrl,
        }));
      }
    } catch (err) {
      console.error("Error processing certificate:", err);
      alert("Error processing certificate");
    } finally {
      setUploadingCertificate(false);
      setParsingCertificate(false);
    }
  };

  const applyParsedData = async () => {
    if (!parsedData || !user?.id) return;

    // Build address string
    const addressParts: string[] = [];
    if (parsedData.address.flat) addressParts.push(`Flat ${parsedData.address.flat}`);
    if (parsedData.address.building) addressParts.push(`Building ${parsedData.address.building}`);
    if (parsedData.address.road) addressParts.push(`Road ${parsedData.address.road}`);
    if (parsedData.address.block) addressParts.push(`Block ${parsedData.address.block}`);

    const updatedSettings = {
      ...settings,
      company_name: parsedData.company_name || settings.company_name,
      legal_name: parsedData.legal_name || settings.legal_name,
      tax_registration_number: parsedData.cr_number || settings.tax_registration_number,
      address_line1: addressParts.join(", ") || settings.address_line1,
      city: parsedData.address.city || settings.city,
      state: parsedData.address.area || settings.state,
      country: "Bahrain",
    };

    setSettings(updatedSettings);
    setShowParsedData(false);

    // Auto-save to database
    setIsSaving(true);
    try {
      const supabase = createClient();

      if (settingsId) {
        const { error } = await supabase
          .from("company_settings")
          .update({
            ...updatedSettings,
            updated_at: new Date().toISOString(),
          })
          .eq("id", settingsId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("company_settings")
          .insert({
            user_id: user.id,
            ...updatedSettings,
          })
          .select()
          .single();

        if (error) throw error;
        if (data) setSettingsId(data.id);
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error("Error auto-saving settings:", err);
      alert("Data applied to form but failed to auto-save. Please click Save manually.");
    } finally {
      setIsSaving(false);
    }
  };

  // Bank letter upload and parsing
  const handleBankLetterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    setUploadingBankLetter(true);
    setParsingBankLetter(true);
    setPendingBankLetterUrl(null);

    try {
      // First, parse the PDF
      const formData = new FormData();
      formData.append("file", file);

      console.log("Uploading bank letter for parsing:", file.name, file.size);

      const parseResponse = await fetch("/api/parse-bank-letter", {
        method: "POST",
        body: formData,
      });

      if (!parseResponse.ok) {
        const errorData = await parseResponse.json().catch(() => ({}));
        console.error("Parse API error:", parseResponse.status, errorData);
        throw new Error(errorData.error || "Failed to parse bank letter");
      }

      const parseResult = await parseResponse.json();
      console.log("Bank letter parse result:", parseResult);
      
      if (!parseResult.parsed || (!parseResult.parsed.bank_name && !parseResult.parsed.bank_account)) {
        console.warn("No data extracted from bank letter. Raw text:", parseResult.rawText?.substring(0, 500));
        alert("Could not extract data from this document. Please check that it's a valid bank letter.");
        return;
      }

      // Check if IBAN already exists
      const existingAccount = bankAccounts.find(
        acc => acc.iban === parseResult.parsed.bank_account
      );
      
      if (existingAccount) {
        alert(`This IBAN (${parseResult.parsed.bank_account}) already exists in your accounts.`);
        return;
      }
      
      setParsedBankData(parseResult.parsed);
      setShowParsedBankData(true);
      setParsingBankLetter(false);

      // Upload to Supabase Storage
      const supabase = createClient();
      const timestamp = Date.now();
      const fileExt = file.name.split(".").pop()?.toLowerCase();
      const filePath = `company/${user.id}/bank/${timestamp}_bank_letter.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("erpfiles")
        .upload(filePath, file, { upsert: false });

      if (uploadError) {
        console.warn("Storage upload failed:", uploadError);
      } else {
        const { data: urlData } = supabase.storage
          .from("erpfiles")
          .getPublicUrl(filePath);

        setPendingBankLetterUrl(urlData.publicUrl);
      }
    } catch (err) {
      console.error("Error processing bank letter:", err);
      alert("Error processing bank letter");
    } finally {
      setUploadingBankLetter(false);
      setParsingBankLetter(false);
    }
  };

  const applyParsedBankData = async () => {
    if (!parsedBankData || !user?.id || !parsedBankData.bank_account || !settingsId) {
      alert("No IBAN found in parsed data or company not set up");
      return;
    }

    setSavingBankAccount(true);
    setShowParsedBankData(false);

    try {
      const supabase = createClient();
      
      // Create new bank account linked to company
      const newAccount: InsertBankAccount = {
        company_id: settingsId,  // Link to company_settings
        user_id: user.id,        // For RLS
        bank_name: parsedBankData.bank_name,
        iban: parsedBankData.bank_account,          // Mapped from parser
        swift_bic: parsedBankData.bank_bic,         // Mapped from parser
        bank_address: parsedBankData.bank_address,
        bank_country: parsedBankData.bank_country || "Bahrain",
        account_currency: parsedBankData.account_currency || "BHD",
        account_holder_name: parsedBankData.account_holder_name,
        bank_letter_url: pendingBankLetterUrl,
        is_primary: bankAccounts.length === 0, // First account is primary
      };

      const { data, error } = await supabase
        .from("bank_accounts")
        .insert(newAccount)
        .select()
        .single();

      if (error) {
        if (error.code === "23505") { // Unique constraint violation
          alert("This IBAN already exists in your accounts.");
        } else {
          throw error;
        }
        return;
      }

      if (data) {
        setBankAccounts(prev => [data as BankAccount, ...prev]);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      }

      // Clear parsed data
      setParsedBankData(null);
      setPendingBankLetterUrl(null);
    } catch (err) {
      console.error("Error saving bank account:", err);
      alert("Failed to save bank account");
    } finally {
      setSavingBankAccount(false);
    }
  };

  // Set bank account as primary
  const setPrimaryBankAccount = async (accountId: string) => {
    if (!user?.id || !settingsId) return;

    try {
      const supabase = createClient();
      
      // The trigger will automatically unset other primary accounts
      const { error } = await supabase
        .from("bank_accounts")
        .update({ is_primary: true, updated_at: new Date().toISOString() })
        .eq("id", accountId)
        .eq("company_id", settingsId);  // Extra safety check

      if (error) throw error;

      // Update local state
      setBankAccounts(prev => prev.map(acc => ({
        ...acc,
        is_primary: acc.id === accountId,
      })));
    } catch (err) {
      console.error("Error setting primary account:", err);
      alert("Failed to set primary account");
    }
  };

  // Delete bank account
  const deleteBankAccount = async (accountId: string) => {
    if (!user?.id) return;

    if (!confirm("Are you sure you want to delete this bank account?")) {
      return;
    }

    try {
      const supabase = createClient();
      
      const { error } = await supabase
        .from("bank_accounts")
        .delete()
        .eq("id", accountId);

      if (error) throw error;

      // Update local state
      setBankAccounts(prev => prev.filter(acc => acc.id !== accountId));
    } catch (err) {
      console.error("Error deleting bank account:", err);
      alert("Failed to delete bank account");
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
          <p className="text-muted-foreground">
            Configure your company details for invoices
          </p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : saveSuccess ? (
            <>
              <Check className="mr-2 h-4 w-4" />
              Saved!
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>

      {/* Parsed Data Modal */}
      {showParsedData && parsedData && (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Parsed Certificate Data</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowParsedData(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <CardDescription>
              Review extracted data and apply to your settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 text-sm">
              {parsedData.company_name && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Company Name:</span>
                  <span className="font-medium">{parsedData.company_name}</span>
                </div>
              )}
              {parsedData.cr_number && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CR Number:</span>
                  <span className="font-medium">{parsedData.cr_number}</span>
                </div>
              )}
              {parsedData.status && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span className="font-medium text-green-600">{parsedData.status}</span>
                </div>
              )}
              {(parsedData.address.building || parsedData.address.road) && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Address:</span>
                  <span className="font-medium text-right">
                    {[
                      parsedData.address.flat && `Flat ${parsedData.address.flat}`,
                      parsedData.address.building && `Bldg ${parsedData.address.building}`,
                      parsedData.address.road && `Road ${parsedData.address.road}`,
                      parsedData.address.block && `Block ${parsedData.address.block}`,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </div>
              )}
              {parsedData.address.area && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Area:</span>
                  <span className="font-medium">{parsedData.address.area}, {parsedData.address.city}</span>
                </div>
              )}
              {parsedData.activities.length > 0 && (
                <div className="pt-2 border-t">
                  <span className="text-muted-foreground text-xs">Activities:</span>
                  <ul className="mt-1 text-xs space-y-1">
                    {parsedData.activities.map((activity, i) => (
                      <li key={i} className="text-muted-foreground">• {activity}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={applyParsedData} className="flex-1">
                <Check className="mr-2 h-4 w-4" />
                Apply to Settings
              </Button>
              <Button variant="outline" onClick={() => setShowParsedData(false)}>
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="company" className="space-y-4">
        <TabsList>
          <TabsTrigger value="company" className="gap-2">
            <Building2 className="h-4 w-4" />
            Company
          </TabsTrigger>
          <TabsTrigger value="bank" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Bank
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-2">
            <FileText className="h-4 w-4" />
            Invoices
          </TabsTrigger>
        </TabsList>

        {/* Company Tab */}
        <TabsContent value="company" className="space-y-4">
          {/* CR Certificate Upload */}
          <Card>
            <CardHeader>
              <CardTitle>Commercial Registration Certificate</CardTitle>
              <CardDescription>
                Upload your CR certificate to auto-fill company details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <input
                  type="file"
                  ref={certificateInputRef}
                  onChange={handleCertificateUpload}
                  accept=".pdf"
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => certificateInputRef.current?.click()}
                  disabled={uploadingCertificate}
                  className="gap-2"
                >
                  {uploadingCertificate ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {parsingCertificate ? "Parsing..." : "Upload CR Certificate"}
                </Button>
                
                {settings.cr_certificate_url && (
                  <div className="flex items-center gap-2">
                    <FileCheck className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-muted-foreground">Certificate uploaded</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(settings.cr_certificate_url || "", "_blank")}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Supported: Bahrain Commercial Registration Certificate (PDF)
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                Company name and legal details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Logo Upload */}
              <div className="space-y-2">
                <Label>Company Logo</Label>
                <p className="text-sm text-muted-foreground">
                  Your logo will appear in the header and on invoices
                </p>
                <div className="flex items-start gap-4">
                  {settings.logo_url ? (
                    <div className="relative group">
                      <Image
                        src={settings.logo_url}
                        alt="Company logo"
                        width={120}
                        height={120}
                        className="h-24 w-24 rounded-lg object-cover border-2 border-border shadow-sm"
                        unoptimized
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                        <span className="text-white text-xs font-medium">Change</span>
                      </div>
                    </div>
                  ) : (
                    <div className="h-24 w-24 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center bg-muted/20">
                      <Building2 className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleLogoUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingLogo}
                    >
                      {uploadingLogo ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      {settings.logo_url ? "Change Logo" : "Upload Logo"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      PNG, JPG or SVG (max. 2MB)
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="company_name">Company Name</Label>
                  <Input
                    id="company_name"
                    name="company_name"
                    value={settings.company_name || ""}
                    onChange={handleInputChange}
                    placeholder="My Company W.L.L"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="legal_name">Legal Name</Label>
                  <Input
                    id="legal_name"
                    name="legal_name"
                    value={settings.legal_name || ""}
                    onChange={handleInputChange}
                    placeholder="My Company W.L.L"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="vat_id">VAT Number (Optional)</Label>
                  <Input
                    id="vat_id"
                    name="vat_id"
                    value={settings.vat_id || ""}
                    onChange={handleInputChange}
                    placeholder="VAT Registration Number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tax_registration_number">CR Number</Label>
                  <Input
                    id="tax_registration_number"
                    name="tax_registration_number"
                    value={settings.tax_registration_number || ""}
                    onChange={handleInputChange}
                    placeholder="190640-1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
              <CardDescription>
                Contact details displayed on invoices
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={settings.email || ""}
                    onChange={handleInputChange}
                    placeholder="info@company.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    name="phone"
                    value={settings.phone || ""}
                    onChange={handleInputChange}
                    placeholder="+973 1234 5678"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    name="website"
                    value={settings.website || ""}
                    onChange={handleInputChange}
                    placeholder="https://company.com"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Address</CardTitle>
              <CardDescription>
                Company registered address
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="address_line1">Address Line 1</Label>
                <Input
                  id="address_line1"
                  name="address_line1"
                  value={settings.address_line1 || ""}
                  onChange={handleInputChange}
                  placeholder="Flat 51, Building 1301, Road 4526, Block 345"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address_line2">Address Line 2</Label>
                <Input
                  id="address_line2"
                  name="address_line2"
                  value={settings.address_line2 || ""}
                  onChange={handleInputChange}
                  placeholder="Office 101, Business Tower"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    name="city"
                    value={settings.city || ""}
                    onChange={handleInputChange}
                    placeholder="Manama"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">Area / Governorate</Label>
                  <Input
                    id="state"
                    name="state"
                    value={settings.state || ""}
                    onChange={handleInputChange}
                    placeholder="Aljuffair"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postal_code">Postal Code</Label>
                  <Input
                    id="postal_code"
                    name="postal_code"
                    value={settings.postal_code || ""}
                    onChange={handleInputChange}
                    placeholder="12345"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    name="country"
                    value={settings.country || ""}
                    onChange={handleInputChange}
                    placeholder="Bahrain"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bank Tab */}
        <TabsContent value="bank" className="space-y-4">
          {/* Add New Bank Account */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Add Bank Account
              </CardTitle>
              <CardDescription>
                Upload a bank letter or statement to automatically extract account details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <input
                  type="file"
                  ref={bankLetterInputRef}
                  onChange={handleBankLetterUpload}
                  accept=".pdf"
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => bankLetterInputRef.current?.click()}
                  disabled={uploadingBankLetter || savingBankAccount}
                  className="gap-2"
                >
                  {uploadingBankLetter ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {parsingBankLetter ? "Parsing..." : "Upload Bank Letter (PDF)"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Supported: Bank letters, account confirmation letters, IBAN certificates (PDF).
                Each unique IBAN will be saved as a separate account.
              </p>
            </CardContent>
          </Card>

          {/* Parsed Bank Data Modal */}
          {showParsedBankData && parsedBankData && (
            <Card className="border-primary/50 bg-primary/5">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">New Bank Account Detected</CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setShowParsedBankData(false);
                      setParsedBankData(null);
                      setPendingBankLetterUrl(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <CardDescription>
                  Review extracted data and save as a new bank account
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 text-sm">
                  {parsedBankData.bank_name && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bank Name:</span>
                      <span className="font-medium">{parsedBankData.bank_name}</span>
                    </div>
                  )}
                  {parsedBankData.bank_account && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IBAN:</span>
                      <span className="font-medium font-mono text-sm">{parsedBankData.bank_account}</span>
                    </div>
                  )}
                  {parsedBankData.bank_bic && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SWIFT/BIC:</span>
                      <span className="font-medium font-mono">{parsedBankData.bank_bic}</span>
                    </div>
                  )}
                  {parsedBankData.account_holder_name && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Account Holder:</span>
                      <span className="font-medium">{parsedBankData.account_holder_name}</span>
                    </div>
                  )}
                  {parsedBankData.account_currency && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Currency:</span>
                      <span className="font-medium">{parsedBankData.account_currency}</span>
                    </div>
                  )}
                  {parsedBankData.bank_country && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Country:</span>
                      <span className="font-medium">{parsedBankData.bank_country}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button 
                    onClick={applyParsedBankData} 
                    className="flex-1"
                    disabled={savingBankAccount || !parsedBankData.bank_account}
                  >
                    {savingBankAccount ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    Save Bank Account
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setShowParsedBankData(false);
                      setParsedBankData(null);
                      setPendingBankLetterUrl(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bank Accounts List */}
          <Card>
            <CardHeader>
              <CardTitle>Your Bank Accounts</CardTitle>
              <CardDescription>
                {bankAccounts.length === 0 
                  ? "No bank accounts yet. Upload a bank letter to add one."
                  : `${bankAccounts.length} account${bankAccounts.length > 1 ? 's' : ''} configured. Primary account is used on invoices.`
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingBankAccounts ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : bankAccounts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No bank accounts added yet</p>
                  <p className="text-sm">Upload a bank letter above to get started</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {bankAccounts.map((account) => (
                    <div 
                      key={account.id} 
                      className={`p-4 rounded-lg border ${account.is_primary ? 'border-primary bg-primary/5' : 'bg-muted/30'}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{account.bank_name || "Unknown Bank"}</span>
                            {account.is_primary && (
                              <Badge variant="default" className="text-xs">
                                <Star className="h-3 w-3 mr-1" />
                                Primary
                              </Badge>
                            )}
                            {account.account_currency && (
                              <Badge variant="outline" className="text-xs">
                                {account.account_currency}
                              </Badge>
                            )}
                          </div>
                          <p className="font-mono text-sm text-muted-foreground">
                            {account.iban}
                          </p>
                          {account.swift_bic && (
                            <p className="text-xs text-muted-foreground">
                              SWIFT: {account.swift_bic}
                            </p>
                          )}
                          {account.account_holder_name && (
                            <p className="text-xs text-muted-foreground">
                              Holder: {account.account_holder_name}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {account.bank_letter_url && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => window.open(account.bank_letter_url!, "_blank")}
                              title="View document"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          {!account.is_primary && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setPrimaryBankAccount(account.id)}
                              title="Set as primary"
                            >
                              <Star className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteBankAccount(account.id)}
                            title="Delete account"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Invoices Tab */}
        <TabsContent value="invoices" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Invoice Settings</CardTitle>
              <CardDescription>
                Default settings for new invoices
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="invoice_prefix">Invoice Number Prefix</Label>
                  <Input
                    id="invoice_prefix"
                    name="invoice_prefix"
                    value={settings.invoice_prefix || ""}
                    onChange={handleInputChange}
                    placeholder="INV"
                  />
                  <p className="text-xs text-muted-foreground">
                    Example: {settings.invoice_prefix || "INV"}-2026-0001
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoice_next_number">Next Invoice Number</Label>
                  <Input
                    id="invoice_next_number"
                    name="invoice_next_number"
                    type="number"
                    min="1"
                    value={settings.invoice_next_number || 1}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="credit_note_prefix">Credit Note Prefix</Label>
                  <Input
                    id="credit_note_prefix"
                    name="credit_note_prefix"
                    value={settings.credit_note_prefix || ""}
                    onChange={handleInputChange}
                    placeholder="CN"
                  />
                  <p className="text-xs text-muted-foreground">
                    Example: {settings.credit_note_prefix || "CN"}-2026-0001
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="credit_note_next_number">Next Credit Note Number</Label>
                  <Input
                    id="credit_note_next_number"
                    name="credit_note_next_number"
                    type="number"
                    min="1"
                    value={settings.credit_note_next_number || 1}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="default_tax_rate">Default VAT Rate (%)</Label>
                  <Input
                    id="default_tax_rate"
                    name="default_tax_rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={settings.default_tax_rate || 0}
                    onChange={handleInputChange}
                  />
                  <p className="text-xs text-muted-foreground">
                    Bahrain VAT is 10% (set 0 if VAT exempt)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="default_payment_terms">Payment Terms (days)</Label>
                  <Input
                    id="default_payment_terms"
                    name="default_payment_terms"
                    type="number"
                    min="1"
                    value={settings.default_payment_terms || 14}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoice_notes">Default Invoice Notes</Label>
                <Textarea
                  id="invoice_notes"
                  name="invoice_notes"
                  value={settings.invoice_notes || ""}
                  onChange={handleInputChange}
                  placeholder="Text that will appear on every invoice..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
