-- ============================================================================
-- Migration: Fix invoice_sequences INSERT policy
--
-- This adds the missing INSERT policy for invoice_sequences table.
-- Required for the auto_generate_invoice_number trigger to work correctly.
-- ============================================================================

-- Add INSERT policy (CREATE OR REPLACE not supported for policies, so use IF NOT EXISTS pattern)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'invoice_sequences'
    AND policyname = 'Users can insert own invoice sequences'
  ) THEN
    CREATE POLICY "Users can insert own invoice sequences"
    ON invoice_sequences FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM company_settings cs
        WHERE cs.id = invoice_sequences.company_id
        AND cs.user_id::uuid = auth.uid()
      )
    );
  END IF;
END $$;

-- ============================================================================
-- Ensure all companies have sequence records initialized
-- ============================================================================

INSERT INTO invoice_sequences (company_id, invoice_sequence, credit_note_sequence)
SELECT
  cs.id,
  COALESCE(
    (SELECT MAX(
      CASE
        WHEN i.invoice_number ~ '-[0-9]+$'
        THEN (regexp_match(i.invoice_number, '-([0-9]+)$'))[1]::INTEGER
        ELSE 0
      END
    ) FROM invoices i WHERE i.user_id = cs.user_id::uuid AND i.document_type = 'invoice'::document_type),
    0
  ),
  COALESCE(
    (SELECT MAX(
      CASE
        WHEN i.invoice_number ~ '-[0-9]+$' AND i.document_type = 'credit_note'::document_type
        THEN (regexp_match(i.invoice_number, '-([0-9]+)$'))[1]::INTEGER
        ELSE 0
      END
    ) FROM invoices i WHERE i.user_id = cs.user_id::uuid AND i.document_type = 'credit_note'::document_type),
    0
  )
FROM company_settings cs
WHERE NOT EXISTS (
  SELECT 1 FROM invoice_sequences seq WHERE seq.company_id = cs.id
);
