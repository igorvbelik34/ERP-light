-- Migration: Add default EUR exchange rates to get_exchange_rate function
-- EUR is a common currency that needs default fallback rates

-- Update the get_exchange_rate function to include EUR defaults
CREATE OR REPLACE FUNCTION get_exchange_rate(
  p_user_id UUID,
  p_from_currency TEXT,
  p_to_currency TEXT,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS DECIMAL(18, 8) AS $$
DECLARE
  v_rate DECIMAL(18, 8);
  v_inverse_rate DECIMAL(18, 8);
  v_from_usd_rate DECIMAL(18, 8);
  v_to_usd_rate DECIMAL(18, 8);
  v_from TEXT;
  v_to TEXT;
BEGIN
  v_from := UPPER(p_from_currency);
  v_to := UPPER(p_to_currency);

  -- Same currency, return 1
  IF v_from = v_to THEN
    RETURN 1.0;
  END IF;

  -- Try direct rate (most recent on or before the date)
  SELECT rate INTO v_rate
  FROM exchange_rates
  WHERE user_id = p_user_id
    AND UPPER(from_currency) = v_from
    AND UPPER(to_currency) = v_to
    AND effective_date <= p_date
  ORDER BY effective_date DESC
  LIMIT 1;

  IF v_rate IS NOT NULL THEN
    RETURN v_rate;
  END IF;

  -- Try inverse rate
  SELECT rate INTO v_inverse_rate
  FROM exchange_rates
  WHERE user_id = p_user_id
    AND UPPER(from_currency) = v_to
    AND UPPER(to_currency) = v_from
    AND effective_date <= p_date
  ORDER BY effective_date DESC
  LIMIT 1;

  IF v_inverse_rate IS NOT NULL THEN
    RETURN 1.0 / v_inverse_rate;
  END IF;

  -- Try cross rate via USD
  -- from_currency -> USD -> to_currency
  SELECT rate INTO v_from_usd_rate
  FROM exchange_rates
  WHERE user_id = p_user_id
    AND UPPER(from_currency) = v_from
    AND UPPER(to_currency) = 'USD'
    AND effective_date <= p_date
  ORDER BY effective_date DESC
  LIMIT 1;

  -- If no direct from->USD, try inverse
  IF v_from_usd_rate IS NULL THEN
    SELECT 1.0 / rate INTO v_from_usd_rate
    FROM exchange_rates
    WHERE user_id = p_user_id
      AND UPPER(from_currency) = 'USD'
      AND UPPER(to_currency) = v_from
      AND effective_date <= p_date
    ORDER BY effective_date DESC
    LIMIT 1;
  END IF;

  SELECT rate INTO v_to_usd_rate
  FROM exchange_rates
  WHERE user_id = p_user_id
    AND UPPER(from_currency) = 'USD'
    AND UPPER(to_currency) = v_to
    AND effective_date <= p_date
  ORDER BY effective_date DESC
  LIMIT 1;

  -- If no direct USD->to, try inverse
  IF v_to_usd_rate IS NULL THEN
    SELECT 1.0 / rate INTO v_to_usd_rate
    FROM exchange_rates
    WHERE user_id = p_user_id
      AND UPPER(from_currency) = v_to
      AND UPPER(to_currency) = 'USD'
      AND effective_date <= p_date
    ORDER BY effective_date DESC
    LIMIT 1;
  END IF;

  IF v_from_usd_rate IS NOT NULL AND v_to_usd_rate IS NOT NULL THEN
    RETURN v_from_usd_rate * v_to_usd_rate;
  END IF;

  -- =====================================================
  -- DEFAULT FALLBACK RATES (when no user rates exist)
  -- These are approximate rates and should be overridden
  -- by user-specific rates for accuracy
  -- =====================================================

  -- BHD is pegged to USD at approximately 1 BHD = 2.65957 USD
  -- USD to BHD
  IF v_from = 'USD' AND v_to = 'BHD' THEN
    RETURN 0.376000;
  END IF;
  IF v_from = 'BHD' AND v_to = 'USD' THEN
    RETURN 2.65957;
  END IF;

  -- EUR to USD (approximate rate ~1.08)
  IF v_from = 'EUR' AND v_to = 'USD' THEN
    RETURN 1.08;
  END IF;
  IF v_from = 'USD' AND v_to = 'EUR' THEN
    RETURN 0.926;
  END IF;

  -- EUR to BHD (via USD: 1.08 * 0.376 ≈ 0.406)
  IF v_from = 'EUR' AND v_to = 'BHD' THEN
    RETURN 0.406;
  END IF;
  IF v_from = 'BHD' AND v_to = 'EUR' THEN
    RETURN 2.463;
  END IF;

  -- GBP to USD (approximate rate ~1.27)
  IF v_from = 'GBP' AND v_to = 'USD' THEN
    RETURN 1.27;
  END IF;
  IF v_from = 'USD' AND v_to = 'GBP' THEN
    RETURN 0.787;
  END IF;

  -- GBP to BHD
  IF v_from = 'GBP' AND v_to = 'BHD' THEN
    RETURN 0.477;
  END IF;
  IF v_from = 'BHD' AND v_to = 'GBP' THEN
    RETURN 2.096;
  END IF;

  -- No rate found
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Recalculate all invoices with the new rates
DO $$
DECLARE
  r RECORD;
  v_rate_to_bhd DECIMAL(18, 8);
  v_rate_to_usd DECIMAL(18, 8);
BEGIN
  FOR r IN SELECT id, user_id, currency, total, issue_date FROM invoices WHERE is_deleted = FALSE LOOP
    -- Get rates with new defaults
    v_rate_to_bhd := get_exchange_rate(r.user_id, UPPER(r.currency), 'BHD', r.issue_date::DATE);
    v_rate_to_usd := get_exchange_rate(r.user_id, UPPER(r.currency), 'USD', r.issue_date::DATE);

    -- Use fallbacks only if still NULL
    v_rate_to_bhd := COALESCE(v_rate_to_bhd, 1.0);
    v_rate_to_usd := COALESCE(v_rate_to_usd, 1.0);

    -- Update invoice
    UPDATE invoices
    SET
      rate_to_bhd = v_rate_to_bhd,
      rate_to_usd = v_rate_to_usd,
      total_bhd = ROUND(r.total * v_rate_to_bhd, 3),
      total_usd = ROUND(r.total * v_rate_to_usd, 2),
      updated_at = NOW()
    WHERE id = r.id;
  END LOOP;
END $$;

COMMENT ON FUNCTION get_exchange_rate IS 'Get exchange rate with fallback logic: direct, inverse, cross-rate via USD, or default rates for common currencies (BHD, USD, EUR, GBP)';
