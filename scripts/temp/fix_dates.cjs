const fs = require('fs');
const file = 'src/pages/suppliers.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace Tanggal Input
const tanggalRegex = /<div className="relative">\s*<Input\s*type="date"\s*value=\{formData.tanggal\}[\s\S]*?<CalendarIcon[^>]*\/>\s*<\/div>/;

const newTanggalContent = `
                            <div className="relative w-full h-10">
                              <Input
                                type="text"
                                placeholder="Pilih Tanggal"
                                value={formData.tanggal ? formData.tanggal.split('-').reverse().join('-') : ""}
                                readOnly
                                className="absolute inset-0 h-10 w-full bg-white dark:bg-slate-950 pr-10 focus:ring-0 cursor-pointer text-left"
                              />
                              <input
                                type="date"
                                value={formData.tanggal}
                                onChange={(e) => handleInputChange('tanggal', e.target.value)}
                                onClick={(e) => {
                                  try { (e.target as HTMLInputElement).showPicker?.(); } catch (err) { }
                                }}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                title="Tanggal"
                              />
                              <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                            </div>
`.trim();

content = content.replace(tanggalRegex, newTanggalContent);

// Replace dueDate Input
const dueDateRegex = /<div className="relative">\s*<Input\s*type="date"\s*value=\{formData.dueDate\}[\s\S]*?<CalendarIcon[^>]*\/>\s*<\/div>/;

const newDueDateContent = `
                                <div className="relative w-full h-10">
                                  <Input
                                    type="text"
                                    placeholder="Pilih Tanggal"
                                    value={formData.dueDate ? formData.dueDate.split('-').reverse().join('-') : ""}
                                    readOnly
                                    className="absolute inset-0 h-10 w-full bg-white dark:bg-slate-950 pr-10 focus:ring-0 cursor-pointer text-left"
                                  />
                                  <input
                                    type="date"
                                    value={formData.dueDate}
                                    onChange={(e) => handleInputChange('dueDate', e.target.value)}
                                    onClick={(e) => {
                                      try { (e.target as HTMLInputElement).showPicker?.(); } catch (err) { }
                                    }}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    title="Tanggal Jatuh Tempo"
                                  />
                                  <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                                </div>
`.trim();

content = content.replace(dueDateRegex, newDueDateContent);

fs.writeFileSync(file, content, 'utf8');
console.log("Replaced native date inputs with placeholder overlay overlay");
