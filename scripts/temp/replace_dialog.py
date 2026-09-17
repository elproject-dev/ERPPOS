with open('src/pages/customer-returns.tsx', 'r') as f:
    lines = f.readlines()

dialog_start = -1
for i, line in enumerate(lines):
    if "<Dialog open={isNewReturnDialogOpen}" in line:
        dialog_start = i
        break

if dialog_start != -1:
    print(f"Dialog starts at {dialog_start}")
    # find where the Dialog ends
    # We can just count <Dialog and </Dialog>
    open_count = 0
    dialog_end = -1
    for i in range(dialog_start, len(lines)):
        if "<Dialog " in lines[i] or "<Dialog>" in lines[i]:
            open_count += 1
        if "</Dialog>" in lines[i]:
            open_count -= 1
            if open_count == 0:
                dialog_end = i
                break
    print(f"Dialog ends at {dialog_end}")
else:
    print("Dialog not found")
