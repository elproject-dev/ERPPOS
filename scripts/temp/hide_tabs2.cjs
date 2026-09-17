const fs = require('fs');
const file = 'src/pages/suppliers.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Find the form block
const formStartRegex = /\{\s*isAddDialogOpen && \(/;
const formStartMatch = content.match(formStartRegex);
if (!formStartMatch) { console.log("Form start not found"); process.exit(1); }

const formStartIdx = formStartMatch.index;
// Find the end of the form block: it ends right before `\n            {activeTab === 'transfer' && \(`
const formEndRegex = /\{\s*activeTab === 'transfer' && \(/;
const formEndMatch = content.slice(formStartIdx).match(formEndRegex);
if (!formEndMatch) { console.log("Form end not found"); process.exit(1); }

const formContentStr = content.slice(formStartIdx, formStartIdx + formEndMatch.index);

// Remove the form from its current place
const contentWithoutForm = content.slice(0, formStartIdx) + content.slice(formStartIdx + formEndMatch.index);

// 2. Wrap the Tabs Switcher and Main Content
const tabsMarker = "{/* Tabs Switcher */}";
const tabsIdx = contentWithoutForm.indexOf(tabsMarker);
if (tabsIdx === -1) { console.log("Tabs not found"); process.exit(1); }

// Find where Main Content ends. It ends at the first `{/* Transaction Detail Dialog */}`
const dialogStartMarker = "{/* Transaction Detail Dialog */}";
const dialogIdx = contentWithoutForm.indexOf(dialogStartMarker);
if (dialogIdx === -1) { console.log("Dialog start not found"); process.exit(1); }

// We need to find the exact closing `</div>` `</div>` `</div>` before the dialogs.
// Just before `{/* Transaction Detail Dialog */}`, there should be:
//             )}
//           </div>
//         </div>
//       </div>

// Let's wrap the Tabs Switcher and Main Content:
const beforeTabs = contentWithoutForm.slice(0, tabsIdx);
const tabsAndContent = contentWithoutForm.slice(tabsIdx, dialogIdx);
const afterContent = contentWithoutForm.slice(dialogIdx);

// The form should be inside a scrollable container when it's rendered, otherwise it will just be placed under the header without scroll.
// Wait, if I put the form before Tabs Switcher, it needs to be inside a scrollable container.
// Let's create a new flex-1 overflow-auto container for the form, or wrap BOTH in a single container.
// The easiest is to just put it in a container.

const newContent = beforeTabs + 
`
        {isAddDialogOpen ? (
          <div className="flex-1 overflow-auto scrollbar-hide p-4 sm:p-6 pb-24 md:pb-6">
            ${formContentStr.replace(/\{isAddDialogOpen && \(/, "").replace(/\)$/, "").trim()}
          </div>
        ) : (
          <>
            ${tabsAndContent}
          </>
        )}
` + afterContent;

fs.writeFileSync(file, newContent, 'utf8');
console.log("Successfully reorganized the layout!");
