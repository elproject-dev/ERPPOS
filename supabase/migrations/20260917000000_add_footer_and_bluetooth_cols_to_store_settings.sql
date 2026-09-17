-- Add footer_message2, footer_message3, show_footer, and bluetooth_store_name columns to store_settings table
ALTER TABLE public.store_settings 
    ADD COLUMN IF NOT EXISTS footer_message2 TEXT,
    ADD COLUMN IF NOT EXISTS footer_message3 TEXT,
    ADD COLUMN IF NOT EXISTS show_footer BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS bluetooth_store_name VARCHAR(255);
