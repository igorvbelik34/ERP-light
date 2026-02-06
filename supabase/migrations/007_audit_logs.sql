-- ============================================================================
-- Migration: Audit Logs for Financial Discipline
-- 
-- Business Rules:
-- 1. Draft invoices (is_locked=false) - can be edited and deleted
-- 2. Issued invoices (is_locked=true) - CANNOT be deleted, only Credit Note
-- 3. ALL operations are logged in audit_logs table
-- 
-- NO soft delete - simpler and cleaner approach:
-- - Draft: physical DELETE allowed (logged)
-- - Issued: DELETE prohibited (use Credit Note)
-- ============================================================================

-- ============================================================================
-- STEP 1: Create audit_logs table
-- Immutable log of all changes to financial tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What was changed
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  
  -- Who changed it
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- What happened
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  
  -- Old and new values as JSONB (complete row snapshots)
  old_values JSONB,
  new_values JSONB,
  
  -- Which fields changed (for easy filtering)
  changed_fields TEXT[],
  
  -- Human-readable description
  description TEXT,
  
  -- When
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS audit_logs_table_record_idx ON audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action);

-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can view audit logs for their own actions
DROP POLICY IF EXISTS "Users can view own audit logs" ON audit_logs;
CREATE POLICY "Users can view own audit logs"
ON audit_logs FOR SELECT
USING (auth.uid() = user_id::uuid);

-- System can insert (via SECURITY DEFINER functions)
DROP POLICY IF EXISTS "System can insert audit logs" ON audit_logs;
CREATE POLICY "System can insert audit logs"
ON audit_logs FOR INSERT
WITH CHECK (true);

-- IMPORTANT: No UPDATE or DELETE policies - audit logs are immutable!

-- ============================================================================
-- STEP 2: Helper function to write audit log
-- ============================================================================

CREATE OR REPLACE FUNCTION write_audit_log(
  p_table_name TEXT,
  p_record_id UUID,
  p_action TEXT,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL,
  p_changed_fields TEXT[] DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO audit_logs (
    table_name,
    record_id,
    user_id,
    action,
    old_values,
    new_values,
    changed_fields,
    description
  ) VALUES (
    p_table_name,
    p_record_id,
    auth.uid(),
    p_action,
    p_old_values,
    p_new_values,
    p_changed_fields,
    p_description
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 3: Helper function to detect changed fields
-- ============================================================================

CREATE OR REPLACE FUNCTION get_changed_fields(old_row JSONB, new_row JSONB)
RETURNS TEXT[] AS $$
DECLARE
  changed TEXT[] := '{}';
  key TEXT;
BEGIN
  FOR key IN SELECT jsonb_object_keys(new_row)
  LOOP
    -- Skip timestamp fields
    IF key IN ('updated_at', 'created_at') THEN
      CONTINUE;
    END IF;
    
    IF (old_row->key IS DISTINCT FROM new_row->key) THEN
      changed := array_append(changed, key);
    END IF;
  END LOOP;
  
  RETURN changed;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- STEP 4: Trigger - LOG and CONTROL DELETE on invoices
-- Draft: allow DELETE (log it)
-- Issued: block DELETE (must use Credit Note)
-- ============================================================================

CREATE OR REPLACE FUNCTION control_invoice_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if invoice is locked (issued)
  IF OLD.is_locked = true THEN
    -- Log the blocked attempt
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
  
  -- Draft invoice - allow deletion but log it
  PERFORM write_audit_log(
    'invoices',
    OLD.id,
    'DELETE',
    to_jsonb(OLD),
    NULL,
    NULL,
    'Draft invoice ' || OLD.invoice_number || ' deleted'
  );
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS control_invoice_delete_trigger ON invoices;
DROP TRIGGER IF EXISTS prevent_invoice_delete_trigger ON invoices;
CREATE TRIGGER control_invoice_delete_trigger
BEFORE DELETE ON invoices
FOR EACH ROW EXECUTE FUNCTION control_invoice_delete();

-- ============================================================================
-- STEP 5: Trigger - LOG INSERT on invoices
-- ============================================================================

CREATE OR REPLACE FUNCTION log_invoice_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_doc_type TEXT;
BEGIN
  v_doc_type := CASE WHEN NEW.document_type = 'credit_note' THEN 'Credit Note' ELSE 'Invoice' END;
  
  PERFORM write_audit_log(
    'invoices',
    NEW.id,
    'INSERT',
    NULL,
    to_jsonb(NEW),
    NULL,
    v_doc_type || ' ' || NEW.invoice_number || ' created'
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS log_invoice_insert_trigger ON invoices;
DROP TRIGGER IF EXISTS audit_invoice_insert_trigger ON invoices;
CREATE TRIGGER log_invoice_insert_trigger
AFTER INSERT ON invoices
FOR EACH ROW EXECUTE FUNCTION log_invoice_insert();

-- ============================================================================
-- STEP 6: Trigger - LOG UPDATE on invoices
-- ============================================================================

CREATE OR REPLACE FUNCTION log_invoice_update()
RETURNS TRIGGER AS $$
DECLARE
  v_old_json JSONB;
  v_new_json JSONB;
  v_changed_fields TEXT[];
  v_description TEXT;
BEGIN
  v_old_json := to_jsonb(OLD);
  v_new_json := to_jsonb(NEW);
  v_changed_fields := get_changed_fields(v_old_json, v_new_json);
  
  -- Skip if nothing meaningful changed
  IF array_length(v_changed_fields, 1) IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Build description based on what changed
  IF 'status' = ANY(v_changed_fields) THEN
    v_description := 'Status: ' || OLD.status || ' → ' || NEW.status;
  ELSIF 'is_locked' = ANY(v_changed_fields) AND NEW.is_locked = true THEN
    v_description := 'Invoice issued (locked)';
  ELSE
    v_description := 'Updated: ' || array_to_string(v_changed_fields, ', ');
  END IF;
  
  PERFORM write_audit_log(
    'invoices',
    NEW.id,
    'UPDATE',
    v_old_json,
    v_new_json,
    v_changed_fields,
    OLD.invoice_number || ': ' || v_description
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS log_invoice_update_trigger ON invoices;
DROP TRIGGER IF EXISTS audit_invoice_update_trigger ON invoices;
CREATE TRIGGER log_invoice_update_trigger
AFTER UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION log_invoice_update();

-- ============================================================================
-- STEP 7: Trigger - CONTROL DELETE on invoice_items
-- Only allow deletion if parent invoice is not locked
-- ============================================================================

CREATE OR REPLACE FUNCTION control_invoice_items_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice RECORD;
BEGIN
  SELECT invoice_number, is_locked INTO v_invoice
  FROM invoices WHERE id = OLD.invoice_id;
  
  IF v_invoice.is_locked = true THEN
    PERFORM write_audit_log(
      'invoice_items',
      OLD.id,
      'DELETE',
      to_jsonb(OLD),
      NULL,
      NULL,
      'DELETE BLOCKED: Item from locked invoice ' || v_invoice.invoice_number
    );
    
    RAISE EXCEPTION 'Cannot delete items from issued invoice %', v_invoice.invoice_number;
  END IF;
  
  -- Log successful deletion
  PERFORM write_audit_log(
    'invoice_items',
    OLD.id,
    'DELETE',
    to_jsonb(OLD),
    NULL,
    NULL,
    'Item deleted from draft invoice ' || v_invoice.invoice_number
  );
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS control_invoice_items_delete_trigger ON invoice_items;
DROP TRIGGER IF EXISTS prevent_invoice_items_delete_trigger ON invoice_items;
DROP TRIGGER IF EXISTS prevent_locked_invoice_items_trigger ON invoice_items;
CREATE TRIGGER control_invoice_items_delete_trigger
BEFORE DELETE ON invoice_items
FOR EACH ROW EXECUTE FUNCTION control_invoice_items_delete();

-- ============================================================================
-- STEP 8: Useful views for audit queries
-- ============================================================================

-- Recent audit activity
CREATE OR REPLACE VIEW recent_audit_logs AS
SELECT 
  al.id,
  al.table_name,
  al.record_id,
  al.action,
  al.description,
  al.changed_fields,
  al.created_at,
  p.email as user_email,
  p.full_name as user_name
FROM audit_logs al
LEFT JOIN profiles p ON p.id = al.user_id
ORDER BY al.created_at DESC
LIMIT 100;

-- Invoice history with full details
CREATE OR REPLACE VIEW invoice_audit_history AS
SELECT 
  al.id as log_id,
  al.record_id as invoice_id,
  COALESCE(
    al.new_values->>'invoice_number',
    al.old_values->>'invoice_number'
  ) as invoice_number,
  al.action,
  al.description,
  al.changed_fields,
  al.old_values,
  al.new_values,
  al.created_at,
  p.email as changed_by
FROM audit_logs al
LEFT JOIN profiles p ON p.id = al.user_id
WHERE al.table_name = 'invoices'
ORDER BY al.created_at DESC;

-- ============================================================================
-- STEP 9: Remove soft delete columns if they exist (cleanup)
-- ============================================================================

ALTER TABLE invoices DROP COLUMN IF EXISTS is_deleted;
ALTER TABLE invoices DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE invoices DROP COLUMN IF EXISTS deleted_by;

-- Drop soft delete function if exists
DROP FUNCTION IF EXISTS soft_delete_invoice(UUID);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE audit_logs IS 'Immutable log of all changes to financial documents. Cannot be modified or deleted.';
COMMENT ON COLUMN audit_logs.old_values IS 'Complete row snapshot BEFORE the change';
COMMENT ON COLUMN audit_logs.new_values IS 'Complete row snapshot AFTER the change';
COMMENT ON COLUMN audit_logs.changed_fields IS 'List of field names that were modified';
COMMENT ON COLUMN audit_logs.description IS 'Human-readable description of what happened';

COMMENT ON FUNCTION write_audit_log IS 'Internal function to record changes. Called by triggers.';
COMMENT ON FUNCTION control_invoice_delete IS 'Allows DELETE only for draft invoices. Logs all attempts.';
COMMENT ON FUNCTION control_invoice_items_delete IS 'Allows DELETE only for items of draft invoices.';
