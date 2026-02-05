-- Migration: Add extended bank details to company_settings
-- Run this in Supabase SQL Editor

-- Add new columns for extended bank information
ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS bank_letter_url TEXT,
ADD COLUMN IF NOT EXISTS bank_address TEXT,
ADD COLUMN IF NOT EXISTS bank_country TEXT DEFAULT 'Bahrain',
ADD COLUMN IF NOT EXISTS account_currency TEXT DEFAULT 'BHD',
ADD COLUMN IF NOT EXISTS account_holder_name TEXT;

-- Add comment for documentation
COMMENT ON COLUMN company_settings.bank_letter_url IS 'URL to uploaded bank letter PDF in storage';
COMMENT ON COLUMN company_settings.bank_address IS 'Bank branch address';
COMMENT ON COLUMN company_settings.bank_country IS 'Country where bank is located';
COMMENT ON COLUMN company_settings.account_currency IS 'Account currency code (BHD, USD, EUR, etc.)';
COMMENT ON COLUMN company_settings.account_holder_name IS 'Name of the account holder as per bank records';
