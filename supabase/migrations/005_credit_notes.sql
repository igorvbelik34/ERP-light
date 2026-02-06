-- ============================================================================
-- Migration: Add Credit Note support
-- Implements immutable invoices + credit note workflow
-- 
-- Business Rules:
-- 1. Invoices in 'draft' status can be edited freely
-- 2. Once issued (sent/paid/etc), invoices become immutable (is_locked = true)
-- 3. To correct an issued invoice: create Credit Note + new Invoice
-- 4. Credit Notes have negative amounts and reference the original invoice
-- ============================================================================

-- 1. Add document_type enum (separate from invoice direction type)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_type') THEN
    CREATE TYPE document_type AS ENUM ('invoice', 'credit_note');
  END IF;
END $$;

-- 2. Add new columns to invoices table
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS document_type document_type DEFAULT 'invoice' NOT NULL,
ADD COLUMN IF NOT EXISTS related_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS correction_reason TEXT,
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false NOT NULL;

-- 3. Add new invoice status for voided invoices
-- Note: We add 'voided' status for invoices that have been credit-noted
DO $$
BEGIN
  -- Check if 'voided' already exists in the enum
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'voided' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'invoice_status')
  ) THEN
    ALTER TYPE invoice_status ADD VALUE 'voided';
  END IF;
END $$;

-- 4. Add credit note prefix and numbering to company_settings
ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS credit_note_prefix TEXT DEFAULT 'CN',
ADD COLUMN IF NOT EXISTS credit_note_next_number INTEGER DEFAULT 1;

-- 5. Index for related invoices lookup
CREATE INDEX IF NOT EXISTS idx_invoices_related_invoice_id 
ON invoices(related_invoice_id) WHERE related_invoice_id IS NOT NULL;

-- 6. Index for document type
CREATE INDEX IF NOT EXISTS idx_invoices_document_type ON invoices(document_type);

-- ============================================================================
-- TRIGGER: Lock invoice when status changes from draft
-- ============================================================================

CREATE OR REPLACE FUNCTION lock_invoice_on_issue()
RETURNS TRIGGER AS $$
BEGIN
  -- Lock the invoice when moving from 'draft' to any other status
  IF OLD.status = 'draft' AND NEW.status != 'draft' THEN
    NEW.is_locked = true;
  END IF;
  
  -- Prevent changes to locked invoices (except status updates)
  IF OLD.is_locked = true AND NEW.is_locked = true THEN
    -- Only allow status changes and updated_at, nothing else
    IF OLD.client_id != NEW.client_id OR
       OLD.invoice_number != NEW.invoice_number OR
       OLD.issue_date != NEW.issue_date OR
       OLD.due_date != NEW.due_date OR
       OLD.tax_rate != NEW.tax_rate OR
       OLD.notes IS DISTINCT FROM NEW.notes OR
       OLD.currency IS DISTINCT FROM NEW.currency OR
       OLD.document_type != NEW.document_type OR
       OLD.related_invoice_id IS DISTINCT FROM NEW.related_invoice_id OR
       OLD.correction_reason IS DISTINCT FROM NEW.correction_reason THEN
      RAISE EXCEPTION 'Cannot modify locked invoice. Create a credit note instead.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lock_invoice_trigger ON invoices;
CREATE TRIGGER lock_invoice_trigger
BEFORE UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION lock_invoice_on_issue();

-- ============================================================================
-- TRIGGER: Prevent changes to invoice_items of locked invoices
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_locked_invoice_items_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_is_locked BOOLEAN;
BEGIN
  -- Get lock status of parent invoice
  IF TG_OP = 'DELETE' THEN
    SELECT is_locked INTO v_is_locked FROM invoices WHERE id = OLD.invoice_id;
  ELSE
    SELECT is_locked INTO v_is_locked FROM invoices WHERE id = NEW.invoice_id;
  END IF;
  
  IF v_is_locked = true THEN
    RAISE EXCEPTION 'Cannot modify items of a locked invoice. Create a credit note instead.';
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_locked_invoice_items_trigger ON invoice_items;
CREATE TRIGGER prevent_locked_invoice_items_trigger
BEFORE INSERT OR UPDATE OR DELETE ON invoice_items
FOR EACH ROW EXECUTE FUNCTION prevent_locked_invoice_items_changes();

-- ============================================================================
-- Lock existing non-draft invoices (data migration)
-- ============================================================================

UPDATE invoices 
SET is_locked = true 
WHERE status != 'draft' AND is_locked = false;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN invoices.document_type IS 'Document type: invoice or credit_note';
COMMENT ON COLUMN invoices.related_invoice_id IS 'For credit_note: references the original invoice being reversed. For replacement invoice: can reference the credit note.';
COMMENT ON COLUMN invoices.correction_reason IS 'Reason for issuing credit note (required for credit notes)';
COMMENT ON COLUMN invoices.is_locked IS 'True when invoice is issued (non-draft status). Prevents any modifications except status changes.';
COMMENT ON TYPE document_type IS 'Document type: regular invoice or credit note (reversal document)';
COMMENT ON COLUMN company_settings.credit_note_prefix IS 'Prefix for credit note numbers (default: CN)';
COMMENT ON COLUMN company_settings.credit_note_next_number IS 'Next sequential number for credit notes';
