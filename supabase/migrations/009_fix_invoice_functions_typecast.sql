-- ============================================================================
-- Migration: Fix type casts in invoice numbering functions
--
-- Fixes uuid/text comparison in generate_invoice_number and
-- preview_next_invoice_number functions
-- ============================================================================

-- Update generate_invoice_number function with proper type cast
CREATE OR REPLACE FUNCTION generate_invoice_number(
  p_user_id UUID,
  p_document_type document_type DEFAULT 'invoice',
  p_related_invoice_number TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_company_id UUID;
  v_prefix TEXT;
  v_next_number INTEGER;
  v_year INTEGER;
  v_result TEXT;
BEGIN
  -- Get the user's company (with type cast)
  SELECT id INTO v_company_id
  FROM company_settings
  WHERE user_id::uuid = p_user_id
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Company settings not found for user';
  END IF;

  -- Ensure sequence record exists
  INSERT INTO invoice_sequences (company_id)
  VALUES (v_company_id)
  ON CONFLICT (company_id) DO NOTHING;

  v_year := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;

  IF p_document_type = 'credit_note'::document_type THEN
    -- Credit Note: CN-{ORIGINAL_INVOICE_NUMBER}
    IF p_related_invoice_number IS NOT NULL THEN
      v_result := 'CN-' || p_related_invoice_number;
    ELSE
      -- Fallback: use sequence if no related invoice
      SELECT cs.credit_note_prefix INTO v_prefix
      FROM company_settings cs
      WHERE cs.id = v_company_id;

      v_prefix := COALESCE(v_prefix, 'CN');

      UPDATE invoice_sequences
      SET credit_note_sequence = credit_note_sequence + 1,
          updated_at = NOW()
      WHERE company_id = v_company_id
      RETURNING credit_note_sequence INTO v_next_number;

      v_result := v_prefix || '-' || v_year || '-' || LPAD(v_next_number::TEXT, 4, '0');
    END IF;
  ELSE
    -- Regular Invoice: INV-2026-0001
    SELECT cs.invoice_prefix INTO v_prefix
    FROM company_settings cs
    WHERE cs.id = v_company_id;

    v_prefix := COALESCE(v_prefix, 'INV');

    -- Atomically increment and get the next number
    UPDATE invoice_sequences
    SET invoice_sequence = invoice_sequence + 1,
        updated_at = NOW()
    WHERE company_id = v_company_id
    RETURNING invoice_sequence INTO v_next_number;

    v_result := v_prefix || '-' || v_year || '-' || LPAD(v_next_number::TEXT, 4, '0');
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update preview_next_invoice_number function with proper type cast
CREATE OR REPLACE FUNCTION preview_next_invoice_number(
  p_user_id UUID,
  p_document_type document_type DEFAULT 'invoice'
)
RETURNS TEXT AS $$
DECLARE
  v_company_id UUID;
  v_prefix TEXT;
  v_current_number INTEGER;
  v_year INTEGER;
BEGIN
  SELECT id INTO v_company_id
  FROM company_settings
  WHERE user_id::uuid = p_user_id
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_year := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;

  IF p_document_type = 'credit_note'::document_type THEN
    SELECT cs.credit_note_prefix, COALESCE(seq.credit_note_sequence, 0)
    INTO v_prefix, v_current_number
    FROM company_settings cs
    LEFT JOIN invoice_sequences seq ON seq.company_id = cs.id
    WHERE cs.id = v_company_id;

    v_prefix := COALESCE(v_prefix, 'CN');
  ELSE
    SELECT cs.invoice_prefix, COALESCE(seq.invoice_sequence, 0)
    INTO v_prefix, v_current_number
    FROM company_settings cs
    LEFT JOIN invoice_sequences seq ON seq.company_id = cs.id
    WHERE cs.id = v_company_id;

    v_prefix := COALESCE(v_prefix, 'INV');
  END IF;

  RETURN v_prefix || '-' || v_year || '-' || LPAD((v_current_number + 1)::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
