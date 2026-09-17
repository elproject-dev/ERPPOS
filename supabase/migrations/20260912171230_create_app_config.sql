CREATE TABLE IF NOT EXISTS public.app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Allow anonymous and authenticated read access
CREATE POLICY "Allow public read access to app_config" 
ON public.app_config FOR SELECT 
TO public 
USING (true);

-- Allow admin to insert/update/delete
CREATE POLICY "Allow admin full access to app_config" 
ON public.app_config FOR ALL 
TO authenticated 
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Insert initial values
INSERT INTO public.app_config (key, value) VALUES 
('app_version_latest', '1.0.0')
ON CONFLICT (key) DO NOTHING;

-- Grant permissions to roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_config TO anon, authenticated;
