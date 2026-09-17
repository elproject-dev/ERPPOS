with open('src/pages/customer-returns.tsx', 'r') as f:
    lines = f.readlines()

cards_start = -1
cards_end = -1

for i, line in enumerate(lines):
    if '<div className="px-4 pt-4 sm:px-6 sm:pt-6 pb-2">' in line:
        cards_start = i
    if cards_start != -1 and "</div>" in line and i > cards_start + 70:
        # Wait, the cards end with </div>.
        pass

# It's better to match the exact start and end.
for i, line in enumerate(lines):
    if '<div className="px-4 pt-4 sm:px-6 sm:pt-6 pb-2">' in line:
        cards_start = i
        break

if cards_start != -1:
    # Find the closing div for the wrapper
    # Since we know the exact wrapper we added:
    cards_end = cards_start + 73  # Wait, let's just count open/close divs
    
    div_count = 0
    for i in range(cards_start, len(lines)):
        div_count += lines[i].count('<div') - lines[i].count('</div')
        if div_count == 0:
            cards_end = i + 1
            break

# Now extract
if cards_start != -1 and cards_end != -1:
    cards_block = lines[cards_start:cards_end]
    del lines[cards_start:cards_end]
    
    # We want to change the wrapper padding since it's now inside another padding container?
    # The parent will be: <div className="p-4 sm:p-6 flex-1 overflow-auto scrollbar-hide">
    # The current wrapper is: <div className="px-4 pt-4 sm:px-6 sm:pt-6 pb-2">
    # That would double the padding. Let's change the wrapper to a plain <div> with mb-6
    # Or just remove the wrapper, and change the inner div's mb-6 to mb-6.
    
    # Actually, the cards block inside has:
    # {/* Summary Cards */}
    # <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-6 items-stretch">
    # Let's just strip the outer wrapper <div className="..."> and </div>
    inner_block = cards_block[1:-1]
    
    # Now find where to insert
    insert_idx = -1
    for i, line in enumerate(lines):
        if '<div className="p-4 sm:p-6 flex-1 overflow-auto scrollbar-hide">' in line:
            insert_idx = i + 1
            break
            
    if insert_idx != -1:
        lines = lines[:insert_idx] + inner_block + lines[insert_idx:]
        with open('src/pages/customer-returns.tsx', 'w') as f:
            f.writelines(lines)
        print("Success")
    else:
        print("Could not find insert index")
else:
    print("Could not find cards block")
