-- ============================================================================
-- Migration: Fix cancelled invoice logic
--
-- Business Rules:
-- 1. Draft (not locked) - can be soft-deleted
-- 2. Cancelled (not locked) - can be soft-deleted (was cancelled before sending)
-- 3. Cancelled (locked) - can issue credit note (rare case)
-- 4. Sent/Paid/Overdue (locked) - only credit note
-- 5. Voided - no actions (already reversed)
-- ============================================================================

-- Update soft_delete_invoice function to allow deleting cancelled invoices
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

  -- Allow soft delete for:
  -- 1. Draft invoices (not locked)
  -- 2. Cancelled invoices (not locked) - cancelled before being sent
  IF v_invoice.is_locked THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot delete issued invoice ' || v_invoice.invoice_number || '. Use Credit Note to reverse it.'
    );
  END IF;

  IF v_invoice.status NOT IN ('draft', 'cancelled') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot delete invoice with status ' || v_invoice.status || '. Only draft and cancelled invoices can be deleted.'
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
    v_invoice.status || ' invoice ' || v_invoice.invoice_number || ' soft-deleted'
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Invoice ' || v_invoice.invoice_number || ' deleted successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the delete trigger
CREATE OR REPLACE FUNCTION control_invoice_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Block all physical deletes - use soft_delete_invoice() function instead
  -- This ensures audit trail is always preserved

  IF OLD.is_deleted THEN
    RAISE EXCEPTION 'Cannot permanently delete invoice %. Invoice is archived for audit purposes.', OLD.invoice_number;
  END IF;

  IF OLD.is_locked THEN
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

  IF OLD.status NOT IN ('draft', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot delete invoice % with status %. Only draft and cancelled invoices can be deleted.', OLD.invoice_number, OLD.status;
  END IF;

  -- Redirect to soft delete
  RAISE EXCEPTION 'Use soft_delete_invoice() function to delete invoices for proper audit trail.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
