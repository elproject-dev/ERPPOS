import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

if (urlMatch && keyMatch) {
  const supabase = createClient(urlMatch[1].trim().replace(/['"]/g, ''), keyMatch[1].trim().replace(/['"]/g, ''));
  supabase
    .from('sales_returns')
    .select('id, created_at, total_refund, sales_return_items(product_id, quantity)')
    .eq('status', 'completed')
    .then(res => {
      console.log("RESPONSE:", JSON.stringify(res, null, 2));
    });
}
