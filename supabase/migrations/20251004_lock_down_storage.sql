-- LOCK DOWN STORAGE ACCESS
-- Ensure bucket is private, use signed URLs only

-- Ensure bucket is private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'claim-letters';

-- Drop existing policies
DROP POLICY IF EXISTS "Users can upload own claim files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own claim files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own claim files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own claim files" ON storage.objects;

-- STRICT STORAGE POLICIES: User can only access their own folder

-- Upload policy: Users can only upload to their own user_id folder
CREATE POLICY "Users can upload to own folder only" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'claim-letters' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- View policy: Users can only view files in their own folder
CREATE POLICY "Users can view own folder only" ON storage.objects
FOR SELECT USING (
  bucket_id = 'claim-letters' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Update policy: Users can only update files in their own folder
CREATE POLICY "Users can update own folder only" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'claim-letters' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Delete policy: Users can only delete files in their own folder
CREATE POLICY "Users can delete own folder only" ON storage.objects
FOR DELETE USING (
  bucket_id = 'claim-letters' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Service role has full access (for backend functions)
CREATE POLICY "Service role has full access" ON storage.objects
FOR ALL USING (
  auth.jwt()->>'role' = 'service_role'
);

COMMENT ON TABLE storage.objects IS 'Storage objects with strict RLS - users can only access their own folders';
