with open('src/pages/customer-returns.tsx', 'r') as f:
    lines = f.readlines()

tabs_idx = -1
for i, line in enumerate(lines):
    if "Tabs Switcher" in line:
        tabs_idx = i
        break

cards_start = -1
cards_end = -1
for i, line in enumerate(lines):
    if "{/* Summary Cards */}" in line:
        cards_start = i
    if cards_start != -1 and "<Card className=\"shadow-sm border-slate-200 dark:border-slate-800\">" in line and "Cari Transaksi" in lines[i+2]:
        cards_end = i
        break

if tabs_idx != -1 and cards_start != -1 and cards_end != -1:
    cards_block = lines[cards_start:cards_end]
    del lines[cards_start:cards_end]
    
    wrapper_start = ['              <div className="px-4 pt-4 sm:px-6 sm:pt-6 pb-2">\n']
    wrapper_end = ['              </div>\n']
    
    lines = lines[:tabs_idx] + wrapper_start + cards_block + wrapper_end + lines[tabs_idx:]
    
    with open('src/pages/customer-returns.tsx', 'w') as f:
        f.writelines(lines)
    print("Success")
else:
    print(f"Failed: tabs={tabs_idx}, start={cards_start}, end={cards_end}")
