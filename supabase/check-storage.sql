-- Check if erpfiles bucket exists
SELECT * FROM storage.buckets WHERE id = 'erpfiles';

-- Check storage policies
SELECT * FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';
