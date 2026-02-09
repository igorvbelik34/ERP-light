-- Migration 016: Tarabut Open Banking Integration
-- Adds support for bank account linking via Tarabut Gateway and transaction storage

-- =====================================================
-- 1. Update bank_accounts table for Tarabut integration
-- =====================================================

ALTER TABLE bank_accounts 
ADD COLUMN IF NOT EXISTS tarabut_consent_id TEXT,
ADD COLUMN IF NOT EXISTS tarabut_account_id TEXT,
ADD COLUMN IF NOT EXISTS tarabut_provider_id TEXT,
ADD COLUMN IF NOT EXISTS consent_status TEXT DEFAULT 'none', -- none, pending, active, expired, revoked
ADD COLUMN IF NOT EXISTS consent_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN DEFAULT true;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bank_accounts_tarabut_consent 
ON bank_accounts(tarabut_consent_id) WHERE tarabut_consent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_accounts_tarabut_account 
ON bank_accounts(tarabut_account_id) WHERE tarabut_account_id IS NOT NULL;

-- =====================================================
-- 2. Create bank_transactions table
-- =====================================================

CREATE TABLE IF NOT EXISTS bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  
  -- Tarabut identifiers
  tarabut_transaction_id TEXT,
  
  -- Transaction details
  transaction_date DATE NOT NULL,
  booking_date DATE,
  value_date DATE,
  amount DECIMAL(15,3) NOT NULL,
  currency TEXT DEFAULT 'BHD',
  
  -- Description and reference
  description TEXT,
  reference TEXT,
  merchant_name TEXT,
  
  -- Transaction classification
  transaction_type TEXT NOT NULL, -- credit, debit
  category TEXT,
  
  -- Balance after transaction (if provided by bank)
  balance_after DECIMAL(15,3),
  
  -- Reconciliation with invoices
  matched_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  is_reconciled BOOLEAN DEFAULT false,
  reconciled_at TIMESTAMPTZ,
  reconciled_by TEXT,
  reconciliation_notes TEXT,
  
  -- Raw data from Tarabut (for debugging)
  raw_data JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint on Tarabut transaction ID per account
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_transactions_tarabut_unique 
ON bank_transactions(bank_account_id, tarabut_transaction_id) 
WHERE tarabut_transaction_id IS NOT NULL;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_bank_transactions_user 
ON bank_transactions(user_id);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_account 
ON bank_transactions(bank_account_id);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_date 
ON bank_transactions(transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_unreconciled 
ON bank_transactions(user_id, is_reconciled) 
WHERE is_reconciled = false;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_invoice 
ON bank_transactions(matched_invoice_id) 
WHERE matched_invoice_id IS NOT NULL;

-- =====================================================
-- 3. Create tarabut_consents table for OAuth management
-- =====================================================

CREATE TABLE IF NOT EXISTS tarabut_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  
  -- Consent details from Tarabut
  consent_id TEXT NOT NULL UNIQUE,
  consent_token TEXT,
  refresh_token TEXT,
  
  -- Provider info
  provider_id TEXT NOT NULL, -- e.g., 'ithmaar'
  provider_name TEXT,
  
  -- Status
  status TEXT DEFAULT 'pending', -- pending, authorized, active, expired, revoked
  scope TEXT[], -- ['accounts', 'transactions', 'balances']
  
  -- Validity
  authorized_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  
  -- Linked accounts (array of account IDs from this consent)
  linked_account_ids UUID[],
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tarabut_consents_user 
ON tarabut_consents(user_id);

CREATE INDEX IF NOT EXISTS idx_tarabut_consents_status 
ON tarabut_consents(user_id, status);

-- =====================================================
-- 4. Create bank_sync_logs table for debugging
-- =====================================================

CREATE TABLE IF NOT EXISTS bank_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
  
  -- Sync details
  sync_type TEXT NOT NULL, -- 'transactions', 'balances', 'accounts'
  status TEXT NOT NULL, -- 'started', 'success', 'error'
  
  -- Results
  records_fetched INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  
  -- Error handling
  error_code TEXT,
  error_message TEXT,
  
  -- Timing
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- Raw response (for debugging)
  request_data JSONB,
  response_data JSONB
);

CREATE INDEX IF NOT EXISTS idx_bank_sync_logs_user 
ON bank_sync_logs(user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_bank_sync_logs_account 
ON bank_sync_logs(bank_account_id, started_at DESC);

-- =====================================================
-- 5. RLS Policies
-- =====================================================

-- Enable RLS
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarabut_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_sync_logs ENABLE ROW LEVEL SECURITY;

-- bank_transactions policies
CREATE POLICY "Users can view own bank transactions"
ON bank_transactions FOR SELECT
USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert own bank transactions"
ON bank_transactions FOR INSERT
WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can update own bank transactions"
ON bank_transactions FOR UPDATE
USING (user_id = auth.uid()::text);

CREATE POLICY "Users can delete own bank transactions"
ON bank_transactions FOR DELETE
USING (user_id = auth.uid()::text);

-- tarabut_consents policies
CREATE POLICY "Users can view own consents"
ON tarabut_consents FOR SELECT
USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert own consents"
ON tarabut_consents FOR INSERT
WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can update own consents"
ON tarabut_consents FOR UPDATE
USING (user_id = auth.uid()::text);

CREATE POLICY "Users can delete own consents"
ON tarabut_consents FOR DELETE
USING (user_id = auth.uid()::text);

-- bank_sync_logs policies
CREATE POLICY "Users can view own sync logs"
ON bank_sync_logs FOR SELECT
USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert own sync logs"
ON bank_sync_logs FOR INSERT
WITH CHECK (user_id = auth.uid()::text);

-- =====================================================
-- 6. Updated_at triggers
-- =====================================================

CREATE OR REPLACE FUNCTION update_bank_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_bank_transactions_updated_at
BEFORE UPDATE ON bank_transactions
FOR EACH ROW EXECUTE FUNCTION update_bank_transactions_updated_at();

CREATE OR REPLACE FUNCTION update_tarabut_consents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tarabut_consents_updated_at
BEFORE UPDATE ON tarabut_consents
FOR EACH ROW EXECUTE FUNCTION update_tarabut_consents_updated_at();

-- =====================================================
-- 7. Helper function: Auto-reconcile transactions
-- =====================================================

CREATE OR REPLACE FUNCTION auto_reconcile_transaction(
  p_transaction_id UUID
)
RETURNS TABLE(
  matched BOOLEAN,
  invoice_id UUID,
  invoice_number TEXT,
  match_type TEXT
) AS $$
DECLARE
  v_transaction bank_transactions%ROWTYPE;
  v_invoice invoices%ROWTYPE;
BEGIN
  -- Get transaction details
  SELECT * INTO v_transaction FROM bank_transactions WHERE id = p_transaction_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'transaction_not_found'::TEXT;
    RETURN;
  END IF;
  
  -- Skip if already reconciled
  IF v_transaction.is_reconciled THEN
    RETURN QUERY SELECT true, v_transaction.matched_invoice_id, 
      (SELECT invoice_number FROM invoices WHERE id = v_transaction.matched_invoice_id),
      'already_reconciled'::TEXT;
    RETURN;
  END IF;
  
  -- Only reconcile credit transactions (incoming payments)
  IF v_transaction.transaction_type != 'credit' THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'not_credit_transaction'::TEXT;
    RETURN;
  END IF;
  
  -- Try to match by exact amount and reference
  SELECT * INTO v_invoice
  FROM invoices
  WHERE user_id = v_transaction.user_id
    AND type = 'outbound'
    AND status IN ('sent', 'overdue')
    AND is_deleted = false
    AND total = v_transaction.amount
    AND (
      -- Match by invoice number in reference/description
      v_transaction.reference ILIKE '%' || invoice_number || '%'
      OR v_transaction.description ILIKE '%' || invoice_number || '%'
    )
  ORDER BY issue_date DESC
  LIMIT 1;
  
  IF FOUND THEN
    -- Auto-reconcile
    UPDATE bank_transactions
    SET matched_invoice_id = v_invoice.id,
        is_reconciled = true,
        reconciled_at = now(),
        reconciliation_notes = 'Auto-matched by amount and reference'
    WHERE id = p_transaction_id;
    
    -- Update invoice status to paid
    UPDATE invoices
    SET status = 'paid',
        updated_at = now()
    WHERE id = v_invoice.id;
    
    RETURN QUERY SELECT true, v_invoice.id, v_invoice.invoice_number, 'exact_match'::TEXT;
    RETURN;
  END IF;
  
  -- Try to match by exact amount only (suggest, don't auto-reconcile)
  SELECT * INTO v_invoice
  FROM invoices
  WHERE user_id = v_transaction.user_id
    AND type = 'outbound'
    AND status IN ('sent', 'overdue')
    AND is_deleted = false
    AND total = v_transaction.amount
  ORDER BY issue_date DESC
  LIMIT 1;
  
  IF FOUND THEN
    RETURN QUERY SELECT false, v_invoice.id, v_invoice.invoice_number, 'amount_match_suggested'::TEXT;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'no_match'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 8. Function: Get unreconciled transactions summary
-- =====================================================

CREATE OR REPLACE FUNCTION get_unreconciled_summary(p_user_id TEXT)
RETURNS TABLE(
  total_unreconciled INTEGER,
  total_credits DECIMAL(15,3),
  total_debits DECIMAL(15,3),
  oldest_transaction DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER as total_unreconciled,
    COALESCE(SUM(CASE WHEN transaction_type = 'credit' THEN amount ELSE 0 END), 0) as total_credits,
    COALESCE(SUM(CASE WHEN transaction_type = 'debit' THEN amount ELSE 0 END), 0) as total_debits,
    MIN(transaction_date) as oldest_transaction
  FROM bank_transactions
  WHERE user_id = p_user_id
    AND is_reconciled = false;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON TABLE bank_transactions IS 'Bank transactions imported from Tarabut Open Banking';
COMMENT ON TABLE tarabut_consents IS 'OAuth consents for Tarabut bank connections';
COMMENT ON TABLE bank_sync_logs IS 'Logs for bank data synchronization operations';
COMMENT ON FUNCTION auto_reconcile_transaction IS 'Attempts to automatically match a bank transaction with an invoice';
