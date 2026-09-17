-- 1. Add customer_id_manual to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_id_manual VARCHAR(100) UNIQUE;

-- 2. Create stock_movements table
CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL, -- Positive for in, Negative for out
  type VARCHAR(50) NOT NULL, -- 'restock', 'transfer_to_sales', 'return_from_sales', 'adjustment', 'sale'
  reference_id TEXT, -- Links to loading_session_id or transaction_id (we use TEXT for flexibility)
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Enable RLS for stock_movements
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- 4. Create allow-all policy for stock_movements
DO $$ BEGIN DROP POLICY IF EXISTS "allow_all_stock_movements" ON stock_movements; EXCEPTION WHEN OTHERS THEN END; $$;
CREATE POLICY "allow_all_stock_movements" ON stock_movements FOR ALL USING (true) WITH CHECK (true);
