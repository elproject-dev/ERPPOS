const fs = require('fs');
const file = 'src/pages/transactions.tsx';
let lines = fs.readFileSync(file, 'utf8').split('\n');

let openCount = 0;
let inSidebar = false;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<Sidebar>')) {
    inSidebar = true;
  }
  if (inSidebar) {
    // very naive counter
    let openMatches = lines[i].match(/<div(\s|>)/g);
    let closeMatches = lines[i].match(/<\/div>/g);
    
    if (openMatches) openCount += openMatches.length;
    if (closeMatches) openCount -= closeMatches.length;
    
    // console.log(i + ": " + lines[i].trim() + " (" + openCount + ")");
  }
  if (lines[i].includes('</Sidebar>')) {
    break;
  }
}
console.log("Final balance: " + openCount);
