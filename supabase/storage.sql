-- Storage bucket setup for organized file storage
-- Run this in Supabase SQL Editor

-- Create erpfiles bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('erpfiles', 'erpfiles', true)
ON CONFLICT (id) DO UPDATE
SET public = true;

-- Drop ALL existing policies for storage.objects to start fresh
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Users can update files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete files" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read" ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete" ON storage.objects;

-- IMPORTANT: Since we use NextAuth (not Supabase Auth), 
-- we need open policies for erpfiles bucket
-- In production, you should migrate to Supabase Auth or use service role key

-- Policy: Anyone can read files from erpfiles bucket
CREATE POLICY "Allow public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'erpfiles');

-- Policy: Anyone can upload files to erpfiles bucket
CREATE POLICY "Allow public upload"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'erpfiles');

-- Policy: Anyone can update files in erpfiles bucket
CREATE POLICY "Allow public update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'erpfiles')
WITH CHECK (bucket_id = 'erpfiles');

-- Policy: Anyone can delete files from erpfiles bucket
CREATE POLICY "Allow public delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'erpfiles');
