-- Migration: Add currency equivalent fields to invoices
-- Stores total in BHD (3 decimal places) and USD (2 decimal places)
-- Auto-calculated on INSERT/UPDATE via trigger

-- Add new columns to invoices
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS total_bhd DECIMAL(15, 3),
  ADD COLUMN IF NOT EXISTS total_usd DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS rate_to_bhd DECIMAL(18, 8),
  ADD COLUMN IF NOT EXISTS rate_to_usd DECIMAL(18, 8);

-- Function to calculate and set currency equivalents
CREATE OR REPLACE FUNCTION calculate_invoice_currency_equivalents()
RETURNS TRIGGER AS $$
DECLARE
  v_rate_to_bhd DECIMAL(18, 8);
  v_rate_to_usd DECIMAL(18, 8);
  v_invoice_date DATE;
BEGIN
  -- Use issue_date for rate lookup
  v_invoice_date := COALESCE(NEW.issue_date::DATE, CURRENT_DATE);

  -- Get rates using the get_exchange_rate function
  v_rate_to_bhd := get_exchange_rate(NEW.user_id, UPPER(NEW.currency), 'BHD', v_invoice_date);
  v_rate_to_usd := get_exchange_rate(NEW.user_id, UPPER(NEW.currency), 'USD', v_invoice_date);

  -- Calculate equivalents (use 1.0 as fallback if no rate found)
  NEW.rate_to_bhd := COALESCE(v_rate_to_bhd, 1.0);
  NEW.rate_to_usd := COALESCE(v_rate_to_usd, 1.0);

  -- BHD has 3 decimal places, USD has 2
  NEW.total_bhd := ROUND(NEW.total * NEW.rate_to_bhd, 3);
  NEW.total_usd := ROUND(NEW.total * NEW.rate_to_usd, 2);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for INSERT and UPDATE
DROP TRIGGER IF EXISTS invoice_currency_equivalents_trigger ON invoices;

CREATE TRIGGER invoice_currency_equivalents_trigger
  BEFORE INSERT OR UPDATE OF total, currency, issue_date
  ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION calculate_invoice_currency_equivalents();

-- Backfill existing invoices
-- We need to update in batches to handle rate lookups properly
DO $$
DECLARE
  r RECORD;
  v_rate_to_bhd DECIMAL(18, 8);
  v_rate_to_usd DECIMAL(18, 8);
BEGIN
  FOR r IN SELECT id, user_id, currency, total, issue_date FROM invoices WHERE total_bhd IS NULL LOOP
    -- Get rates
    v_rate_to_bhd := get_exchange_rate(r.user_id, UPPER(r.currency), 'BHD', r.issue_date::DATE);
    v_rate_to_usd := get_exchange_rate(r.user_id, UPPER(r.currency), 'USD', r.issue_date::DATE);

    -- Use fallbacks
    v_rate_to_bhd := COALESCE(v_rate_to_bhd, 1.0);
    v_rate_to_usd := COALESCE(v_rate_to_usd, 1.0);

    -- Update invoice
    UPDATE invoices
    SET
      rate_to_bhd = v_rate_to_bhd,
      rate_to_usd = v_rate_to_usd,
      total_bhd = ROUND(r.total * v_rate_to_bhd, 3),
      total_usd = ROUND(r.total * v_rate_to_usd, 2)
    WHERE id = r.id;
  END LOOP;
END $$;

-- Create indexes for faster aggregation queries
CREATE INDEX IF NOT EXISTS idx_invoices_total_bhd ON invoices(total_bhd) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_invoices_total_usd ON invoices(total_usd) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_invoices_dashboard_stats
  ON invoices(user_id, type, status, is_deleted)
  INCLUDE (total_bhd, total_usd);

-- Add comments
COMMENT ON COLUMN invoices.total_bhd IS 'Invoice total converted to BHD (3 decimal places)';
COMMENT ON COLUMN invoices.total_usd IS 'Invoice total converted to USD (2 decimal places)';
COMMENT ON COLUMN invoices.rate_to_bhd IS 'Exchange rate used for BHD conversion';
COMMENT ON COLUMN invoices.rate_to_usd IS 'Exchange rate used for USD conversion';
