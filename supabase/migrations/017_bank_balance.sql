-- Migration: Add balance fields to bank_accounts
-- =====================================================

-- Add balance columns to bank_accounts
ALTER TABLE bank_accounts 
ADD COLUMN IF NOT EXISTS current_balance DECIMAL(15,3),
ADD COLUMN IF NOT EXISTS opening_balance DECIMAL(15,3),
ADD COLUMN IF NOT EXISTS balance_currency TEXT,
ADD COLUMN IF NOT EXISTS balance_updated_at TIMESTAMPTZ;

-- Index for balance lookups
CREATE INDEX IF NOT EXISTS idx_bank_accounts_balance_updated 
ON bank_accounts(balance_updated_at) WHERE balance_updated_at IS NOT NULL;

-- Comment on new columns
COMMENT ON COLUMN bank_accounts.current_balance IS 'Current/closing balance from last statement import or API sync';
COMMENT ON COLUMN bank_accounts.opening_balance IS 'Opening balance from statement period';
COMMENT ON COLUMN bank_accounts.balance_currency IS 'Currency of the balance';
COMMENT ON COLUMN bank_accounts.balance_updated_at IS 'Timestamp when balance was last updated';
