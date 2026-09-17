-- Fix RLS policies for transaction_payments
-- The app uses anon key (no Supabase session), so policies must allow anon role

DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.transaction_payments;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.transaction_payments;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.transaction_payments;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.transaction_payments;
DROP POLICY IF EXISTS "allow_all_transaction_payments" ON public.transaction_payments;

-- Allow all operations for anon (same pattern as other tables in this app)
CREATE POLICY "allow_all_transaction_payments" ON public.transaction_payments
    FOR ALL USING (true) WITH CHECK (true);
