import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

if (urlMatch && keyMatch) {
  const url = urlMatch[1].trim().replace(/['"]/g, '');
  const key = keyMatch[1].trim().replace(/['"]/g, '');
  
  fetch(`${url}/rest/v1/sales_returns?select=*&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  })
  .then(res => res.json())
  .then(data => {
    console.log("sales_returns:", data.length > 0 ? Object.keys(data[0]) : "No data, can't infer");
  })
  .catch(err => console.log("FETCH ERROR:", err.message));
}
