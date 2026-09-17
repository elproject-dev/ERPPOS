import { useState, useMemo } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { ActionMenu } from "@/components/ui/action-menu";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, Edit, Trash2, Users, Store, Building2, UserCog, SquarePen, Eye, X } from "lucide-react";
import { isTenantSuperAdmin } from "@/lib/tenant";
import { useListOutlets, useListStaff, useCreateStaff, useUpdateStaff, useDeleteStaff } from "@/mocks/api-client-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { ADMIN_EMAIL } from "@/lib/auth";

interface Staff {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  outlet_id: number | null;
  outlets?: { name: string } | null;
  avatar_url?: string | null;
}

export default function StaffPage() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  // Data hooks
  const { data: outlets, refetch: refetchOutlets } = useListOutlets();
  const [selectedOutletFilter, setSelectedOutletFilter] = useState<string>("all");
  const { data: staffList, isLoading, refetch } = useListStaff({ outletId: selectedOutletFilter });
  const { mutate: createStaff, isPending: isCreating } = useCreateStaff();
  const { mutate: updateStaff, isPending: isUpdating } = useUpdateStaff();
  const { mutate: deleteStaff } = useDeleteStaff();

  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [selectedStaffDetail, setSelectedStaffDetail] = useState<Staff | null>(null);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteStaffId, setDeleteStaffId] = useState<number | null>(null);
  const [deleteStaffName, setDeleteStaffName] = useState("");

  // Outlet states
  const [isOutletDialogOpen, setIsOutletDialogOpen] = useState(false);
  const [newOutletName, setNewOutletName] = useState('');
  const [newStoreName, setNewStoreName] = useState('');
  const [newOutletAddress, setNewOutletAddress] = useState('');
  const [newOutletPhone, setNewOutletPhone] = useState('');
  const [newOutletFooter1, setNewOutletFooter1] = useState('');
  const [newOutletFooter2, setNewOutletFooter2] = useState('');
  const [newOutletFooter3, setNewOutletFooter3] = useState('');
  const [isCreatingOutlet, setIsCreatingOutlet] = useState(false);
  const [editingOutletId, setEditingOutletId] = useState<number | null>(null);

  const isAdmin = useMemo(() => isTenantSuperAdmin(), []);

  // Tambahkan akun admin root jika belum ada di tabel staff
  const staffListWithAdmin = useMemo(() => {
    const adminAlreadyInList = staffList.some(
      (s) => s.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
    );
    if (adminAlreadyInList) return staffList;

    const virtualAdmin: Staff = {
      id: -1, // virtual ID
      name: currentUser?.name || "Admin",
      email: ADMIN_EMAIL,
      phone: "-",
      role: "admin",
      status: "active",
      outlet_id: null,
      outlets: null,
      avatar_url: currentUser?.avatarUrl || null,
    };
    return [virtualAdmin, ...staffList];
  }, [staffList, currentUser]);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    role: "kasir",
    status: "active",
    outlet_id: "all",
  });

  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("all");

  const filteredStaff = staffListWithAdmin.filter((staff) => {
    const matchesSearch = search === "" ||
      staff.name.toLowerCase().includes(search.toLowerCase()) ||
      staff.email.toLowerCase().includes(search.toLowerCase());

    const matchesRole = selectedRoleFilter === "all" || staff.role.toLowerCase() === selectedRoleFilter.toLowerCase();

    return matchesSearch && matchesRole;
  }).sort((a, b) => {
    const rolePriority: Record<string, number> = {
      developer: 1,
      admin: 2,
      kasir: 3
    };

    const priorityA = rolePriority[a.role.toLowerCase()] || 99;
    const priorityB = rolePriority[b.role.toLowerCase()] || 99;

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    return a.name.localeCompare(b.name);
  });

  const handleOpenDialog = (staff?: Staff) => {
    if (staff) {
      setEditingStaff(staff);
      setFormData({
        name: staff.name,
        email: staff.email,
        phone: staff.phone || "",
        role: staff.role,
        status: staff.status || "active",
        outlet_id: staff.outlet_id ? staff.outlet_id.toString() : "all",
      });
    } else {
      setEditingStaff(null);
      setFormData({
        name: "",
        email: "",
        phone: "",
        role: "kasir",
        status: "active",
        outlet_id: "all",
      });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.email || !formData.role) {
      toast({ title: "Error", description: "Nama, email, dan peran wajib diisi", variant: "destructive" });
      return;
    }

    const payload = {
      ...formData,
      outlet_id: formData.outlet_id === "all" ? null : parseInt(formData.outlet_id),
    };

    if (editingStaff) {
      updateStaff(
        { id: editingStaff.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Sukses", description: "Data staff berhasil diperbarui" });
            setIsDialogOpen(false);
            refetch();
          },
          onError: () => {
            toast({ title: "Error", description: "Gagal memperbarui data staff", variant: "destructive" });
          }
        }
      );
    } else {
      createStaff(
        { data: payload },
        {
          onSuccess: () => {
            toast({ title: "Sukses", description: "Staff berhasil ditambahkan" });
            setIsDialogOpen(false);
            refetch();
          },
          onError: () => {
            toast({ title: "Error", description: "Gagal menambahkan staff", variant: "destructive" });
          }
        }
      );
    }
  };

  const triggerDelete = (id: number, name: string) => {
    setDeleteStaffId(id);
    setDeleteStaffName(name);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = () => {
    if (!deleteStaffId) return;

    deleteStaff(
      { id: deleteStaffId },
      {
        onSuccess: () => {
          toast({ title: "Sukses", description: "Staff berhasil dihapus" });
          refetch();
          setIsDeleteDialogOpen(false);
          setDeleteStaffId(null);
        },
        onError: () => {
          toast({ title: "Error", description: "Gagal menghapus staff", variant: "destructive" });
        }
      }
    );
  };

  const handleSaveOutlet = async () => {
    if (!newOutletName.trim()) {
      toast({ title: "Error", description: "Nama outlet harus diisi", variant: "destructive" });
      return;
    }

    setIsCreatingOutlet(true);
    try {
      let error;
      if (editingOutletId) {
        const result = await supabase
          .from('outlets')
          .update({
            name: newOutletName.trim(),
            store_name: newStoreName.trim(),
            address: newOutletAddress.trim(),
            phone: newOutletPhone.trim(),
            footer_message: newOutletFooter1.trim() || null,
            footer_message2: newOutletFooter2.trim() || null,
            footer_message3: newOutletFooter3.trim() || null,
          })
          .eq('id', editingOutletId);
        error = result.error;
      } else {
        const result = await supabase
          .from('outlets')
          .insert([{
            name: newOutletName.trim(),
            store_name: newStoreName.trim(),
            address: newOutletAddress.trim(),
            phone: newOutletPhone.trim(),
            footer_message: newOutletFooter1.trim() || null,
            footer_message2: newOutletFooter2.trim() || null,
            footer_message3: newOutletFooter3.trim() || null,
            is_active: true
          }]);
        error = result.error;
      }

      if (error) {
        toast({ title: "Error", description: "Gagal menyimpan outlet", variant: "destructive" });
      } else {
        toast({ title: "Sukses", description: editingOutletId ? "Outlet diperbarui" : "Outlet ditambahkan" });
      }

      setNewOutletName('');
      setNewStoreName('');
      setNewOutletAddress('');
      setNewOutletPhone('');
      setEditingOutletId(null);
      refetchOutlets();
    } catch (error) {
      toast({ title: "Error", description: "Terjadi kesalahan", variant: "destructive" });
    } finally {
      setIsCreatingOutlet(false);
    }
  };

  const handleEditOutlet = (outlet: any) => {
    setEditingOutletId(outlet.id);
    setNewOutletName(outlet.name);
    setNewStoreName(outlet.store_name || '');
    setNewOutletAddress(outlet.address || '');
    setNewOutletPhone(outlet.phone || '');
    setNewOutletFooter1(outlet.footer_message || '');
    setNewOutletFooter2(outlet.footer_message2 || '');
    setNewOutletFooter3(outlet.footer_message3 || '');
  };

  const handleDeleteOutlet = async (id: number) => {
    if (!confirm("Hapus outlet ini?")) return;

    try {
      const { error } = await supabase.from('outlets').delete().eq('id', id);
      if (error) {
        toast({ title: "Error", description: "Gagal menghapus outlet (mungkin masih ada data terkait)", variant: "destructive" });
      } else {
        toast({ title: "Sukses", description: "Outlet dihapus" });
        refetchOutlets();
      }
    } catch (error) {
      toast({ title: "Error", description: "Terjadi kesalahan", variant: "destructive" });
    }
  };

  const resetOutletForm = () => {
    setNewOutletName('');
    setNewStoreName('');
    setNewOutletAddress('');
    setNewOutletPhone('');
    setNewOutletFooter1('');
    setNewOutletFooter2('');
    setNewOutletFooter3('');
    setEditingOutletId(null);
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "admin": return "Admin";
      case "developer": return "Developer";
      case "supervisor": return "Supervisor";
      case "kasir": return "Sales";
      default: return role;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "admin": return "bg-purple-600 dark:bg-purple-700 text-white";
      case "developer": return "bg-[hsl(0,72%,51%)] text-white font-bold";
      case "supervisor": return "bg-blue-600 dark:bg-blue-700 text-white";
      case "kasir": return "bg-[hsl(188,72%,51%)] text-white font-bold";
      default: return "bg-slate-500 dark:bg-slate-600 text-white";
    }
  };

  const getRoleTextColor = (role: string) => {
    switch (role) {
      case "admin": return "text-purple-600 dark:text-purple-400";
      case "developer": return "text-[hsl(0,72%,51%)]";
      case "supervisor": return "text-blue-600 dark:text-blue-400";
      case "kasir": return "text-[hsl(188,72%,51%)]";
      default: return "text-slate-600 dark:text-slate-400";
    }
  };

  return (
    <Sidebar>
      <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950" style={{ '--radius': '0px' } as React.CSSProperties}>
        {/* Header */}
        <div className="px-4 py-2 sm:px-6 sm:py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between">
          <h1 className="text-xl sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            Manajemen Staff
          </h1>
          {isAdmin && (
            <>
              {/* Mobile 3-Dots Action Menu */}
              <div className="sm:hidden flex items-center">
                <ActionMenu
                  items={[
                    {
                      label: "Tambah Staff",
                      icon: <Plus className="h-4 w-4 text-primary" />,
                      onClick: () => handleOpenDialog(),
                    },
                    {
                      label: "Area Cabang",
                      icon: <Store className="h-4 w-4 text-primary" />,
                      onClick: () => setIsOutletDialogOpen(true),
                    },
                  ]}
                />
              </div>

              {/* Desktop Buttons */}
              <div className="hidden sm:flex items-center gap-2">
                <Button variant="outline" onClick={() => setIsOutletDialogOpen(true)} className="h-8 px-3 text-sm gap-2">
                  <Store className="w-4 h-4" />
                  Area Cabang
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
            <LoadingSpinner text="Memuat data staff..." />
          </div>
        ) : (
          <>
            <div id="staff-scroll-container" className="px-4 py-3 sm:px-6 sm:py-4 flex-1 overflow-auto scrollbar-hide">
              {isDialogOpen && (
                <div id="staff-form-card" className="mb-6 p-4 sm:p-5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">{editingStaff ? "Edit Staff" : "Tambah Staff Baru"}</h2>
                      <p className="text-sm text-slate-500">{editingStaff ? "Ubah informasi staff yang sudah ada" : "Isi formulir untuk menambah staff baru"}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setIsDialogOpen(false)} className="h-8 w-8 rounded-none">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-sm font-medium">Nama Lengkap</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Masukkan nama lengkap"
                        className="h-11 rounded-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-sm font-medium">Email (Untuk Login)</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="Masukkan alamat email"
                        className="h-11 rounded-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-sm font-medium">Nomor Telepon</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="Masukkan nomor telepon"
                        className="h-11 rounded-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="role" className="text-sm font-medium">Peran</Label>
                        <Select
                          value={formData.role}
                          onValueChange={(value) => setFormData({ ...formData, role: value })}
                        >
                          <SelectTrigger id="role" className="h-11 rounded-none">
                            <SelectValue placeholder="Pilih peran" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="kasir">Sales / Kasir</SelectItem>
                            <SelectItem value="supervisor">Supervisor</SelectItem>
                            {isAdmin && <SelectItem value="admin">Admin</SelectItem>}
                            {isAdmin && <SelectItem value="developer">Developer</SelectItem>}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="status" className="text-sm font-medium">Status</Label>
                        <Select
                          value={formData.status}
                          onValueChange={(value) => setFormData({ ...formData, status: value })}
                        >
                          <SelectTrigger id="status" className="h-11 rounded-none">
                            <SelectValue placeholder="Pilih status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Aktif</SelectItem>
                            <SelectItem value="inactive">Nonaktif</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="outlet" className="text-sm font-medium flex items-center gap-2">
                        <Store className="w-4 h-4 text-slate-500" />
                        Cabang Penugasan
                      </Label>
                      <Select
                        value={formData.outlet_id}
                        onValueChange={(value) => setFormData({ ...formData, outlet_id: value })}
                      >
                        <SelectTrigger id="outlet" className="h-11 rounded-none">
                          <SelectValue placeholder="Pilih cabang/outlet penugasan" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Belum Ditugaskan</SelectItem>
                          {outlets?.map((outlet: any) => (
                            <SelectItem key={outlet.id} value={outlet.id.toString()}>
                              {outlet.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500">
                        Untuk kasir/sales yang bertugas di lapangan, harap pilih Cabang spesifik agar harga dapat disesuaikan otomatis dengan harga cabang.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 flex gap-2 justify-end pt-4 border-t border-slate-100 dark:border-slate-700">
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="rounded-none">Batal</Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={isCreating || isUpdating}
                      className="rounded-none px-6"
                    >
                      {isCreating || isUpdating ? (
                        <>
                          <div className="w-4 h-4 mr-2 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                          Menyimpan...
                        </>
                      ) : (
                        editingStaff ? "Simpan Perubahan" : "Tambahkan"
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Filters */}
              <div className="mb-4 flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-4 h-4" />
                  <Input
                    placeholder="Cari staff berdasarkan nama atau email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 shadow-sm"
                  />
                </div>
              </div>

              <>
                {/* Table (Desktop) */}
                <div className="hidden md:block bg-white dark:bg-slate-900 rounded-none shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/50 dark:bg-slate-800/50">
                        <TableHead className="w-16 text-center font-semibold">Foto</TableHead>
                        <TableHead className="font-semibold">Nama & Email</TableHead>
                        <TableHead className="font-semibold">Telepon</TableHead>
                        <TableHead className="font-semibold">Cabang</TableHead>
                        <TableHead className="font-semibold text-center w-[120px]">Peran</TableHead>
                        <TableHead className="font-semibold text-center w-[100px]">Status</TableHead>

                        {isAdmin && <TableHead className="w-[50px] text-center font-semibold">Aksi</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStaff.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-16 text-slate-500">
                            <div className="flex flex-col items-center gap-3">
                              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center">
                                <Users className="w-8 h-8 text-slate-400" />
                              </div>
                              <div>
                                <p className="font-medium text-slate-700 dark:text-slate-300">Belum ada data staff</p>
                                <p className="text-sm text-slate-400 mt-1">Tambahkan staff untuk mengatur akses login</p>
                              </div>
                              {isAdmin && (
                                <Button variant="outline" size="sm" onClick={() => handleOpenDialog()} className="mt-2">
                                  <Plus className="w-4 h-4 mr-2" />
                                  Tambah Staff
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredStaff.map((staff) => (
                          <TableRow
                            key={staff.id}
                            className="border-b dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:shadow-sm relative hover:z-10 transition-all duration-200 cursor-pointer"
                            onClick={() => setSelectedStaffDetail(staff)}
                          >
                            <TableCell className="w-16">
                              <div className="flex items-center justify-center">
                                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700 overflow-hidden">
                                  {staff.avatar_url ? (
                                    <img src={staff.avatar_url} alt={staff.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-sm font-bold text-slate-500 dark:text-slate-400">
                                      {staff.name.charAt(0).toUpperCase()}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-slate-900 dark:text-white">{staff.name}</p>
                                <p className="text-sm text-slate-500">{staff.email}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-slate-600 dark:text-slate-400">
                              {staff.phone || "-"}
                            </TableCell>
                            <TableCell className="text-slate-600 dark:text-slate-400">
                              {staff.outlet_id && staff.outlets ? (
                                <span>{staff.outlets.name}</span>
                              ) : (staff.role === 'admin' || staff.role === 'developer') ? (
                                <span className="text-slate-500 font-medium">Semua Cabang</span>
                              ) : (
                                <span className="text-slate-400 italic">Belum Ditugaskan</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge className={`${getRoleColor(staff.role)} rounded-sm`}>
                                {getRoleLabel(staff.role)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              {staff.status === 'active' ? (
                                <Badge className="bg-green-500 dark:bg-green-600 rounded-sm">Aktif</Badge>
                              ) : (
                                <Badge variant="destructive" className="rounded-sm">Nonaktif</Badge>
                              )}
                            </TableCell>

                            {isAdmin && (
                              <TableCell className="text-center whitespace-nowrap">
                                {staff.id !== -1 ? (
                                  <ActionMenu
                                    items={[
                                      {
                                        label: "Edit",
                                        icon: <SquarePen className="h-4 w-4 text-slate-500" />,
                                        onClick: () => handleOpenDialog(staff),
                                      },
                                      {
                                        label: "Hapus",
                                        icon: <Trash2 className="h-4 w-4" />,
                                        onClick: () => triggerDelete(staff.id, staff.name),
                                        destructive: true,
                                      },
                                    ]}
                                  />
                                ) : (
                                  <span className="text-xs text-slate-400 italic pr-2">Root Admin</span>
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Card List (Smartphone) */}
                <div className="md:hidden space-y-3 mt-4">
                  {filteredStaff.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 bg-white dark:bg-slate-900 rounded-none border border-slate-200 dark:border-slate-800">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-none flex items-center justify-center">
                          <Users className="w-6 h-6 text-slate-400" />
                        </div>
                        <p className="font-medium text-slate-700 dark:text-slate-300">Belum ada data staff</p>
                      </div>
                    </div>
                  ) : (
                    filteredStaff.map((staff) => (
                      <div
                        key={staff.id}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none p-4 flex flex-col gap-3 shadow-sm relative hover:shadow transition-all"
                        onClick={() => setSelectedStaffDetail(staff)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-600 overflow-hidden">
                              {staff.avatar_url ? (
                                <img src={staff.avatar_url} alt={staff.name} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-sm font-bold text-slate-500 dark:text-slate-400">
                                  {staff.name.charAt(0).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 dark:text-white truncate">{staff.name}</p>
                              <p className="text-xs text-slate-500 truncate">{staff.email}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                {staff.outlet_id && staff.outlets ? staff.outlets.name : (staff.role === 'admin' || staff.role === 'developer') ? "Semua Cabang" : "Belum Ditugaskan"}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end shrink-0">
                            {isAdmin && staff.id !== -1 && (
                              <ActionMenu
                                triggerClassName="-mr-3.5 -mt-3.5"
                                items={[
                                  {
                                    label: "Edit",
                                    icon: <SquarePen className="h-4 w-4 text-slate-500" />,
                                    onClick: () => handleOpenDialog(staff),
                                  },
                                  {
                                    label: "Hapus",
                                    icon: <Trash2 className="h-4 w-4" />,
                                    onClick: () => triggerDelete(staff.id, staff.name),
                                    destructive: true,
                                  },
                                ]}
                              />
                            )}
                            <Badge className={`${getRoleColor(staff.role)} rounded-sm text-[11px] px-2 py-0.5 mt-1`}>
                              {getRoleLabel(staff.role)}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex justify-between items-center text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg">
                          <span className="text-[10px] text-slate-400 uppercase">Status</span>
                          <span className={staff.status === 'active' ? "text-green-600 dark:text-green-400 font-medium" : "text-red-500 font-medium"}>
                            {staff.status === 'active' ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            </div>
          </>
        )}
      </div>



      {/* Detail Staff Dialog */}
      <Dialog open={!!selectedStaffDetail} onOpenChange={(open) => !open && setSelectedStaffDetail(null)}>
        <DialogContent className="sm:max-w-md sm:rounded-sm max-h-[90vh] overflow-y-auto scrollbar-hide">
          <DialogHeader className="pb-4 border-b border-slate-100 dark:border-slate-800">
            <DialogTitle className="text-1xl font-bold flex items-center gap-2">
              Detail Staff
            </DialogTitle>
            <DialogDescription className="sr-only">
              Informasi detail mengenai staff ini
            </DialogDescription>
          </DialogHeader>

          {selectedStaffDetail && (
            <div className="space-y-5 py-2">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Nama Lengkap</p>
                  <p className="font-semibold text-slate-900 dark:text-white text-lg truncate">{selectedStaffDetail.name}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                  {selectedStaffDetail.avatar_url ? (
                    <img src={selectedStaffDetail.avatar_url} alt={selectedStaffDetail.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-lg font-bold text-slate-500 dark:text-slate-400">
                      {selectedStaffDetail.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Email</p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate" title={selectedStaffDetail.email}>{selectedStaffDetail.email}</p>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5 text-right w-full">Status</p>
                  {selectedStaffDetail.status === 'active' ? (
                    <Badge className="mt-1 bg-green-500 dark:bg-green-600 text-[10px] h-5 px-2 rounded-sm">Aktif</Badge>
                  ) : (
                    <Badge variant="destructive" className="mt-1 text-[10px] h-5 px-2 rounded-sm">Nonaktif</Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Telepon</p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{selectedStaffDetail.phone || "-"}</p>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5 text-right w-full">Peran / Role</p>
                  <Badge className={`${getRoleColor(selectedStaffDetail.role)} mt-1 text-[10px] h-5 px-2 rounded-sm`}>
                    {getRoleLabel(selectedStaffDetail.role)}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Cabang Penugasan</p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                    {selectedStaffDetail.outlet_id && selectedStaffDetail.outlets ? selectedStaffDetail.outlets.name : (selectedStaffDetail.role === 'admin' || selectedStaffDetail.role === 'developer') ? "Semua Cabang" : "Belum Ditugaskan"}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-2 flex justify-end">
            <Button onClick={() => setSelectedStaffDetail(null)} className="rounded-sm">Tutup</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Outlet Management Dialog */}
      <Dialog
        open={isOutletDialogOpen}
        onOpenChange={(open) => {
          setIsOutletDialogOpen(open);
          if (!open) resetOutletForm();
        }}
      >
        <DialogContent className="sm:max-w-xl sm:rounded-none max-h-[90vh] overflow-y-auto scrollbar-hide">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">

              Manajemen Area
            </DialogTitle>
            <DialogDescription>
              Kelola daftar Area untuk penugasan staff.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">{editingOutletId ? 'Edit Cabang' : 'Tambah Cabang Baru'}</h4>
              <div className="space-y-1.5">

                <Input
                  placeholder="Contoh : Solo,Jogja"
                  value={newOutletName}
                  onChange={(e) => setNewOutletName(e.target.value)}
                  className="h-9 rounded-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveOutlet();
                  }}
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                {editingOutletId && (
                  <Button variant="ghost" size="sm" onClick={resetOutletForm} className="h-9 rounded-none">
                    Batal Edit
                  </Button>
                )}
                <Button onClick={handleSaveOutlet} disabled={isCreatingOutlet} className="h-9 rounded-none">
                  {isCreatingOutlet ? 'Menyimpan...' : (editingOutletId ? 'Simpan Perubahan' : 'Tambahkan Cabang')}
                </Button>
              </div>
            </div>

            <div className="w-full h-px bg-slate-200 dark:bg-slate-800 my-5" />

            <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-hide">
              <h4 className="text-sm font-semibold mb-2">Daftar Cabang Saat Ini</h4>
              {!outlets || outlets.length === 0 ? (
                <div className="text-center py-8 text-slate-500 bg-white dark:bg-slate-800 rounded-none border border-slate-200 dark:border-slate-700">
                  Belum ada cabang/outlet yang ditambahkan.
                </div>
              ) : (
                outlets.map((outlet: any) => (
                  <div key={outlet.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-none gap-3 shadow-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-900 dark:text-white text-sm">{outlet.name}</span>
                      </div>
                    </div>
                    <div className="flex gap-1 items-center justify-end">
                      <Button variant="outline" size="sm" onClick={() => handleEditOutlet(outlet)} className="h-8 rounded-none">
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDeleteOutlet(outlet.id)} className="h-8 rounded-none text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-none" onClick={() => {
              setIsOutletDialogOpen(false);
              resetOutletForm();
            }}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {deleteStaffName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan.<br></br>Data staff akan dihapus secara permanen dari sistem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-t-2 border-slate-200 dark:border-slate-700 pt-4 mt-2">
            <AlertDialogCancel onClick={() => setDeleteStaffId(null)}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}
