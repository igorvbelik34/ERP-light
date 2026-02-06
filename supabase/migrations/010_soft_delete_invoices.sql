-- ============================================================================
-- Migration: Add soft delete support for invoices
--
-- Business Rules:
-- 1. Draft invoices can be soft-deleted (marked as deleted but kept for audit)
-- 2. Issued invoices (sent/paid/etc) cannot be deleted - use Credit Note
-- 3. All invoices are shown in UI, deleted ones appear faded
-- ============================================================================

-- Add soft delete columns
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

-- Index for filtering deleted invoices
CREATE INDEX IF NOT EXISTS idx_invoices_is_deleted ON invoices(is_deleted);

-- ============================================================================
-- Function: Soft delete a draft invoice
-- Only drafts can be soft-deleted, issued invoices must use Credit Note
-- ============================================================================

CREATE OR REPLACE FUNCTION soft_delete_invoice(p_invoice_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_invoice RECORD;
  v_result JSONB;
BEGIN
  -- Get invoice details
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;

  IF v_invoice IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  -- Check if already deleted
  IF v_invoice.is_deleted THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice is already deleted');
  END IF;

  -- Only allow soft delete for drafts
  IF v_invoice.status != 'draft' OR v_invoice.is_locked THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot delete issued invoice. Use Credit Note to reverse invoice ' || v_invoice.invoice_number
    );
  END IF;

  -- Perform soft delete
  UPDATE invoices
  SET
    is_deleted = true,
    deleted_at = NOW(),
    deleted_by = auth.uid(),
    updated_at = NOW()
  WHERE id = p_invoice_id;

  -- Log the deletion
  PERFORM write_audit_log(
    'invoices',
    p_invoice_id,
    'DELETE',
    to_jsonb(v_invoice),
    NULL,
    ARRAY['is_deleted', 'deleted_at', 'deleted_by'],
    'Draft invoice ' || v_invoice.invoice_number || ' soft-deleted'
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Invoice ' || v_invoice.invoice_number || ' deleted successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Function: Restore a soft-deleted invoice
-- ============================================================================

CREATE OR REPLACE FUNCTION restore_invoice(p_invoice_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_invoice RECORD;
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;

  IF v_invoice IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF NOT v_invoice.is_deleted THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice is not deleted');
  END IF;

  -- Restore invoice
  UPDATE invoices
  SET
    is_deleted = false,
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = NOW()
  WHERE id = p_invoice_id;

  -- Log the restoration
  PERFORM write_audit_log(
    'invoices',
    p_invoice_id,
    'UPDATE',
    to_jsonb(v_invoice),
    (SELECT to_jsonb(i) FROM invoices i WHERE i.id = p_invoice_id),
    ARRAY['is_deleted', 'deleted_at', 'deleted_by'],
    'Invoice ' || v_invoice.invoice_number || ' restored'
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Invoice ' || v_invoice.invoice_number || ' restored successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Update the delete trigger to use soft delete for drafts
-- ============================================================================

CREATE OR REPLACE FUNCTION control_invoice_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Block all physical deletes - use soft_delete_invoice() function instead
  -- This ensures audit trail is always preserved

  IF OLD.is_deleted THEN
    -- Already soft-deleted, block physical delete
    RAISE EXCEPTION 'Cannot permanently delete invoice %. Invoice is archived for audit purposes.', OLD.invoice_number;
  END IF;

  IF OLD.is_locked OR OLD.status != 'draft' THEN
    -- Issued invoice - must use Credit Note
    PERFORM write_audit_log(
      'invoices',
      OLD.id,
      'DELETE',
      to_jsonb(OLD),
      NULL,
      NULL,
      'DELETE BLOCKED: Invoice ' || OLD.invoice_number || ' is issued. Use Credit Note to reverse.'
    );
    RAISE EXCEPTION 'Cannot delete issued invoice %. Create a Credit Note instead.', OLD.invoice_number;
  END IF;

  -- For drafts, redirect to soft delete
  RAISE EXCEPTION 'Use soft_delete_invoice() function to delete draft invoices for proper audit trail.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN invoices.is_deleted IS 'Soft delete flag - invoice is hidden but preserved for audit';
COMMENT ON COLUMN invoices.deleted_at IS 'Timestamp when invoice was soft-deleted';
COMMENT ON COLUMN invoices.deleted_by IS 'User who soft-deleted the invoice';
COMMENT ON FUNCTION soft_delete_invoice IS 'Soft-deletes a draft invoice. Returns JSON with success status and message.';
COMMENT ON FUNCTION restore_invoice IS 'Restores a soft-deleted invoice. Returns JSON with success status and message.';
