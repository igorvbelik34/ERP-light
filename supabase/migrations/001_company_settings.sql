-- ============================================================================
-- Sprint 1: Company Settings Table
-- Run this SQL in your Supabase Dashboard SQL Editor
-- ============================================================================

-- Company Settings table (one per user)
CREATE TABLE IF NOT EXISTS company_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  
  -- Company Information
  company_name TEXT,
  legal_name TEXT,
  
  -- Tax Information
  vat_id TEXT,                    -- ИНН / VAT Number
  tax_registration_number TEXT,   -- КПП / Tax Reg Number
  
  -- Contact Information
  email TEXT,
  phone TEXT,
  website TEXT,
  
  -- Address
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'Bahrain',
  
  -- Bank Details
  bank_name TEXT,
  bank_account TEXT,              -- Расчётный счёт
  bank_bic TEXT,                  -- БИК
  bank_correspondent_account TEXT, -- Корр. счёт
  
  -- Branding
  logo_url TEXT,
  
  -- Invoice Settings
  invoice_prefix TEXT DEFAULT 'INV',
  invoice_next_number INTEGER DEFAULT 1,
  default_tax_rate DECIMAL(5, 2) DEFAULT 20.00,
  default_payment_terms INTEGER DEFAULT 14, -- days
  invoice_notes TEXT,             -- Default notes on invoices
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index
CREATE INDEX IF NOT EXISTS idx_company_settings_user_id ON company_settings(user_id);

-- Enable RLS
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own company settings"
  ON company_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own company settings"
  ON company_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own company settings"
  ON company_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- Auto-update updated_at trigger
CREATE TRIGGER update_company_settings_updated_at
  BEFORE UPDATE ON company_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Supabase Storage Bucket for logos
-- Run this separately in SQL Editor or create via Dashboard
-- ============================================================================

-- Create storage bucket for company logos (run in Dashboard > Storage > New Bucket)
-- Name: company-logos
-- Public: true (so logos can be displayed)

-- Storage policy (run in SQL Editor after creating bucket)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('company-logos', 'company-logos', true);

-- Allow authenticated users to upload their own logos
-- CREATE POLICY "Users can upload their own logo"
--   ON storage.objects FOR INSERT
--   WITH CHECK (
--     bucket_id = 'company-logos' AND
--     auth.uid()::text = (storage.foldername(name))[1]
--   );

-- CREATE POLICY "Users can update their own logo"
--   ON storage.objects FOR UPDATE
--   USING (
--     bucket_id = 'company-logos' AND
--     auth.uid()::text = (storage.foldername(name))[1]
--   );

-- CREATE POLICY "Anyone can view logos"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'company-logos');
