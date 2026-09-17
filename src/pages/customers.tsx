import { useState, useMemo, useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { useListCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer } from "@workspace/api-client-react";
import { formatRupiah } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Edit, Trash2, Phone, Award, Users, Download, Store, AlertTriangle, Copy, MapPin, ChevronLeft, ChevronRight, X, Eye, SlidersHorizontal } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty } from "@/components/ui/combobox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ActionMenu } from "@/components/ui/action-menu";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth, useAuthUserName } from "@/contexts/AuthContext";
import { ADMIN_EMAIL } from "@/lib/auth";
import { exportToExcel } from "@/components/excel-export/excel-export";
import { useListOutlets } from "@/mocks/api-client-react";

export default function CustomersPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [salesFilter, setSalesFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [lookupPhone, setLookupPhone] = useState("");
  const [lookupResult, setLookupResult] = useState<any>(null);
  const { data: customers, isLoading, refetch } = useListCustomers();
  const { data: outlets } = useListOutlets();
  const [outletFilter, setOutletFilter] = useState<string>(() => {
    return localStorage.getItem('selectedOutletId') || "all";
  });
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();
  const salesName = useAuthUserName();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLookupDialogOpen, setIsLookupDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedCustomerDetail, setSelectedCustomerDetail] = useState<any>(null);
  const [formData, setFormData] = useState<any>({ name: "", phone: "", outlet_id: "all", province: "", city: "", district: "", village: "", postal_code: "" });
  const [isLookupPending, setIsLookupPending] = useState(false);
  const [deleteCustomerId, setDeleteCustomerId] = useState<number | null>(null);
  const [deleteCustomerName, setDeleteCustomerName] = useState<string>("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Emsifa API states
  const [provinces, setProvinces] = useState<any[]>([]);
  const [regencies, setRegencies] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [villages, setVillages] = useState<any[]>([]);

  const [selectedProvId, setSelectedProvId] = useState("");
  const [selectedKabId, setSelectedKabId] = useState("");
  const [selectedKecId, setSelectedKecId] = useState("");

  const [isLoadingProv, setIsLoadingProv] = useState(false);
  const [isLoadingKab, setIsLoadingKab] = useState(false);
  const [isLoadingKec, setIsLoadingKec] = useState(false);
  const [isLoadingKel, setIsLoadingKel] = useState(false);

  // Fetch Provinces
  useEffect(() => {
    if (!isDialogOpen) return;
    async function fetchProvinces() {
      setIsLoadingProv(true);
      try {
        const res = await fetch("https://www.emsifa.com/api-wilayah-indonesia/api/provinces.json");
        setProvinces(await res.json());
      } catch (error) { console.error(error); }
      finally { setIsLoadingProv(false); }
    }
    fetchProvinces();
  }, [isDialogOpen]);

  // Fetch Regencies
  useEffect(() => {
    if (!selectedProvId) {
      setRegencies([]);
      setSelectedKabId("");
      return;
    }
    async function fetchRegencies() {
      setIsLoadingKab(true);
      try {
        const res = await fetch(`https://www.emsifa.com/api-wilayah-indonesia/api/regencies/${selectedProvId}.json`);
        setRegencies(await res.json());
      } catch (error) { console.error(error); }
      finally { setIsLoadingKab(false); }
    }
    fetchRegencies();
  }, [selectedProvId]);

  // Fetch Districts
  useEffect(() => {
    if (!selectedKabId) {
      setDistricts([]);
      setSelectedKecId("");
      return;
    }
    async function fetchDistricts() {
      setIsLoadingKec(true);
      try {
        const res = await fetch(`https://www.emsifa.com/api-wilayah-indonesia/api/districts/${selectedKabId}.json`);
        setDistricts(await res.json());
      } catch (error) { console.error(error); }
      finally { setIsLoadingKec(false); }
    }
    fetchDistricts();
  }, [selectedKabId]);

  // Fetch Villages
  useEffect(() => {
    if (!selectedKecId) {
      setVillages([]);
      return;
    }
    async function fetchVillages() {
      setIsLoadingKel(true);
      try {
        const res = await fetch(`https://www.emsifa.com/api-wilayah-indonesia/api/villages/${selectedKecId}.json`);
        setVillages(await res.json());
      } catch (error) { console.error(error); }
      finally { setIsLoadingKel(false); }
    }
    fetchVillages();
  }, [selectedKecId]);

  // Auto-select Province when editing
  useEffect(() => {
    if (editingCustomer?.province && provinces.length > 0 && !selectedProvId) {
      const foundProv = provinces.find((p: any) => p.name?.toLowerCase() === editingCustomer.province?.toLowerCase());
      if (foundProv) setSelectedProvId(foundProv.id);
    }
  }, [editingCustomer, provinces, selectedProvId]);

  // Auto-select City when editing
  useEffect(() => {
    if (editingCustomer?.city && regencies.length > 0 && !selectedKabId) {
      const foundKab = regencies.find((r: any) => r.name?.toLowerCase() === editingCustomer.city?.toLowerCase());
      if (foundKab) setSelectedKabId(foundKab.id);
    }
  }, [editingCustomer, regencies, selectedKabId]);

  // Auto-select District when editing
  useEffect(() => {
    if (editingCustomer?.district && districts.length > 0 && !selectedKecId) {
      const foundKec = districts.find((d: any) => d.name?.toLowerCase() === editingCustomer.district?.toLowerCase());
      if (foundKec) setSelectedKecId(foundKec.id);
    }
  }, [editingCustomer, districts, selectedKecId]);

  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    setPage(1);
  }, [search, salesFilter, sortBy, outletFilter]);

  // Check if user is admin (only elproject.dev@gmail.com)
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();



  const handleOpenDialog = (customer?: any) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        name: customer.name || "",
        phone: customer.phone || "",
        outlet_id: customer.outlet_id ? customer.outlet_id.toString() : "all",
        district: customer.district || "",
        city: customer.city || "",
        village: customer.village || "",
        postal_code: customer.postal_code || "",
        address: customer.address || "",
        province: customer.province || ""
      });
      // Selected IDs will be auto-populated by useEffects once region data loads
    } else {
      setEditingCustomer(null);
      const currentOutletIdStr = localStorage.getItem('selectedOutletId') || "all";
      setFormData({
        name: "",
        phone: "",
        outlet_id: (!isAdmin && user?.outletId) ? user.outletId : currentOutletIdStr,
        district: "",
        city: "",
        village: "",
        postal_code: "",
        address: "",
        province: ""
      });
      setSelectedProvId("");
      setSelectedKabId("");
      setSelectedKecId("");
    }
    setIsDetailDialogOpen(false);
    setIsDialogOpen(true);
  };

  const handleOpenDetail = (customer: any) => {
    setSelectedCustomerDetail(customer);
    setIsDialogOpen(false);
    setIsDetailDialogOpen(true);
  };

  const handleSubmit = () => {
    const payload: any = {
      name: formData.name,
      phone: formData.phone || null,
      address: formData.address || null,
      province: formData.province || null,
      city: formData.city || null,
      district: formData.district || null,
      village: formData.village || null,
      postal_code: formData.postal_code || null
    };

    if (isAdmin && formData.outlet_id && formData.outlet_id !== "all") {
      payload.outlet_id = parseInt(formData.outlet_id);
    } else {
      payload.outlet_id = null;
    }

    if (!editingCustomer) {
      payload.sales_name = salesName;
    }

    if (editingCustomer) {
      updateCustomer.mutate({ id: editingCustomer.id, data: payload }, {
        onSuccess: () => {
          toast({ title: "Sukses", description: "Pelanggan diperbarui" });
          setIsDialogOpen(false);
          refetch?.();
        },
        onError: () => toast({ title: "Error", description: "Gagal memperbarui pelanggan", variant: "destructive" })
      });
    } else {
      createCustomer.mutate({ data: payload }, {
        onSuccess: () => {
          toast({ title: "Sukses", description: "Pelanggan ditambahkan" });
          setIsDialogOpen(false);
          refetch?.();
        },
        onError: () => toast({ title: "Error", description: "Gagal menambahkan pelanggan", variant: "destructive" })
      });
    }
  };

  const triggerDelete = (id: number, name: string) => {
    setDeleteCustomerId(id);
    setDeleteCustomerName(name);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (deleteCustomerId) {
      deleteCustomer.mutate({ id: deleteCustomerId }, {
        onSuccess: () => {
          toast({ title: "Sukses", description: "Pelanggan dihapus" });
          setIsDeleteDialogOpen(false);
          setDeleteCustomerId(null);
          refetch?.();
        },
        onError: () => toast({ title: "Error", description: "Gagal menghapus pelanggan", variant: "destructive" })
      });
    }
  };

  const handleLookup = () => {
    if (!lookupPhone) return;
    setIsLookupPending(true);
    const found = customers?.find((c: any) => c.phone === lookupPhone || c.phone_number === lookupPhone);
    setIsLookupPending(false);
    if (found) {
      setLookupResult(found);
      toast({ title: "Ditemukan", description: found.name });
    } else {
      setLookupResult(null);
      toast({ title: "Tidak ditemukan", description: "Pelanggan tidak ditemukan", variant: "destructive" });
    }
  };

  const handleExportExcel = async () => {
    if (!customers || customers.length === 0) {
      toast({ title: "Kosong", description: "Tidak ada data pelanggan untuk di-download", variant: "destructive" });
      return;
    }

    const columns = [
      { header: "No", key: "No", width: 5 },
      { header: "ID Pelanggan", key: "ID Pelanggan", width: 20 },
      { header: "Nama Pelanggan", key: "Nama Pelanggan", width: 30 },
      { header: "No. Telepon", key: "No. Telepon", width: 15 },
      { header: "Alamat", key: "Alamat", width: 40 },
      { header: "Kota/Kabupaten", key: "Kota/Kabupaten", width: 25 },
      { header: "Kecamatan", key: "Kecamatan", width: 20 },
      { header: "Kelurahan", key: "Kelurahan", width: 20 },
      { header: "Kodepos", key: "Kodepos", width: 10 },
      { header: "Bergabung Sejak", key: "Bergabung Sejak", width: 18 },
    ];

    const toTitleCase = (str: string | undefined | null) => {
      if (!str || typeof str !== 'string') return "-";
      return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };

    const data = customers.map((c: any, index: number) => {
      const date = new Date(c.created_at);
      const formattedDate = date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

      return {
        "No": index + 1,
        "ID Pelanggan": c.customer_id_manual || "-",
        "Nama Pelanggan": c.name || "-",
        "No. Telepon": c.phone || "-",
        "Alamat": c.address || "-",
        "Kota/Kabupaten": toTitleCase(c.city),
        "Kecamatan": toTitleCase(c.district),
        "Kelurahan": toTitleCase(c.village),
        "Kodepos": c.postal_code || "-",
        "Bergabung Sejak": formattedDate
      };
    });

    try {
      toast({ title: "Memproses", description: "Sedang menyiapkan file Excel..." });
      await exportToExcel({
        title: "Laporan Data Pelanggan",
        filename: `Data_Pelanggan_${new Date().toISOString().split('T')[0]}.xlsx`,
        sheetName: "Pelanggan",
        columns,
        data,
        rowStripes: []
      });
      toast({ title: "Berhasil", description: "File Excel berhasil didownload" });
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Gagal mendownload Excel", variant: "destructive" });
    }
  };

  const activeOutletId = null;

  const uniqueSalesNames = useMemo(() => {
    if (!customers) return [];
    const names = customers.map(c => c.sales_name).filter(Boolean);
    return Array.from(new Set(names));
  }, [customers]);

  const filteredCustomers = customers?.filter((customer: any) => {
    if (salesFilter !== "all" && customer.sales_name !== salesFilter) {
      return false;
    }
    // Filter by outlet (Hide if customer belongs to a DIFFERENT specific outlet)
    if (activeOutletId !== null) {
      if (customer.outlet_id != null && customer.outlet_id !== activeOutletId) {
        return false;
      }
    }

    if (!search || search.length < 3) return true;
    const s = search.toLowerCase();
    return customer.name?.toLowerCase().includes(s) || (customer.phone || "").toLowerCase().includes(s);
  }).sort((a: any, b: any) => {
    if (sortBy === "newest") {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    if (sortBy === "oldest") {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    if (sortBy === "id_asc") {
      const idA = a.customer_id_manual || "";
      const idB = b.customer_id_manual || "";
      return idA.localeCompare(idB);
    }
    if (sortBy === "id_desc") {
      const idA = a.customer_id_manual || "";
      const idB = b.customer_id_manual || "";
      return idB.localeCompare(idA);
    }
    return 0;
  });

  const paginatedCustomers = useMemo(() => {
    if (!filteredCustomers) return [];
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    return filteredCustomers.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredCustomers, page]);

  const handleNextPage = () => {
    if (filteredCustomers && page * ITEMS_PER_PAGE < filteredCustomers.length) {
      setPage(p => p + 1);
    }
  };

  const handlePrevPage = () => {
    if (page > 1) {
      setPage(p => p - 1);
    }
  };

  return (
    <>
      <Sidebar>
        <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950" style={{ '--radius': '0px' } as React.CSSProperties}>
          <div className="px-4 py-2 sm:px-6 sm:py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between">
            <h1 className="text-xl sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
              Manajemen Pelanggan
            </h1>
            {isAdmin && (
              <>
                {/* Mobile 3-Dots Action Menu */}
                <div className="sm:hidden flex items-center">
                  <ActionMenu
                    items={[
                      {
                        label: "Tambah Pelanggan",
                        icon: <Plus className="h-4 w-4 text-primary" />,
                        onClick: () => handleOpenDialog(),
                      },
                      {
                        label: "Download Excel",
                        icon: <Download className="h-4 w-4 text-primary" />,
                        onClick: () => handleExportExcel(),
                      },
                    ]}
                  />
                </div>

                {/* Desktop Buttons */}
                <div className="hidden sm:flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleExportExcel()}
                    className="h-8 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 gap-2"
                  >
                    <Download className="w-4 h-4 text-primary" />
                    <span className="font-medium text-xs sm:text-sm">Download</span>
                  </Button>
                  <Button onClick={() => handleOpenDialog()} className="h-8 px-3 text-sm gap-2">
                    <Plus className="w-4 h-4" />
                    Tambah
                  </Button>
                </div>
              </>
            )}
          </div>

          {isLoading ? (
            <div className="flex-1 overflow-auto scrollbar-hide flex items-center justify-center">
              <LoadingSpinner text="Memuat data pelanggan..." />
            </div>
          ) : (
            <>
              <div id="customers-scroll-container" className="px-4 py-3 sm:px-6 sm:py-4 flex-1 overflow-auto scrollbar-hide">
                {isDialogOpen && (
                  <div id="customer-form-card" className="mb-6 p-4 sm:p-5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{editingCustomer ? "Edit Pelanggan" : "Tambah Pelanggan Baru"}</h2>
                        <p className="text-sm text-slate-500">{editingCustomer ? "Ubah informasi pelanggan yang sudah ada" : "Isi formulir untuk menambah pelanggan baru"}</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => setIsDialogOpen(false)} className="h-8 w-8 rounded-none">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Nama Pelanggan <span className="text-red-500">*</span></label>
                        <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Masukkan Nama Pelanggan" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Nomor HP</label>
                        <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="Masukkan Nomor" />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-medium">Alamat Lengkap</label>
                        <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Masukkan alamat jalan, nomor rumah, RT/RW..." />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Provinsi</label>
                        <SearchableSelect
                          options={provinces}
                          value={selectedProvId}
                          onChange={(id, name) => {
                            setSelectedProvId(id);
                            setFormData({ ...formData, province: name });
                          }}
                          placeholder="Pilih Provinsi..."
                          loading={isLoadingProv}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Kabupaten / Kota</label>
                        <SearchableSelect
                          options={regencies}
                          value={selectedKabId}
                          onChange={(id, name) => {
                            setSelectedKabId(id);
                            setFormData({ ...formData, city: name });
                          }}
                          placeholder="Pilih Kabupaten/Kota..."
                          loading={isLoadingKab}
                          disabled={!selectedProvId}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Kecamatan</label>
                        <SearchableSelect
                          options={districts}
                          value={selectedKecId}
                          onChange={(id, name) => {
                            setSelectedKecId(id);
                            setFormData({ ...formData, district: name });
                          }}
                          placeholder="Pilih Kecamatan..."
                          loading={isLoadingKec}
                          disabled={!selectedKabId}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Kelurahan</label>
                        <SearchableSelect
                          options={villages}
                          value={villages.find(v => v.name === formData.village)?.id || ""}
                          onChange={(_id, name) => {
                            setFormData((prev: any) => ({ ...prev, village: name }));
                            // Auto-fetch postal code
                            fetch(`https://kodepos.vercel.app/search?q=${name}`)
                              .then(res => res.json())
                              .then(resData => {
                                if (resData && resData.data && resData.data.length > 0) {
                                  // Try to match the district to be more accurate, fallback to the first result
                                  const match = resData.data.find((d: any) => d.district.toLowerCase() === formData.district?.toLowerCase()) || resData.data[0];
                                  setFormData((prev: any) => ({ ...prev, postal_code: match.code.toString() }));
                                }
                              })
                              .catch(err => console.error("Gagal mengambil kodepos", err));
                          }}
                          placeholder="Pilih Kelurahan..."
                          loading={isLoadingKel}
                          disabled={!selectedKecId}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Kodepos</label>
                        <Input value={formData.postal_code || ""} onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })} placeholder="Kodepos" className="rounded-none" />
                      </div>
                    </div>
                    <div className="mt-5 flex gap-2 justify-end pt-4 border-t border-slate-100 dark:border-slate-700">
                      <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="rounded-none">Batal</Button>
                      <Button onClick={handleSubmit} disabled={!formData.name || createCustomer.isPending || updateCustomer.isPending} className="rounded-none">
                        {createCustomer.isPending || updateCustomer.isPending ? "Menyimpan..." : "Simpan Data"}
                      </Button>
                    </div>
                  </div>
                )}

                {isDetailDialogOpen && selectedCustomerDetail && (
                  <div id="customer-detail-card" className="mb-6 p-4 sm:p-5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Detail Pelanggan</h2>
                        <p className="text-sm text-slate-500">Informasi lengkap pelanggan</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => setIsDetailDialogOpen(false)} className="h-8 w-8 rounded-none">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:col-span-2">
                        <div className="space-y-1 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-md border border-slate-100 dark:border-slate-800">
                          <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">ID Pelanggan</span>
                          <span className="block text-sm font-medium text-slate-900 dark:text-white">{selectedCustomerDetail.customer_id_manual || "-"}</span>
                        </div>
                        <div className="space-y-1 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-md border border-slate-100 dark:border-slate-800">
                          <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nama Pelanggan</span>
                          <span className="block text-sm font-medium text-slate-900 dark:text-white">{selectedCustomerDetail.name || "-"}</span>
                        </div>
                        <div className="space-y-1 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-md border border-slate-100 dark:border-slate-800">
                          <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">No. Telp</span>
                          <span className="block text-sm font-medium text-slate-900 dark:text-white">{selectedCustomerDetail.phone || "-"}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:col-span-2">
                        <div className="space-y-1 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-md border border-slate-100 dark:border-slate-800">
                          <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Alamat Lengkap</span>
                          <span className="block text-sm font-medium text-slate-900 dark:text-white">{selectedCustomerDetail.address || "-"}</span>
                        </div>
                        <div className="space-y-1 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-md border border-slate-100 dark:border-slate-800">
                          <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Provinsi</span>
                          <span className="block text-sm font-medium text-slate-900 dark:text-white capitalize">{selectedCustomerDetail.province?.toLowerCase() || "-"}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:col-span-2">
                        <div className="space-y-1 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-md border border-slate-100 dark:border-slate-800">
                          <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Kota/Kabupaten</span>
                          <span className="block text-sm font-medium text-slate-900 dark:text-white capitalize">{selectedCustomerDetail.city?.toLowerCase() || "-"}</span>
                        </div>
                        <div className="space-y-1 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-md border border-slate-100 dark:border-slate-800">
                          <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Kecamatan</span>
                          <span className="block text-sm font-medium text-slate-900 dark:text-white capitalize">{selectedCustomerDetail.district?.toLowerCase() || "-"}</span>
                        </div>
                        <div className="space-y-1 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-md border border-slate-100 dark:border-slate-800">
                          <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Kelurahan</span>
                          <span className="block text-sm font-medium text-slate-900 dark:text-white capitalize">{selectedCustomerDetail.village?.toLowerCase() || "-"}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:col-span-2">
                        <div className="space-y-1 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-md border border-slate-100 dark:border-slate-800">
                          <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Kodepos</span>
                          <span className="block text-sm font-medium text-slate-900 dark:text-white">{selectedCustomerDetail.postal_code || "-"}</span>
                        </div>
                        <div className="space-y-1 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-md border border-slate-100 dark:border-slate-800">
                          <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pelanggan dari</span>
                          <span className="block text-sm font-medium text-slate-900 dark:text-white">{selectedCustomerDetail.sales_name || "-"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mb-4 flex flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-4 h-4" />
                    <Input placeholder="Cari pelanggan..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-10 shadow-sm" />
                  </div>

                  <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-10 px-3 flex items-center justify-center gap-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm relative shrink-0"
                      >
                        <SlidersHorizontal className="w-4 h-4 text-slate-500" />
                        <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">Filter</span>
                        {(salesFilter !== "all" || sortBy !== "newest") && (
                          <span className="w-2 h-2 rounded-full bg-primary absolute top-1.5 right-1.5" />
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-4" align="end">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                          <h4 className="font-semibold text-sm text-slate-900 dark:text-white">Filter Pelanggan</h4>
                          {(salesFilter !== "all" || sortBy !== "newest") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSalesFilter("all");
                                setSortBy("newest");
                              }}
                              className="h-auto p-0 text-xs text-primary hover:bg-transparent"
                            >
                              Reset Filter
                            </Button>
                          )}
                        </div>

                        <div className="space-y-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Urutkan Data</label>
                            <Select value={sortBy} onValueChange={setSortBy}>
                              <SelectTrigger className="w-full h-9 text-xs">
                                <SelectValue placeholder="Urutkan" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="newest">Terbaru</SelectItem>
                                <SelectItem value="oldest">Terlama</SelectItem>
                                <SelectItem value="id_desc">Nama (A-Z)</SelectItem>
                                <SelectItem value="id_asc">Nama (Z-A)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Sales</label>
                            <Select value={salesFilter} onValueChange={setSalesFilter}>
                              <SelectTrigger className="w-full h-9 text-xs">
                                <SelectValue placeholder="Semua Sales" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Semua Sales</SelectItem>
                                {uniqueSalesNames.map((name: any) => (
                                  <SelectItem key={name} value={name}>{name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <>
                  {/* Mobile Card List */}
                  <div className="flex flex-col gap-3 md:hidden">
                    {filteredCustomers?.length === 0 ? (
                      <div className="text-center py-10 text-slate-500 dark:text-slate-400">Tidak ada data</div>
                    ) : (
                      paginatedCustomers?.map((customer: any) => (
                        <div key={customer.id} className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 shadow-sm relative hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="font-semibold text-slate-900 dark:text-white mb-1.5">{customer.name}</div>
                              <div className="flex flex-col gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                <div className="flex items-center gap-1.5">

                                  {customer.phone || "-"}
                                </div>
                                {(customer.address || customer.city || customer.district || customer.village) && (
                                  <div className="flex flex-col gap-1 text-xs mt-1 border-t border-slate-100 dark:border-slate-800/60 pt-2">
                                    {customer.address && (
                                      <div className="text-slate-700 dark:text-slate-300 font-medium">
                                        {customer.address}
                                      </div>
                                    )}
                                    {(customer.city || customer.district || customer.village) && (
                                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-1 gap-y-0.5 capitalize font-medium">
                                        {customer.city && <span>Kota/Kab. {customer.city.toLowerCase()}</span>}
                                        {customer.city && (customer.district || customer.village) && <span>,</span>}
                                        {customer.district && <span>Kec. {customer.district.toLowerCase()}</span>}
                                        {customer.district && customer.village && <span>,</span>}
                                        {customer.village && <span>Kel. {customer.village.toLowerCase()}</span>}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            {isAdmin && (
                              <div className="shrink-0">
                                <ActionMenu
                                  triggerClassName="-mr-3 -mt-3"
                                  items={[
                                    {
                                      label: "Lihat Detail",
                                      icon: <Eye className="h-4 w-4 text-slate-500" />,
                                      onClick: () => handleOpenDetail(customer),
                                    },
                                    {
                                      label: "Edit",
                                      icon: <Edit className="h-4 w-4 text-slate-500" />,
                                      onClick: () => handleOpenDialog(customer),
                                    },
                                    {
                                      label: "Hapus",
                                      icon: <Trash2 className="h-4 w-4" />,
                                      onClick: () => triggerDelete(customer.id, customer.name),
                                      destructive: true,
                                    },
                                  ]}
                                />
                              </div>
                            )}
                          </div>
                          <div className="flex justify-between text-sm pt-2 border-t border-slate-100 dark:border-slate-800">
                            <div className="text-left">
                              <span className="text-xs text-slate-500 dark:text-slate-400">Pelanggan dari</span>
                              <div className="font-semibold text-slate-700 dark:text-slate-300">{customer.sales_name || "-"}</div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden md:block bg-white dark:bg-slate-900 rounded-none shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                          <TableHead className="w-[130px]">ID Pelanggan</TableHead>
                          <TableHead className="min-w-[200px]">Nama Pelanggan</TableHead>
                          <TableHead className="w-[140px]">No. Telp</TableHead>
                          <TableHead>Kota/Kabupaten</TableHead>
                          <TableHead>Kecamatan</TableHead>
                          <TableHead>Kelurahan</TableHead>
                          <TableHead className="w-[140px]">Pelanggan dari</TableHead>
                          {isAdmin && <TableHead className="w-[50px] text-center">Aksi</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCustomers?.length === 0 ? (
                          <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-500 dark:text-slate-400">Tidak ada data</TableCell></TableRow>
                        ) : (
                          paginatedCustomers?.map((customer: any) => {
                            return (
                              <TableRow
                                key={customer.id}
                                className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:shadow-sm relative hover:z-10 transition-all duration-200"
                              >
                                <TableCell className="text-slate-600 dark:text-slate-400 whitespace-nowrap">{customer.customer_id_manual || "-"}</TableCell>
                                <TableCell className="font-medium text-slate-900 dark:text-white whitespace-nowrap">{customer.name}</TableCell>
                                <TableCell className="text-slate-600 dark:text-slate-400 whitespace-nowrap">{customer.phone || "-"}</TableCell>
                                <TableCell className="text-slate-600 dark:text-slate-400 whitespace-nowrap capitalize">{customer.city?.toLowerCase() || "-"}</TableCell>
                                <TableCell className="text-slate-600 dark:text-slate-400 whitespace-nowrap capitalize">{customer.district?.toLowerCase() || "-"}</TableCell>
                                <TableCell className="text-slate-600 dark:text-slate-400 whitespace-nowrap capitalize">{customer.village?.toLowerCase() || "-"}</TableCell>
                                <TableCell className="text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                  {customer.sales_name || "-"}
                                </TableCell>
                                {isAdmin && (
                                  <TableCell className="text-center whitespace-nowrap">
                                    <ActionMenu
                                      items={[
                                        {
                                          label: "Lihat Detail",
                                          icon: <Eye className="h-4 w-4 text-slate-500" />,
                                          onClick: () => handleOpenDetail(customer),
                                        },
                                        {
                                          label: "Edit",
                                          icon: <Edit className="h-4 w-4 text-slate-500" />,
                                          onClick: () => handleOpenDialog(customer),
                                        },
                                        {
                                          label: "Hapus",
                                          icon: <Trash2 className="h-4 w-4" />,
                                          onClick: () => triggerDelete(customer.id, customer.name),
                                          destructive: true,
                                        },
                                      ]}
                                    />
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </>

                {/* Pagination Controls */}
                {filteredCustomers && filteredCustomers.length > 0 && (
                  <div className="flex items-center justify-between py-3 border-t border-slate-200 dark:border-slate-800 mt-2">
                    <div className="text-sm text-slate-500">
                      Halaman {page} dari {Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE) || 1}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePrevPage}
                        disabled={page === 1}
                        className="flex items-center gap-1"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Prev
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleNextPage}
                        disabled={page * ITEMS_PER_PAGE >= filteredCustomers.length}
                        className="flex items-center gap-1"
                      >
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>



        {/* Lookup Dialog */}
        <Dialog open={isLookupDialogOpen} onOpenChange={setIsLookupDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cari Pelanggan</DialogTitle>
              <DialogDescription>Masukkan nomor HP pelanggan</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex gap-2">
                <Input placeholder="Nomor HP" value={lookupPhone} onChange={(e) => setLookupPhone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLookup()} className="flex-1" />
                <Button onClick={handleLookup} disabled={isLookupPending}><Search className="w-4 h-4 mr-2" /> Cari</Button>
              </div>
              {lookupResult && (
                <div className="mt-4 p-4 bg-gradient-to-r from-amber-50 to-slate-50 dark:from-amber-950/50 dark:to-slate-900 border border-amber-200 dark:border-amber-800/50 rounded-none space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-bold text-lg text-slate-900 dark:text-white">{lookupResult.name}</div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">{lookupResult.phone}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsLookupDialogOpen(false); setLookupPhone(""); setLookupResult(null); }}>Tutup</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </Sidebar>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {deleteCustomerName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan.<br></br> Pelanggan ini akan dihapus secara permanen dari sistem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-t-2 border-slate-200 dark:border-slate-700 pt-4 mt-2">
            <AlertDialogCancel onClick={() => setDeleteCustomerId(null)}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              disabled={deleteCustomer.isPending}
            >
              {deleteCustomer.isPending ? "Menghapus..." : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}