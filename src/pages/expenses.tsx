import { useState, useEffect, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ActionMenu } from "@/components/ui/action-menu";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Search, Edit, Trash2, Wallet, TrendingDown, SlidersHorizontal, Receipt, User, Store, Calendar, FileDown, Loader2, Image as ImageIcon, Camera, X, Download, Tag, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { applyTenantFilter, withTenantOwner, handleTenantError, isTenantSuperAdmin, getTenantOwnerId } from "@/lib/tenant";
import { loadSession } from "@/lib/auth";
import { useListOutlets, useListStaff } from "@/mocks/api-client-react";
import { uploadExpenseReceipt, deleteExpenseReceipt } from "@/lib/expense-storage";
import { compressImage } from "@/lib/image-utils";
import * as XLSX from "xlsx-js-style";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";
import { isTauri, tauriSaveFile } from "@/lib/tauri-file";
import { useCountUp } from "@/hooks/useCountUp";

interface Expense {
  id: number;
  category: string;
  description: string;
  supplier?: string;
  amount: number;
  date: string;
  image_url?: string;
  created_at: string;
  owner_id?: string;
  outlet_id?: number;
  status?: 'pending' | 'approved' | 'rejected';
}

interface UserOption {
  id: string;
  name: string;
  email: string;
}

interface ExpenseCategory {
  id: string;
  name: string;
  color: string;
}

const DEFAULT_CATEGORIES: ExpenseCategory[] = [
  { id: "operational", name: "Operasional", color: "blue" },
  { id: "inventory", name: "Pengadaan Barang", color: "green" },
  { id: "utilities", name: "Utilitas", color: "yellow" },
  { id: "maintenance", name: "Perawatan", color: "orange" },
  { id: "marketing", name: "Marketing", color: "purple" },
  { id: "salary", name: "Gaji", color: "red" },
  { id: "rent", name: "Sewa", color: "pink" },
  { id: "transport", name: "Transportasi", color: "cyan" },
  { id: "other", name: "Lainnya", color: "slate" },
];

const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function ExpensesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [categories, setCategories] = useState<ExpenseCategory[]>(DEFAULT_CATEGORIES);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<number | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [totalExpense, setTotalExpense] = useState(0);

  // User filter state
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("all");

  // Staff data hook
  const { data: allStaff } = useListStaff();

  // Outlet filter state
  const [selectedOutlet, setSelectedOutlet] = useState<string>("all");
  const { data: outlets } = useListOutlets();

  // Date filter state
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Download dialog state
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [downloadStartDate, setDownloadStartDate] = useState("");
  const [downloadEndDate, setDownloadEndDate] = useState("");
  const [downloadCount, setDownloadCount] = useState<number | null>(null);

  // Check if current user is admin
  const isAdmin = useMemo(() => {
    return isTenantSuperAdmin();
  }, [currentUser]);

  const currentUserId = useMemo(() => {
    return currentUser?.id || getTenantOwnerId();
  }, [currentUser]);

  // Check font size for responsive layout adjustments
  const currentFontSize = typeof window !== 'undefined' ? localStorage.getItem('fontSize') || 'small' : 'small';
  const isSmallFont = currentFontSize === 'small' || currentFontSize === 'xsmall';

  // Get current outlet from localStorage
  const currentOutletId = useMemo(() => {
    const outletId = localStorage.getItem('selectedOutletId');
    return outletId ? parseInt(outletId) : null;
  }, []);

  const [formData, setFormData] = useState({
    category: "",
    description: "",
    supplier: "",
    amount: "",
    date: getLocalDateString(),
    image_url: "",
  });

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("id-ID").format(num);
  };

  const parseFormattedNumber = (str: string) => {
    return str.replace(/\./g, "");
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = parseFormattedNumber(e.target.value);
    if (rawValue === "" || /^\d+$/.test(rawValue)) {
      const numericValue = rawValue === "" ? "" : parseInt(rawValue, 10);
      setFormData({ ...formData, amount: numericValue.toString() });
    }
  };

  const getFormattedAmount = () => {
    if (formData.amount === "") return "";
    return formatNumber(parseInt(formData.amount, 10));
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;

    const newId = newCategoryName.toLowerCase().replace(/\s+/g, '-');

    if (categories.some(c => c.id === newId)) {
      toast({ title: "Error", description: "Kategori sudah ada", variant: "destructive" });
      return;
    }

    const colors = ["blue", "green", "yellow", "orange", "purple", "red", "pink", "cyan", "slate"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newCategory: ExpenseCategory = {
      id: newId,
      name: newCategoryName.trim(),
      color: randomColor,
    };

    // Optimistic update
    const updated = [...categories, newCategory];
    setCategories(updated);
    setNewCategoryName("");
    toast({ title: "Sukses", description: "Kategori berhasil ditambahkan" });

    // Save to DB
    const { error } = await supabase.from('expense_categories').insert([newCategory]);
    if (error) {
      toast({ title: "Error", description: "Gagal menyimpan kategori ke database", variant: "destructive" });
      fetchCategories(); // Revert optimistic update
    }
  };

  const handleQuickCreateCategory = async (name: string) => {
    if (!name.trim()) return;

    const newId = name.toLowerCase().replace(/\s+/g, '-');

    if (categories.some(c => c.id === newId)) {
      toast({ title: "Error", description: "Kategori sudah ada", variant: "destructive" });
      return;
    }

    const colors = ["blue", "green", "yellow", "orange", "purple", "red", "pink", "cyan", "slate"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newCategory: ExpenseCategory = {
      id: newId,
      name: name.trim(),
      color: randomColor,
    };

    const updated = [...categories, newCategory];
    setCategories(updated);
    setFormData((prev) => ({ ...prev, category: newId }));
    toast({ title: "Sukses", description: "Kategori berhasil ditambahkan" });

    const { error } = await supabase.from('expense_categories').insert([newCategory]);
    if (error) {
      toast({ title: "Error", description: "Gagal menyimpan kategori ke database", variant: "destructive" });
      fetchCategories();
    }
  };

  const handleDeleteCategory = (id: string) => {
    setCategoryToDelete(id);
  };

  const confirmDeleteCategory = async () => {
    if (!categoryToDelete) return;
    const id = categoryToDelete;

    const isUsed = expenses.some((e) => e.category === id);
    if (isUsed) {
      toast({
        title: "Kategori Digunakan",
        description: "Tidak dapat menghapus kategori yang sedang digunakan oleh pengeluaran.",
        variant: "destructive",
      });
      setCategoryToDelete(null);
      return;
    }

    // Optimistic update
    const updated = categories.filter((c) => c.id !== id);
    setCategories(updated);
    toast({ title: "Sukses", description: "Kategori berhasil dihapus" });

    // Save to DB
    const { error } = await supabase.from('expense_categories').delete().eq('id', id);
    if (error) {
      toast({ title: "Error", description: "Gagal menghapus kategori", variant: "destructive" });
      fetchCategories(); // Revert optimistic update
    }

    setCategoryToDelete(null);
  };

  const fetchCategories = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('expense_categories').select('*').order('created_at', { ascending: true });
      if (!error && data && data.length > 0) {
        setCategories(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Fetch categories and listen for changes
  useEffect(() => {
    fetchCategories();

    const channel = supabase
      .channel('expense_categories_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expense_categories' },
        () => {
          fetchCategories();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCategories]);

  // Initial fetch for expenses & users
  useEffect(() => {
    fetchExpenses();
  }, []);

  // Refresh users list when expenses or staff list changes
  useEffect(() => {
    if (expenses.length > 0 || (allStaff && allStaff.length > 0)) {
      fetchUsers();
    }
  }, [expenses, allStaff]);

  // Fetch users for filter dropdown (admin only)
  const fetchUsers = async () => {
    try {
      if (expenses.length === 0) return;

      // 1. Get unique owner_ids from expenses table
      const uniqueOwnerIds = [...new Set(expenses.map(d => d.owner_id).filter(Boolean) as string[])];

      if (uniqueOwnerIds.length === 0) {
        setUsers([]);
        return;
      }

      // 2. Try to get mapping from transactions table (backup source)
      const { data: txs } = await supabase
        .from("transactions")
        .select("owner_id, cashier_name")
        .not("owner_id", "is", null)
        .in("owner_id", uniqueOwnerIds);

      const ownerMap = new Map<string, string>();

      // Populate map from staff table (best source)
      if (allStaff && allStaff.length > 0) {
        allStaff.forEach(s => {
          // Priority 1: Direct owner_id column
          if (s.owner_id) {
            ownerMap.set(s.owner_id, s.name);
          }
          // Priority 2: Extract from avatar_url
          if (s.avatar_url) {
            const match = s.avatar_url.match(/\/avatars\/([0-9a-f-]{36})_/i);
            if (match && match[1]) {
              ownerMap.set(match[1].toLowerCase(), s.name);
            }
          }
        });
      }

      // Populate map from transactions (Secondary source)
      if (txs) {
        txs.forEach(tx => {
          if (tx.cashier_name && !ownerMap.has(tx.owner_id)) {
            ownerMap.set(tx.owner_id.toLowerCase(), tx.cashier_name);
          }
        });
      }

      const userOptions: UserOption[] = uniqueOwnerIds.map((id, index) => {
        const lowerId = id.toLowerCase();

        // If it's the current user, we can use their name from session
        const isCurrentUser = lowerId === currentUserId?.toLowerCase();
        const currentSessionName = isCurrentUser ? currentUser?.name : null;

        // Find staff record from allStaff list
        const staff = allStaff?.find(s =>
          (s.owner_id && s.owner_id.toLowerCase() === lowerId) ||
          (s.avatar_url && s.avatar_url.toLowerCase().includes(lowerId))
        );

        const mappedName = currentSessionName || staff?.name || ownerMap.get(lowerId);

        return {
          id,
          name: mappedName || `Staff ${index + 1}`,
          email: staff?.email || "",
        };
      });

      setUsers(userOptions);
    } catch (error: any) {
      console.error("Error fetching users:", error?.message || error);
      setUsers([]);
    }
  };

  const getStaffNameDisplay = useCallback((ownerId?: string) => {
    if (!ownerId) return "Admin";
    const lowerId = ownerId.toLowerCase();

    if (lowerId === currentUserId?.toLowerCase()) {
      return currentUser?.name || "Anda";
    }

    // 1. Look in allStaff first (direct and URL extraction)
    const staff = allStaff?.find(s =>
      (s.owner_id && s.owner_id.toLowerCase() === lowerId) ||
      (s.avatar_url && s.avatar_url.toLowerCase().includes(lowerId))
    );
    if (staff) return staff.name;

    // 2. Look in users state
    const mappedUser = users.find(u => u.id.toLowerCase() === lowerId);
    if (mappedUser && !mappedUser.name.startsWith("Staff ")) {
      return mappedUser.name;
    }

    return mappedUser?.name || "Staff";
  }, [currentUserId, currentUser, allStaff, users]);

  useEffect(() => {
    const total = expenses
      .filter((exp) => exp.status !== 'pending' && exp.status !== 'rejected')
      .reduce((sum, exp) => sum + exp.amount, 0);
    setTotalExpense(total);
  }, [expenses]);

  const fetchExpenses = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      let query = supabase
        .from("expenses")
        .select("*")
        .order("date", { ascending: false });

      // Apply tenant filter (already handles admin vs kasir logic)
      query = applyTenantFilter(query);

      // If admin and specific user selected, filter by that user
      if (isAdmin && selectedUserId !== "all") {
        query = query.eq("owner_id", selectedUserId);
      }

      // If specific outlet selected, filter by outlet
      if (selectedOutlet !== "all") {
        query = query.eq("outlet_id", parseInt(selectedOutlet));
      }

      // Date filters
      if (startDate) {
        query = query.gte("date", startDate);
      }
      if (endDate) {
        query = query.lte("date", endDate);
      }

      const { data, error } = await query;

      if (error) throw error;
      setExpenses(data || []);
    } catch (error) {
      console.error("Error fetching expenses:", error);
      if (showLoading) {
        toast({ title: "Error", description: "Gagal memuat data pengeluaran", variant: "destructive" });
      }
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [isAdmin, selectedUserId, selectedOutlet, startDate, endDate, applyTenantFilter, toast]);

  // Refetch when user or outlet filter changes, and setup realtime subscription
  useEffect(() => {
    fetchExpenses();

    const channel = supabase
      .channel('expenses_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expenses' },
        (payload) => {
          // Fetch silently when realtime update occurs
          fetchExpenses(false);
        }
      )
      .subscribe((status) => {
        // Silently handle subscription status
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchExpenses]);

  // Reset download filters on close
  useEffect(() => {
    if (!showDownloadDialog) {
      setDownloadStartDate("");
      setDownloadEndDate("");
      setDownloadCount(null);
    }
  }, [showDownloadDialog]);

  // Fetch download count preview
  useEffect(() => {
    if (!showDownloadDialog) return;

    const fetchDownloadCount = async () => {
      try {
        let query = supabase
          .from("expenses")
          .select("*", { count: "exact", head: true });

        query = applyTenantFilter(query);

        if (selectedOutlet !== "all") {
          query = query.eq("outlet_id", parseInt(selectedOutlet));
        }
        if (isAdmin && selectedUserId !== "all") {
          query = query.eq("owner_id", selectedUserId);
        }
        if (downloadStartDate) {
          query = query.gte("date", downloadStartDate);
        }
        if (downloadEndDate) {
          query = query.lte("date", downloadEndDate);
        }

        const { count, error } = await query;
        if (!error && count !== null) {
          setDownloadCount(count);
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchDownloadCount();
  }, [showDownloadDialog, downloadStartDate, downloadEndDate, selectedOutlet, selectedUserId, isAdmin, applyTenantFilter]);

  const filteredExpenses = expenses.filter((expense) => {
    const matchesSearch =
      expense.description.toLowerCase().includes(search.toLowerCase()) ||
      expense.category.toLowerCase().includes(search.toLowerCase()) ||
      (expense.supplier && expense.supplier.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = selectedCategory === "all" || expense.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleOpenDialog = (expense?: Expense) => {
    setImageFile(null);
    setImagePreview(null);
    if (expense) {
      setEditingExpense(expense);
      setFormData({
        category: expense.category,
        description: expense.description,
        supplier: expense.supplier || "",
        amount: expense.amount.toString(),
        date: expense.date,
        image_url: expense.image_url || "",
      });
      if (expense.image_url) {
        setImagePreview(expense.image_url);
      }
    } else {
      setEditingExpense(null);
      setFormData({
        category: "",
        description: "",
        supplier: "",
        amount: "",
        date: getLocalDateString(),
        image_url: "",
      });
    }
    setIsDialogOpen(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const allowedExts = ['jpg', 'jpeg', 'png', 'webp'];
      const isValidImage = file.type.startsWith("image/") || allowedExts.includes(ext);

      if (!isValidImage) {
        toast({ title: "Error", description: "Hanya file JPG, PNG, atau WebP yang diizinkan", variant: "destructive" });
        return;
      }

      if (file.size > 500 * 1024) {
        toast({ title: "Error", description: "Ukuran file maksimal 500 KB (untuk menghemat kuota cloud)", variant: "destructive" });
        return;
      }

      toast({ title: "Memproses gambar", description: "Mohon tunggu sebentar..." });

      compressImage(file).then((compressedFile: File) => {
        setImageFile(compressedFile);

        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(compressedFile);

        toast({ title: "Foto dipilih", description: "Gambar berhasil dikompresi untuk menghemat kuota", duration: 2000 });
      }).catch((err: any) => {
        console.error("Compression error:", err);
        toast({ title: "Error", description: "Gagal memproses gambar", variant: "destructive" });
      });
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setFormData({ ...formData, image_url: "" });
  };

  const handleSubmit = async () => {
    if (!formData.category || !formData.description || !formData.amount) {
      toast({ title: "Error", description: "Kategori, deskripsi, dan jumlah wajib diisi", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    let finalImageUrl = formData.image_url;

    try {
      if (imageFile) {
        const uploadRes = await uploadExpenseReceipt(imageFile);
        if (!uploadRes.success || !uploadRes.publicUrl) {
          throw new Error(uploadRes.error || "Gagal mengunggah foto bukti");
        }
        finalImageUrl = uploadRes.publicUrl;

        // If editing and replacing an old image, delete the old one
        if (editingExpense && editingExpense.image_url && editingExpense.image_url !== finalImageUrl) {
          await deleteExpenseReceipt(editingExpense.image_url);
        }
      } else if (editingExpense && editingExpense.image_url && !finalImageUrl) {
        // User removed the image
        await deleteExpenseReceipt(editingExpense.image_url);
      }

      const payload = withTenantOwner({
        category: formData.category,
        description: formData.description,
        supplier: formData.supplier,
        amount: parseFloat(formData.amount),
        date: formData.date,
        image_url: finalImageUrl || null,
        outlet_id: currentOutletId || undefined,
        status: isAdmin ? 'approved' : 'pending',
      }, "expenses");

      if (editingExpense) {
        const query = applyTenantFilter(
          supabase
            .from("expenses")
            .update(payload)
            .eq("id", editingExpense.id)
        );
        const { error } = await query;

        if (error) throw error;
        toast({ title: "Sukses", description: "Pengeluaran berhasil diperbarui" });
      } else {
        const { error } = await supabase.from("expenses").insert(payload);

        if (error) throw error;
        toast({ title: "Sukses", description: "Pengeluaran berhasil ditambahkan" });
      }

      setIsDialogOpen(false);
      fetchExpenses();
    } catch (error: any) {
      console.error("Error saving expense:", error);
      handleTenantError(error);
      toast({ title: "Error", description: error.message || "Gagal menyimpan pengeluaran", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpdateStatus = async (id: number, newStatus: 'approved' | 'rejected') => {
    try {
      const query = applyTenantFilter(
        supabase
          .from("expenses")
          .update({ status: newStatus })
          .eq("id", id)
      );
      const { error } = await query;
      if (error) throw error;
      toast({ title: "Sukses", description: `Pengeluaran berhasil ${newStatus === 'approved' ? 'disetujui' : 'ditolak'}` });
      fetchExpenses();
      queryClient.invalidateQueries({ queryKey: ["pendingExpensesCount"] });
    } catch (error: any) {
      console.error("Error updating expense status:", error);
      handleTenantError(error);
      toast({ title: "Error", description: error.message || "Gagal mengubah status pengeluaran", variant: "destructive" });
    }
  };

  const handleDelete = (id: number) => {
    setExpenseToDelete(id);
  };

  const confirmDeleteExpense = async () => {
    if (expenseToDelete === null) return;

    try {
      const expenseToDeleteData = expenses.find(e => e.id === expenseToDelete);
      if (expenseToDeleteData?.image_url) {
        const deleteRes = await deleteExpenseReceipt(expenseToDeleteData.image_url);
        if (!deleteRes.success) {
          console.warn("Gagal menghapus foto di Supabase:", deleteRes.error);
          toast({ title: "Warning", description: "Data terhapus, tapi foto mungkin masih tersisa di server.", variant: "destructive" });
        }
      }

      const query = applyTenantFilter(
        supabase.from("expenses").delete().eq("id", expenseToDelete)
      );
      const { error } = await query;
      if (error) throw error;
      toast({ title: "Sukses", description: "Pengeluaran berhasil dihapus" });
      setExpenseToDelete(null);
      fetchExpenses();
    } catch (error) {
      console.error("Error deleting expense:", error);
      handleTenantError(error);
      toast({ title: "Error", description: "Gagal menghapus pengeluaran", variant: "destructive" });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleExportExpenses = async () => {
    try {
      setDownloadLoading(true);

      let query = supabase
        .from("expenses")
        .select("*")
        .order("date", { ascending: false });

      // Apply tenant filter
      query = applyTenantFilter(query);

      // Filter by selected outlet
      if (selectedOutlet !== "all") {
        query = query.eq("outlet_id", parseInt(selectedOutlet));
      }

      // Filter by selected user (if admin)
      if (isAdmin && selectedUserId !== "all") {
        query = query.eq("owner_id", selectedUserId);
      }

      // Date range filters
      if (downloadStartDate) {
        query = query.gte("date", downloadStartDate);
      }
      if (downloadEndDate) {
        query = query.lte("date", downloadEndDate);
      }

      const { data: filtered, error } = await query;

      if (error) throw error;

      if (!filtered || filtered.length === 0) {
        toast({ title: "Info", description: `Tidak ada pengeluaran untuk periode ini`, variant: "destructive" });
        return;
      }

      // Format Data for Excel
      const data = filtered.map((exp, index) => {
        const staffName = getStaffNameDisplay(exp.owner_id);
        const outletName = outlets?.find(o => o.id === exp.outlet_id)?.name || "Semua Outlet";
        return {
          "No": index + 1,
          "Tanggal": formatDate(exp.date),
          "Sales": staffName,
          "Kategori": getCategoryLabel(exp.category),
          "Deskripsi": exp.description,
          "Suplier": exp.supplier || "-",
          "Outlet": outletName,
          "Status": exp.status === 'pending' ? 'Pending' : exp.status === 'rejected' ? 'Ditolak' : 'Disetujui',
          "Jumlah": exp.amount
        };
      });

      const ws = XLSX.utils.json_to_sheet(data);

      // Add column widths
      ws["!cols"] = [
        { wch: 5 },  // No
        { wch: 15 }, // Tanggal
        { wch: 15 }, // Sales
        { wch: 20 }, // Kategori
        { wch: 40 }, // Deskripsi
        { wch: 20 }, // Suplier
        { wch: 20 }, // Outlet
        { wch: 15 }, // Status
        { wch: 20 }, // Jumlah
      ];

      // Styles
      const HEADER_STYLE = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { patternType: "solid", fgColor: { rgb: "000000" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin", color: { rgb: "CCCCCC" } },
          bottom: { style: "thin", color: { rgb: "CCCCCC" } },
          left: { style: "thin", color: { rgb: "CCCCCC" } },
          right: { style: "thin", color: { rgb: "CCCCCC" } },
        }
      };

      const STRIPE_WHITE = { patternType: "solid", fgColor: { rgb: "FFFFFF" } };
      const STRIPE_GRAY = { patternType: "solid", fgColor: { rgb: "F2F2F2" } };
      const GRID_BORDER = {
        top: { style: "thin", color: { rgb: "CCCCCC" } },
        bottom: { style: "thin", color: { rgb: "CCCCCC" } },
        left: { style: "thin", color: { rgb: "CCCCCC" } },
        right: { style: "thin", color: { rgb: "CCCCCC" } },
      };

      const range = XLSX.utils.decode_range(ws["!ref"] || "A1:I1");
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = { c: C, r: R };
          const cellRef = XLSX.utils.encode_cell(cellAddress);
          if (!ws[cellRef]) {
            ws[cellRef] = { t: "s", v: "" };
          }
          const cell = ws[cellRef];

          let horizontalAlign: "left" | "center" | "right" = "left";
          if (C === 0 || C === 1 || C === 7) horizontalAlign = "center"; // No, Tanggal, Status
          else if (C === 8) horizontalAlign = "right"; // Jumlah (index 8)

          if (R === 0) {
            // Header
            cell.s = {
              ...HEADER_STYLE,
              alignment: { horizontal: horizontalAlign, vertical: "center", wrapText: false }
            };
          } else {
            // Data
            const stripe = (R - 1) % 2 === 0 ? STRIPE_WHITE : STRIPE_GRAY;
            cell.s = {
              alignment: { horizontal: horizontalAlign, vertical: "center", wrapText: false },
              fill: stripe,
              border: GRID_BORDER
            };

            if (C === 8) { // Jumlah
              cell.s.numFmt = "#,##0";
              if (typeof cell.v === 'number' || !isNaN(Number(cell.v))) {
                if (typeof cell.v !== 'number') {
                  cell.v = Number(cell.v);
                }
                cell.t = 'n';
              }
            }
          }
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Pengeluaran");
      const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

      const dateStr = new Date().toISOString().slice(0, 10);
      let fileName = `Laporan_Pengeluaran_${dateStr}.xlsx`;
      if (downloadStartDate && downloadEndDate) {
        fileName = `Laporan_Pengeluaran_${downloadStartDate}_sd_${downloadEndDate}.xlsx`;
      } else if (downloadStartDate) {
        fileName = `Laporan_Pengeluaran_Mulai_${downloadStartDate}.xlsx`;
      } else if (downloadEndDate) {
        fileName = `Laporan_Pengeluaran_Sampai_${downloadEndDate}.xlsx`;
      }

      if (Capacitor.isNativePlatform()) {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          const base64data = (reader.result as string).split(',')[1];
          await Filesystem.writeFile({
            path: fileName,
            data: base64data,
            directory: Directory.Cache,
            recursive: true
          });
          const filePath = await Filesystem.getUri({
            path: fileName,
            directory: Directory.Cache
          });
          await Share.share({
            title: "Download Laporan Pengeluaran",
            url: filePath.uri
          });
        };
      } else if (isTauri()) {
        // Tauri desktop: Use native save dialog
        await tauriSaveFile(
          excelBuffer,
          fileName,
          [{ name: "Excel Files", extensions: ["xlsx"] }]
        );
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

      toast({ title: "Sukses", description: `Berhasil download laporan pengeluaran` });
      setShowDownloadDialog(false);
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Gagal mendownload laporan", variant: "destructive" });
    } finally {
      setDownloadLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const getCategoryLabel = (categoryId: string) => {
    return categories.find((c) => c.id === categoryId)?.name || categoryId;
  };

  const getCategoryColor = (categoryId: string) => {
    const category = categories.find((c) => c.id === categoryId);
    const color = category?.color || "slate";

    const colorMap: Record<string, string> = {
      blue: "bg-blue-600 dark:bg-blue-700 text-white",
      green: "bg-green-600 dark:bg-green-700 text-white",
      yellow: "bg-yellow-500 dark:bg-yellow-600 text-white",
      orange: "bg-orange-500 dark:bg-orange-600 text-white",
      purple: "bg-purple-600 dark:bg-purple-700 text-white",
      red: "bg-red-600 dark:bg-red-700 text-white",
      pink: "bg-pink-600 dark:bg-pink-700 text-white",
      cyan: "bg-cyan-600 dark:bg-cyan-700 text-white",
      slate: "bg-slate-600 dark:bg-slate-700 text-white",
    };
    return colorMap[color] || colorMap.slate;
  };

  const getBadgeDotColor = (color: string) => {
    const map: Record<string, string> = {
      blue: "bg-blue-500",
      green: "bg-green-500",
      yellow: "bg-yellow-500",
      orange: "bg-orange-500",
      purple: "bg-purple-500",
      red: "bg-red-500",
      pink: "bg-pink-500",
      cyan: "bg-cyan-500",
      slate: "bg-slate-500",
    };
    return map[color] || map.slate;
  };

  // Hitung metrik hari ini dan bulan ini
  const { todayTotal, todayCount, thisMonthTotal, thisMonthCount, currentDay } = useMemo(() => {
    const now = new Date();
    // Gunakan format YYYY-MM-DD lokal
    const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentMonthLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let tTotal = 0;
    let tCount = 0;
    let mTotal = 0;
    let mCount = 0;

    expenses.forEach(e => {
      if (e.status === 'pending' || e.status === 'rejected') return;
      if (e.date === todayLocal) {
        tTotal += e.amount;
        tCount++;
      }
      if (e.date.startsWith(currentMonthLocal)) {
        mTotal += e.amount;
        mCount++;
      }
    });

    const cDay = now.getDate();
    return {
      todayTotal: tTotal,
      todayCount: tCount,
      thisMonthTotal: mTotal,
      thisMonthCount: mCount,
      currentDay: cDay
    };
  }, [expenses]);

  const animatedTodayTotal = useCountUp(todayTotal, { duration: 1200 });
  const animatedThisMonthTotal = useCountUp(thisMonthTotal, { duration: 1600 });
  const maxExpense = expenses.length > 0 ? Math.max(...expenses.map((e) => e.amount)) : 0;
  const animatedMaxExpense = useCountUp(maxExpense, { duration: 1400 });
  const animatedTotalExpense = useCountUp(totalExpense, { duration: 1800 });

  const animatedTodayCount = useCountUp(todayCount, { duration: 1000 });
  const animatedThisMonthCount = useCountUp(thisMonthCount, { duration: 1200 });
  const animatedTotalCount = useCountUp(expenses.length, { duration: 1400 });

  return (
    <Sidebar>
      <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950" style={{ '--radius': '0px' } as React.CSSProperties}>
        {/* Header */}
        <div className="px-4 py-2 sm:px-6 sm:py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between">
          <h1 className="text-xl sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            Pengeluaran
          </h1>

          {/* Mobile 3-Dots Action Menu */}
          <div className="sm:hidden flex items-center">
            <ActionMenu
              items={[
                {
                  label: "Tambah Pengeluaran",
                  icon: <Plus className="h-4 w-4 text-primary" />,
                  onClick: () => handleOpenDialog(),
                },
                {
                  label: "Download Excel",
                  icon: <Download className="h-4 w-4 text-primary" />,
                  onClick: () => setShowDownloadDialog(true),
                },
              ]}
            />
          </div>

          {/* Desktop Buttons */}
          <div className="hidden sm:flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDownloadDialog(true)}
              className="h-8 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 gap-2"
            >
              <Download className="w-4 h-4 text-primary" />
              <span className="font-medium text-xs sm:text-sm">Download</span>
            </Button>
            <Button onClick={() => handleOpenDialog()} className="h-8 flex items-center justify-center gap-2 text-white bg-primary shadow-sm rounded-sm px-4">
              <Plus className="w-4 h-4" />
              <span className="font-medium text-xs sm:text-sm">Tambah</span>
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex-1 overflow-auto scrollbar-hide flex items-center justify-center">
            <LoadingSpinner text="Memuat data pengeluaran..." />
          </div>
        ) : (
          <>
            <div className="p-5 flex-1 overflow-auto scrollbar-hide">
              {isDialogOpen ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none shadow-sm mb-6">
                  <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-lg font-semibold">{editingExpense ? "Edit Pengeluaran" : "Tambah Pengeluaran"}</h2>
                    <Button variant="ghost" size="icon" onClick={() => !isUploading && setIsDialogOpen(false)} className="h-8 w-8 rounded-none">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="p-4 sm:p-6 space-y-6">
                    {/* Image Upload */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Foto Bukti Transaksi

                      </label>
                      <div className="flex flex-col items-start gap-3">
                        <label htmlFor="receipt-upload" className="relative w-32 h-32 rounded-sm border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 flex items-center justify-center overflow-hidden cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors group">
                          {imagePreview ? (
                            <>
                              <img src={imagePreview} alt="Preview" className="w-full h-full object-cover group-hover:opacity-75 transition-opacity" />
                              <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Upload className="w-6 h-6 text-white drop-shadow-md mb-1" />
                                <span className="text-xs font-semibold text-white drop-shadow-md">Ganti Foto</span>
                              </div>
                              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRemoveImage(); }} className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors z-10">
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <div className="flex flex-col items-center text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
                              <ImageIcon className="w-8 h-8 mb-1" />
                              <span className="text-xs font-medium">Pilih Foto</span>
                            </div>
                          )}
                        </label>

                        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageChange} className="hidden" id="receipt-upload" />
                        <p className="text-xs text-slate-500 dark:text-slate-400">Format: JPG, PNG, WebP. Maks: 500KB</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Category */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Kategori</label>
                        <SearchableSelect
                          options={categories.map((cat) => ({ id: cat.id, name: cat.name }))}
                          value={formData.category}
                          onChange={(id) => setFormData({ ...formData, category: id })}
                          placeholder="Pilih kategori"
                          onCreate={handleQuickCreateCategory}
                          onDelete={handleDeleteCategory}
                        />
                      </div>

                      {/* Date */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Tanggal</label>
                        <div className="relative">
                          <Input
                            type="date"
                            value={formData.date}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                            onClick={(e: any) => {
                              try { e.target.showPicker?.(); } catch (err) { }
                            }}
                            className="pr-10 w-full custom-date-input cursor-pointer"
                          />
                          <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Amount */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Jumlah (Rp)</label>
                        <Input
                          type="text"
                          value={getFormattedAmount()}
                          onChange={handleAmountChange}
                          placeholder="0"
                        />
                      </div>

                      {/* Supplier */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Suplier (Opsional)</label>
                        <Input
                          value={formData.supplier}
                          onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                          placeholder="Nama suplier atau toko"
                        />
                      </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Deskripsi</label>
                      <Input
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Contoh: Beli ATK, Bayar listrik"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isUploading} className="rounded-none">
                      Batal
                    </Button>
                    <Button onClick={handleSubmit} disabled={isUploading} className="rounded-none">
                      {isUploading ? "Menyimpan..." : (editingExpense ? "Simpan" : "Tambah")}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-5 items-stretch">
                    {/* Pengeluaran Hari Ini */}
                    <div className="rounded-sm bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-lg h-full">
                      <div className="p-4 sm:p-5 h-full flex flex-col justify-between">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-blue-100 text-xs sm:text-sm font-medium">Pengeluaran Hari Ini</p>
                            <p className="text-lg sm:text-lg md:text-xl font-bold text-white leading-tight mt-1 truncate">
                              {formatCurrency(animatedTodayTotal.value)}
                            </p>
                          </div>
                          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-sm bg-white/20 flex items-center justify-center shrink-0">
                            <Calendar className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                          </div>
                        </div>
                        <p className="text-xs mt-3 text-blue-200">{animatedTodayCount.value} transaksi hari ini</p>
                      </div>
                    </div>

                    {/* Pengeluaran Bulan Ini */}
                    <div className="rounded-sm bg-gradient-to-br from-purple-500 to-purple-600 border-0 shadow-lg h-full">
                      <div className="p-4 sm:p-5 h-full flex flex-col justify-between">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-purple-100 text-xs sm:text-sm font-medium">Pengeluaran Bulan Ini</p>
                            <p className="text-lg sm:text-lg md:text-xl font-bold text-white leading-tight mt-1 truncate">
                              {formatCurrency(animatedThisMonthTotal.value)}
                            </p>
                          </div>
                          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-sm bg-white/20 flex items-center justify-center shrink-0">
                            <Receipt className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                          </div>
                        </div>
                        <p className="text-xs mt-3 text-purple-200">{animatedThisMonthCount.value} transaksi bulan ini</p>
                      </div>
                    </div>

                    {/* Tertinggi */}
                    <div className="rounded-sm bg-gradient-to-br from-amber-500 to-orange-600 border-0 shadow-lg h-full">
                      <div className="p-4 sm:p-5 h-full flex flex-col justify-between">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-amber-100 text-xs sm:text-sm font-medium">Tertinggi</p>
                            <p className="text-lg sm:text-lg md:text-xl font-bold text-white leading-tight mt-1 truncate">
                              {expenses.length > 0 ? formatCurrency(animatedMaxExpense.value) : "Rp 0"}
                            </p>
                          </div>
                          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-sm bg-white/20 flex items-center justify-center shrink-0">
                            <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                          </div>
                        </div>
                        <p className="text-xs mt-3 text-amber-200">single transaction</p>
                      </div>
                    </div>

                    {/* Total Pengeluaran */}
                    <div className="rounded-sm bg-gradient-to-br from-red-500 to-red-600 border-0 shadow-lg h-full">
                      <div className="p-4 sm:p-5 h-full flex flex-col justify-between">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-red-100 text-xs sm:text-sm font-medium">Total Pengeluaran</p>
                            <p className="text-lg sm:text-lg md:text-xl font-bold text-white leading-tight mt-1">{formatCurrency(animatedTotalExpense.value)}</p>
                          </div>
                          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-sm bg-white/20 flex items-center justify-center shrink-0">
                            <Wallet className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                          </div>
                        </div>
                        <p className="text-xs mt-3 text-red-200">{animatedTotalCount.value} transaksi</p>
                      </div>
                    </div>
                  </div>

                  {/* Filters & Actions */}
                  <div className="mb-4 flex flex-col sm:flex-row gap-3">
                    <div className="flex items-center gap-2 flex-1">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-4 h-4" />
                        <Input
                          placeholder="Cari pengeluaran..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="pl-9 shadow-sm"
                        />
                      </div>

                      {/* Mobile 1 Filter Button (Popover) */}
                      <div className="sm:hidden">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="h-9 px-2.5 sm:px-3 relative shadow-sm border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                              <SlidersHorizontal className="w-4 h-4" />
                              {(selectedCategory !== "all" || selectedOutlet !== "all" || selectedUserId !== "all") && (
                                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full" />
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-[280px] p-4 space-y-3">
                            <div className="font-semibold text-sm mb-2 text-slate-900 dark:text-white">Filter Data</div>

                            <div className="space-y-1">
                              <label className="text-xs text-slate-500 font-medium">Kategori</label>
                              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                                <SelectTrigger className="w-full h-9 text-xs shadow-sm">
                                  <SelectValue placeholder="Semua Kategori" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">Semua Kategori</SelectItem>
                                  {categories.map((cat) => (
                                    <SelectItem key={cat.id} value={cat.name}>
                                      {cat.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {isAdmin && (
                              <div className="space-y-1">
                                <label className="text-xs text-slate-500 font-medium">Cabang / Outlet</label>
                                <Select value={selectedOutlet} onValueChange={setSelectedOutlet}>
                                  <SelectTrigger className="w-full h-9 text-xs shadow-sm">
                                    <SelectValue placeholder="Semua Outlet" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="all">Semua Outlet</SelectItem>
                                    {outlets.map((outlet) => (
                                      <SelectItem key={outlet.id} value={outlet.id}>
                                        {outlet.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}

                            {isAdmin && (
                              <div className="space-y-1">
                                <label className="text-xs text-slate-500 font-medium">Sales / User</label>
                                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                                  <SelectTrigger className="w-full h-9 text-xs shadow-sm">
                                    <SelectValue placeholder="Semua Sales" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="all">Semua Sales</SelectItem>
                                    {users.map((user) => (
                                      <SelectItem key={user.id} value={user.id}>
                                        {user.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}

                            {(selectedCategory !== "all" || selectedOutlet !== "all" || selectedUserId !== "all") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedCategory("all");
                                  setSelectedOutlet("all");
                                  setSelectedUserId("all");
                                }}
                                className="w-full text-xs text-red-500 hover:text-red-600 h-8 mt-2"
                              >
                                Reset Filter
                              </Button>
                            )}
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>

                    {/* Desktop Filters */}
                    <div className="hidden sm:flex gap-3 w-auto">
                      <div className="w-[160px]">
                        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                          <SelectTrigger className="w-full shadow-sm">
                            <SelectValue placeholder="Semua Kategori" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Semua Kategori</SelectItem>
                            {categories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.name}>
                                {cat.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {isAdmin && (
                        <div className="w-[160px]">
                          <Select value={selectedOutlet} onValueChange={setSelectedOutlet}>
                            <SelectTrigger className="w-full shadow-sm">
                              <SelectValue placeholder="Semua Outlet" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Semua Outlet</SelectItem>
                              {outlets.map((outlet) => (
                                <SelectItem key={outlet.id} value={outlet.id}>
                                  {outlet.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {isAdmin && (
                        <div className="w-[160px]">
                          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                            <SelectTrigger className="w-full shadow-sm">
                              <SelectValue placeholder="Semua Sales" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Semua Sales</SelectItem>
                              {users.map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  {user.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </div>

                  <>
                    {/* ── MOBILE & TABLET: Card List ── */}
                    <div className="flex flex-col gap-3 md:hidden pb-6">
                      {filteredExpenses.length === 0 ? (
                        <div className="text-center py-10 text-slate-500 bg-white dark:bg-slate-900 rounded-sm border border-slate-200 dark:border-slate-800">
                          <div className="flex flex-col items-center gap-3">
                            <div>
                              <p className="font-medium text-slate-700 dark:text-slate-300">Belum ada data pengeluaran</p>
                              <p className="text-sm text-slate-400 mt-1">Tambahkan pengeluaran pertama Anda</p>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => handleOpenDialog()} className="mt-2">
                              <Plus className="w-4 h-4 mr-2" />
                              Tambah Pengeluaran
                            </Button>
                          </div>
                        </div>
                      ) : (
                        filteredExpenses.map((expense) => {
                          const staffName = getStaffNameDisplay(expense.owner_id);
                          return (
                            <div key={expense.id} className="bg-white dark:bg-slate-900 rounded-sm border border-slate-200 dark:border-slate-800 shadow-sm p-3 flex flex-col gap-3 relative">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                                  {formatDate(expense.date)}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <div className="font-bold text-red-600 dark:text-red-400 text-base whitespace-nowrap text-right">
                                    {formatCurrency(expense.amount)}
                                  </div>
                                  {isAdmin && (
                                    <div onClick={(e) => e.stopPropagation()}>
                                      <ActionMenu
                                        triggerClassName="-mr-2.5 -mt-2.5"
                                        items={[
                                          {
                                            label: "Edit",
                                            icon: <Edit className="h-4 w-4 text-slate-500 group-hover/menu-item:text-white" />,
                                            onClick: () => handleOpenDialog(expense),
                                          },
                                          {
                                            label: "Hapus",
                                            icon: <Trash2 className="h-4 w-4 text-red-500 group-hover/menu-item:text-white" />,
                                            onClick: () => handleDelete(expense.id),
                                            destructive: true,
                                          },
                                        ]}
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-start justify-between gap-3">
                                <div className="text-sm text-slate-700 dark:text-slate-300 font-medium break-words flex-1">
                                  <div>{expense.description}</div>
                                  {expense.supplier && (
                                    <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                                      <Store className="w-3 h-3" />
                                      Suplier: {expense.supplier}
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1.5 mt-2">
                                    <span className={`inline-flex px-2 py-1 text-[10px] sm:text-xs font-medium rounded-full ${getCategoryColor(expense.category)}`}>
                                      {getCategoryLabel(expense.category)}
                                    </span>
                                  </div>
                                </div>
                                <div className="shrink-0 flex flex-col items-end gap-2">
                                  {isAdmin && expense.status === 'pending' ? (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleUpdateStatus(expense.id, 'approved'); }}
                                      className="inline-flex px-3.5 py-1.5 text-[10px] sm:text-xs font-bold rounded-sm bg-red-600 hover:bg-red-700 text-white transition-all cursor-pointer shadow-md shadow-red-600/20 hover:shadow-lg hover:shadow-red-600/30 hover:-translate-y-0.5 active:translate-y-0 duration-200"
                                    >
                                      Konfirmasi
                                    </button>
                                  ) : (
                                    <span
                                      className={`inline-flex px-2 py-1 text-[10px] sm:text-xs font-medium rounded-full text-white shadow-sm ${expense.status === 'pending'
                                        ? 'bg-yellow-500'
                                        : expense.status === 'rejected'
                                          ? 'bg-red-500'
                                          : 'bg-green-500'
                                        }`}
                                    >
                                      {expense.status === 'pending' ? 'Pending' : expense.status === 'rejected' ? 'Ditolak' : 'Disetujui'}
                                    </span>
                                  )}
                                  {expense.image_url && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 mt-2"
                                      onClick={(e) => { e.stopPropagation(); setViewImageUrl(expense.image_url || null); }}
                                    >
                                      <ImageIcon className="w-3 h-3 mr-1" /> Bukti
                                    </Button>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center justify-between mt-1 pt-3 border-t border-slate-100 dark:border-slate-700/50">
                                <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-col gap-1.5 font-medium">
                                  <div className="flex items-center gap-1.5">
                                    <User className="w-3.5 h-3.5" />
                                    {staffName}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* ── DESKTOP LARGE: Table (hidden on tablet and below) ── */}
                    <div className="hidden md:block rounded-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                      <div className="overflow-x-auto scrollbar-hide">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                              <TableHead className="w-16 text-center">No</TableHead>
                              <TableHead className="whitespace-nowrap">Tanggal</TableHead>
                              <TableHead className="whitespace-nowrap">Sales</TableHead>
                              <TableHead className="text-center whitespace-nowrap">Kategori</TableHead>
                              <TableHead>Deskripsi</TableHead>
                              <TableHead className="text-center whitespace-nowrap">Bukti</TableHead>
                              <TableHead className="whitespace-nowrap">Suplier</TableHead>
                              <TableHead className="text-right whitespace-nowrap">Jumlah</TableHead>
                              <TableHead className="text-center whitespace-nowrap">Status</TableHead>
                              {isAdmin && <TableHead className="w-[50px] text-center whitespace-nowrap">Aksi</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredExpenses.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={isAdmin ? 10 : 8} className="text-center py-16 text-slate-500">
                                  <div className="flex flex-col items-center gap-3">

                                    <div>
                                      <p className="font-medium text-slate-700 dark:text-slate-300">Belum ada data pengeluaran</p>

                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => handleOpenDialog()} className="mt-2">
                                      <Plus className="w-4 h-4 mr-2" />
                                      Tambah Pengeluaran
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ) : (
                              filteredExpenses.map((expense, index) => (
                                <TableRow key={expense.id} className="border-b dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:shadow-sm relative hover:z-10 transition-all duration-200 cursor-pointer">
                                  <TableCell className="text-slate-400 font-medium text-center">{index + 1}</TableCell>
                                  <TableCell className="text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                    {formatDate(expense.date)}
                                  </TableCell>
                                  <TableCell className="font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                                    {getStaffNameDisplay(expense.owner_id)}
                                  </TableCell>
                                  <TableCell className="text-center whitespace-nowrap">
                                    <Badge
                                      className={`rounded border-0 font-semibold shadow-none whitespace-nowrap hover:opacity-80 ${getCategoryColor(
                                        expense.category
                                      )}`}
                                    >
                                      {getCategoryLabel(expense.category)}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-slate-900 dark:text-white font-medium max-w-[200px] truncate">
                                    {expense.description}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {expense.image_url ? (
                                      <div
                                        className="w-10 h-10 mx-auto rounded-sm overflow-hidden border border-slate-200 dark:border-slate-700 cursor-pointer hover:opacity-80 hover:ring-2 hover:ring-primary/50 transition-all"
                                        onClick={(e) => { e.stopPropagation(); setViewImageUrl(expense.image_url || null); }}
                                        title="Lihat Bukti"
                                      >
                                        <img
                                          src={expense.image_url}
                                          alt="Bukti"
                                          className="w-full h-full object-cover"
                                        />
                                      </div>
                                    ) : (
                                      <span className="text-slate-300 dark:text-slate-600">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                    {expense.supplier || "-"}
                                  </TableCell>

                                  <TableCell className="text-right font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
                                    {formatCurrency(expense.amount)}
                                  </TableCell>

                                  <TableCell className="text-center whitespace-nowrap">
                                    {isAdmin && expense.status === 'pending' ? (
                                      <Badge
                                        variant="destructive"
                                        onClick={(e) => { e.stopPropagation(); handleUpdateStatus(expense.id, 'approved'); }}
                                        className="rounded cursor-pointer bg-red-600 hover:bg-red-700 text-white font-semibold whitespace-nowrap shadow-sm"
                                      >
                                        Konfirmasi
                                      </Badge>
                                    ) : (
                                      <Badge
                                        className={`rounded font-semibold whitespace-nowrap border-0 shadow-none text-white ${expense.status === 'pending'
                                          ? 'bg-amber-500 hover:bg-amber-600'
                                          : expense.status === 'rejected'
                                            ? 'bg-red-500 hover:bg-red-600'
                                            : 'bg-green-500 hover:bg-green-600'
                                          }`}
                                      >
                                        {expense.status === 'pending' ? 'Pending' : expense.status === 'rejected' ? 'Ditolak' : 'Disetujui'}
                                      </Badge>
                                    )}
                                  </TableCell>
                                  {isAdmin && (
                                    <TableCell className="text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                      <ActionMenu
                                        items={[
                                          {
                                            label: "Edit",
                                            icon: <Edit className="h-4 w-4 text-slate-500 group-hover/menu-item:text-white" />,
                                            onClick: () => handleOpenDialog(expense),
                                          },
                                          {
                                            label: "Hapus",
                                            icon: <Trash2 className="h-4 w-4 text-red-500 group-hover/menu-item:text-white" />,
                                            onClick: () => handleDelete(expense.id),
                                            destructive: true,
                                          },
                                        ]}
                                      />
                                    </TableCell>
                                  )}
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Category Management Dialog */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Kelola Kategori Pengeluaran</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Input
                placeholder="Nama kategori baru..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleAddCategory();
                  }
                }}
              />
              <Button onClick={handleAddCategory}>Tambah</Button>
            </div>

            <div className="max-h-[300px] overflow-y-auto scrollbar-hide space-y-2 border rounded-sm p-2">
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-sm group">
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${getBadgeDotColor(cat.color)}`} />
                    <span className="font-medium text-slate-700 dark:text-slate-300">{cat.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              {categories.length === 0 && (
                <p className="text-center text-sm text-slate-500 py-4">Belum ada kategori</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Download Excel Dialog for Expenses */}
      <Dialog open={showDownloadDialog} onOpenChange={setShowDownloadDialog}>
        <DialogContent className="sm:max-w-xl rounded-sm sm:rounded-sm max-h-[90vh] overflow-y-auto scrollbar-hide">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Download Laporan
            </DialogTitle>
            <DialogDescription>
              Pilih periode untuk download pengeluaran (Excel).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {isAdmin && (
              <div className="space-y-1.5">
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="h-9 rounded-none">
                    <SelectValue placeholder="Semua Sales" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Sales</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-3">

              <div className="flex flex-col gap-3 w-full">
                <div className="space-y-1.5 w-full">
                  <Label className="text-sm font-medium">Dari Tanggal</Label>
                  <div className="relative w-full h-9">
                    <Input
                      type="text"
                      placeholder="Pilih Tanggal Mulai"
                      value={downloadStartDate ? downloadStartDate.split('-').reverse().join('-') : ""}
                      readOnly
                      className="absolute inset-0 h-9 w-full rounded-none text-sm font-medium cursor-pointer"
                    />
                    <input
                      type="date"
                      value={downloadStartDate}
                      onChange={(e) => setDownloadStartDate(e.target.value)}
                      onClick={(e: any) => {
                        try { e.target.showPicker?.(); } catch (err) { }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      title="Tanggal Mulai"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 w-full">
                  <Label className="text-sm font-medium">Sampai Tanggal</Label>
                  <div className="relative w-full h-9">
                    <Input
                      type="text"
                      placeholder="Pilih Tanggal Akhir"
                      value={downloadEndDate ? downloadEndDate.split('-').reverse().join('-') : ""}
                      readOnly
                      className="absolute inset-0 h-9 w-full rounded-none text-sm font-medium cursor-pointer"
                    />
                    <input
                      type="date"
                      value={downloadEndDate}
                      onChange={(e) => setDownloadEndDate(e.target.value)}
                      onClick={(e: any) => {
                        try { e.target.showPicker?.(); } catch (err) { }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      title="Tanggal Akhir"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Expenses count preview */}
            {downloadStartDate && downloadEndDate ? (() => {
              const start = new Date(downloadStartDate);
              start.setHours(0, 0, 0, 0);
              const end = new Date(downloadEndDate);
              end.setHours(23, 59, 59, 999);

              if (start > end) {
                return (
                  <p className="text-sm text-red-500 font-medium text-center -mt-1">
                    Tanggal akhir harus lebih besar atau sama dengan tanggal mulai
                  </p>
                );
              }

              return (
                <p className="text-xs text-slate-500 font-medium text-center -mt-1">
                  <span className="text-slate-700 dark:text-slate-300">{downloadCount !== null ? downloadCount : 0}</span> pengeluaran ditemukan pada rentang waktu ini.
                </p>
              );
            })() : (
              <p className="text-xs text-slate-500 text-center -mt-1">
                Pilih tanggal untuk melihat jumlah pengeluaran yang akan didownload.
              </p>
            )}

            <div className="w-full h-px bg-slate-200 dark:bg-slate-800 my-3" />

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDownloadDialog(false)}
                className="h-9 rounded-none"
              >
                Batal
              </Button>
              <Button
                onClick={handleExportExpenses}
                disabled={downloadLoading || !downloadStartDate || !downloadEndDate}
                className="h-9 rounded-none"
              >
                {downloadLoading ? "Mengunduh..." : "Download Excel"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Receipt Image Dialog */}
      <Dialog open={!!viewImageUrl} onOpenChange={(open) => !open && setViewImageUrl(null)}>
        <DialogContent className="max-w-2xl bg-transparent border-0 shadow-none p-0">
          <DialogTitle className="sr-only">Bukti Transaksi</DialogTitle>
          <div className="relative flex items-center justify-center min-h-[50vh]">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-50 bg-black/50 hover:bg-black/70 text-white rounded-full h-8 w-8"
              onClick={() => setViewImageUrl(null)}
            >
              <X className="w-4 h-4" />
            </Button>
            {viewImageUrl && (
              <img
                src={viewImageUrl}
                alt="Bukti Transaksi"
                className="max-w-full max-h-[80vh] object-contain rounded-sm shadow-2xl"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Delete Confirmation */}
      <AlertDialog open={!!categoryToDelete} onOpenChange={(open) => !open && setCategoryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Kategori {categories.find((c) => c.id === categoryToDelete)?.name}</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus kategori ini?<br></br>Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="w-full h-px bg-slate-200 dark:bg-slate-800 my-1" />
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteCategory} className="bg-red-600 hover:bg-red-700 text-white">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Expense Delete Confirmation */}
      <AlertDialog open={!!expenseToDelete} onOpenChange={(open) => !open && setExpenseToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Pengeluaran ?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus data pengeluaran ini?<br></br>Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="w-full h-px bg-slate-200 dark:bg-slate-800 my-1" />
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteExpense} className="bg-red-600 hover:bg-red-700 text-white">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </Sidebar>
  );
}
