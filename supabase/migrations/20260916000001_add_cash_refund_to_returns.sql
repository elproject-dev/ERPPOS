ALTER TABLE public.sales_returns
ADD COLUMN IF NOT EXISTS cash_refund numeric(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS deducted_balance numeric(15,2) DEFAULT 0;
