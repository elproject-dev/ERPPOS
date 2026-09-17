-- 1. Multi UOM
CREATE TABLE IF NOT EXISTS product_uoms (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  unit_name VARCHAR(50) NOT NULL,
  conversion_factor INTEGER NOT NULL DEFAULT 1,
  price DECIMAL(12, 2),
  barcode VARCHAR(100),
  sort_order INTEGER DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(product_id, unit_name)
);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS due_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'paid';

-- 2. Customer Returns
CREATE TABLE IF NOT EXISTS sales_returns (
  id BIGSERIAL PRIMARY KEY,
  transaction_id BIGINT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  cashier_name VARCHAR(255),
  total_refund DECIMAL(12, 2) NOT NULL DEFAULT 0,
  reason VARCHAR(255) NOT NULL,
  notes TEXT,
  status VARCHAR(50) DEFAULT 'completed',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sales_return_items (
  id BIGSERIAL PRIMARY KEY,
  return_id BIGINT NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
  transaction_item_id BIGINT NOT NULL REFERENCES transaction_items(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  refund_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  condition VARCHAR(50) DEFAULT 'good',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Expenses
CREATE TABLE IF NOT EXISTS expense_categories (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS expenses (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  description TEXT NOT NULL,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  receipt_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS outlet_id BIGINT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS supplier_id BIGINT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';

-- 4. FMCG Workflow (Visit Logs)
CREATE TABLE IF NOT EXISTS visit_schedules (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sales_id UUID,
  scheduled_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS visit_logs (
  id BIGSERIAL PRIMARY KEY,
  schedule_id BIGINT REFERENCES visit_schedules(id) ON DELETE SET NULL,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sales_id UUID,
  visited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  status VARCHAR(50) NOT NULL,
  notes TEXT,
  photo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Enable (safe to do multiple times)
ALTER TABLE product_uoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_logs ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now to fix errors quickly
DO $$ BEGIN DROP POLICY IF EXISTS "allow_all_product_uoms" ON product_uoms; EXCEPTION WHEN OTHERS THEN END; $$;
CREATE POLICY "allow_all_product_uoms" ON product_uoms FOR ALL USING (true) WITH CHECK (true);

DO $$ BEGIN DROP POLICY IF EXISTS "allow_all_sales_returns" ON sales_returns; EXCEPTION WHEN OTHERS THEN END; $$;
CREATE POLICY "allow_all_sales_returns" ON sales_returns FOR ALL USING (true) WITH CHECK (true);

DO $$ BEGIN DROP POLICY IF EXISTS "allow_all_sales_return_items" ON sales_return_items; EXCEPTION WHEN OTHERS THEN END; $$;
CREATE POLICY "allow_all_sales_return_items" ON sales_return_items FOR ALL USING (true) WITH CHECK (true);

DO $$ BEGIN DROP POLICY IF EXISTS "allow_all_expense_categories" ON expense_categories; EXCEPTION WHEN OTHERS THEN END; $$;
CREATE POLICY "allow_all_expense_categories" ON expense_categories FOR ALL USING (true) WITH CHECK (true);

DO $$ BEGIN DROP POLICY IF EXISTS "allow_all_expenses" ON expenses; EXCEPTION WHEN OTHERS THEN END; $$;
CREATE POLICY "allow_all_expenses" ON expenses FOR ALL USING (true) WITH CHECK (true);

DO $$ BEGIN DROP POLICY IF EXISTS "allow_all_visit_schedules" ON visit_schedules; EXCEPTION WHEN OTHERS THEN END; $$;
CREATE POLICY "allow_all_visit_schedules" ON visit_schedules FOR ALL USING (true) WITH CHECK (true);

DO $$ BEGIN DROP POLICY IF EXISTS "allow_all_visit_logs" ON visit_logs; EXCEPTION WHEN OTHERS THEN END; $$;
CREATE POLICY "allow_all_visit_logs" ON visit_logs FOR ALL USING (true) WITH CHECK (true);

