const fs = require('fs');
const file = 'src/mocks/api-client-react.ts';
let content = fs.readFileSync(file, 'utf8');

// 1. Remove total_spent from customers
content = content.replace(/select\('id, name, phone, total_spent, outlet_id'\)/g, "select('id, name, phone, outlet_id')");

// 2. Remove conversion_factor, unit_name, unit_qty from transaction_items
content = content.replace(/select\('\*, products\(image_url, product_uoms\(\*\)\), transaction_items\(\*\)'\)/g, "select('*, products(image_url, product_uoms(*))')");
content = content.replace(/sales_return_items\(\*, products\(image_url, product_uoms\(\*\)\), transaction_items\(\*\)\)/g, "sales_return_items(*, products(image_url, product_uoms(*)))");

// 3. Fix transaction_items column insertions/selects
content = content.replace(/"unit_name", "unit_qty", "conversion_factor"/g, "");
// also if it's like unit_name, unit_qty, conversion_factor
content = content.replace(/,\s*unit_name\s*,\s*unit_qty\s*,\s*conversion_factor/g, "");
content = content.replace(/,\s*"unit_name"\s*,\s*"unit_qty"\s*,\s*"conversion_factor"/g, "");

// 4. Fix customer_returns -> sales_returns
// Wait, is there `customer_returns`? Let's check:
content = content.replace(/\.from\('customer_returns'\)/g, ".from('sales_returns')");

fs.writeFileSync(file, content, 'utf8');
console.log("Fixed issues in api-client-react.ts");
