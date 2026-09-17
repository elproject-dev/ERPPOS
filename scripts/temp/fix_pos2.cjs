const fs = require('fs');
const file = 'src/pages/pos.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace updateCustomerData body with just returning true, as total_spent is no longer updated here.
const updateCustomerDataRegex = /const updateCustomerData = async \([^)]+\) => \{[\s\S]*?\} catch \(err\) \{[\s\S]*?return false;\s*\n\s*\};\n/g;

const emptyUpdateCustomerData = `const updateCustomerData = async (customerId: number, transactionTotal: number) => {
    // total_spent is no longer a column, so we don't need to manually update it here
    return true;
  };
`;

content = content.replace(updateCustomerDataRegex, emptyUpdateCustomerData);

// also check if there are other `total_spent` issues in dashboard.tsx
// src/pages/dashboard.tsx:937:                        const maxSpent = topList[0]?.total_spent || 1;
// src/pages/dashboard.tsx:940:                          const percentage = Math.max((customer.total_spent / maxSpent) * 100, 2);
// src/pages/dashboard.tsx:960:                                    {formatRupiah(customer.total_spent || 0)}

fs.writeFileSync(file, content, 'utf8');
console.log("Fixed pos.tsx again");
