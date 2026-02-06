-- ============================================================================
-- Migration: Proper Invoice Numbering with PostgreSQL Sequences
-- 
-- Features:
-- 1. Atomic number generation using sequences (no race conditions)
-- 2. Per-company sequential numbering
-- 3. Credit Notes linked to original invoice number: CN-{INV_NUMBER}
-- 4. Automatic number assignment on INSERT via trigger
-- ============================================================================

-- ============================================================================
-- STEP 1: Create table for company-specific sequences
-- Each company has its own invoice and credit note counters
-- ============================================================================

CREATE TABLE IF NOT EXISTS invoice_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES company_settings(id) ON DELETE CASCADE UNIQUE,
  invoice_sequence INTEGER DEFAULT 0 NOT NULL,
  credit_note_sequence INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE invoice_sequences ENABLE ROW LEVEL SECURITY;

-- RLS Policies (access through company ownership)
DROP POLICY IF EXISTS "Users can view own invoice sequences" ON invoice_sequences;
CREATE POLICY "Users can view own invoice sequences"
ON invoice_sequences FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM company_settings cs
    WHERE cs.id = invoice_sequences.company_id
    AND cs.user_id::uuid = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update own invoice sequences" ON invoice_sequences;
CREATE POLICY "Users can update own invoice sequences"
ON invoice_sequences FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM company_settings cs
    WHERE cs.id = invoice_sequences.company_id
    AND cs.user_id::uuid = auth.uid()
  )
);

-- INSERT policy - needed for initial sequence creation
DROP POLICY IF EXISTS "Users can insert own invoice sequences" ON invoice_sequences;
CREATE POLICY "Users can insert own invoice sequences"
ON invoice_sequences FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM company_settings cs
    WHERE cs.id = invoice_sequences.company_id
    AND cs.user_id::uuid = auth.uid()
  )
);

-- ============================================================================
-- STEP 2: Function to get next invoice number atomically
-- Returns: INV-2026-0001 format
-- ============================================================================

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
  -- Get the user's company
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
  
  IF p_document_type = 'credit_note' THEN
    -- Credit Note: CN-{ORIGINAL_INVOICE_NUMBER}
    -- e.g., INV-2026-0001 → CN-INV-2026-0001
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

-- ============================================================================
-- STEP 3: Function to auto-generate invoice number on INSERT
-- Only generates if invoice_number is NULL or empty
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  v_related_number TEXT;
BEGIN
  -- Only generate if number not provided
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    -- For credit notes, get the related invoice number
    IF NEW.document_type = 'credit_note' AND NEW.related_invoice_id IS NOT NULL THEN
      SELECT invoice_number INTO v_related_number
      FROM invoices
      WHERE id = NEW.related_invoice_id;
    END IF;
    
    NEW.invoice_number := generate_invoice_number(
      NEW.user_id, 
      NEW.document_type,
      v_related_number
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for auto-generation
DROP TRIGGER IF EXISTS auto_generate_invoice_number_trigger ON invoices;
CREATE TRIGGER auto_generate_invoice_number_trigger
BEFORE INSERT ON invoices
FOR EACH ROW EXECUTE FUNCTION auto_generate_invoice_number();

-- ============================================================================
-- STEP 4: Initialize sequences from existing data
-- Sets the sequence to max existing invoice number + 1
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  v_max_inv INTEGER;
  v_max_cn INTEGER;
BEGIN
  FOR r IN SELECT id FROM company_settings LOOP
    -- Get max invoice number for this company
    SELECT COALESCE(MAX(
      CASE 
        WHEN invoice_number ~ '-[0-9]+$' 
        THEN (regexp_match(invoice_number, '-([0-9]+)$'))[1]::INTEGER
        ELSE 0
      END
    ), 0) INTO v_max_inv
    FROM invoices i
    JOIN company_settings cs ON cs.user_id::uuid = i.user_id
    WHERE cs.id = r.id AND i.document_type = 'invoice'::document_type;

    -- Get max credit note number
    SELECT COALESCE(MAX(
      CASE
        WHEN invoice_number ~ '-[0-9]+$' AND document_type = 'credit_note'::document_type
        THEN (regexp_match(invoice_number, '-([0-9]+)$'))[1]::INTEGER
        ELSE 0
      END
    ), 0) INTO v_max_cn
    FROM invoices i
    JOIN company_settings cs ON cs.user_id::uuid = i.user_id
    WHERE cs.id = r.id AND i.document_type = 'credit_note'::document_type;
    
    -- Upsert the sequence
    INSERT INTO invoice_sequences (company_id, invoice_sequence, credit_note_sequence)
    VALUES (r.id, v_max_inv, v_max_cn)
    ON CONFLICT (company_id) 
    DO UPDATE SET 
      invoice_sequence = GREATEST(invoice_sequences.invoice_sequence, v_max_inv),
      credit_note_sequence = GREATEST(invoice_sequences.credit_note_sequence, v_max_cn),
      updated_at = NOW();
  END LOOP;
END $$;

-- ============================================================================
-- STEP 5: Add helper function to get next number preview (for UI)
-- This doesn't increment, just shows what the next number will be
-- ============================================================================

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
  
  IF p_document_type = 'credit_note' THEN
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

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE invoice_sequences IS 'Stores sequential counters for invoice and credit note numbers per company';
COMMENT ON FUNCTION generate_invoice_number IS 'Atomically generates next invoice/credit note number. For credit notes linked to invoices, returns CN-{original_number}';
COMMENT ON FUNCTION preview_next_invoice_number IS 'Returns preview of next number without incrementing (for UI display)';
COMMENT ON FUNCTION auto_generate_invoice_number IS 'Trigger function to auto-assign invoice number on INSERT if not provided';
