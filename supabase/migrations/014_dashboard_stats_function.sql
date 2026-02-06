-- Migration: Dashboard statistics RPC function
-- Returns aggregated stats for the dashboard in the requested currency

-- Create composite type for dashboard stats
DROP TYPE IF EXISTS dashboard_stats_type CASCADE;

CREATE TYPE dashboard_stats_type AS (
  -- Contacts
  total_contacts INTEGER,
  customer_count INTEGER,
  supplier_count INTEGER,
  both_count INTEGER,

  -- Outbound invoices (revenue)
  outbound_total DECIMAL(15, 2),
  outbound_paid DECIMAL(15, 2),
  outbound_pending DECIMAL(15, 2),
  outbound_overdue DECIMAL(15, 2),

  -- Inbound invoices (expenses)
  inbound_total DECIMAL(15, 2),
  inbound_paid DECIMAL(15, 2),
  inbound_pending DECIMAL(15, 2),
  inbound_overdue DECIMAL(15, 2),

  -- Invoice status counts
  draft_count INTEGER,
  sent_count INTEGER,
  paid_count INTEGER,
  overdue_count INTEGER,
  cancelled_count INTEGER,

  -- Net position
  net_balance DECIMAL(15, 2),

  -- Currency used for display
  display_currency TEXT
);

-- Main dashboard stats function
CREATE OR REPLACE FUNCTION get_dashboard_stats(p_currency TEXT DEFAULT 'BHD')
RETURNS dashboard_stats_type AS $$
DECLARE
  v_result dashboard_stats_type;
  v_user_id UUID;
  v_currency TEXT;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Normalize currency
  v_currency := UPPER(COALESCE(p_currency, 'BHD'));
  IF v_currency NOT IN ('BHD', 'USD') THEN
    v_currency := 'BHD';
  END IF;

  v_result.display_currency := v_currency;

  -- Count contacts
  SELECT
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE type = 'customer')::INTEGER,
    COUNT(*) FILTER (WHERE type = 'supplier')::INTEGER,
    COUNT(*) FILTER (WHERE type = 'both')::INTEGER
  INTO
    v_result.total_contacts,
    v_result.customer_count,
    v_result.supplier_count,
    v_result.both_count
  FROM clients
  WHERE user_id = v_user_id;

  -- Outbound invoices (revenue) - only regular invoices, not credit notes
  IF v_currency = 'BHD' THEN
    SELECT
      COALESCE(SUM(total_bhd), 0),
      COALESCE(SUM(total_bhd) FILTER (WHERE status = 'paid'), 0),
      COALESCE(SUM(total_bhd) FILTER (WHERE status IN ('draft', 'sent')), 0),
      COALESCE(SUM(total_bhd) FILTER (WHERE status = 'overdue'), 0)
    INTO
      v_result.outbound_total,
      v_result.outbound_paid,
      v_result.outbound_pending,
      v_result.outbound_overdue
    FROM invoices
    WHERE user_id = v_user_id
      AND type = 'outbound'
      AND document_type = 'invoice'
      AND is_deleted = FALSE
      AND status != 'cancelled'
      AND status != 'voided';
  ELSE
    SELECT
      COALESCE(SUM(total_usd), 0),
      COALESCE(SUM(total_usd) FILTER (WHERE status = 'paid'), 0),
      COALESCE(SUM(total_usd) FILTER (WHERE status IN ('draft', 'sent')), 0),
      COALESCE(SUM(total_usd) FILTER (WHERE status = 'overdue'), 0)
    INTO
      v_result.outbound_total,
      v_result.outbound_paid,
      v_result.outbound_pending,
      v_result.outbound_overdue
    FROM invoices
    WHERE user_id = v_user_id
      AND type = 'outbound'
      AND document_type = 'invoice'
      AND is_deleted = FALSE
      AND status != 'cancelled'
      AND status != 'voided';
  END IF;

  -- Inbound invoices (expenses) - only regular invoices, not credit notes
  IF v_currency = 'BHD' THEN
    SELECT
      COALESCE(SUM(total_bhd), 0),
      COALESCE(SUM(total_bhd) FILTER (WHERE status = 'paid'), 0),
      COALESCE(SUM(total_bhd) FILTER (WHERE status IN ('draft', 'sent')), 0),
      COALESCE(SUM(total_bhd) FILTER (WHERE status = 'overdue'), 0)
    INTO
      v_result.inbound_total,
      v_result.inbound_paid,
      v_result.inbound_pending,
      v_result.inbound_overdue
    FROM invoices
    WHERE user_id = v_user_id
      AND type = 'inbound'
      AND document_type = 'invoice'
      AND is_deleted = FALSE
      AND status != 'cancelled'
      AND status != 'voided';
  ELSE
    SELECT
      COALESCE(SUM(total_usd), 0),
      COALESCE(SUM(total_usd) FILTER (WHERE status = 'paid'), 0),
      COALESCE(SUM(total_usd) FILTER (WHERE status IN ('draft', 'sent')), 0),
      COALESCE(SUM(total_usd) FILTER (WHERE status = 'overdue'), 0)
    INTO
      v_result.inbound_total,
      v_result.inbound_paid,
      v_result.inbound_pending,
      v_result.inbound_overdue
    FROM invoices
    WHERE user_id = v_user_id
      AND type = 'inbound'
      AND document_type = 'invoice'
      AND is_deleted = FALSE
      AND status != 'cancelled'
      AND status != 'voided';
  END IF;

  -- Invoice status counts (all invoice types)
  SELECT
    COUNT(*) FILTER (WHERE status = 'draft')::INTEGER,
    COUNT(*) FILTER (WHERE status = 'sent')::INTEGER,
    COUNT(*) FILTER (WHERE status = 'paid')::INTEGER,
    COUNT(*) FILTER (WHERE status = 'overdue')::INTEGER,
    COUNT(*) FILTER (WHERE status IN ('cancelled', 'voided'))::INTEGER
  INTO
    v_result.draft_count,
    v_result.sent_count,
    v_result.paid_count,
    v_result.overdue_count,
    v_result.cancelled_count
  FROM invoices
  WHERE user_id = v_user_id
    AND is_deleted = FALSE;

  -- Calculate net balance (revenue - expenses, paid only)
  v_result.net_balance := v_result.outbound_paid - v_result.inbound_paid;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_dashboard_stats(TEXT) TO authenticated;

-- Add comment
COMMENT ON FUNCTION get_dashboard_stats IS 'Returns aggregated dashboard statistics in the requested currency (BHD or USD)';
