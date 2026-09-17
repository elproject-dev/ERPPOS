const fs = require('fs');

const file = 'src/pages/suppliers.tsx';
let content = fs.readFileSync(file, 'utf8');

const tabsSwitcherRegex = /\{\/\* Tabs Switcher \*\/\}/;
const matchTabs = content.match(tabsSwitcherRegex);

if (!matchTabs) {
  console.log("Could not find Tabs Switcher");
  process.exit(1);
}

// Wrap the tabs switcher and everything below it until before the closing Dialogs in `suppliers.tsx`.
// Wait, the file ends with a bunch of Dialogs and then </Sidebar>. We just need to wrap the Tabs Switcher and the `Main Content` div.
const tabsIdx = matchTabs.index;

// The main content div ends before `{/* Stock Transfer Dialog */}` or `{/* Return Dialog */}`
const dialogStartRegex = /\{\/\* Stock Transfer Dialog \*\/\}/;
const matchDialog = content.match(dialogStartRegex);

if (!matchDialog) {
  console.log("Could not find dialogs start");
  process.exit(1);
}

const dialogIdx = matchDialog.index;

// Actually, `flex-1 overflow-auto` is closed right before `{/* Stock Transfer Dialog */}`?
// Let's check what is right before Stock Transfer Dialog.
