-- Drop all existing restrictive or incorrect policies for avatars
DROP POLICY IF EXISTS "anon_insert_avatar" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload an avatar" ON storage.objects;

-- Create comprehensive policies for authenticated and anon users

-- Allow anyone to view avatars (since bucket is public, this is usually redundant but good for completeness)
CREATE POLICY "Public can view avatars"
ON storage.objects FOR SELECT
USING ( bucket_id = 'avatars' );

-- Allow authenticated users to upload their own avatar
CREATE POLICY "Authenticated users can insert avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'avatars' );

-- Allow anon to upload avatar (if registration requires uploading an avatar before being fully authenticated)
CREATE POLICY "Anon can insert avatars"
ON storage.objects FOR INSERT
TO anon
WITH CHECK ( bucket_id = 'avatars' );

-- Allow authenticated users to update their avatars
CREATE POLICY "Authenticated users can update avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'avatars' );

-- Allow authenticated users to delete their avatars
CREATE POLICY "Authenticated users can delete avatars"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'avatars' );
