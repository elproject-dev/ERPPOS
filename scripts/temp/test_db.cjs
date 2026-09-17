const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log("No supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: c, error: ce } = await supabase.from('customers').select('*').limit(1);
  console.log("Customers:", Object.keys(c?.[0] || {}), "Error:", ce?.message);

  const { data: sr, error: sre } = await supabase.from('sales_returns').select('*').limit(1);
  console.log("Sales Returns:", Object.keys(sr?.[0] || {}), "Error:", sre?.message);

  const { data: sri, error: srie } = await supabase.from('sales_return_items').select('*').limit(1);
  console.log("Sales Return Items:", Object.keys(sri?.[0] || {}), "Error:", srie?.message);

  const { data: ti, error: tie } = await supabase.from('transaction_items').select('*').limit(1);
  console.log("Transaction Items:", Object.keys(ti?.[0] || {}), "Error:", tie?.message);
}
test();
