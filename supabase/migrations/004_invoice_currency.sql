-- Migration: Add currency field to invoices
-- This allows invoices to be created in different currencies
-- The appropriate bank account will be selected based on currency

-- Add currency column to invoices
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'BHD';

-- Add index for currency lookups
CREATE INDEX IF NOT EXISTS invoices_currency_idx ON invoices(currency);

-- Comment for documentation
COMMENT ON COLUMN invoices.currency IS 'Invoice currency code (e.g. BHD, USD, EUR). Used to select matching bank account.';
