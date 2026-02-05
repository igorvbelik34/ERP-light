-- ============================================================================
-- Add CR Certificate field to company_settings
-- Run this SQL in your Supabase Dashboard SQL Editor
-- ============================================================================

-- Add cr_certificate_url column
ALTER TABLE company_settings 
ADD COLUMN IF NOT EXISTS cr_certificate_url TEXT;

-- ============================================================================
-- Storage bucket for certificates (if not exists)
-- Create in Dashboard > Storage > New Bucket
-- Name: company-certificates
-- Public: false (private documents)
-- ============================================================================

-- Storage policies for certificates
-- Run after creating the bucket:

-- CREATE POLICY "Users can upload their own certificates"
--   ON storage.objects FOR INSERT
--   WITH CHECK (
--     bucket_id = 'company-certificates' AND
--     auth.uid()::text = (storage.foldername(name))[1]
--   );

-- CREATE POLICY "Users can view their own certificates"
--   ON storage.objects FOR SELECT
--   USING (
--     bucket_id = 'company-certificates' AND
--     auth.uid()::text = (storage.foldername(name))[1]
--   );

-- CREATE POLICY "Users can update their own certificates"
--   ON storage.objects FOR UPDATE
--   USING (
--     bucket_id = 'company-certificates' AND
--     auth.uid()::text = (storage.foldername(name))[1]
--   );

-- CREATE POLICY "Users can delete their own certificates"
--   ON storage.objects FOR DELETE
--   USING (
--     bucket_id = 'company-certificates' AND
--     auth.uid()::text = (storage.foldername(name))[1]
--   );
