const fs = require('fs');
const file = 'src/pages/suppliers.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add Calendar as CalendarIcon to lucide-react imports
content = content.replace(/import \{([^}]+)\} from "lucide-react";/, (match, p1) => {
  if (p1.includes("Calendar as CalendarIcon")) return match;
  return `import {${p1}, Calendar as CalendarIcon} from "lucide-react";`;
});

// Replace `tanggal` Popover with native Input
const tanggalRegex = /<Popover open=\{isTanggalCalendarOpen\}[\s\S]*?<\/Popover>/;
const newTanggalContent = `
                            <div className="relative">
                              <Input
                                type="date"
                                value={formData.tanggal}
                                onChange={(e) => handleInputChange('tanggal', e.target.value)}
                                onClick={(e) => {
                                  try { (e.target as HTMLInputElement).showPicker?.(); } catch (err) { }
                                }}
                                className="pr-10 w-full custom-date-input cursor-pointer bg-white dark:bg-slate-950"
                              />
                              <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                            </div>
`.trim();

content = content.replace(tanggalRegex, newTanggalContent);

// Replace `isCalendarOpen` (dueDate) Popover with native Input
const dueDateRegex = /<Popover open=\{isCalendarOpen\}[\s\S]*?<\/Popover>/;
const newDueDateContent = `
                                <div className="relative">
                                  <Input
                                    type="date"
                                    value={formData.dueDate}
                                    onChange={(e) => handleInputChange('dueDate', e.target.value)}
                                    onClick={(e) => {
                                      try { (e.target as HTMLInputElement).showPicker?.(); } catch (err) { }
                                    }}
                                    className="pr-10 w-full custom-date-input cursor-pointer bg-white dark:bg-slate-950"
                                  />
                                  <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                                </div>
`.trim();

content = content.replace(dueDateRegex, newDueDateContent);

fs.writeFileSync(file, content, 'utf8');
console.log("Successfully replaced both Popover calendars with native Input type='date'!");
