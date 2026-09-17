const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from('transaction_items').insert([{
    owner_id: "test", transaction_id: "test", product_id: "test", product_name: "test", quantity: 1, price: 1, original_price: 1, discount_amount: 1, subtotal: 1
  }]);
  console.log("Error:", error);
}
test();
