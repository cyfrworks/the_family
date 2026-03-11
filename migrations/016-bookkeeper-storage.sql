-- 016-bookkeeper-storage.sql
-- Create bookkeeper-files storage bucket and RLS policies
-- Files are stored at: {owner_id}/{bookkeeper_id}/{filename}

-- 1. Create the bucket (private, not public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('bookkeeper-files', 'bookkeeper-files', false)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS policies scoped to owner_id prefix
--    Path format: {owner_id}/{bookkeeper_id}/{filename}
--    auth.uid()::text must match the first path segment

CREATE POLICY "Users can upload own bookkeeper files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'bookkeeper-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view own bookkeeper files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'bookkeeper-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own bookkeeper files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'bookkeeper-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own bookkeeper files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'bookkeeper-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
