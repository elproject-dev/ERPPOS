import { useState, useMemo, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Sidebar } from "@/components/layout/Sidebar";
import { exportToExcel } from "@/components/excel-export/excel-export";
import {
  useListVisitSchedules,
  useCreateVisitSchedule,
  useUpdateVisitSchedule,
  useDeleteVisitSchedule,
  useListVisitLogs,
  useCreateVisitLog,
  useListStaff,
} from "@/mocks/api-client-react";
import { useListCustomers } from "@workspace/api-client-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionMenu } from "@/components/ui/action-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { isAdminMode } from "@/lib/auth";
import { Capacitor } from "@capacitor/core";
import {
  CalendarDays,
  Plus,
  MapPin,
  Check,
  ChevronsUpDown,
  Navigation,
  Trash2,
  Edit,
  Clock,
  User,
  Phone,
  ClipboardList,
  CheckCircle2,
  Loader2,
  Map,
  History,
  Store,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

const DAYS = [
  { id: 1, short: "Sen", label: "Senin" },
  { id: 2, short: "Sel", label: "Selasa" },
  { id: 3, short: "Rab", label: "Rabu" },
  { id: 4, short: "Kam", label: "Kamis" },
  { id: 5, short: "Jum", label: "Jumat" },
  { id: 6, short: "Sab", label: "Sabtu" },
];

function getTodayDayId(): number {
  const jsDay = new Date().getDay(); // 0=Sun, 1=Mon...6=Sat
  if (jsDay === 0) return 1; // Falling back to Senin if today is Sunday
  return jsDay; // 1=Senin ... 6=Sabtu
}

function formatVisitedAt(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function isDateInCurrentWeek(dateStr: string): boolean {
  try {
    const date = new Date(dateStr);
    const now = new Date();

    // Get start of current week (Monday)
    const currentDay = now.getDay(); // 0 is Sunday, 1 is Monday...
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() + diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    // Get end of current week (Sunday)
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return date >= startOfWeek && date <= endOfWeek;
  } catch {
    return false;
  }
}

async function getLocationNative(): Promise<{ latitude: number; longitude: number }> {
  // Use Capacitor Geolocation on Android native
  if (Capacitor.isNativePlatform()) {
    try {
      // Access Capacitor plugin via window object (registered by native layer)
      const Geolocation = (window as any).Capacitor?.Plugins?.Geolocation;
      if (Geolocation) {
        const perm = await Geolocation.requestPermissions();
        if (perm.location !== "granted") {
          throw new Error("Izin lokasi ditolak. Aktifkan izin GPS di pengaturan.");
        }
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
        return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      }
    } catch (e: any) {
      if (e.message?.includes("Izin")) throw e;
      // Fall through to browser geolocation if plugin not available
    }
  }
  // Fallback for browser / web
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Perangkat tidak mendukung GPS"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          console.warn("Geolocation API failed on localhost. Using fallback dummy location.");
          resolve({ latitude: -6.200000, longitude: 106.816666 }); // Jakarta dummy
        } else {
          reject(new Error("Gagal mendapatkan lokasi: " + err.message));
        }
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
}

const cleanNotes = (notes: string | null | undefined) => {
  if (!notes) return "";
  return notes.replace(/\s*\[verified\]\s*/g, "").trim();
};

export default function VisitSchedulePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = isAdminMode(user);

  const [activeTab, setActiveTab] = useState<"schedule" | "history">("schedule");
  const [selectedDay, setSelectedDay] = useState<number>(getTodayDayId());
  const [scheduleSalesFilter, setScheduleSalesFilter] = useState<string>("all");
  const [logSalesFilter, setLogSalesFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 20;
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [checkingLog, setCheckingLog] = useState<any>(null);
  const [verifiedLogs, setVerifiedLogs] = useState<Record<number, boolean>>(() => {
    try {
      const stored = localStorage.getItem("kasir_verified_logs");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [editingSchedule, setEditingSchedule] = useState<any>(null);
  const [trackingId, setTrackingId] = useState<number | null>(null); // schedule id being tracked
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteScheduleId, setDeleteScheduleId] = useState<number | null>(null);
  const [isDeleteAllLogsDialogOpen, setIsDeleteAllLogsDialogOpen] = useState(false);
  const [isDeletingLogs, setIsDeletingLogs] = useState(false);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [pendingCheckIn, setPendingCheckIn] = useState<any>(null);
  const [checkInNotes, setCheckInNotes] = useState("");

  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [downloadStartDate, setDownloadStartDate] = useState("");
  const [downloadEndDate, setDownloadEndDate] = useState("");
  const [downloadSalesFilter, setDownloadSalesFilter] = useState("all");

  const [formData, setFormData] = useState<any>({
    customer_id: "",
    day_of_week: "1",
    visit_time: "",
    notes: "",
    sales_name: "",
  });

  const { data: schedules, isLoading: schedulesLoading, refetch: refetchSchedules } = useListVisitSchedules();

  const logsSalesNameParam = !isAdmin && user?.name ? user.name : (logSalesFilter === 'all' ? undefined : logSalesFilter);
  const { data: dbLogs, totalCount: logsTotalCount, isLoading: logsLoading, refetch: refetchLogs } = useListVisitLogs({
    limit: ITEMS_PER_PAGE,
    offset: (page - 1) * ITEMS_PER_PAGE,
    salesName: logsSalesNameParam
  });
  const logs = dbLogs || [];
  const { data: customers } = useListCustomers();
  const { data: staffList } = useListStaff({});
  const createSchedule = useCreateVisitSchedule();
  const updateSchedule = useUpdateVisitSchedule();
  const deleteSchedule = useDeleteVisitSchedule();
  const createLog = useCreateVisitLog();

  // Names of admins to exclude from sales options
  const adminNames = useMemo(() => {
    const names = new Set<string>();
    names.add("Admin");
    if (user?.role === "admin" && user?.name) {
      names.add(user.name);
    }
    (staffList || []).forEach((s: any) => {
      if ((s.role === 'admin' || s.role === 'developer') && s.name) {
        names.add(s.name);
      }
    });
    return names;
  }, [staffList, user]);

  // Active staff list for sales dropdown (excluding admins)
  const activeSalesList = useMemo(() => {
    return (staffList || []).filter(
      (s: any) => s.status === 'active' && s.name && s.role !== 'admin' && s.role !== 'developer'
    );
  }, [staffList]);

  const visibleSchedules = useMemo(() => {
    let list = schedules || [];
    if (!isAdmin && user?.name) {
      return list.filter((s: any) => s.sales_name === user.name);
    }
    return list;
  }, [schedules, isAdmin, user?.name]);

  // Unique sales names from schedules (excluding admins)
  const uniqueSalesNames = useMemo(() => {
    const names = visibleSchedules
      .map((s: any) => s.sales_name)
      .filter((name: string) => name && !adminNames.has(name));
    return Array.from(new Set(names)).sort() as string[];
  }, [visibleSchedules, adminNames]);

  // Unique sales names from logs (using all active sales to show in filter)
  const uniqueLogSalesNames = useMemo(() => {
    const names = activeSalesList.map((s: any) => s.name).filter(Boolean);
    return Array.from(new Set(names)).sort() as string[];
  }, [activeSalesList]);

  const filteredSchedules = useMemo(
    () =>
      scheduleSalesFilter === "all"
        ? visibleSchedules
        : visibleSchedules.filter((s: any) => s.sales_name === scheduleSalesFilter),
    [visibleSchedules, scheduleSalesFilter]
  );

  const handleNextPage = () => {
    if (page * ITEMS_PER_PAGE < logsTotalCount) {
      setPage((prev) => prev + 1);
    }
  };

  const handlePrevPage = () => {
    if (page > 1) {
      setPage((prev) => prev - 1);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [logSalesFilter]);

  // Check if a schedule has been visited this week
  const visitedScheduleIdsToday = useMemo(() => {
    const visitedSet = new Set<number>();
    (logs || []).forEach((log: any) => {
      if (log.schedule_id && log.visited_at) {
        if (isDateInCurrentWeek(log.visited_at)) {
          visitedSet.add(log.schedule_id);
        }
      }
    });
    return visitedSet;
  }, [logs]);

  const schedulesForDay = useMemo(
    () => filteredSchedules.filter((s: any) => s.day_of_week === selectedDay),
    [filteredSchedules, selectedDay]
  );

  const handleOpenDialog = (schedule?: any) => {
    if (schedule) {
      setEditingSchedule(schedule);
      setFormData({
        customer_id: schedule.customer_id?.toString() || "",
        day_of_week: schedule.day_of_week?.toString() || "1",
        visit_time: schedule.visit_time || "",
        notes: schedule.notes || "",
        sales_name: schedule.sales_name || user?.name || "",
      });
    } else {
      setEditingSchedule(null);
      setFormData({
        customer_id: "",
        day_of_week: selectedDay.toString(),
        visit_time: "",
        notes: "",
        sales_name: isAdmin ? (scheduleSalesFilter !== "all" ? scheduleSalesFilter : "") : (user?.name || ""),
      });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.customer_id) {
      toast({ title: "⚠️ Perhatian", description: "Pilih pelanggan terlebih dahulu", variant: "destructive" });
      return;
    }

    if (isAdmin && !formData.sales_name) {
      toast({ title: "⚠️ Perhatian", description: "Pilih sales terlebih dahulu", variant: "destructive" });
      return;
    }

    const selectedCustomer = customers?.find((c: any) => c.id.toString() === formData.customer_id);
    const selectedSales = staffList?.find((s: any) => s.name === (formData.sales_name || user?.name));
    const staffIdRaw = selectedSales?.id || user?.staffId;
    const payload: any = {
      customer_id: isNaN(Number(formData.customer_id)) ? formData.customer_id : Number(formData.customer_id),
      customer_name: selectedCustomer?.name || "",
      sales_name: formData.sales_name || user?.name || "Sales",
      staff_id: staffIdRaw || null,
      day_of_week: parseInt(formData.day_of_week),
      visit_time: formData.visit_time || null,
      notes: formData.notes || null,
      is_active: true,
    };

    if (editingSchedule) {
      updateSchedule.mutate(
        { id: editingSchedule.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Berhasil", description: "Jadwal diperbarui", variant: "success" });
            setIsDialogOpen(false);
            refetchSchedules();
          },
          onError: () =>
            toast({ title: "❌ Error", description: "Gagal memperbarui jadwal", variant: "destructive" }),
        }
      );
    } else {
      createSchedule.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast({ title: "Berhasil", description: "Jadwal ditambahkan", variant: "success" });
            setIsDialogOpen(false);
            refetchSchedules();
          },
          onError: () =>
            toast({ title: "❌ Error", description: "Gagal menambahkan jadwal", variant: "destructive" }),
        }
      );
    }
  };

  const confirmDelete = (id: number) => {
    setDeleteScheduleId(id);
    setIsDeleteDialogOpen(true);
  };

  const executeDelete = () => {
    if (!deleteScheduleId) return;
    deleteSchedule.mutate(
      { id: deleteScheduleId },
      {
        onSuccess: () => {
          toast({
            title: "Berhasil Menghapus",
            description: "Jadwal kunjungan telah dihapus",
            variant: "success",
          });
          refetchSchedules();
          setIsDeleteDialogOpen(false);
          setDeleteScheduleId(null);
        },
        onError: (err: any) =>
          toast({
            title: "❌ Gagal Menghapus",
            description: err.message || "Gagal menghapus jadwal",
            variant: "destructive",
          }),
      }
    );
  };

  const handleDeleteAllLogs = async () => {
    setIsDeletingLogs(true);
    try {
      const ownerIdStr = localStorage.getItem('ownerId') || localStorage.getItem('tenantOwnerId') || '';
      let query = supabase.from('visit_logs').delete();

      if (ownerIdStr) {
        query = query.eq('owner_id', ownerIdStr);
      } else {
        query = query.neq('id', 0);
      }

      if (logSalesFilter && logSalesFilter !== 'all') {
        query = query.eq('sales_name', logSalesFilter);
      }

      const { error } = await query;
      if (error) throw error;

      if (logSalesFilter === 'all') {
        setVerifiedLogs({});
        localStorage.removeItem('kasir_verified_logs');
      }

      toast({
        title: "Riwayat Dihapus",
        description: logSalesFilter !== 'all'
          ? `Riwayat kunjungan untuk sales ${logSalesFilter} berhasil dihapus.`
          : "Semua riwayat kunjungan berhasil dihapus.",
      });

      refetchLogs();
      setIsDeleteAllLogsDialogOpen(false);
    } catch (err: any) {
      console.error("Gagal menghapus riwayat kunjungan:", err);
      toast({
        title: "Gagal",
        description: err.message || "Gagal menghapus riwayat kunjungan.",
        variant: "destructive",
      });
    } finally {
      setIsDeletingLogs(false);
    }
  };

  const handleStartVisit = async (schedule: any) => {
    setTrackingId(schedule.id);
    try {
      toast({ title: "📍 Mengambil lokasi...", description: "Mohon tunggu sebentar" });
      const position = await getLocationNative();

      // Store pending check-in and open notes dialog
      setPendingCheckIn({ schedule, position });
      setCheckInNotes("");
      setNotesDialogOpen(true);
    } catch (err: any) {
      toast({
        title: "Gagal GPS",
        description: err.message || "Tidak dapat mengambil lokasi",
        variant: "destructive",
      });
    } finally {
      setTrackingId(null);
    }
  };

  const handleConfirmCheckIn = () => {
    if (!pendingCheckIn) return;
    const { schedule, position } = pendingCheckIn;
    const mapsUrl = `https://maps.google.com/?q=${position.latitude},${position.longitude}`;

    createLog.mutate(
      {
        data: {
          schedule_id: schedule.id,
          customer_id: schedule.customer_id,
          customer_name: schedule.customer_name || schedule.customers?.name || "",
          sales_name: user?.name || "Sales",
          visited_at: new Date().toISOString(),
          latitude: position.latitude,
          longitude: position.longitude,
          location_address: mapsUrl,
          notes: checkInNotes || null,
          status: 'completed',
        },
      },
      {
        onSuccess: () => {
          toast({
            title: "Check-in Berhasil!",
            description: `Kunjungan ke ${schedule.customer_name || schedule.customers?.name} berhasil dicatat`,
            variant: "success",
          });
          setNotesDialogOpen(false);
          setPendingCheckIn(null);
          setCheckInNotes("");
          refetchLogs();
        },
        onError: () =>
          toast({ title: "❌ Error", description: "Gagal menyimpan kunjungan", variant: "destructive" }),
      }
    );
  };

  const handleVerifyLog = async (logId: number) => {
    const log = (logs || []).find((l: any) => l.id === logId);
    const currentNotes = log?.notes || "";
    const newNotes = currentNotes.includes("[verified]")
      ? currentNotes
      : (currentNotes ? `${currentNotes} [verified]` : "[verified]");

    try {
      const { error } = await supabase
        .from("visit_logs")
        .update({ notes: newNotes })
        .eq("id", logId);

      if (error) throw error;

      const updated = { ...verifiedLogs, [logId]: true };
      setVerifiedLogs(updated);
      localStorage.setItem("kasir_verified_logs", JSON.stringify(updated));

      toast({
        title: "Validasi Sukses",
        description: "Lokasi kunjungan terverifikasi valid.",
      });

      refetchLogs();
    } catch (err: any) {
      toast({
        title: "Error",
        description: "Gagal memvalidasi kunjungan di database.",
        variant: "destructive",
      });
    } finally {
      setCheckingLog(null);
    }
  };

  const openInMaps = (lat: number, lng: number) => {
    const url = `https://maps.google.com/?q=${lat},${lng}`;
    window.open(url, "_blank");
  };

  const dayScheduleCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    filteredSchedules.forEach((s: any) => {
      counts[s.day_of_week] = (counts[s.day_of_week] || 0) + 1;
    });
    return counts;
  }, [filteredSchedules]);


  const handleDownloadExcel = async () => {
    try {
      const ownerIdStr = localStorage.getItem('ownerId') || localStorage.getItem('tenantOwnerId') || '';
      let query = supabase
        .from('visit_logs')
        .select('*')
        .order('visited_at', { ascending: false });

      if (ownerIdStr) {
        query = query.eq('owner_id', ownerIdStr);
      }

      let salesFilter = downloadSalesFilter;
      if (!isAdmin && user?.name) {
        salesFilter = user.name;
      }
      if (salesFilter !== "all") {
        query = query.eq('sales_name', salesFilter);
      }

      const { data: dbLogs, error } = await query;
      if (error) throw error;

      let exportLogs = dbLogs || [];

      if (downloadStartDate) {
        const start = new Date(downloadStartDate);
        start.setHours(0, 0, 0, 0);
        exportLogs = exportLogs.filter((l: any) => l.visited_at && new Date(l.visited_at) >= start);
      }
      if (downloadEndDate) {
        const end = new Date(downloadEndDate);
        end.setHours(23, 59, 59, 999);
        exportLogs = exportLogs.filter((l: any) => l.visited_at && new Date(l.visited_at) <= end);
      }

      if (!exportLogs || exportLogs.length === 0) {
        toast({ title: "⚠️ Perhatian", description: "Tidak ada data riwayat untuk filter tersebut", variant: "destructive" });
        return;
      }

      const columns = [
        { header: "No", key: "No", width: 8 },
        { header: "Jadwal Kunjungan", key: "Jadwal Kunjungan", width: 30 },
        { header: "Nama Sales", key: "Nama Sales", width: 25 },
        { header: "Tanggal", key: "Tanggal", width: 20 },
        { header: "Jam", key: "Jam", width: 12 },
        { header: "Hari", key: "Hari", width: 15 },
        { header: "Catatan", key: "Catatan", width: 40 },
        { header: "Koordinat Lokasi", key: "Koordinat Lokasi", width: 30 },
        { header: "Status", key: "Status", width: 15 },
      ];

      const data: Record<string, unknown>[] = [];
      const rowStripes: number[] = [];

      exportLogs.forEach((log: any, index: number) => {
        const stripe = index % 2;
        const status = (verifiedLogs[log.id] || (log.notes && log.notes.includes('[verified]'))) ? "Valid" : "Pending";
        const notes = cleanNotes(log.notes) || "";

        let tanggal = "-";
        let jam = "-";
        let hari = "-";
        if (log.visited_at) {
          const d = new Date(log.visited_at);
          if (!isNaN(d.getTime())) {
            tanggal = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "long", year: "numeric" }).format(d);
            jam = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
            hari = new Intl.DateTimeFormat("id-ID", { weekday: "long" }).format(d);
          }
        }

        data.push({
          "No": index + 1,
          "Jadwal Kunjungan": log.customer_name || "-",
          "Nama Sales": log.sales_name || "-",
          "Tanggal": tanggal,
          "Jam": jam,
          "Hari": hari,
          "Catatan": notes || "-",
          "Koordinat Lokasi": (log.latitude && log.longitude) ? `${log.latitude}, ${log.longitude}` : "-",
          "Status": status
        });
        rowStripes.push(stripe);
      });

      await exportToExcel({
        title: "Riwayat Kunjungan Sales",
        sheetName: "Riwayat",
        columns,
        data,
        rowStripes,
        filename: `Riwayat_Kunjungan_${new Date().toISOString().slice(0, 10)}.xlsx`,
      });
      setShowDownloadDialog(false);

    } catch (err: any) {
      toast({ title: "❌ Error", description: err.message || "Gagal mengunduh Excel", variant: "destructive" });
    }
  };

  return (
    <Sidebar>
      <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950" style={{ '--radius': '0px' } as React.CSSProperties}>
        {/* Header */}
        <div className="px-4 py-2 sm:px-6 sm:py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between">
          <h1 className="text-xl sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            Jadwal Kunjungan Sales
          </h1>
          {isAdmin && (
            <>
              {/* Mobile 3-Dots Action Menu */}
              <div className="sm:hidden flex items-center">
                <ActionMenu
                  items={[
                    {
                      label: "Tambah Jadwal",
                      icon: <Plus className="h-4 w-4 text-primary" />,
                      onClick: () => handleOpenDialog(),
                    },
                    ...(activeTab === "history" ? [{
                      label: "Download Excel",
                      icon: <Download className="h-4 w-4 text-primary" />,
                      onClick: () => setShowDownloadDialog(true),
                    }] : []),
                  ]}
                />
              </div>

              {/* Desktop Buttons */}
              <div className="hidden sm:flex items-center gap-2">
                {activeTab === "history" && (
                  <Button
                    variant="outline"
                    onClick={() => setShowDownloadDialog(true)}
                    className="h-8 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 gap-2"
                  >
                    <Download className="w-4 h-4 text-primary" />
                    <span className="font-medium text-xs sm:text-sm">Download</span>
                  </Button>
                )}
                <Button onClick={() => handleOpenDialog()} className="h-8 shadow-sm">
                  <Plus className="w-4 h-4 mr-2" /> Tambah Jadwal
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Tabs — underline style matching products.tsx */}
        <div className="px-4 sm:px-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex justify-between sm:justify-start sm:gap-6 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setActiveTab("schedule")}
            className={`py-3 text-sm font-semibold border-b-2 transition-all relative flex items-center justify-center gap-2 flex-1 sm:flex-none ${activeTab === "schedule"
              ? "border-primary text-primary"
              : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
          >
            <CalendarDays className="w-4 h-4 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Jadwal</span>
            <span className="sm:hidden">Jadwal</span>
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`py-3 text-sm font-semibold border-b-2 transition-all relative flex items-center justify-center gap-2 flex-1 sm:flex-none ${activeTab === "history"
              ? "border-primary text-primary"
              : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
          >
            <History className="w-4 h-4 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Riwayat</span>
            <span className="sm:hidden">Riwayat</span>
          </button>
        </div>

        {schedulesLoading || logsLoading ? (
          <div className="flex-1 overflow-auto scrollbar-hide flex items-center justify-center min-h-[400px]">
            <LoadingSpinner text="Memuat jadwal kunjungan..." />
          </div>
        ) : (
          <>
            {/* Schedule Tab */}
            {activeTab === "schedule" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Day tabs + Sales filter bar */}
                <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Day tabs */}
                    <div className="grid grid-cols-6 gap-1 sm:gap-2 flex-1 w-full">
                      {DAYS.map((day) => {
                        const isToday = day.id === getTodayDayId();
                        const isSelected = day.id === selectedDay;
                        return (
                          <button
                            key={day.id}
                            onClick={() => setSelectedDay(day.id)}
                            className={cn(
                              "flex items-center justify-center py-1.5 px-1 sm:px-3 rounded-sm transition-all duration-200 text-xs font-semibold border text-center w-full min-w-0",
                              isSelected
                                ? "bg-primary text-primary-foreground border-transparent shadow-sm font-bold"
                                : isToday
                                  ? "bg-primary/10 text-primary border-primary/30"
                                  : "bg-slate-50 dark:bg-slate-700/30 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                            )}
                          >
                            <span className="hidden min-[400px]:inline truncate">{day.label}</span>
                            <span className="min-[400px]:hidden truncate">{day.short}</span>
                          </button>
                        );
                      })}
                    </div>

                    {isAdmin && uniqueSalesNames.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Select value={scheduleSalesFilter} onValueChange={(v) => setScheduleSalesFilter(v)}>
                          <SelectTrigger className="w-full sm:w-[180px] shadow-sm">
                            <SelectValue placeholder="Semua Sales" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Semua Sales</SelectItem>
                            {uniqueSalesNames.map((name) => (
                              <SelectItem key={name} value={name}>{name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>

                {/* Schedule list */}
                <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                      {DAYS.find((d) => d.id === selectedDay)?.label}
                      {getTodayDayId() === selectedDay && (
                        <Badge className="text-[10px] px-2 py-0 bg-primary text-primary-foreground">Hari Ini</Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px] px-2 py-0 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700">
                        {schedulesForDay.length}
                      </Badge>
                    </h2>
                  </div>

                  {schedulesForDay.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <p className="text-slate-500 dark:text-slate-400 font-medium">Belum ada jadwal kunjungan</p>
                      {isAdmin && (
                        <>
                          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Klik tombol + untuk menambah jadwal</p>
                          <Button variant="outline" className="mt-4 gap-2" onClick={() => handleOpenDialog()}>
                            <Plus className="w-4 h-4" /> Tambah Jadwal
                          </Button>
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Mobile Cards */}
                      <div className="flex flex-col gap-3 md:hidden">
                        {schedulesForDay.map((schedule: any) => {
                          const customer = schedule.customers || {};
                          const name = schedule.customer_name || customer.name || "—";
                          const phone = customer.phone || "—";
                          const isTracking = trackingId === schedule.id;
                          const todayLogForSchedule = (logs || []).find((log: any) =>
                            log.schedule_id === schedule.id && log.visited_at && isDateInCurrentWeek(log.visited_at)
                          );
                          const isVerified = todayLogForSchedule &&
                            (verifiedLogs[todayLogForSchedule.id] || todayLogForSchedule.notes?.includes('[verified]'));

                          return (
                            <div key={schedule.id} className="bg-white dark:bg-slate-900 rounded-none border border-slate-200 dark:border-slate-800 p-4 shadow-sm relative">
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0 pr-2">
                                  <div className="font-semibold text-slate-900 dark:text-white mb-1">{name}</div>
                                  <div className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                                    <div className="flex items-center gap-1.5">
                                      <Phone className="w-3.5 h-3.5 text-primary" />{phone}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <User className="w-3.5 h-3.5 text-primary" />{schedule.sales_name || "—"}
                                    </div>
                                    {schedule.visit_time && (
                                      <div className="flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5 text-primary" />{schedule.visit_time.slice(0, 5)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="shrink-0 flex flex-col items-end gap-2">
                                  {isAdmin && (
                                    <ActionMenu
                                      triggerClassName="-mr-3.5 -mt-3.5"
                                      items={[
                                        { label: "Edit", icon: <Edit className="h-4 w-4 text-slate-500" />, onClick: () => handleOpenDialog(schedule) },
                                        { label: "Hapus", icon: <Trash2 className="h-4 w-4" />, onClick: () => confirmDelete(schedule.id), destructive: true },
                                      ]}
                                    />
                                  )}
                                  {todayLogForSchedule ? (
                                    isVerified ? (
                                      <Badge className="bg-green-500 text-white text-[10px] h-6 px-2 gap-1">
                                        <CheckCircle2 className="w-3 h-3" />Selesai
                                      </Badge>
                                    ) : (
                                      <Badge className="bg-amber-400 text-white text-[10px] h-6 px-2">Check-in</Badge>
                                    )
                                  ) : (
                                    <Badge variant="secondary" className="text-[10px] h-6 px-2">Pending</Badge>
                                  )}
                                  {!isAdmin && (
                                    <Button size="sm" className="h-7 text-xs gap-1"
                                      onClick={() => handleStartVisit(schedule)}
                                      disabled={isTracking || createLog.isPending}
                                    >
                                      {isTracking ? <><Loader2 className="w-3 h-3 animate-spin" />GPS...</> : <><Navigation className="w-3 h-3" />{visitedScheduleIdsToday.has(schedule.id) ? "Lagi" : "Kunjungi"}</>}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Desktop Table */}
                      <div className="hidden md:block bg-white dark:bg-slate-900 rounded-none shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                              <TableHead className="w-[40px] text-center">#</TableHead>
                              <TableHead className="min-w-[180px]">Pelanggan</TableHead>
                              <TableHead className="w-[130px] text-left">No. Telp</TableHead>
                              <TableHead className="w-[140px] text-left">Kota/Kabupaten</TableHead>
                              <TableHead className="w-[140px] text-left">Kecamatan</TableHead>
                              <TableHead className="w-[140px] text-left">Kelurahan</TableHead>
                              <TableHead className="min-w-[100px]">Nama Sales</TableHead>
                              <TableHead className="w-[100px] text-center">Jam</TableHead>
                              <TableHead className="w-[120px] text-center">Status</TableHead>
                              <TableHead className="w-[50px] text-center">Aksi</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {schedulesForDay.map((schedule: any, idx: number) => {
                              const customer = schedule.customers || {};
                              const name = schedule.customer_name || customer.name || "—";
                              const phone = customer.phone || "—";
                              const isTracking = trackingId === schedule.id;
                              const todayLogForSchedule = (logs || []).find((log: any) =>
                                log.schedule_id === schedule.id && log.visited_at && isDateInCurrentWeek(log.visited_at)
                              );
                              const isVerified = todayLogForSchedule &&
                                (verifiedLogs[todayLogForSchedule.id] || todayLogForSchedule.notes?.includes('[verified]'));

                              return (
                                <TableRow key={schedule.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                  <TableCell className="text-center text-slate-500 text-sm">{idx + 1}</TableCell>
                                  <TableCell>
                                    <div className="font-medium text-slate-900 dark:text-white">{name}</div>
                                    {customer.address && <div className="text-xs text-slate-400 mt-0.5 truncate max-w-[200px]">{customer.address}</div>}
                                  </TableCell>
                                  <TableCell className="text-slate-600 dark:text-slate-400 whitespace-nowrap text-left">{phone}</TableCell>
                                  <TableCell className="text-slate-600 dark:text-slate-400 whitespace-nowrap capitalize">{customer.city?.toLowerCase() || "-"}</TableCell>
                                  <TableCell className="text-slate-600 dark:text-slate-400 whitespace-nowrap capitalize">{customer.district?.toLowerCase() || "-"}</TableCell>
                                  <TableCell className="text-slate-600 dark:text-slate-400 whitespace-nowrap capitalize">{customer.village?.toLowerCase() || "-"}</TableCell>
                                  <TableCell className="text-slate-600 dark:text-slate-400 whitespace-nowrap text-left">{schedule.sales_name || "—"}</TableCell>
                                  <TableCell className="text-slate-600 dark:text-slate-400 whitespace-nowrap text-center">
                                    {schedule.visit_time ? schedule.visit_time.slice(0, 5) : "—"}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {todayLogForSchedule ? (
                                      isVerified ? (
                                        <Badge className="bg-green-500 text-white text-[10px] h-5 px-2 gap-1">
                                          <CheckCircle2 className="w-3 h-3" />Selesai
                                        </Badge>
                                      ) : (
                                        <Badge className="bg-amber-400 text-white text-[10px] h-5 px-2">Check-in</Badge>
                                      )
                                    ) : (
                                      <Badge variant="secondary" className="text-[10px] h-5 px-2">Pending</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex items-center justify-center gap-1.5">
                                      {isAdmin ? (
                                        <>
                                          <ActionMenu items={[
                                            ...(todayLogForSchedule && !isVerified && todayLogForSchedule.latitude ? [{
                                              label: "Periksa Peta",
                                              icon: <Map className="h-4 w-4 text-slate-500" />,
                                              onClick: () => openInMaps(todayLogForSchedule.latitude, todayLogForSchedule.longitude)
                                            }] : []),
                                            ...(todayLogForSchedule && !isVerified ? [{
                                              label: "Konfirmasi",
                                              icon: <Check className="h-4 w-4 text-emerald-600" />,
                                              onClick: () => handleVerifyLog(todayLogForSchedule.id)
                                            }] : []),
                                            { label: "Edit", icon: <Edit className="h-4 w-4 text-slate-500" />, onClick: () => handleOpenDialog(schedule) },
                                            { label: "Hapus", icon: <Trash2 className="h-4 w-4" />, onClick: () => confirmDelete(schedule.id), destructive: true },
                                          ]} />
                                        </>
                                      ) : (
                                        <ActionMenu items={[
                                          {
                                            label: isTracking ? "Mencari GPS..." : (visitedScheduleIdsToday.has(schedule.id) ? "Kunjungi Lagi" : "Kunjungi"),
                                            icon: isTracking ? <Loader2 className="h-4 w-4 text-slate-500 animate-spin" /> : (visitedScheduleIdsToday.has(schedule.id) ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Navigation className="h-4 w-4 text-primary" />),
                                            onClick: () => {
                                              if (!isTracking && !createLog.isPending) {
                                                handleStartVisit(schedule);
                                              }
                                            }
                                          }
                                        ]} />
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* History Tab */}
            {activeTab === "history" && (
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:border-red-900/50 dark:hover:bg-red-950/50 gap-2 shadow-sm self-start sm:self-auto"
                      onClick={() => setIsDeleteAllLogsDialogOpen(true)}
                      disabled={logs.length === 0 && logsTotalCount === 0}
                    >
                      <Trash2 className="w-4 h-4" />
                      Hapus Semua Riwayat
                    </Button>
                  )}
                  {isAdmin && uniqueLogSalesNames.length > 0 && (
                    <div className="flex justify-end sm:ml-auto w-full sm:w-auto">
                      <Select value={logSalesFilter} onValueChange={(v) => setLogSalesFilter(v)}>
                        <SelectTrigger className="w-full sm:w-[200px] shadow-sm">
                          <SelectValue placeholder="Semua Sales" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Semua Sales</SelectItem>
                          {uniqueLogSalesNames.map((name) => (
                            <SelectItem key={name} value={name}>{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                {logs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <p className="text-slate-500 dark:text-slate-400 font-medium">
                      {logSalesFilter !== "all"
                        ? "Belum ada riwayat dengan kriteria filter tersebut"
                        : "Belum ada riwayat kunjungan"}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-sm overflow-x-auto shadow-sm">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                            <TableHead className="w-[40px] text-center">#</TableHead>
                            <TableHead className="min-w-[150px]">Pelanggan</TableHead>
                            <TableHead className="w-[150px]">Sales</TableHead>
                            <TableHead className="w-[160px]">Waktu Check-in</TableHead>
                            <TableHead className="min-w-[140px]">Lokasi (GPS)</TableHead>
                            <TableHead className="w-[80px] text-center">Peta</TableHead>
                            <TableHead className="min-w-[150px]">Catatan</TableHead>
                            <TableHead className="w-[90px] text-center">Status</TableHead>
                            <TableHead className="w-[90px] text-center">Validasi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {logs.map((log: any, idx: number) => {
                            const globalIdx = (page - 1) * ITEMS_PER_PAGE + idx;
                            return (
                              <TableRow key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                                <TableCell className="text-center text-slate-500 font-medium">
                                  {globalIdx + 1}
                                </TableCell>
                                <TableCell className="font-medium text-slate-900 dark:text-white">
                                  {log.customer_name || "—"}
                                </TableCell>
                                <TableCell className="text-slate-600 dark:text-slate-400">
                                  {log.sales_name || "—"}
                                </TableCell>
                                <TableCell className="text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                  {formatVisitedAt(log.visited_at)}
                                </TableCell>
                                <TableCell>
                                  {log.latitude && log.longitude ? (
                                    <span className="text-xs font-mono text-slate-500">
                                      {log.latitude.toFixed(5)}, {log.longitude.toFixed(5)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 text-xs italic">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  {log.latitude && log.longitude ? (
                                    <a
                                      href={`https://maps.google.com/?q=${log.latitude},${log.longitude}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center justify-center text-primary hover:text-primary/80 transition-colors"
                                      title="Buka Peta"
                                    >
                                      <Map className="w-4 h-4" />
                                    </a>
                                  ) : (
                                    <span className="text-slate-400 text-xs italic">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-slate-600 dark:text-slate-400 max-w-[200px] truncate">
                                  {cleanNotes(log.notes) ? (
                                    <span title={cleanNotes(log.notes)}>{cleanNotes(log.notes)}</span>
                                  ) : (
                                    <span className="italic text-slate-400 text-[10px]">Tidak ada catatan</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge className="bg-green-500 text-white font-medium rounded-sm text-[10px] h-5 px-2 hover:bg-green-600 border-transparent">
                                    Selesai
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-center">
                                  {(verifiedLogs[log.id] || (log.notes && log.notes.includes('[verified]'))) ? (
                                    <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400 font-medium rounded-sm text-[10px] h-5 px-2">
                                      Valid
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400 font-medium rounded-sm text-[10px] h-5 px-2">
                                      Pending
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination Controls */}
                    {logsTotalCount > 0 && (
                      <div className="flex items-center justify-between px-2 py-3 border-t border-slate-200 dark:border-slate-800 mt-2">
                        <div className="text-sm text-slate-500">
                          Halaman {page} dari {Math.ceil(logsTotalCount / ITEMS_PER_PAGE) || 1}
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
                            disabled={page * ITEMS_PER_PAGE >= logsTotalCount}
                            className="flex items-center gap-1"
                          >
                            Next
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Add/Edit Schedule Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingSchedule ? "Edit Jadwal Kunjungan" : "Tambah Jadwal Kunjungan"}
            </DialogTitle>
            <DialogDescription>
              {editingSchedule
                ? "Perbarui informasi jadwal kunjungan"
                : "Atur jadwal kunjungan sales ke toko pelanggan"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Sales picker — shown to admin only; non-admin sees their own name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Sales <span className="text-red-500">*</span>
              </label>
              {isAdmin ? (
                <SearchableSelect
                  options={activeSalesList.map((s: any) => ({
                    id: s.name,
                    name: s.name,
                  }))}
                  value={formData.sales_name || ""}
                  onChange={(_id, name) => setFormData({ ...formData, sales_name: name })}
                  placeholder="Pilih sales..."
                />
              ) : (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-sm bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary flex-shrink-0">
                    {(formData.sales_name || user?.name || "").charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                    {formData.sales_name || user?.name || "—"}
                  </span>
                </div>
              )}
            </div>

            {/* Customer selection */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Pelanggan / Toko <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                options={(customers || []).map((c: any) => ({
                  id: c.id.toString(),
                  name: `${c.name}${c.phone ? ` - ${c.phone}` : ""}`,
                }))}
                value={formData.customer_id || ""}
                onChange={(id) => setFormData({ ...formData, customer_id: id })}
                placeholder="Pilih pelanggan..."
              />
            </div>

            {/* Day of week */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Hari Kunjungan <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                options={DAYS.map(day => ({ id: day.id.toString(), name: day.label }))}
                value={formData.day_of_week || ""}
                onChange={(id) => setFormData({ ...formData, day_of_week: id })}
                placeholder="Pilih hari kunjungan..."
              />
            </div>

            {/* Visit time */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Jam Kunjungan <span className="text-slate-400 text-xs">(opsional)</span>
              </label>
              <SearchableSelect
                options={[
                  { id: "", name: "-- Tidak ditentukan --" },
                  ...Array.from({ length: 29 }, (_, i) => {
                    const totalMinutes = 7 * 60 + i * 30;
                    const h = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
                    const m = String(totalMinutes % 60).padStart(2, "0");
                    return { id: `${h}:${m}`, name: `${h}:${m}` };
                  })
                ]}
                value={formData.visit_time || ""}
                onChange={(id) => setFormData({ ...formData, visit_time: id })}
                placeholder="Pilih jam kunjungan..."
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Catatan <span className="text-slate-400 text-xs">(opsional)</span>
              </label>
              <Input
                placeholder="Misal: Tanya stok bulan ini..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !formData.customer_id ||
                createSchedule.isPending ||
                updateSchedule.isPending
              }
            >
              {createSchedule.isPending || updateSchedule.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                "Simpan"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Check-in Notes Dialog */}
      <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Navigation className="w-5 h-5 text-green-500" />
              Konfirmasi Kunjungan
            </DialogTitle>
            <DialogDescription>
              Selesaikan check-in kunjungan hari ini
            </DialogDescription>
          </DialogHeader>

          {pendingCheckIn && (
            <div className="py-2 space-y-4">
              {/* Store info */}
              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/50 rounded-sm p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-green-600" />
                  <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                    {pendingCheckIn.schedule.customer_name ||
                      pendingCheckIn.schedule.customers?.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  <span className="font-mono">
                    {pendingCheckIn.position.latitude.toFixed(6)},{" "}
                    {pendingCheckIn.position.longitude.toFixed(6)}
                  </span>
                </div>
              </div>

              {/* Notes input */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Catatan Kunjungan
                </label>
                <Input
                  placeholder="Hasil kunjungan, pesanan, dll..."
                  value={checkInNotes}
                  onChange={(e) => setCheckInNotes(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleConfirmCheckIn()}
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setNotesDialogOpen(false);
                setPendingCheckIn(null);
              }}
            >
              Batal
            </Button>
            <Button
              onClick={handleConfirmCheckIn}
              disabled={createLog.isPending}
              className="bg-green-500 hover:bg-green-600 text-white"
            >
              {createLog.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Check-in Sekarang
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin Location Verification Dialog */}
      <Dialog open={!!checkingLog} onOpenChange={(open) => !open && setCheckingLog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              Pemeriksaan Lokasi Kunjungan
            </DialogTitle>
            <DialogDescription>
              Validasi koordinat GPS sales saat melakukan check-in
            </DialogDescription>
          </DialogHeader>

          {checkingLog && (
            <div className="py-2 space-y-4">
              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-sm p-4 space-y-3">
                <div className="grid grid-cols-[100px_1fr] text-xs gap-y-2">
                  <span className="text-slate-400 font-medium">Toko:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {checkingLog.customer_name}
                  </span>

                  <span className="text-slate-400 font-medium">Sales:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {checkingLog.sales_name}
                  </span>

                  <span className="text-slate-400 font-medium">Waktu:</span>
                  <span className="text-slate-600 dark:text-slate-300">
                    {formatVisitedAt(checkingLog.visited_at)}
                  </span>

                  <span className="text-slate-400 font-medium">Koordinat:</span>
                  <span className="font-mono text-slate-600 dark:text-slate-300">
                    {checkingLog.latitude.toFixed(6)}, {checkingLog.longitude.toFixed(6)}
                  </span>

                  {checkingLog.notes && (
                    <>
                      <span className="text-slate-400 font-medium">Catatan:</span>
                      <span className="text-slate-600 dark:text-slate-300 italic">
                        "{cleanNotes(checkingLog.notes)}"
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-900 p-3 rounded-sm border border-slate-200 dark:border-slate-800 text-xs">
                <span className="text-slate-500">Status Pemeriksaan:</span>
                {(verifiedLogs[checkingLog.id] || (checkingLog.notes && checkingLog.notes.includes('[verified]'))) ? (
                  <Badge className="bg-emerald-500 text-white font-bold">
                    VALID
                  </Badge>
                ) : (
                  <Badge className="bg-amber-500 text-white font-bold">
                    MENUNGGU VALIDASI
                  </Badge>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setCheckingLog(null)}>
              Tutup
            </Button>
            {checkingLog && !(verifiedLogs[checkingLog.id] || (checkingLog.notes && checkingLog.notes.includes('[verified]'))) && (
              <Button
                onClick={() => handleVerifyLog(checkingLog.id)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                Konfirmasi Lokasi Valid
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Download Excel Dialog */}
      <Dialog open={showDownloadDialog} onOpenChange={setShowDownloadDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">

              Download Laporan
            </DialogTitle>
            <DialogDescription>
              Pilih periode dan filter untuk download laporan Excel
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Tanggal Mulai</label>
              <div className="relative w-full h-8">
                <Input
                  type="text"
                  placeholder="Tanggal Mulai"
                  value={downloadStartDate ? downloadStartDate.split('-').reverse().join('-') : "Tanggal Mulai"}
                  readOnly
                  className="absolute inset-0 h-10 w-full rounded-sm text-sm text-center focus:ring-2 cursor-pointer bg-slate-50 dark:bg-slate-900"
                />
                <input
                  type="date"
                  value={downloadStartDate}
                  onChange={(e: any) => setDownloadStartDate(e.target.value)}
                  onClick={(e: any) => {
                    try { e.target.showPicker?.(); } catch (err) { }
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  title="Tanggal Mulai"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Tanggal Akhir</label>
              <div className="relative w-full h-8">
                <Input
                  type="text"
                  placeholder="Tanggal Akhir"
                  value={downloadEndDate ? downloadEndDate.split('-').reverse().join('-') : "Tanggal Akhir"}
                  readOnly
                  className="absolute inset-0 h-10 w-full rounded-sm text-sm text-center focus:ring-2 cursor-pointer bg-slate-50 dark:bg-slate-900"
                />
                <input
                  type="date"
                  value={downloadEndDate}
                  onChange={(e: any) => setDownloadEndDate(e.target.value)}
                  onClick={(e: any) => {
                    try { e.target.showPicker?.(); } catch (err) { }
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  title="Tanggal Akhir"
                />
              </div>
            </div>

            {isAdmin && uniqueLogSalesNames.length > 0 && (
              <div className="grid gap-2">
                <label className="text-sm font-medium">Sales</label>
                <Select value={downloadSalesFilter} onValueChange={setDownloadSalesFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Semua Sales" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Sales</SelectItem>
                    {uniqueLogSalesNames.map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDownloadDialog(false)}>Batal</Button>
            <Button onClick={handleDownloadExcel} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
              <Download className="w-4 h-4" />
              Download Excel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Jadwal Kunjungan?</AlertDialogTitle>
            <AlertDialogDescription>
              Jadwal ini akan dihapus secara permanen dan tidak dapat dikembalikan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-t-2 border-slate-200 dark:border-slate-700 pt-4 mt-2">
            <AlertDialogCancel onClick={() => setDeleteScheduleId(null)}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={executeDelete}
              disabled={deleteSchedule.isPending}
            >
              {deleteSchedule.isPending ? "Menghapus..." : "Hapus Jadwal"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete All History Confirmation Dialog */}
      <AlertDialog open={isDeleteAllLogsDialogOpen} onOpenChange={setIsDeleteAllLogsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 dark:text-red-400 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              Hapus Semua Riwayat Kunjungan?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {logSalesFilter !== 'all'
                ? `Seluruh riwayat kunjungan sales (${logSalesFilter}) akan dihapus secara permanen.`
                : "Seluruh riwayat kunjungan sales akan dihapus secara permanen dari sistem dan tidak dapat dikembalikan."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-t-2 border-slate-200 dark:border-slate-700 pt-4 mt-2">
            <AlertDialogCancel disabled={isDeletingLogs}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDeleteAllLogs}
              disabled={isDeletingLogs}
            >
              {isDeletingLogs ? "Menghapus..." : "Hapus Semua Riwayat"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}
