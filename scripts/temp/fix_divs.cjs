const fs = require('fs');
const file = 'src/pages/transactions.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace the end of the file correctly
const endRegex = /<\/div>\s*<\/div>\s*<\/div>\s*\{\/\* Transaction Detail Pop-up \*\/\s*\}/;
content = content.replace(endRegex, `
      </div>
    </div>

    {/* Transaction Detail Pop-up */}
`);

fs.writeFileSync(file, content, 'utf8');
console.log("Replaced div at end");
