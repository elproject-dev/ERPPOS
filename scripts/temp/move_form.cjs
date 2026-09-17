const fs = require('fs');

const file = 'src/pages/suppliers.tsx';
let content = fs.readFileSync(file, 'utf8');

const dialogStartMarker = "{/* Dialog Add Purchase */}";
const dialogStartIndex = content.indexOf(dialogStartMarker);

if (dialogStartIndex === -1) {
  console.log("Could not find dialog start marker");
  process.exit(1);
}

const formStartMatch = content.slice(dialogStartIndex).match(/<form onSubmit=\{handleSubmit\}>/);
if (!formStartMatch) {
  console.log("Could not find form start");
  process.exit(1);
}

const formStartIdx = dialogStartIndex + formStartMatch.index;

const formEndMarker = "</form>";
const formEndIndexLocal = content.slice(formStartIdx).indexOf(formEndMarker);
if (formEndIndexLocal === -1) {
  console.log("Could not find form end");
  process.exit(1);
}
const formEndIdx = formStartIdx + formEndIndexLocal + formEndMarker.length;

const formContent = content.slice(formStartIdx, formEndIdx);

// Find </Dialog> after the form
const dialogEndMatch = content.slice(formEndIdx).match(/<\/Dialog>/);
if (!dialogEndMatch) {
  console.log("Could not find Dialog end");
  process.exit(1);
}
const dialogEndIdx = formEndIdx + dialogEndMatch.index + dialogEndMatch[0].length;

// Remove the whole block from original place (from Dialog Add Purchase to </Dialog>)
const beforeDialog = content.slice(0, dialogStartIndex);
const afterDialog = content.slice(dialogEndIdx);

let newContent = beforeDialog + afterDialog;

// Find injection point: `<div className="flex flex-col gap-4 max-w-full">`
const injectionMarker = '<div className="flex flex-col gap-4 max-w-full">';
const injectionIdxLocal = newContent.indexOf(injectionMarker);
if (injectionIdxLocal === -1) {
  console.log("Could not find injection point");
  process.exit(1);
}
const injectionIdx = injectionIdxLocal + injectionMarker.length;

let replacedForm = formContent;
replacedForm = replacedForm.replace(/<DialogHeader>/g, '<div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">');
replacedForm = replacedForm.replace(/<\/DialogHeader>/g, '</div>');
replacedForm = replacedForm.replace(/<DialogTitle[^>]*>/, '<h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">');
replacedForm = replacedForm.replace(/<\/DialogTitle>/, '</h2>\n                    <Button type="button" variant="ghost" size="icon" onClick={() => setIsAddDialogOpen(false)} className="h-8 w-8 rounded-none"><X className="w-4 h-4" /></Button>');
replacedForm = replacedForm.replace(/<DialogDescription[^>]*>[\s\S]*?<\/DialogDescription>/, '');
replacedForm = replacedForm.replace(/<DialogFooter>/g, '<div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">');
replacedForm = replacedForm.replace(/<\/DialogFooter>/g, '</div>');
replacedForm = replacedForm.replace(/className="grid gap-6 py-4"/, 'className="grid gap-6 p-4 sm:p-5"');

const newFormContent = `
            {isAddDialogOpen && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm mb-6 animate-in fade-in slide-in-from-top-4 duration-200" id="supplier-form-card">
                ${replacedForm}
              </div>
            )}
`;

newContent = newContent.slice(0, injectionIdx) + newFormContent + newContent.slice(injectionIdx);

fs.writeFileSync(file, newContent, 'utf8');
console.log("Successfully moved the form!");
