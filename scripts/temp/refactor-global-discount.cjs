const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/pages/products.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Add state variables
const stateTarget = "const [globalDiscountLoaded, setGlobalDiscountLoaded] = useState(false);";
const stateAdd = `
  const [isGlobalDiscountFormOpen, setIsGlobalDiscountFormOpen] = useState(false);
  const [editingGlobalDiscountIndex, setEditingGlobalDiscountIndex] = useState<number | null>(null);
  const [globalDiscountFormData, setGlobalDiscountFormData] = useState({ minPurchase: '', percent: '' });
`;
if (content.includes(stateTarget)) {
  content = content.replace(stateTarget, stateTarget + "\n" + stateAdd);
} else {
  console.log("State target not found!");
}

// 2. Add helper functions before `return (`
const returnTarget = "  return (";
const returnAdd = `
  const handleOpenGlobalDiscountForm = (idx: number | null = null) => {
    if (idx !== null) {
      setEditingGlobalDiscountIndex(idx);
      setGlobalDiscountFormData({
        minPurchase: globalDiscountRules[idx].minPurchase,
        percent: globalDiscountRules[idx].percent
      });
    } else {
      setEditingGlobalDiscountIndex(null);
      setGlobalDiscountFormData({ minPurchase: '', percent: '' });
    }
    setIsGlobalDiscountFormOpen(true);
  };

  const handleCloseGlobalDiscountForm = () => {
    setIsGlobalDiscountFormOpen(false);
    setEditingGlobalDiscountIndex(null);
    setGlobalDiscountFormData({ minPurchase: '', percent: '' });
  };

  const handleSaveGlobalDiscount = async () => {
    let newRules = [...globalDiscountRules];
    if (editingGlobalDiscountIndex !== null) {
      newRules[editingGlobalDiscountIndex] = globalDiscountFormData;
    } else {
      newRules.push(globalDiscountFormData);
    }

    const rulesToSave = newRules.map(r => ({
      minPurchase: parseNumberFromDots(r.minPurchase),
      percent: Number(r.percent)
    })).filter(r => r.minPurchase > 0 && r.percent > 0);

    await updateDiscountSettings.mutate({
      global_discount_enabled: globalDiscountEnabled,
      global_discount_rules: rulesToSave
    }, {
      onSuccess: () => {
        setGlobalDiscountRules(newRules);
        toast({ title: "Sukses", description: "Diskon Global berhasil disimpan." });
        handleCloseGlobalDiscountForm();
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err?.message || "Gagal menyimpan diskon.", variant: "destructive" });
      }
    });
  };

  const handleDeleteGlobalDiscount = async (idx: number) => {
    const newRules = [...globalDiscountRules];
    newRules.splice(idx, 1);
    
    const rulesToSave = newRules.map(r => ({
      minPurchase: parseNumberFromDots(r.minPurchase),
      percent: Number(r.percent)
    })).filter(r => r.minPurchase > 0 && r.percent > 0);

    await updateDiscountSettings.mutate({
      global_discount_enabled: globalDiscountEnabled,
      global_discount_rules: rulesToSave
    }, {
      onSuccess: () => {
        setGlobalDiscountRules(newRules);
        toast({ title: "Sukses", description: "Diskon berhasil dihapus." });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err?.message || "Gagal menghapus diskon.", variant: "destructive" });
      }
    });
  };

  const handleToggleGlobalDiscount = async (checked: boolean) => {
    const rulesToSave = globalDiscountRules.map(r => ({
      minPurchase: parseNumberFromDots(r.minPurchase),
      percent: Number(r.percent)
    })).filter(r => r.minPurchase > 0 && r.percent > 0);

    setGlobalDiscountEnabled(checked);
    await updateDiscountSettings.mutate({
      global_discount_enabled: checked,
      global_discount_rules: rulesToSave
    }, {
      onSuccess: () => {
        toast({ title: "Sukses", description: "Status Diskon Global berhasil diubah." });
      },
      onError: (err: any) => {
        setGlobalDiscountEnabled(!checked);
        toast({ title: "Error", description: err?.message || "Gagal mengubah status.", variant: "destructive" });
      }
    });
  };

`;
const firstReturnIndex = content.indexOf(returnTarget);
if (firstReturnIndex !== -1) {
  content = content.slice(0, firstReturnIndex) + returnAdd + content.slice(firstReturnIndex);
} else {
  console.log("Return target not found!");
}

// 3. Replace JSX Block
const jsxStartToken = ") : activeTab === 'global-discount' ? (";
const jsxEndToken = ") : activeTab === 'history' ? (";
const jsxStartIndex = content.indexOf(jsxStartToken);
const jsxEndIndex = content.indexOf(jsxEndToken);

const newJsx = \`) : activeTab === 'global-discount' ? (
            <div className="w-full">
              <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
                <CardContent className="p-6 space-y-6">
                  <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                    <div>
                      <h3 className="font-semibold text-slate-800 dark:text-slate-200">Aktifkan Diskon Global</h3>
                      <p className="text-xs text-slate-500 mt-1">Diskon akan otomatis diterapkan pada transaksi kasir (POS)</p>
                    </div>
                    <Switch
                      checked={globalDiscountEnabled}
                      onCheckedChange={handleToggleGlobalDiscount}
                    />
                  </div>

                  {globalDiscountEnabled && (
                    <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                      
                      {isGlobalDiscountFormOpen && (
                        <div className="mb-6 p-4 sm:p-5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm rounded-xl">
                          <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                            <div>
                              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                {editingGlobalDiscountIndex !== null ? "Edit Diskon Global" : "Tambah Diskon Global"}
                              </h2>
                            </div>
                            <Button variant="ghost" size="sm" onClick={handleCloseGlobalDiscountForm} className="h-8 text-xs rounded-none shrink-0">
                              Tutup
                            </Button>
                          </div>
                          
                          <div className="space-y-4 py-2">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Minimal Belanja (Rp)</label>
                                <Input
                                  value={globalDiscountFormData.minPurchase}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/[^0-9]/g, '');
                                    setGlobalDiscountFormData({ ...globalDiscountFormData, minPurchase: formatNumberWithDots(val) });
                                  }}
                                  placeholder="Contoh: 300.000"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Persentase Diskon (%)</label>
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={globalDiscountFormData.percent}
                                  onChange={(e) => {
                                    setGlobalDiscountFormData({ ...globalDiscountFormData, percent: e.target.value });
                                  }}
                                  placeholder="Contoh: 5"
                                />
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                            <Button variant="outline" onClick={handleCloseGlobalDiscountForm}>Batal</Button>
                            <Button onClick={handleSaveGlobalDiscount} disabled={updateDiscountSettings.isPending}>
                              {updateDiscountSettings.isPending ? "Menyimpan..." : "Simpan"}
                            </Button>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                        <div className="relative w-full sm:max-w-xs">
                          {/* Search bar placeholder */}
                        </div>
                        <Button 
                          onClick={() => handleOpenGlobalDiscountForm()} 
                          className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-900 shadow-sm"
                        >
                          Tambah Diskon
                        </Button>
                      </div>

                      <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                        <Table>
                          <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                            <TableRow>
                              <TableHead className="font-semibold text-slate-800 dark:text-slate-200">Minimal Belanja</TableHead>
                              <TableHead className="font-semibold text-slate-800 dark:text-slate-200">Diskon (%)</TableHead>
                              <TableHead className="text-right font-semibold text-slate-800 dark:text-slate-200 w-[100px]">Aksi</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {globalDiscountRules.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={3} className="text-center py-8 text-slate-500">
                                  Belum ada diskon global yang diatur.
                                </TableCell>
                              </TableRow>
                            ) : (
                              globalDiscountRules.map((rule, idx) => (
                                <TableRow key={idx} className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                  <TableCell className="font-medium">Rp {rule.minPurchase}</TableCell>
                                  <TableCell>{rule.percent}%</TableCell>
                                  <TableCell className="text-right">
                                    <ActionMenu
                                      options={[
                                        {
                                          label: "Edit",
                                          onClick: () => handleOpenGlobalDiscountForm(idx),
                                        },
                                        {
                                          label: "Hapus",
                                          onClick: () => handleDeleteGlobalDiscount(idx),
                                          variant: "danger"
                                        }
                                      ]}
                                    />
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                      <p className="text-xs text-slate-500 mt-4">Sistem akan otomatis memilih diskon dengan minimal belanja terbesar yang memenuhi total belanja pelanggan.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          \`;

if (jsxStartIndex !== -1 && jsxEndIndex !== -1) {
  content = content.slice(0, jsxStartIndex) + newJsx + content.slice(jsxEndIndex);
  fs.writeFileSync(file, content);
  console.log("Success");
} else {
  console.log("JSX block not found!");
}
