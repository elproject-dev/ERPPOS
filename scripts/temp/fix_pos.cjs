const fs = require('fs');
const file = 'src/pages/pos.tsx';
let content = fs.readFileSync(file, 'utf8');

// The issue in pos.tsx:
// src/pages/pos.tsx:721:        .select('total_spent')
// src/pages/pos.tsx:729:      const currentTotalSpent = customer?.total_spent || 0;
// src/pages/pos.tsx:739:            total_spent: newTotalSpent
// src/pages/pos.tsx:995:        // Update customer data langsung (total_spent)

// Let's remove total_spent entirely from pos.tsx where it interacts with the database.

// Replace `.select('total_spent')` with `.select('id')` just to check if exists, or remove it if not needed.
// Around line 721, it's probably fetching the current total_spent to add to it.
content = content.replace(/\.select\('total_spent'\)/g, ".select('id')");

// Also remove `total_spent: newTotalSpent` in the update payload.
// We can just use a regex to match `total_spent:\s*[^,}\n]+,?` and remove it.
content = content.replace(/total_spent:\s*[^,}\n]+,?\n?/g, "");
content = content.replace(/total_spent:\s*0,?\n?/g, "");

fs.writeFileSync(file, content, 'utf8');
console.log("Fixed pos.tsx");
