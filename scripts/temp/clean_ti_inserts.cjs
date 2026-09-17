const fs = require('fs');
const file = 'src/mocks/api-client-react.ts';
let content = fs.readFileSync(file, 'utf8');

// The issue is objects being constructed and passed to supabase.from('transaction_items').insert(items)
// Let's remove `unit_name: ...`, `unit_qty: ...`, `conversion_factor: ...` from object literals in this file.

// Be careful to only remove them inside transaction_items related blocks or globally if they are only for transaction_items.
// Actually, they might be needed for UI logic? But if they are being inserted, it means they are part of the object mapped to `items`.
// Let's use regex to remove those fields globally from object literals being inserted.
content = content.replace(/unit_name:\s*[^,]+,/g, '');
content = content.replace(/unit_qty:\s*[^,]+,/g, '');
content = content.replace(/conversion_factor:\s*[^,]+,/g, '');

content = content.replace(/unit_name:\s*[^}]+(})?/g, (match, p1) => p1 ? '}' : '');
content = content.replace(/unit_qty:\s*[^}]+(})?/g, (match, p1) => p1 ? '}' : '');
content = content.replace(/conversion_factor:\s*[^}]+(})?/g, (match, p1) => p1 ? '}' : '');

// For the `select('product_id, quantity, unit_qty, unit_name, conversion_factor')`
content = content.replace(/select\('product_id, quantity, unit_qty, unit_name, conversion_factor'\)/g, "select('product_id, quantity')");

// For total_spent
content = content.replace(/select\('id,\s*name,\s*phone,\s*total_spent,\s*outlet_id'\)/g, "select('id, name, phone, outlet_id')");

// Fix sales_returns selects in case my previous replace was not perfect
content = content.replace(/sales_return_items\(\*,\s*products\(image_url,\s*product_uoms\(\*\)\),\s*transaction_items\(\*\)\)/g, "sales_return_items(*, products(image_url, product_uoms(*)))");

// Fix any customer_returns queries
content = content.replace(/from\('customer_returns'\)/g, "from('sales_returns')");

fs.writeFileSync(file, content, 'utf8');
console.log("Cleaned API queries and inserts");
