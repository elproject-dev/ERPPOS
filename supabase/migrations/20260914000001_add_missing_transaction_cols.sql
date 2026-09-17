-- Add remaining_balance to transactions if it doesn't exist
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS remaining_balance DECIMAL(12, 2) DEFAULT 0;

-- Create store_settings table
CREATE TABLE IF NOT EXISTS public.store_settings (
    id INT PRIMARY KEY DEFAULT 1,
    name VARCHAR(255) NOT NULL DEFAULT 'EL PROJECT',
    address TEXT,
    phone VARCHAR(50),
    footer_message TEXT,
    bank_name VARCHAR(100),
    bank_account VARCHAR(100),
    bank_account_name VARCHAR(100),
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT store_settings_id_check CHECK (id = 1)
);

-- Enable RLS for store_settings
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Enable read access for all users" ON public.store_settings;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.store_settings;

-- Create policies for store_settings
CREATE POLICY "Enable read access for all users" ON public.store_settings
    FOR SELECT USING (true);

CREATE POLICY "Enable all access for authenticated users" ON public.store_settings
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
