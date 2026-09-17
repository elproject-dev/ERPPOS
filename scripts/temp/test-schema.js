import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase
    .from('sales_returns')
    .select('*')
    .limit(1);
  console.log("returns:", Object.keys(data?.[0] || {}));
  
  const { data: d2 } = await supabase
    .from('sales_return_items')
    .select('*')
    .limit(1);
  console.log("return_items:", Object.keys(d2?.[0] || {}));
}
check().catch(console.error);
