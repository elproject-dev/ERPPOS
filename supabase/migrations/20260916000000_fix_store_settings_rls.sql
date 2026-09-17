-- Fix RLS policies for store_settings
-- The app uses anon key, so policies must allow anon role

DROP POLICY IF EXISTS "Enable read access for all users" ON public.store_settings;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.store_settings;

-- Allow all operations for anon (same pattern as transaction_payments)
CREATE POLICY "allow_all_store_settings" ON public.store_settings
    FOR ALL USING (true) WITH CHECK (true);
