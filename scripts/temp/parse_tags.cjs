const fs = require('fs');
const file = 'src/pages/transactions.tsx';
let lines = fs.readFileSync(file, 'utf8').split('\n');

let inSidebar = false;
let stack = [];

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<Sidebar>')) {
    inSidebar = true;
    continue;
  }
  if (lines[i].includes('</Sidebar>')) {
    break;
  }
  
  if (inSidebar) {
    let line = lines[i];
    // This regex matches simple <tag> and </tag>
    let tagRegex = /<\/?([A-Za-z0-9]+)[^>]*>/g;
    let match;
    while ((match = tagRegex.exec(line)) !== null) {
      let fullTag = match[0];
      let tagName = match[1];
      
      // ignore self-closing
      if (fullTag.endsWith('/>')) continue;
      
      if (fullTag.startsWith('</')) {
        let last = stack.pop();
        if (last !== tagName) {
          console.log(`Mismatch at line ${i+1}: expected </${last}> but found ${fullTag}`);
          return;
        }
      } else {
        stack.push(tagName);
      }
    }
  }
}

console.log("Remaining stack: " + stack.join(', '));
