-- Migration: Create bank_accounts table for multiple bank accounts per company
-- Run this in Supabase SQL Editor
-- 
-- Architecture Decision:
-- - bank_accounts is linked to company_settings (not directly to user)
-- - This allows future multi-company support per user
-- - user_id is kept for RLS policies (faster than JOIN)

-- ============================================
-- STEP 1: Create bank_accounts table
-- ============================================

CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Company reference (main relationship)
  company_id UUID NOT NULL REFERENCES company_settings(id) ON DELETE CASCADE,
  
  -- User reference (for RLS - denormalized for performance)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Bank identification
  bank_name TEXT,                    -- e.g. "National Bank of Bahrain"
  iban TEXT NOT NULL,                -- IBAN (unique per company)
  swift_bic TEXT,                    -- SWIFT/BIC code
  
  -- Account details
  account_holder_name TEXT,          -- Name on the account
  account_currency TEXT DEFAULT 'BHD',
  
  -- Bank location
  bank_address TEXT,
  bank_country TEXT DEFAULT 'Bahrain',
  
  -- Supporting document
  bank_letter_url TEXT,              -- URL to uploaded PDF in storage
  
  -- Flags
  is_primary BOOLEAN DEFAULT false,  -- Primary account for invoices
  is_active BOOLEAN DEFAULT true,    -- Soft delete
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- STEP 2: Indexes and Constraints
-- ============================================

-- Unique IBAN per company (not globally - same IBAN might be in different companies theoretically)
CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_company_iban_unique 
ON bank_accounts(company_id, iban);

-- Index for fast lookups by company
CREATE INDEX IF NOT EXISTS bank_accounts_company_id_idx ON bank_accounts(company_id);

-- Index for RLS queries
CREATE INDEX IF NOT EXISTS bank_accounts_user_id_idx ON bank_accounts(user_id);

-- ============================================
-- STEP 3: Row Level Security
-- ============================================

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

-- Users can only see bank accounts of their companies
DROP POLICY IF EXISTS "Users can view own bank accounts" ON bank_accounts;
CREATE POLICY "Users can view own bank accounts"
ON bank_accounts FOR SELECT
USING (auth.uid() = user_id::uuid);

DROP POLICY IF EXISTS "Users can insert own bank accounts" ON bank_accounts;
CREATE POLICY "Users can insert own bank accounts"
ON bank_accounts FOR INSERT
WITH CHECK (auth.uid() = user_id::uuid);

DROP POLICY IF EXISTS "Users can update own bank accounts" ON bank_accounts;
CREATE POLICY "Users can update own bank accounts"
ON bank_accounts FOR UPDATE
USING (auth.uid() = user_id::uuid);

DROP POLICY IF EXISTS "Users can delete own bank accounts" ON bank_accounts;
CREATE POLICY "Users can delete own bank accounts"
ON bank_accounts FOR DELETE
USING (auth.uid() = user_id::uuid);

-- ============================================
-- STEP 4: Trigger for single primary account
-- ============================================

CREATE OR REPLACE FUNCTION ensure_single_primary_bank_account()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary = true THEN
    -- Unset primary from other accounts of the same company
    UPDATE bank_accounts 
    SET is_primary = false, updated_at = NOW()
    WHERE company_id = NEW.company_id AND id != NEW.id AND is_primary = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS ensure_single_primary_bank_account_trigger ON bank_accounts;
CREATE TRIGGER ensure_single_primary_bank_account_trigger
AFTER INSERT OR UPDATE OF is_primary ON bank_accounts
FOR EACH ROW
WHEN (NEW.is_primary = true)
EXECUTE FUNCTION ensure_single_primary_bank_account();

-- ============================================
-- STEP 5: Remove deprecated columns from company_settings
-- (Old bank fields - now in bank_accounts table)
-- ============================================

-- Note: We keep these columns for now to avoid breaking existing code
-- In a future migration, these should be removed:
-- ALTER TABLE company_settings DROP COLUMN IF EXISTS bank_name;
-- ALTER TABLE company_settings DROP COLUMN IF EXISTS bank_account;
-- ALTER TABLE company_settings DROP COLUMN IF EXISTS bank_bic;
-- ALTER TABLE company_settings DROP COLUMN IF EXISTS bank_correspondent_account;
-- ALTER TABLE company_settings DROP COLUMN IF EXISTS bank_letter_url;
-- ALTER TABLE company_settings DROP COLUMN IF EXISTS bank_address;
-- ALTER TABLE company_settings DROP COLUMN IF EXISTS bank_country;
-- ALTER TABLE company_settings DROP COLUMN IF EXISTS account_currency;
-- ALTER TABLE company_settings DROP COLUMN IF EXISTS account_holder_name;

-- ============================================
-- STEP 6: Comments for documentation
-- ============================================

COMMENT ON TABLE bank_accounts IS 'Bank accounts linked to companies. Supports multiple accounts per company.';
COMMENT ON COLUMN bank_accounts.company_id IS 'Reference to company_settings - main relationship';
COMMENT ON COLUMN bank_accounts.user_id IS 'Denormalized user reference for RLS performance';
COMMENT ON COLUMN bank_accounts.iban IS 'International Bank Account Number - unique per company';
COMMENT ON COLUMN bank_accounts.is_primary IS 'Primary account used for invoice generation';
