-- Migration: Exchange rates table and helper function
-- Stores currency exchange rates per user with effective dates

-- Create exchange_rates table
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate DECIMAL(18, 8) NOT NULL CHECK (rate > 0),
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, from_currency, to_currency, effective_date)
);

-- Enable RLS
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own exchange rates"
  ON exchange_rates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own exchange rates"
  ON exchange_rates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own exchange rates"
  ON exchange_rates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own exchange rates"
  ON exchange_rates FOR DELETE
  USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX idx_exchange_rates_lookup
  ON exchange_rates(user_id, from_currency, to_currency, effective_date DESC);

-- Function to get exchange rate with fallbacks
-- Returns rate for converting from_currency to to_currency
-- Fallback logic:
-- 1. Try direct rate
-- 2. Try inverse rate (1/rate)
-- 3. Try cross rate via USD
-- 4. Return 1.0 if same currency
-- 5. Return NULL if not found
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
BEGIN
  -- Same currency, return 1
  IF UPPER(p_from_currency) = UPPER(p_to_currency) THEN
    RETURN 1.0;
  END IF;

  -- Try direct rate (most recent on or before the date)
  SELECT rate INTO v_rate
  FROM exchange_rates
  WHERE user_id = p_user_id
    AND UPPER(from_currency) = UPPER(p_from_currency)
    AND UPPER(to_currency) = UPPER(p_to_currency)
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
    AND UPPER(from_currency) = UPPER(p_to_currency)
    AND UPPER(to_currency) = UPPER(p_from_currency)
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
    AND UPPER(from_currency) = UPPER(p_from_currency)
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
      AND UPPER(to_currency) = UPPER(p_from_currency)
      AND effective_date <= p_date
    ORDER BY effective_date DESC
    LIMIT 1;
  END IF;

  SELECT rate INTO v_to_usd_rate
  FROM exchange_rates
  WHERE user_id = p_user_id
    AND UPPER(from_currency) = 'USD'
    AND UPPER(to_currency) = UPPER(p_to_currency)
    AND effective_date <= p_date
  ORDER BY effective_date DESC
  LIMIT 1;

  -- If no direct USD->to, try inverse
  IF v_to_usd_rate IS NULL THEN
    SELECT 1.0 / rate INTO v_to_usd_rate
    FROM exchange_rates
    WHERE user_id = p_user_id
      AND UPPER(from_currency) = UPPER(p_to_currency)
      AND UPPER(to_currency) = 'USD'
      AND effective_date <= p_date
    ORDER BY effective_date DESC
    LIMIT 1;
  END IF;

  IF v_from_usd_rate IS NOT NULL AND v_to_usd_rate IS NOT NULL THEN
    RETURN v_from_usd_rate * v_to_usd_rate;
  END IF;

  -- Default fallback rates for BHD/USD if no user rates exist
  -- BHD is pegged to USD at approximately 1 BHD = 2.65 USD
  IF UPPER(p_from_currency) = 'BHD' AND UPPER(p_to_currency) = 'USD' THEN
    RETURN 2.65957;
  ELSIF UPPER(p_from_currency) = 'USD' AND UPPER(p_to_currency) = 'BHD' THEN
    RETURN 0.376000;
  END IF;

  -- No rate found
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_exchange_rate(UUID, TEXT, TEXT, DATE) TO authenticated;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_exchange_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exchange_rates_updated_at
  BEFORE UPDATE ON exchange_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_exchange_rates_updated_at();

-- Add comment
COMMENT ON TABLE exchange_rates IS 'User-specific exchange rates with effective dates';
COMMENT ON FUNCTION get_exchange_rate IS 'Get exchange rate with fallback logic: direct, inverse, cross-rate via USD, or default BHD/USD peg';
