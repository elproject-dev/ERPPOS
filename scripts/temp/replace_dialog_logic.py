with open('src/pages/customer-returns.tsx', 'r') as f:
    lines = f.readlines()

# Find the exact lines
start_idx = -1
for i, line in enumerate(lines):
    if "<Dialog open={isNewReturnDialogOpen}" in line:
        start_idx = i
        break

end_idx = -1
for i in range(start_idx, len(lines)):
    if "</Dialog>" in lines[i]:
        end_idx = i
        break

if start_idx != -1 and end_idx != -1:
    dialog_content = lines[start_idx:end_idx+1]
    
    # We will replace the Dialog structure with a div
    # Replace the starting elements
    
    # Instead of doing complex string manipulation, let's just replace lines
    # dialog_content[0] is <Dialog ...>
    # dialog_content[1] is <DialogContent ...>
    # dialog_content[2] is <DialogHeader ...>
    # dialog_content[3] is <div>
    # dialog_content[4] is <DialogTitle ...>
    # dialog_content[5] is Buat Retur Baru
    # dialog_content[6] is </DialogTitle>
    
    new_header = """                {isNewReturnDialogOpen ? (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-sm shadow-sm overflow-hidden flex flex-col mb-6">
                    <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                        Buat Retur Baru
                      </h2>
                      <Button variant="ghost" size="icon" onClick={() => setIsNewReturnDialogOpen(false)} className="rounded-sm">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="p-4 sm:p-5 space-y-6 flex-1">
"""
    
    new_footer = """                    </div>
                  </div>
                ) : (
"""
    
    # We need to extract just the inside of the dialog content
    # The inside starts around dialog_content[13] which is <div className="space-y-6 flex-1"> wait let me check
    
    inner_start = -1
    for i, line in enumerate(dialog_content):
        if '<Card className="shadow-sm border-slate-200 dark:border-slate-800">' in line:
            inner_start = i
            break
            
    inner_end = -1
    for i in range(len(dialog_content)-1, -1, -1):
        if "</div>" in dialog_content[i] and "DialogContent" in dialog_content[i+1]:
            inner_end = i - 1
            break
            
    # wait, the end of the dialog is:
    # 1410:                       ) : null}
    # 1411:                     </div>
    # 1412:                   </DialogContent>
    # 1413:                 </Dialog>
    
    if inner_start != -1:
        inner_content = dialog_content[inner_start:-4]  # skip the last 4 lines
        
        # Now we need to wrap the tables in the `) : (` block
        # The tables are after the Dialog, lines end_idx+1 onwards
        # We need to find where they end.
        tables_end_idx = -1
        for i in range(end_idx, len(lines)):
            if "              </div>" in lines[i] and "<>" in lines[i+1]:
                tables_end_idx = i
                break
                
        tables_content = lines[end_idx+1:tables_end_idx]
        
        # Combine
        new_lines = lines[:start_idx] + [new_header] + inner_content + [new_footer] + tables_content + ["                )}\n"] + lines[tables_end_idx:]
        
        with open('src/pages/customer-returns.tsx', 'w') as f:
            f.writelines(new_lines)
        print("Success")
    else:
        print("inner_start not found")
else:
    print("Dialog not found")

