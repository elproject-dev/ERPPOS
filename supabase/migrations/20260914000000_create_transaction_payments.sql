-- Create transaction_payments table
CREATE TABLE IF NOT EXISTS public.transaction_payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    transaction_id BIGINT REFERENCES public.transactions(id) ON DELETE CASCADE NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    payment_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    notes TEXT,
    status VARCHAR(50) DEFAULT 'pending' NOT NULL,
    cashier_name VARCHAR(100),
    confirmed_by VARCHAR(100),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    proof_image TEXT,
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable realtime replication
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'transaction_payments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.transaction_payments;
    END IF;
END $$;

-- Enable RLS
ALTER TABLE public.transaction_payments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Enable read access for all users" ON public.transaction_payments;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.transaction_payments;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.transaction_payments;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.transaction_payments;

-- Create policies
CREATE POLICY "Enable read access for all users" ON public.transaction_payments
    FOR SELECT USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON public.transaction_payments
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users" ON public.transaction_payments
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Enable delete access for authenticated users" ON public.transaction_payments
    FOR DELETE TO authenticated USING (true);
