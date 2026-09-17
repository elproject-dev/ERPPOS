const fs = require('fs');
const file = 'src/pages/transactions.tsx';
let lines = fs.readFileSync(file, 'utf8').split('\n');

for (let i = 1320; i < 1340; i++) {
  if (lines[i].includes('</Popover>')) {
    // The next two lines should be </div> </div>
    if (lines[i+1].includes('</div>') && lines[i+2].includes('</div>')) {
      lines.splice(i+2, 1); // remove one </div>
      console.log("Removed extra </div> at line " + (i+3));
      break;
    }
  }
}

// Also the user added a </div> at the very end in their diff, let's remove it.
// The diff showed:
// -    
// +    </div>
// 
//       {/* Transaction Detail Pop-up */ }
for (let i = lines.length - 20; i < lines.length; i++) {
  if (lines[i].includes('{/* Transaction Detail Pop-up */}')) {
    if (lines[i-1].includes('</div>') || lines[i-2].includes('</div>')) {
      // Find the last </div> before the comment and remove it, if it's alone on the line
      let idx = lines[i-1].includes('</div>') ? i-1 : (lines[i-2].includes('</div>') ? i-2 : -1);
      if (idx !== -1 && lines[idx].trim() === '</div>') {
        lines.splice(idx, 1);
        console.log("Removed extra </div> at end before Pop-up at line " + (idx+1));
      }
    }
    break;
  }
}

fs.writeFileSync(file, lines.join('\n'), 'utf8');
