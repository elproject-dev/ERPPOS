const fs = require('fs');
const file = 'src/mocks/api-client-react.ts';
let content = fs.readFileSync(file, 'utf8');

// The select statement uses return_items, but the table has sales_return_items
content = content.replace(/return_items\(product_id,\s*quantity,\s*refund_amount,\s*subtotal\)/g, "sales_return_items(product_id, quantity, refund_amount, subtotal)");

// Also update the fallback code that accesses ret.return_items
content = content.replace(/\(ret\.return_items/g, "(ret.sales_return_items");

fs.writeFileSync(file, content, 'utf8');
console.log("Fixed return_items -> sales_return_items");
