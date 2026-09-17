import { useState, useMemo, useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { useListCustomers } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Megaphone, Send, MessageSquare, Users, Store, Plus, Trash2, Edit2, Save, X, SquarePen, RotateCcw, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { ADMIN_EMAIL } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { open as openShell } from "@tauri-apps/plugin-shell";
import { formatInvoiceNumber, formatSimpleDate, formatRupiah } from "@/lib/formatters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ActionMenu } from "@/components/ui/action-menu";
interface PromoTemplate {
  id: number;
  name: string;
  content: string;
}

const DEFAULT_TEMPLATES: PromoTemplate[] = [
  {
    id: -1,
    name: "Template Promo Spesial",
    content: "Halo @ 😊\n\nKabar gembira dari #! 🎉\nKami sedang mengadakan PROMO SPESIAL minggu ini!\n\nYuk, segera order produk kami atau balas pesan ini untuk info penawaran terbaik khusus untuk Anda!\n\nTerima kasih sudah menjadi pelanggan setia kami. 🙏\n\nSalam hangat,\n#",
  },
  {
    id: -2,
    name: "Template Penagihan",
    content: "🔔 *PEMBERITAHUAN PENAGIHAN* 🔔\n\nHalo @ 😊\n\nKami menginformasikan bahwa terdapat tagihan yang belum diselesaikan dengan detail berikut:\n\n- No. Transaksi: %\n- Tanggal Pemesanan: &\n- Total Tagihan: ^\n- Jatuh Tempo: $\n\nBerikut data pesanan saat ini adalah,\n~\n\nMohon untuk segera melakukan pembayaran atau menghubungi kami untuk konfirmasi.\n\nJika Anda sudah melakukan pembayaran, silakan abaikan pesan ini atau kirimkan bukti pembayaran kepada kami.\n\nTerima kasih atas perhatian dan kerja samanya.\n\n🙏 Hormat Kami,\n#",
  },
];

const ITEMS_PER_PAGE = 20;

export default function PromoPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const { data: customers, isLoading } = useListCustomers();

  const [templates, setTemplates] = useState<PromoTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<PromoTemplate | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [isManagingTemplates, setIsManagingTemplates] = useState(false);
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [templateFormData, setTemplateFormData] = useState({ id: 0, name: "", content: "" });
  const [isTemplateLoading, setIsTemplateLoading] = useState(true);
  const [isSentLogsLoading, setIsSentLogsLoading] = useState(true);
  const [sentLogs, setSentLogs] = useState<Map<number, string>>(new Map()); // customer_id -> sent_at timestamp
  const [statusFilter, setStatusFilter] = useState<"all" | "sent" | "unsent">("all");
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<PromoTemplate | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Cooldown settings
  const [cooldownDays, setCooldownDays] = useState<number>(() => {
    const saved = localStorage.getItem("promoCooldownDays");
    return saved ? parseInt(saved, 10) : 7; // Default 7 days
  });
  const [isConfiguringCooldown, setIsConfiguringCooldown] = useState(false);

  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const storeName = localStorage.getItem("storeName") || "EL PROJECT";

  useEffect(() => {
    if (user) {
      fetchTemplates();
      fetchSentLogs();
    }
  }, [user]);

  const fetchSentLogs = async () => {
    try {
      const { data, error } = await supabase
        .from("promo_sent_logs")
        .select("customer_id, sent_at")
        .order("sent_at", { ascending: false }); // Get latest first

      if (!error && data) {
        const logMap = new Map<number, string>();
        // Only keep the most recent sent_at for each customer
        data.forEach(log => {
          const cid = Number(log.customer_id);
          if (!logMap.has(cid)) {
            logMap.set(cid, log.sent_at);
          }
        });
        setSentLogs(logMap);
      }
    } catch (error) {
      console.error("Failed to fetch sent logs", error);
    } finally {
      setIsSentLogsLoading(false);
    }
  };

  const fetchTemplates = async () => {
    setIsTemplateLoading(true);
    try {
      const { data, error } = await supabase
        .from("promo_templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Supabase fetch error (expected if table not ready):", error);
        setTemplates(DEFAULT_TEMPLATES);
        if (!selectedTemplate) {
          setSelectedTemplate(DEFAULT_TEMPLATES[0]);
          setCustomMessage(DEFAULT_TEMPLATES[0].content);
        }
        return;
      }

      const allTemplates = [...(data || []), ...DEFAULT_TEMPLATES];
      setTemplates(allTemplates);

      if (allTemplates.length > 0 && !selectedTemplate) {
        const initialTemplate = allTemplates[0];
        setSelectedTemplate(initialTemplate);
        setCustomMessage(initialTemplate.content);
      }
    } catch (error) {
      console.error("Unexpected error fetching templates:", error);
      setTemplates(DEFAULT_TEMPLATES);
      if (!selectedTemplate) {
        setSelectedTemplate(DEFAULT_TEMPLATES[0]);
        setCustomMessage(DEFAULT_TEMPLATES[0].content);
      }
    } finally {
      setIsTemplateLoading(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];

    const now = new Date();

    const filtered = customers.filter((c: any) => {
      const matchesSearch =
        c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.phone?.includes(search);

      let isSent = false;
      const lastSentIso = sentLogs.get(c.id);

      if (lastSentIso) {
        const lastSentDate = new Date(lastSentIso);
        const diffTime = Math.abs(now.getTime() - lastSentDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        // It's considered "sent" if it was sent within the cooldown period
        isSent = diffDays <= cooldownDays;
      }

      let matchesStatus = true;
      if (statusFilter === "sent") {
        matchesStatus = isSent;
      } else if (statusFilter === "unsent") {
        matchesStatus = !isSent;
      }

      // We attach the dynamic isSent boolean to the customer object for rendering
      c._isSentTemporarily = isSent;

      return matchesSearch && c.phone && matchesStatus;
    });

    // Apply sorting
    return filtered.sort((a: any, b: any) => {
      if (sortOrder === "newest") return b.id - a.id;
      return a.id - b.id;
    });
  }, [customers, search, statusFilter, sentLogs, cooldownDays, sortOrder]);

  const totalPages = Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE);
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredCustomers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredCustomers, currentPage]);

  // Reset to first page when filtering or searching
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  const handleTemplateChange = (templateId: string) => {
    const template = templates.find(t => t.id.toString() === templateId);
    if (template) {
      setSelectedTemplate(template);
      setCustomMessage(template.content);
    }
  };

  const formatMessage = (
    message: string,
    customerName: string,
    dueDate: string = "Tanggal Jatuh Tempo",
    invoiceNumber: string = "Nomor Transaksi",
    orderDate: string = "Tanggal Pemesanan",
    totalTagihan: string = "Total Tagihan",
    productDetails: string = "Rincian Produk"
  ) => {
    const cleanName = (customerName || "").trim();
    const cleanStore = (storeName || "EL PROJECT").trim();

    return (message || "")
      .replace(/@/g, `*${cleanName}*`)
      .replace(/#/g, `*${cleanStore}*`)
      .replace(/\$/g, `*${dueDate}*`)
      .replace(/%/g, `*${invoiceNumber}*`)
      .replace(/&/g, `*${orderDate}*`)
      .replace(/\^/g, `*${totalTagihan}*`)
      .replace(/~/g, productDetails);
  };

  const renderPreviewMessage = (message: string) => {
    const formatted = formatMessage(message, "Nama Pelanggan");
    return formatted.split(/(\*[^*]+\*)/g).map((part, i) => {
      if (part.startsWith("*") && part.endsWith("*")) {
        return <strong key={i} className="font-bold text-slate-900 dark:text-white">{part.slice(1, -1)}</strong>;
      }
      return part;
    });
  };

  const handleSendWA = async (customer: any) => {
    if (!customer.phone) {
      toast({ title: "Error", description: "Nomor WhatsApp tidak ada", variant: "destructive" });
      return;
    }

    let dueDateStr = "-";
    let invoiceNumberStr = "-";
    let orderDateStr = "-";
    let totalTagihanStr = "-";
    let productDetailsStr = "-";

    try {
      const { data } = await supabase
        .from("transactions")
        .select("id, due_date, created_at, remaining_balance, subtotal, tax, discount, transaction_items(product_name, quantity, price)")
        .eq("customer_id", customer.id)
        .not("due_date", "is", null)
        .neq("payment_status", "paid")
        .order("created_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const trx = data[0];
        if (trx.due_date) {
          dueDateStr = formatSimpleDate(trx.due_date);
        }
        if (trx.id) {
          invoiceNumberStr = formatInvoiceNumber(trx.id);
        }
        if (trx.created_at) {
          orderDateStr = formatSimpleDate(trx.created_at);
        }
        if (trx.remaining_balance !== undefined && trx.remaining_balance !== null) {
          totalTagihanStr = formatRupiah(trx.remaining_balance);
        } else {
          const total = (trx.subtotal || 0) + (trx.tax || 0) - (trx.discount || 0);
          totalTagihanStr = formatRupiah(total);
        }
        if (trx.transaction_items && trx.transaction_items.length > 0) {
          productDetailsStr = trx.transaction_items.map((item: any) => {
            return `- ${item.product_name} (${item.quantity} x ${formatRupiah(item.price)})`;
          }).join("\n");
        }
      }
    } catch (e) {
      console.error("Gagal mengambil info transaksi:", e);
    }

    const message = formatMessage(customMessage, customer.name, dueDateStr, invoiceNumberStr, orderDateStr, totalTagihanStr, productDetailsStr);
    let phone = customer.phone.replace(/[^0-9]/g, "");
    if (phone.startsWith("0")) phone = "62" + phone.substring(1);
    else if (!phone.startsWith("62") && !phone.startsWith("+")) phone = "62" + phone;

    // Menggunakan api.whatsapp.com/send lebih stabil untuk encoding emoji di Android
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;

    const isTauri = !!(window as any).__TAURI_INTERNALS__;

    if (isTauri) {
      try {
        await openShell(whatsappUrl);
      } catch (err) {
        console.error("Tauri shell open failed:", err);
        window.open(whatsappUrl, "_blank");
      }
    } else {
      window.open(whatsappUrl, "_blank");
    }

    toast({ title: "Sukses", description: `Membuka WhatsApp untuk ${customer.name}` });

    // Mark as sent locally for immediate UI update
    setSentLogs(prev => {
      const next = new Map(prev);
      next.set(customer.id, new Date().toISOString());
      return next;
    });

    // Save to database for persistence
    try {
      await supabase.from("promo_sent_logs").insert([{
        customer_id: customer.id,
        template_id: (selectedTemplate?.id ?? 0) > 0 ? selectedTemplate?.id : null,
        owner_id: user?.id
      }]);
    } catch (error) {
      console.error("Failed to save sent log", error);
    }
  };

  const handleResetLogs = async () => {
    setIsResetDialogOpen(false);
    try {
      const { error } = await supabase
        .from("promo_sent_logs")
        .delete()
        .eq("owner_id", user?.id);

      if (error) throw error;

      setSentLogs(new Map());
      toast({ title: "Berhasil", description: "Status pengiriman telah direset." });
    } catch (error) {
      toast({ title: "Error", description: "Gagal mereset status", variant: "destructive" });
    }
  };

  // Template Management Logic
  const handleOpenAddTemplate = () => {
    setTemplateFormData({ id: 0, name: "", content: "" });
    setIsEditingTemplate(true);
  };

  const handleEditTemplate = (template: PromoTemplate) => {
    if (template.id < 0) {
      toast({ title: "Info", description: "Template bawaan tidak dapat diubah", variant: "destructive" });
      return;
    }
    setTemplateFormData({ id: template.id, name: template.name, content: template.content });
    setIsEditingTemplate(true);
  };

  const handleSaveTemplate = async () => {
    if (!templateFormData.name || !templateFormData.content) {
      toast({ title: "Error", description: "Nama dan isi template wajib diisi", variant: "destructive" });
      return;
    }

    try {
      if (templateFormData.id > 0) {
        const { error, data } = await supabase
          .from("promo_templates")
          .update({
            name: templateFormData.name,
            content: templateFormData.content
          })
          .eq("id", templateFormData.id)
          .select();

        if (error) throw error;
        if (!data || data.length === 0) throw new Error("Anda tidak memiliki izin untuk mengedit template ini.");

        toast({ title: "Sukses", description: "Template diperbarui" });
      } else {
        const { error } = await supabase
          .from("promo_templates")
          .insert([{
            name: templateFormData.name,
            content: templateFormData.content,
            owner_id: user?.id || null // Ensure null if user is undefined
          }]);
        if (error) throw error;
        toast({ title: "Sukses", description: "Template baru ditambahkan" });
      }
      setIsEditingTemplate(false);
      fetchTemplates();
    } catch (error: any) {
      console.error("Save template error:", error);
      toast({ title: "Gagal", description: error.message || "Gagal menyimpan template", variant: "destructive" });
    }
  };

  const handleConfirmDeleteTemplate = async () => {
    if (!deletingTemplate || deletingTemplate.id < 0) return;
    const targetId = deletingTemplate.id;
    setDeletingTemplate(null);

    try {
      const { error, data } = await supabase
        .from("promo_templates")
        .delete()
        .eq("id", targetId)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Anda tidak memiliki izin untuk menghapus template ini.");

      toast({ title: "Sukses", description: "Template dihapus" });
      fetchTemplates();
    } catch (error: any) {
      console.error("Delete template error:", error);
      toast({ title: "Gagal", description: error.message || "Gagal menghapus template", variant: "destructive" });
    }
  };

  return (
    <Sidebar>
      <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950" style={{ '--radius': '0px' } as React.CSSProperties}>
        {/* Header */}
        <div className="px-4 py-2 sm:px-6 sm:py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-row items-center justify-between gap-3">
          <h1 className="text-xl sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            Promo WhatsApp
          </h1>
          <div className="flex items-center gap-2">
            <ActionMenu
              items={[
                {
                  label: "Kelola Template",
                  icon: <MessageSquare className="h-4 w-4 text-slate-500" />,
                  onClick: () => setIsManagingTemplates(true),
                },
                {
                  label: "Tambah Template",
                  icon: <Plus className="h-4 w-4 text-slate-500" />,
                  onClick: () => {
                    setIsManagingTemplates(true);
                    handleOpenAddTemplate();
                  },
                },
                {
                  label: "Reset",
                  icon: <RotateCcw className="h-4 w-4 text-slate-500" />,
                  onClick: () => setIsResetDialogOpen(true),
                },
              ]}
            />
          </div>
        </div>

        {isLoading || isSentLogsLoading ? (
          <div className="flex-1 overflow-auto scrollbar-hide flex items-center justify-center min-h-[400px]">
            <LoadingSpinner text="Memuat data promo..." />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-auto scrollbar-hide p-4 sm:p-6 pb-24 md:pb-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Message Config */}
                <div className="lg:col-span-1 space-y-6">
                  <Card className="p-4 border-slate-200 dark:border-slate-700">
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">

                      Konfigurasi Pesan
                    </h3>

                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-medium text-slate-500 mb-1.5 block uppercase tracking-wider">Pilih Template</label>
                        <Select
                          value={selectedTemplate?.id?.toString() || ""}
                          onValueChange={handleTemplateChange}
                        >
                          <SelectTrigger className="w-full shadow-sm">
                            <SelectValue placeholder="Pilih Template" />
                          </SelectTrigger>
                          <SelectContent>
                            {templates.map(t => (
                              <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-slate-500 mb-1.5 block uppercase tracking-wider">Isi Pesan</label>
                        <Textarea
                          className="min-h-[200px] text-sm leading-relaxed scrollbar-hide"
                          value={customMessage}
                          onChange={(e) => setCustomMessage(e.target.value)}
                          placeholder="Tulis pesan promo di sini..."
                        />
                        <div className="mt-2 space-y-1">
                          <p className="text-[10px] text-slate-400 italic">Ketik <span className="font-mono text-primary text-xs font-bold">@</span> untuk menyisipkan nama pelanggan</p>
                          <p className="text-[10px] text-slate-400 italic">Ketik <span className="font-mono text-primary text-xs font-bold">#</span> untuk menyisipkan nama toko</p>
                          <p className="text-[10px] text-slate-400 italic">Ketik <span className="font-mono text-primary text-xs font-bold">%</span> untuk menyisipkan nomor transaksi</p>
                          <p className="text-[10px] text-slate-400 italic">Ketik <span className="font-mono text-primary text-xs font-bold">&amp;</span> untuk menyisipkan tanggal pemesanan</p>
                          <p className="text-[10px] text-slate-400 italic">Ketik <span className="font-mono text-primary text-xs font-bold">$</span> untuk menyisipkan tanggal jatuh tempo</p>
                          <p className="text-[10px] text-slate-400 italic">Ketik <span className="font-mono text-primary text-xs font-bold">^</span> untuk menyisipkan total tagihan</p>
                          <p className="text-[10px] text-slate-400 italic">Ketik <span className="font-mono text-primary text-xs font-bold">~</span> untuk menyisipkan rincian produk</p>
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-4 bg-primary/5 border-primary/20">
                    <h4 className="text-xs font-bold text-primary uppercase tracking-widest mb-2">Preview</h4>
                    <div className="bg-white dark:bg-slate-800 p-3 rounded-sm border border-slate-100 dark:border-slate-700 text-sm shadow-sm italic text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                      {renderPreviewMessage(customMessage)}
                    </div>
                  </Card>
                </div>

                {/* Customer List */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-4 h-4" />
                      <Input
                        placeholder="Cari nama atau nomor..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 shadow-sm h-9"
                      />
                    </div>

                    <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 px-3 flex items-center gap-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm relative shrink-0"
                        >
                          <SlidersHorizontal className="w-4 h-4 text-slate-500" />
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Filter</span>
                          {(statusFilter !== "all" || sortOrder !== "newest") && (
                            <span className="w-2 h-2 rounded-full bg-primary absolute top-1.5 right-1.5" />
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-4" align="end">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                            <h4 className="font-semibold text-sm text-slate-900 dark:text-white">Filter Pelanggan</h4>
                            {(statusFilter !== "all" || sortOrder !== "newest") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setStatusFilter("all");
                                  setSortOrder("newest");
                                }}
                                className="h-auto p-0 text-xs text-primary hover:bg-transparent"
                              >
                                Reset Filter
                              </Button>
                            )}
                          </div>

                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Status Pengiriman</label>
                              <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
                                <SelectTrigger className="w-full h-9 text-xs">
                                  <SelectValue placeholder="Semua Status" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">Semua Status</SelectItem>
                                  <SelectItem value="sent">Terkirim</SelectItem>
                                  <SelectItem value="unsent">Belum Terkirim</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Urutkan Data</label>
                              <Select value={sortOrder} onValueChange={(val: any) => setSortOrder(val)}>
                                <SelectTrigger className="w-full h-9 text-xs">
                                  <SelectValue placeholder="Urutkan" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="newest">Terbaru</SelectItem>
                                  <SelectItem value="oldest">Terlama</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setIsFilterOpen(false);
                                  setIsResetDialogOpen(true);
                                }}
                                className="w-full h-9 text-xs gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 border-red-200 dark:border-red-900/50"
                              >
                                <RotateCcw className="w-3.5 h-3.5" /> Reset Status Pengiriman
                              </Button>
                            </div>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="bg-white dark:bg-slate-800 rounded-sm border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50/50 dark:bg-slate-800/50">
                          <TableHead className="hidden sm:table-cell w-12 text-center">No</TableHead>
                          <TableHead>Nama Pelanggan</TableHead>
                          <TableHead>WhatsApp</TableHead>
                          <TableHead className="hidden md:table-cell">Aktif</TableHead>
                          <TableHead className="text-center w-24">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedCustomers.length === 0 ? (
                          <TableRow><TableCell colSpan={5} className="text-center py-20 text-slate-500">Tidak ada data</TableCell></TableRow>
                        ) : (
                          paginatedCustomers.map((customer, index) => (
                            <TableRow key={customer.id}>
                              <TableCell className="hidden sm:table-cell text-center text-slate-400 text-xs">{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                              <TableCell>
                                <div className="font-medium">{customer.name}</div>
                              </TableCell>
                              <TableCell className="text-slate-600 dark:text-slate-400 font-mono text-xs">{customer.phone}</TableCell>
                              <TableCell className="hidden md:table-cell text-slate-500 text-xs">
                                {customer.created_at ? new Date(customer.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                              </TableCell>
                              <TableCell className="text-center">
                                {customer._isSentTemporarily ? (
                                  <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600 border-emerald-200 cursor-default hover:bg-transparent gap-1.5 px-2 py-0" disabled>
                                    <Send className="w-3.5 h-3.5 opacity-70" /> <span className="hidden sm:inline">Terkirim</span>
                                  </Button>
                                ) : (
                                  <Button size="sm" onClick={() => handleSendWA(customer)} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 px-2.5 py-0">
                                    <Send className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Kirim WA</span>
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>

                    {/* Pagination UI */}
                    {totalPages > 1 && (
                      <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/30 flex items-center justify-between gap-4">
                        <div className="text-xs text-slate-500 font-medium hidden sm:block">
                          Menampilkan {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredCustomers.length)} dari {filteredCustomers.length} pelanggan
                        </div>
                        <div className="flex items-center gap-1 ml-auto">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>

                          <div className="flex items-center gap-1 mx-2">
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                              .filter(page => {
                                // Show first, last, and pages around current
                                return page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1;
                              })
                              .map((page, index, array) => (
                                <div key={page} className="flex items-center">
                                  {index > 0 && array[index - 1] !== page - 1 && (
                                    <span className="text-slate-400 px-1 text-xs">...</span>
                                  )}
                                  <button
                                    onClick={() => setCurrentPage(page)}
                                    className={cn(
                                      "h-8 w-8 rounded-sm text-xs font-bold transition-all",
                                      currentPage === page
                                        ? "bg-primary text-white shadow-md shadow-primary/20"
                                        : "text-slate-600 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700"
                                    )}
                                  >
                                    {page}
                                  </button>
                                </div>
                              ))}
                          </div>

                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>


      {/* Manage Templates Dialog */}
      <Dialog open={isManagingTemplates} onOpenChange={setIsManagingTemplates}>
        <DialogContent className="max-w-2xl w-[95vw] p-0 overflow-hidden flex flex-col max-h-[90vh]">
          <DialogHeader className="p-2 sm:p-6 border-b border-slate-100 dark:border-slate-800 space-y-1">
            <DialogTitle className="flex items-center gap-2 text-lg">
              Kelola Template Pesan
            </DialogTitle>
            <DialogDescription className="text-xs">Tambahkan atau ubah template pesan promosi Anda</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto scrollbar-hide p-4 sm:p-6 space-y-6">

            {/* Cooldown Settings - Compact */}
            <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-sm border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-sm bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                  <Save className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-tight">Status "Terkirim"</h4>
                  <p className="text-[10px] text-slate-500">Reset otomatis setelah {cooldownDays} hari</p>
                </div>
              </div>

              {isConfiguringCooldown ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min="1"
                    max="365"
                    value={cooldownDays}
                    onChange={(e) => setCooldownDays(parseInt(e.target.value) || 1)}
                    className="w-16 h-8 text-center text-xs px-1"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      localStorage.setItem("promoCooldownDays", cooldownDays.toString());
                      setIsConfiguringCooldown(false);
                      toast({ title: "Tersimpan", description: `Durasi diubah menjadi ${cooldownDays} hari.` });
                    }}
                    className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                  >
                    <Save className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsConfiguringCooldown(true)}
                  className="h-8 text-[11px] px-3 border-slate-200 hover:bg-slate-100 dark:border-slate-700"
                >
                  Ubah Durasi
                </Button>
              )}
            </div>

            {/* Form section - More polished */}
            {isEditingTemplate ? (
              <div className="space-y-4 bg-white dark:bg-slate-800 p-4 rounded-sm border-2 border-primary/20 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    {templateFormData.id > 0 ? <Edit2 className="w-4 h-4 text-primary" /> : <Plus className="w-4 h-4 text-primary" />}
                    {templateFormData.id > 0 ? "Edit Template" : "Tambah Template Baru"}
                  </h3>
                  <Button variant="ghost" size="icon" onClick={() => setIsEditingTemplate(false)} className="h-6 w-6">
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                <div className="grid gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 ml-1">Nama Template</label>
                    <Input
                      value={templateFormData.name}
                      onChange={(e) => setTemplateFormData({ ...templateFormData, name: e.target.value })}
                      placeholder="Contoh: Promo Ramadhan"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 ml-1">Isi Pesan</label>
                    <Textarea
                      value={templateFormData.content}
                      onChange={(e) => setTemplateFormData({ ...templateFormData, content: e.target.value })}
                      placeholder="Tulis isi pesan di sini..."
                      className="min-h-[120px] text-sm resize-none scrollbar-hide"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" size="sm" onClick={() => setIsEditingTemplate(false)} className="h-9 text-xs">
                    Batal
                  </Button>
                  <Button size="sm" onClick={handleSaveTemplate} className="h-9 text-xs px-6">
                    Simpan
                  </Button>
                </div>
              </div>
            ) : (
              <Button onClick={handleOpenAddTemplate} className="w-full gap-2 border-dashed h-11 text-sm font-medium" variant="outline">
                <Plus className="w-4 h-4" /> Tambah Template Baru
              </Button>
            )}

            {/* List section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">Daftar Template</h4>
                <span className="text-[10px] text-slate-400 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-sm">{templates.length} Total</span>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {templates.map((t) => (
                  <div key={t.id} className="group flex flex-col p-4 sm:p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-sm hover:border-primary/40 hover:shadow-md transition-all duration-200 relative">
                    <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
                      <ActionMenu
                        items={t.id > 0 ? [
                          {
                            label: "Edit Template",
                            icon: <SquarePen className="h-4 w-4 text-slate-500" />,
                            onClick: () => handleEditTemplate(t),
                          },
                          {
                            label: "Hapus Template",
                            icon: <Trash2 className="h-4 w-4 text-red-500" />,
                            onClick: () => setDeletingTemplate(t),
                            destructive: true,
                          },
                        ] : [
                          {
                            label: "Gunakan Template",
                            icon: <MessageSquare className="h-4 w-4 text-slate-500" />,
                            onClick: () => {
                              setSelectedTemplate(t);
                              setCustomMessage(t.content);
                              setIsManagingTemplates(false);
                            },
                          },
                        ]}
                      />
                    </div>
                    <div className="min-w-0 mb-10 pr-8">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-bold text-base sm:text-lg text-slate-900 dark:text-white truncate">{t.name}</span>
                        {t.id < 0 && <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-sm font-bold uppercase tracking-widest">Sistem</span>}
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap line-clamp-4">
                        {t.content}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 mt-auto pt-3 border-t border-slate-100 dark:border-slate-800 absolute bottom-4 left-4 right-4 justify-end bg-white dark:bg-slate-800">
                      {t.id > 0 ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditTemplate(t)}
                            className="h-8 px-3 text-xs gap-2 text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 border border-slate-200 dark:border-slate-700"
                          >
                            <SquarePen className="w-4 h-4" /> Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingTemplate(t)}
                            className="h-8 px-3 text-xs gap-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border border-slate-200 dark:border-slate-700"
                          >
                            <Trash2 className="w-4 h-4" /> Hapus
                          </Button>
                        </>
                      ) : (
                        <div className="h-8 px-3 flex items-center bg-slate-50 dark:bg-slate-900 rounded-sm">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Template Standar</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <Button onClick={() => setIsManagingTemplates(false)} className="w-full sm:w-auto px-8">Selesai</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Template Confirmation Dialog */}
      <AlertDialog open={!!deletingTemplate} onOpenChange={(open) => !open && setDeletingTemplate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Template Promo?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus template <strong className="text-slate-900 dark:text-white">"{deletingTemplate?.name}"</strong>?
              <br /><br />
              <span className="font-semibold text-red-500 dark:text-red-400">Peringatan:</span> Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-t-2 border-slate-200 dark:border-slate-700 pt-4 mt-2">
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteTemplate}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Riwayat Pengiriman?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini akan mereset status pengiriman untuk semua pelanggan, dan tombol "Kirim WA" akan muncul kembali.
              <br /><br />
              <span className="font-semibold text-red-500 dark:text-red-400">Peringatan :</span> Fitur ini ditujukan hanya untuk tujuan testing atau reset global. Apakah Anda yakin ingin melanjutkan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-t-2 border-slate-200 dark:border-slate-700 pt-4 mt-2">
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetLogs}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Ya, Reset Semua
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}
