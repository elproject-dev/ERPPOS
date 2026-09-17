import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Capacitor } from "@capacitor/core";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionMenu } from "@/components/ui/action-menu";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { useAuth, useAuthUserName } from "@/contexts/AuthContext";
import { isAdminMode } from "@/lib/auth";
import {
  PackageOpen,
  Package,
  Search,
  History,
  AlertTriangle,
  Receipt,
  User,
  CheckCircle2,
  Clock,
  Trash2,
  Banknote,
  TrendingDown,
  Printer,
  ChevronLeft,
  ChevronRight,
  Eye,
  Plus,
  X
} from "lucide-react";
import {
  useListReturns,
  useGetTransactionByInvoice,
  useCreateReturn,
  useConfirmReturn,
  useDeleteReturn,
  useStoreSettings
} from "@workspace/api-client-react";
import { formatRupiah, formatInvoiceNumber } from "@/lib/formatters";
import { getProductImageUrl } from "@/lib/supabase-storage";

export default function CustomerReturnsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const cashierName = useAuthUserName();
  const isAdmin = isAdminMode(user);

  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [isNewReturnDialogOpen, setIsNewReturnDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 20;
  const [searchInvoice, setSearchInvoice] = useState("");
  const [searchedId, setSearchedId] = useState<string | null>(null);
  const [selectedReturn, setSelectedReturn] = useState<any>(null);
  const [actionDialog, setActionDialog] = useState<{ type: 'confirm' | 'reject' | 'delete', ret: any } | null>(null);

  // Return Form State
  const [returnItems, setReturnItems] = useState<Record<number, number>>({}); // transaction_item_id -> return quantity
  const [returnUnits, setReturnUnits] = useState<Record<number, any>>({}); // transaction_item_id -> selected uom object
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  // Queries
  const { data: rawReturnHistory, isLoading: isLoadingHistory } = useListReturns();
  const returnHistory = isAdmin ? rawReturnHistory : rawReturnHistory?.filter((r: any) => r.cashier_name === cashierName);
  const { data: transaction, isLoading: isLoadingTransaction, isError: isTransactionError } = useGetTransactionByInvoice(searchedId);
  const createReturn = useCreateReturn();
  const confirmReturn = useConfirmReturn();
  const deleteReturn = useDeleteReturn();

  const pendingReturns = returnHistory?.filter((r: any) => r.status === 'pending') || [];
  const completedReturns = returnHistory?.filter((r: any) => r.status === 'completed') || [];

  const { data: storeSettingsData } = useStoreSettings();

  const storeInfo = {
    name: storeSettingsData?.name || 'EL PROJECT',
    address: storeSettingsData?.address || 'Jl. Condongcatur No.123',
    phone: storeSettingsData?.phone || '',
    footer: storeSettingsData?.footer_message || 'Terima Kasih Sudah Melakukan Order',
    bankName: storeSettingsData?.bank_name || 'BCA',
    bankAccount: storeSettingsData?.bank_account || '4451377137',
    bankAccountName: storeSettingsData?.bank_account_name || 'EL PROJECT'
  };

  const getPaymentStatusText = (status: string) => {
    if (status === 'paid') return 'Lunas';
    if (status === 'partial') return 'Cicilan';
    if (status === 'unpaid' || status === 'tempo') return 'Tempo';
    return '-';
  };

  const getPaymentStatusColor = (status: string) => {
    if (status === 'paid') return 'bg-orange-500 hover:bg-orange-600 text-white border-transparent';
    if (status === 'partial') return 'bg-orange-500 hover:bg-orange-600 text-white border-transparent';
    if (status === 'unpaid' || status === 'tempo') return 'bg-orange-500 hover:bg-orange-600 text-white border-transparent';
    return 'bg-orange-500 hover:bg-orange-600 text-white border-transparent';
  };

  const handlePrintReturnReceipt = (returnData: any) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const printWindow = iframe.contentWindow;
    if (!printWindow) {
      document.body.removeChild(iframe);
      toast({
        title: "Gagal mencetak",
        description: "Tidak dapat membuat frame cetak.",
        variant: "destructive"
      });
      return;
    }

    const storeName = storeInfo?.name || "CV EL PROJECT";
    const storeAddress = storeInfo?.address || "";
    const storePhone = storeInfo?.phone || "";

    let itemsHtml = returnData.sales_return_items?.map((item: any, index: number) => {
      const productName = item.products?.name || item.product_name || 'Unknown';
      const quantity = item.quantity || 0;
      const unit = item.unit_name || 'PCS';
      const subtotal = item.refund_amount || 0;
      const refundPrice = quantity > 0 ? subtotal / quantity : 0;
      return `
        <tr>
          <td style="text-align: center; color: #64748b;">${index + 1}</td>
          <td style="font-weight: 600; color: #0f172a;">${productName}</td>
          <td style="text-align: center; font-weight: 600; color: #0f172a;">${quantity} ${unit}</td>
          <td style="text-align: right; color: #475569;">${formatRupiah(refundPrice)}</td>
          <td style="text-align: right; font-weight: 700; color: #0f172a;">${formatRupiah(subtotal)}</td>
        </tr>`;
    }).join('') || '';

    // Always fill the table with at least 8 rows
    const itemsCount = returnData.sales_return_items?.length || 0;
    if (itemsCount < 8) {
      for (let i = itemsCount; i < 8; i++) {
        itemsHtml += `
          <tr class="empty-row">
            <td style="text-align: center; color: #cbd5e1;">${i + 1}</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
          </tr>`;
      }
    }

    let returnDate = '-';
    if (returnData.created_at) {
      const dateObj = new Date(returnData.created_at);
      const dateStr = dateObj.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
      const timeStr = dateObj.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).replace(':', '.');
      returnDate = `${dateStr} ,${timeStr}`;
    }

    const getInvoiceContentHtml = () => {
      return `
        <div class="invoice-copy">
          <div>
            <table class="info-table">
              <tr>
                <td style="width: 60%; vertical-align: middle;">
                  <table style="border-collapse: collapse; border: none; margin: 0; padding: 0;">
                    <tr>
                      <td style="vertical-align: middle; padding-right: 12px; border: none;">
                        <img src="${window.location.origin}${import.meta.env.BASE_URL}elproject.png" alt="Logo" style="height: 40px; width: auto; display: block; position: relative; top: -3px;" onerror="this.style.display='none'" />
                      </td>
                      <td style="vertical-align: middle; border: none; padding: 0; text-align: left;">
                        <div class="company-name">${storeName}</div>
                        ${storeAddress ? `<div class="company-address">${storeAddress}</div>` : ''}
                        ${storePhone ? `<div class="company-contact">Telp : ${storePhone}</div>` : ''}
                      </td>
                    </tr>
                  </table>
                </td>
                <td style="width: 40%; text-align: right; vertical-align: top;">
                  <h1 class="invoice-title">FAKTUR RETUR</h1>
                  <div style="font-size: 12px; font-weight: 700; margin-top: 4px; display: inline-flex; gap: 6px; justify-content: flex-end; align-items: center; width: 100%;">
                    <span class="invoice-status-badge ${returnData.status === 'completed' ? 'badge-completed' : 'badge-pending'}">${returnData.status === 'completed' ? 'SELESAI' : 'PENDING'}</span>
                  </div>
                </td>
              </tr>
            </table>

            <hr class="header-divider">

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
              <tr>
                <td style="width: 70%; vertical-align: top;">
                  <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                    <tr>
                      <td style="width: 1%; white-space: nowrap; padding: 2px 0; color: #475569; font-weight: 500;">Kepada Yth.</td>
                      <td style="width: 1%; white-space: nowrap; padding: 2px 8px 2px 4px; color: #475569;">:</td>
                      <td style="padding: 2px 0; font-weight: 600; color: #0f172a;">${returnData.customers?.name || returnData.transactions?.customer_name || returnData.customer_name || 'Pelanggan Umum'}</td>
                    </tr>
                    <tr>
                      <td style="width: 1%; white-space: nowrap; padding: 2px 0; color: #475569; font-weight: 500;">No. Telepon</td>
                      <td style="width: 1%; white-space: nowrap; padding: 2px 8px 2px 4px; color: #475569;">:</td>
                      <td style="padding: 2px 0;">${returnData.customers?.phone || returnData.transactions?.customer_phone || returnData.customer_phone || '-'}</td>
                    </tr>
                    <tr>
                      <td style="width: 1%; white-space: nowrap; padding: 2px 0; color: #475569; font-weight: 500;">Alamat</td>
                      <td style="width: 1%; white-space: nowrap; padding: 2px 8px 2px 4px; color: #475569;">:</td>
                      <td style="padding: 2px 0; font-size: 11.4px; line-height: 1.2;">
                        ${returnData.customers?.address || returnData.transactions?.customer_address || returnData.customer_address || '-'}
                        ${returnData.customers?.district || returnData.customer_district ? `, ${returnData.customers?.district || returnData.customer_district}` : ''}
                        ${returnData.customers?.city || returnData.customer_city ? `, ${returnData.customers?.city || returnData.customer_city}` : ''}
                      </td>
                    </tr>
                  </table>
                </td>
                <td style="width: 2%;"></td>
                <td style="width: 28%; vertical-align: top;">
                  <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                    <tr>
                      <td style="width: 1%; white-space: nowrap; padding: 2px 0; color: #475569; font-weight: 500;">No. Transaksi</td>
                      <td style="width: 1%; white-space: nowrap; padding: 2px 8px 2px 4px; color: #475569;">:</td>
                      <td style="padding: 2px 0; font-weight: 600; color: #0f172a; white-space: nowrap;">${formatInvoiceNumber(returnData.transaction_id)}</td>
                    </tr>
                    <tr>
                      <td style="width: 1%; white-space: nowrap; padding: 2px 0; color: #475569; font-weight: 500;">Tgl Retur</td>
                      <td style="width: 1%; white-space: nowrap; padding: 2px 8px 2px 4px; color: #475569;">:</td>
                      <td style="padding: 2px 0; white-space: nowrap;">${returnDate}</td>
                    </tr>
                    <tr>
                      <td style="width: 1%; white-space: nowrap; padding: 2px 0; color: #475569; font-weight: 500;">Salesman</td>
                      <td style="width: 1%; white-space: nowrap; padding: 2px 8px 2px 4px; color: #475569;">:</td>
                      <td style="padding: 2px 0; white-space: nowrap;">${returnData.cashier_name || 'N/A'}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 5%; text-align: center;">No</th>
                  <th style="width: 44%; text-align: left;">Nama Produk / Item</th>
                  <th style="width: 15%; text-align: center;">Qty</th>
                  <th style="width: 15%; text-align: right;">Harga Refund</th>
                  <th style="width: 20%; text-align: right;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <table style="width: 100%; border-collapse: collapse; margin-top: 4px;">
              <tr>
                <td style="width: 55%; vertical-align: top;">
                  <div class="reason-section">
                    <strong>Alasan Retur:</strong> ${returnData.reason || '-'}<br>
                    ${returnData.notes ? `<strong style="margin-top: 4px; display: inline-block;">Catatan:</strong> ${returnData.notes}` : ''}
                  </div>
                </td>
                <td style="width: 45%; vertical-align: top; text-align: right;">
                  <table style="width: 100%; border-collapse: collapse; font-size: 11.4px; line-height: 1.4; float: right;">
                    <tr>
                      <td style="color: #0f172a; font-weight: 800; border-top: 1.5px solid #0f172a; padding-top: 4px; text-align: left; font-size: 15.6px;">TOTAL REFUND</td>
                      <td style="text-align: right; color: #ea580c; font-weight: 800; border-top: 1.5px solid #0f172a; padding-top: 4px; font-size: 15.6px;">
                        ${formatRupiah(returnData.total_refund || 0)}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </div>

          <div>
            <table style="width: 100%; margin-top: 12px; border-collapse: collapse;">
              <tr>
                <td style="width: 50%; text-align: center; font-size: 12px; color: #334155; vertical-align: top;">
                  <div>Penerima,</div>
                  <div style="height: 32px;"></div>
                  <div style="color: #0f172a; display: inline-block; min-width: 130px; padding-top: 2px; font-family: monospace;">
                    ( _________________ )
                  </div>
                  <div style="margin-top: 4px; font-family: monospace;">
                    _________________
                  </div>
                </td>
                <td style="width: 50%; text-align: center; font-size: 12px; color: #334155; vertical-align: top;">
                  <div>Hormat Kami,</div>
                  <div style="height: 32px;"></div>
                  <div style="color: #0f172a; display: inline-block; min-width: 130px; padding-top: 2px; font-family: monospace;">
                    ( _________________ )
                  </div>
                  <div style="margin-top: 4px; font-family: monospace;">
                    _________________
                  </div>
                </td>
              </tr>
            </table>
            
            <div style="text-align: left; font-size: 9.6px; font-style: italic; color: #475569; margin-top: 10px; line-height: 1.2; width: 100%;">
              Pembayaran Transfer melalui Bank: <strong>${storeInfo?.bankName || 'BCA'} ${storeInfo?.bankAccount || '4451377137'}</strong> a/n <strong>${storeInfo?.bankAccountName || 'EL PROJECT'}</strong>
            </div>

            <div class="footer-divider" style="border-top: 1px solid #cbd5e1; margin-top: 6px; margin-bottom: 2px;"></div>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="text-align: center; font-size: 10.2px; color: #64748b;">
                  ${storeInfo?.footer || 'Terima Kasih Sudah Melakukan Order'}
                </td>
              </tr>
            </table>
          </div>
        </div>
      `;
    };

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Faktur Retur - ${returnData.return_number || ''}</title>
        <style>
          @page {
            size: auto; /* Biarkan driver printer continuous yang menentukan ukuran */
            margin-top: 15mm;
            margin-bottom: 5mm;
            margin-left: 0mm;
            margin-right: 0mm;
          }
          @media print {
            body { margin: 0; padding: 10mm 8mm 5mm 8mm; }
            .no-print { display: none !important; }
            .invoice-copy { border: none !important; } /* Hilangkan border putus-putus luar */
          }
          * {
            box-sizing: border-box;
            color: #000000 !important; /* WAJIB HITAM PEKAT agar jelas di printer Dot Matrix */
            font-family: Helvetica, Arial, sans-serif !important; /* Font standar faktur dot matrix */
            font-weight: 900 !important; /* Semua teks ditebalkan */
          }
          body {
            font-size: 13.2px;
            font-weight: 600;
            line-height: 1.35;
            margin: 0;
            padding: 5mm 8mm;
            background-color: #ffffff;
          }
          .print-wrapper {
            display: flex;
            flex-direction: column;
          }
          .invoice-copy {
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            overflow: hidden;
            border: none; /* Tanpa border luar agar tidak terpotong tepi kertas */
            padding: 0;
            background-color: #ffffff;
          }
          .info-table {
            width: 100%;
            border-collapse: collapse;
          }
          .company-name {
            font-size: 15.6px;
            font-weight: 800;
            color: #0f172a;
            margin: 0;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .company-address, .company-contact {
            margin: 0;
            font-size: 10.2px;
            color: #475569;
          }
          .invoice-title {
            font-size: 18px;
            font-weight: 800;
            color: #0f172a;
            margin: 0;
            letter-spacing: 0.02em;
          }
          .invoice-status-badge {
            display: inline-block;
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 0.05em;
            padding: 1px 5px;
            border-radius: 3px;
            text-transform: uppercase;
          }
          .badge-completed {
            background-color: #dcfce7;
            color: #166534;
            border: 1px solid #bbf7d0;
          }
          .badge-pending {
            background-color: #fef9c3;
            color: #854d0e;
            border: 1px solid #fef08a;
          }
          .header-divider {
            border: none;
            border-top: 2px double #0f172a;
            margin: 4px 0 6px 0;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 8px;
          }
          .items-table th {
            color: #000000 !important;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
            padding: 4px 6px;
            border-bottom: 1.5px solid #000000;
            border-top: 1.5px solid #000000;
          }
          .items-table td {
            padding: 4px 6px;
            font-size: 13.2px;
            border-bottom: none;
            color: #000000 !important;
          }
          .items-table tr:last-child td {
            border-bottom: 1.5px solid #000000;
          }
          .items-table tr.empty-row td {
            height: 15px;
            padding: 2px 6px;
          }
          .reason-section {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 6px 10px;
            font-size: 11.4px;
            line-height: 1.35;
          }
        </style>
      </head>
      <body>
        <div class="print-wrapper">
          ${getInvoiceContentHtml()}
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          };
          window.onafterprint = function() {
            setTimeout(function() {
              if (window.frameElement) window.frameElement.remove();
            }, 500);
          };
        </script>
      </body>
      </html>
    `);

    printWindow.document.close();
  };

  // Summary Metrics
  const totalPermintaan = returnHistory?.length || 0;
  const getReturnItemBaseQty = (item: any) => {
    const uoms = item.products?.product_uoms || [];
    const uom = uoms.find((u: any) => u.unit_name === item.unit_name);
    const conversionFactor = uom ? uom.conversion_factor : 1;
    return item.quantity * conversionFactor;
  };
  const totalBarangDiretur = completedReturns.reduce((sum: number, r: any) => sum + (r.sales_return_items?.reduce((itemSum: number, item: any) => itemSum + getReturnItemBaseQty(item), 0) || 0), 0) || 0;
  const totalBarangRusak = completedReturns.filter((r: any) => r.reason === 'Barang Rusak/Cacat' || r.reason === 'Barang Kadaluarsa').reduce((sum: number, r: any) => sum + (r.sales_return_items?.reduce((itemSum: number, item: any) => itemSum + getReturnItemBaseQty(item), 0) || 0), 0) || 0;
  const totalNilaiRefund = completedReturns.reduce((sum: number, r: any) => sum + Number(r.total_refund || 0), 0) || 0;

  // Handle Search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInvoice.trim()) return;
    // Extract ID if they type the invoice format (e.g. INV-00123 -> 123)
    const idMatch = searchInvoice.match(/\d+$/);
    const id = idMatch ? parseInt(idMatch[0], 10).toString() : searchInvoice;
    setSearchedId(id);
    setReturnItems({});
    setReturnUnits({});
    setReason("");
    setNotes("");
  };

  const handleReturnQtyChange = (itemId: number, value: string, maxLimit: number) => {
    const val = parseInt(value) || 0;
    setReturnItems(prev => ({
      ...prev,
      [itemId]: Math.min(maxLimit, Math.max(0, val))
    }));
  };

  const handleReturnUnitChange = (item: any, uom: any, maxLimitInSelectedUnit: number) => {
    setReturnUnits(prev => ({ ...prev, [item.id]: uom }));
    // Clamp quantity to new max limit
    if (returnItems[item.id] !== undefined) {
      setReturnItems(prev => ({
        ...prev,
        [item.id]: Math.min(maxLimitInSelectedUnit, prev[item.id])
      }));
    }
  };

  // Calculate totals
  const totalRefundItems = Object.values(returnItems).reduce((sum, qty) => sum + qty, 0);
  let totalReturnValue = 0;
  if (transaction?.items) {
    totalReturnValue = transaction.items.reduce((sum: number, item: any) => {
      const qty = returnItems[item.id] || 0;
      const selectedUnit = returnUnits[item.id] || { unit_name: item.unit_name || 'PCS', conversion_factor: item.conversion_factor || 1 };
      const basePrice = Number(item.price);
      const refundPrice = basePrice * (selectedUnit.conversion_factor || 1);
      return sum + (qty * refundPrice);
    }, 0);
  }

  const remainingBalance = Number(transaction?.remaining_balance) || 0;
  const deductedBalance = Math.min(totalReturnValue, remainingBalance);
  const cashRefund = totalReturnValue - deductedBalance;

  const handleSubmitReturn = () => {
    if (!transaction) return;
    if (totalRefundItems === 0) {
      toast({ title: "Peringatan", description: "Pilih minimal 1 barang untuk diretur.", variant: "destructive" });
      return;
    }
    if (!reason) {
      toast({ title: "Peringatan", description: "Pilih alasan retur.", variant: "destructive" });
      return;
    }

    // Filter items that have return quantity > 0
    const itemsToReturn = transaction.items
      .filter((item: any) => (returnItems[item.id] || 0) > 0)
      .map((item: any) => {
        const qty = returnItems[item.id] || 0;
        const selectedUnit = returnUnits[item.id] || { unit_name: item.unit_name || 'PCS', conversion_factor: item.conversion_factor || 1 };
        const basePrice = Number(item.price);
        const refundPrice = basePrice * (selectedUnit.conversion_factor || 1);
        return {
          ...item,
          return_unit_name: selectedUnit.unit_name,
          return_conversion_factor: selectedUnit.conversion_factor,
          return_quantity: qty,
          return_price: refundPrice,
          return_subtotal: qty * refundPrice
        };
      });

    createReturn.mutate({
      transactionId: transaction.id,
      customerId: transaction.customer_id,
      cashierName: cashierName,
      totalRefund: cashRefund,
      reason,
      notes,
      items: itemsToReturn,
      status: isAdmin ? 'completed' : 'pending'
    }, {
      onSuccess: () => {
        toast({ title: "Sukses", description: "Retur penjualan berhasil dicatat.", variant: "success" });
        setSearchedId(null);
        setSearchInvoice("");
        setIsNewReturnDialogOpen(false);
        setActiveTab(isAdmin ? "history" : "pending");
      },
      onError: (err: any) => {
        toast({ title: "Gagal", description: err.message || "Terjadi kesalahan saat memproses retur.", variant: "destructive" });
      }
    });
  };

  const renderTable = (data: any[], emptyTitle: string, emptyIcon: React.ReactNode) => {
    const isEmpty = !data || data.length === 0;
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const paginatedData = isEmpty ? [] : data.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    const handleNextPage = () => {
      if (page * ITEMS_PER_PAGE < data.length) setPage(p => p + 1);
    };
    const handlePrevPage = () => {
      if (page > 1) setPage(p => p - 1);
    };

    return (
      <div className="w-full">
        {/* Mobile View (Cards) */}
        <div className="md:hidden space-y-4">
          {isEmpty ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-sm">
              <div className="mb-3 text-slate-300">{emptyIcon}</div>
              {emptyTitle}
            </div>
          ) : (
            paginatedData.map((ret: any) => (
              <div
                key={ret.id}
                onClick={() => setSelectedReturn(ret)}
                className="bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800 shadow-sm cursor-pointer hover:border-orange-200 hover:shadow-md transition-all"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-bold text-orange-600 dark:text-orange-400 text-lg">
                      {formatInvoiceNumber(ret.transaction_id)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {new Date(ret.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </div>
                  </div>
                  <div className="flex gap-2 items-center flex-wrap justify-end">
                    {ret.transactions?.payment_status && (
                      <Badge variant="secondary" className={`font-normal text-[10px] px-1.5 py-0 ${getPaymentStatusColor(ret.transactions.payment_status)}`}>
                        {getPaymentStatusText(ret.transactions.payment_status)}
                      </Badge>
                    )}
                    {ret.status === 'pending' ? (
                      <Badge variant="outline" className="bg-amber-50/85 text-amber-700 border-amber-200">Pending</Badge>
                    ) : (
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Selesai</Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-2 mb-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Pelanggan</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {ret.customers?.name || ret.transactions?.customer_name || ret.customer_name || 'Pelanggan Umum'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Sales</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">{ret.cashier_name}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-slate-100 dark:border-slate-800 pt-2">
                    <span className="text-slate-500">Total Refund</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {formatRupiah(ret.total_refund)}
                    </span>
                  </div>
                </div>

                {ret.status === 'pending' && isAdmin && (
                  <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800" onClick={e => e.stopPropagation()}>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActionDialog({ type: 'reject', ret });
                      }}
                      disabled={deleteReturn.isPending || confirmReturn.isPending}
                    >
                      Tolak
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActionDialog({ type: 'confirm', ret });
                      }}
                      disabled={confirmReturn.isPending || deleteReturn.isPending}
                    >
                      Terima
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Desktop View */}
        <div className="hidden md:block bg-white dark:bg-slate-900 rounded-none shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                <TableHead className="whitespace-nowrap w-[140px]">Tanggal</TableHead>
                <TableHead className="whitespace-nowrap w-[120px]">ID Transaksi</TableHead>
                <TableHead>Pelanggan</TableHead>
                <TableHead className="w-[120px]">Sales</TableHead>
                <TableHead>Alasan</TableHead>
                <TableHead className="text-center w-[100px]">Pembayaran</TableHead>
                <TableHead className="text-right">Total Refund</TableHead>
                <TableHead className="text-center w-[100px]">Status</TableHead>
                <TableHead className="text-center w-[50px]">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isEmpty ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-48 text-center text-slate-500 hover:bg-transparent">
                    <div className="flex flex-col items-center justify-center">
                      <div className="mb-3 text-slate-300">{emptyIcon}</div>
                      <p>{emptyTitle}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((ret: any) => (
                  <TableRow
                    key={ret.id}
                    onClick={() => setSelectedReturn(ret)}
                    className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-all"
                  >
                    <TableCell className="text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {new Date(ret.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </TableCell>
                    <TableCell className="font-mono font-medium text-orange-600 dark:text-orange-400 whitespace-nowrap">
                      {formatInvoiceNumber(ret.transaction_id)}
                    </TableCell>
                    <TableCell className="font-medium text-slate-900 dark:text-white">
                      {ret.customers?.name || ret.transactions?.customer_name || ret.customer_name || 'Pelanggan Umum'}
                    </TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400">
                      {ret.cashier_name}
                    </TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400">
                      {ret.reason}
                    </TableCell>
                    <TableCell className="text-center">
                      {ret.transactions?.payment_status ? (
                        <Badge variant="outline" className={`font-normal ${getPaymentStatusColor(ret.transactions.payment_status)}`}>
                          {getPaymentStatusText(ret.transactions.payment_status)}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-extrabold text-slate-900 dark:text-white whitespace-nowrap">
                      {formatRupiah(ret.total_refund)}
                    </TableCell>
                    <TableCell className="text-center">
                      {ret.status === 'pending' ? (
                        <Badge variant="outline" className="bg-amber-50/85 text-amber-700 border-amber-200">Pending</Badge>
                      ) : (
                        <Badge className="bg-green-600 text-white">Selesai</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <ActionMenu
                          items={[
                            {
                              label: "Lihat Detail",
                              icon: <Eye className="h-4 w-4 text-slate-500" />,
                              onClick: () => setSelectedReturn(ret),
                            },
                            ...(ret.status === 'pending' && isAdmin ? [
                              {
                                label: "Terima Retur",
                                icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
                                onClick: () => {
                                  setActionDialog({ type: 'confirm', ret });
                                },
                              },
                              {
                                label: "Tolak Retur",
                                icon: <Trash2 className="h-4 w-4 text-red-500" />,
                                onClick: () => {
                                  setActionDialog({ type: 'reject', ret });
                                },
                                destructive: true,
                              }
                            ] : []),
                            ...(ret.status === 'completed' && isAdmin ? [
                              {
                                label: "Hapus Permanen",
                                icon: <Trash2 className="h-4 w-4 text-red-500" />,
                                onClick: () => {
                                  setActionDialog({ type: 'delete', ret });
                                },
                                destructive: true,
                              }
                            ] : [])
                          ]}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Controls */}
        {data.length > 0 && (
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-slate-500">
              Halaman {page} dari {Math.ceil(data.length / ITEMS_PER_PAGE) || 1}
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
                disabled={page * ITEMS_PER_PAGE >= data.length}
                className="flex items-center gap-1"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Sidebar>
        <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950" style={{ '--radius': '0px' } as React.CSSProperties}>
          {/* Header */}
          <div className="px-4 py-2 sm:px-6 sm:py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-row items-center justify-between gap-3">
            <h1 className="text-xl sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
              Retur Penjualan
            </h1>
            <div className="flex items-center gap-2">
              {/* Mobile 3-Dots Action Menu */}
              <div className="sm:hidden flex items-center">
                <ActionMenu
                  items={[
                    {
                      label: "Buat Retur Baru",
                      icon: <Plus className="h-4 w-4 text-orange-500" />,
                      onClick: () => {
                        setSearchInvoice("");
                        setSearchedId(null);
                        setReturnItems({});
                        setReturnUnits({});
                        setReason("");
                        setNotes("");
                        setIsNewReturnDialogOpen(true);
                      },
                    },
                  ]}
                />
              </div>

              {/* Desktop Web Button */}
              <div className="hidden sm:flex items-center gap-2">
                <Button
                  onClick={() => {
                    setSearchInvoice("");
                    setSearchedId(null);
                    setReturnItems({});
                    setReturnUnits({});
                    setReason("");
                    setNotes("");
                    setIsNewReturnDialogOpen(true);
                  }}
                  className="h-8 px-3 text-sm gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Buat Retur Baru
                </Button>
              </div>
            </div>
          </div>

          {isLoadingHistory ? (
            <div className="flex-1 overflow-auto scrollbar-hide flex items-center justify-center">
              <LoadingSpinner text="Memuat data retur..." />
            </div>
          ) : (
            <>
              {/* Tabs Switcher */}
              <div className="px-4 sm:px-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex justify-between sm:justify-start sm:gap-6 overflow-x-auto whitespace-nowrap scrollbar-hide">

                <button
                  onClick={() => { setActiveTab('pending'); setPage(1); }}
                  className={`py-3 text-sm font-semibold border-b-2 transition-all relative flex items-center justify-center gap-2 flex-1 sm:flex-none ${activeTab === 'pending'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                >
                  <Clock className="w-5 h-5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Menunggu Konfirmasi</span>
                  {pendingReturns.length > 0 && (
                    <span className="absolute sm:relative top-2 right-1/3 sm:top-0 sm:right-0 flex h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900" />
                  )}
                </button>
                <button
                  onClick={() => { setActiveTab('history'); setPage(1); }}
                  className={`py-3 text-sm font-semibold border-b-2 transition-all relative flex items-center justify-center gap-2 flex-1 sm:flex-none ${activeTab === 'history'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                >
                  <History className="w-5 h-5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Riwayat Selesai</span>
                </button>
              </div>

              <div className="p-4 sm:p-6 flex-1 overflow-auto scrollbar-hide">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-6 items-stretch">
                  <div className="rounded-sm bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 shadow-lg h-full">
                    <div className="p-4 sm:p-5 h-full flex flex-col justify-between">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-emerald-100 text-xs sm:text-sm font-medium">Total Permintaan</p>
                          <p className="text-lg sm:text-lg md:text-xl font-bold text-white leading-tight mt-1 truncate">
                            {totalPermintaan} <span className="text-sm font-normal text-emerald-200">laporan</span>
                          </p>
                        </div>
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-sm bg-white/20 flex items-center justify-center shrink-0">
                          <Receipt className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                        </div>
                      </div>
                      <p className="text-xs mt-3 text-emerald-200">seluruh laporan retur terdata</p>
                    </div>
                  </div>

                  <div className="rounded-sm bg-gradient-to-br from-indigo-500 to-indigo-600 border-0 shadow-lg h-full">
                    <div className="p-4 sm:p-5 h-full flex flex-col justify-between">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-indigo-100 text-xs sm:text-sm font-medium">Total Barang Diretur</p>
                          <p className="text-lg sm:text-lg md:text-xl font-bold text-white leading-tight mt-1 truncate">
                            {totalBarangDiretur} <span className="text-sm font-normal text-indigo-200">pcs</span>
                          </p>
                        </div>
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-sm bg-white/20 flex items-center justify-center shrink-0">
                          <PackageOpen className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                        </div>
                      </div>
                      <p className="text-xs mt-3 text-indigo-200">kuantitas dari semua retur</p>
                    </div>
                  </div>

                  <div className="rounded-sm bg-gradient-to-br from-red-500 to-red-600 border-0 shadow-lg h-full">
                    <div className="p-4 sm:p-5 h-full flex flex-col justify-between">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-red-100 text-xs sm:text-sm font-medium">Barang Rusak</p>
                          <p className="text-lg sm:text-lg md:text-xl font-bold text-white leading-tight mt-1 truncate">
                            {totalBarangRusak} <span className="text-sm font-normal text-red-200">pcs</span>
                          </p>
                        </div>
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-sm bg-white/20 flex items-center justify-center shrink-0">
                          <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                        </div>
                      </div>
                      <p className="text-xs mt-3 text-red-200">kondisi buruk tidak masuk stok</p>
                    </div>
                  </div>

                  <div className="rounded-sm bg-gradient-to-br from-purple-500 to-purple-600 border-0 shadow-lg h-full">
                    <div className="p-4 sm:p-5 h-full flex flex-col justify-between">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-purple-100 text-xs sm:text-sm font-medium">Total Nilai Refund</p>
                          <p className="text-lg sm:text-lg md:text-xl font-bold text-white leading-tight mt-1 truncate">
                            {formatRupiah(totalNilaiRefund)}
                          </p>
                        </div>
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-sm bg-white/20 flex items-center justify-center shrink-0">
                          <Banknote className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                        </div>
                      </div>
                      <p className="text-xs mt-3 text-purple-200">nominal pengembalian dana</p>
                    </div>
                  </div>
                </div>

                {isNewReturnDialogOpen ? (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-sm shadow-sm overflow-hidden flex flex-col mb-6">
                    <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                        Buat Retur Baru
                      </h2>
                      <Button variant="ghost" size="icon" onClick={() => setIsNewReturnDialogOpen(false)} className="rounded-sm">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="p-4 sm:p-5 space-y-6 flex-1">
                      <Card className="shadow-sm border-slate-200 dark:border-slate-800">
                        <CardHeader className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                          <CardTitle className="text-sm">Cari Transaksi</CardTitle>
                          <CardDescription>Masukkan Nomor Invoice atau ID Transaksi</CardDescription>
                        </CardHeader>
                        <CardContent className="p-6">
                          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 max-w-lg">
                            <div className="flex-1 relative">
                              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              <Input
                                value={searchInvoice}
                                onChange={(e) => setSearchInvoice(e.target.value)}
                                placeholder="Contoh: TRX-ID00123 atau 123"
                                className="pl-9"
                              />
                            </div>
                            <Button type="submit" disabled={!searchInvoice.trim() || isLoadingTransaction} className="w-full sm:w-auto">
                              Cari Transaksi
                            </Button>
                          </form>
                        </CardContent>
                      </Card>

                      {isLoadingTransaction ? (
                        <div className="p-12 text-center text-slate-500 animate-pulse bg-white dark:bg-slate-900 rounded-sm border">
                          Mencari data transaksi...
                        </div>
                      ) : isTransactionError || (searchedId && !transaction) ? (
                        <div className="p-12 text-center flex flex-col items-center bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-sm">
                          <AlertTriangle className="w-12 h-12 text-red-400 mb-3" />
                          <h3 className="font-semibold text-red-700 dark:text-red-400">Transaksi Tidak Ditemukan</h3>
                          <p className="text-sm text-red-600/80 mt-1">Pastikan ID transaksi atau nomor invoice sudah benar.</p>
                          <Button variant="outline" className="mt-4" onClick={() => { setSearchedId(null); setSearchInvoice(""); }}>
                            Coba Lagi
                          </Button>
                        </div>
                      ) : transaction ? (
                        <div className="flex flex-col gap-6 w-full">
                          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-sm p-4 sm:p-5 border border-slate-200 dark:border-slate-800 flex items-center gap-4 shadow-sm">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <User className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                              <div className="text-sm text-slate-500 mb-0.5">Informasi Pelanggan</div>
                              <div className="font-bold text-slate-900 dark:text-white text-lg">
                                {transaction.customers?.name || 'Pelanggan Umum'}
                              </div>
                              {transaction.customers?.phone && (
                                <div className="text-sm text-slate-500 mt-0.5">{transaction.customers.phone}</div>
                              )}
                            </div>
                          </div>

                          <div className="space-y-6">
                            <Card className="shadow-sm border-slate-200 dark:border-slate-800 overflow-hidden">
                              <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 p-3.5 sm:p-5">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
                                  <div>
                                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                                      Rincian Barang Transaksi
                                    </CardTitle>
                                    <CardDescription className="text-xs sm:text-sm">Pilih barang yang akan diretur</CardDescription>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                    {transaction.payment_status && (
                                      <Badge variant="secondary" className={`font-normal text-xs px-2.5 py-0.5 sm:px-3 sm:py-1 ${getPaymentStatusColor(transaction.payment_status)}`}>
                                        {getPaymentStatusText(transaction.payment_status)}
                                      </Badge>
                                    )}
                                    {transaction.cashier_name && (
                                      <Badge variant="outline" className="text-xs px-2.5 py-0.5 sm:px-3 sm:py-1 bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium flex items-center gap-1.5">
                                        <User className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                        {transaction.cashier_name}
                                      </Badge>
                                    )}
                                    <Badge variant="outline" className="font-mono text-xs sm:text-sm px-2.5 py-0.5 sm:px-3 sm:py-1 bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700">
                                      INV-{transaction.id.toString().padStart(5, '0')}
                                    </Badge>
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent className="p-0">
                                <div className="w-full">
                                  {/* Mobile View */}
                                  <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
                                    {transaction.items?.map((item: any) => {
                                      const selectedUnit = returnUnits[item.id] || { unit_name: item.unit_name || 'PCS', conversion_factor: item.conversion_factor || 1 };
                                      const baseRemaining = item.quantity - (item.already_returned_base_qty || 0);
                                      const maxInSelectedUnit = Math.floor(baseRemaining / (selectedUnit.conversion_factor || 1));
                                      const hasUoms = item.uoms && item.uoms.length > 0;
                                      const isLunas = baseRemaining <= 0;

                                      return (
                                        <div key={item.id} className="p-4 space-y-3">
                                          <div className="flex gap-4 mb-3">
                                            {item.image_url ? (
                                              <div className="w-16 h-16 rounded-sm overflow-hidden bg-white dark:bg-slate-800 shrink-0 border border-slate-200 dark:border-slate-700">
                                                <img
                                                  src={getProductImageUrl(item.image_url)}
                                                  alt={item.product_name}
                                                  className="w-full h-full object-cover"
                                                  onError={(e) => {
                                                    e.currentTarget.style.display = 'none';
                                                    if (e.currentTarget.parentElement?.nextElementSibling) {
                                                      e.currentTarget.parentElement.nextElementSibling.classList.remove('hidden');
                                                    }
                                                  }}
                                                />
                                                <div className="w-full h-full flex items-center justify-center hidden bg-slate-50 dark:bg-slate-800/50">
                                                  <Package className="w-6 h-6 text-slate-400" />
                                                </div>
                                              </div>
                                            ) : (
                                              <div className="w-16 h-16 rounded-sm bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                                                <Package className="w-6 h-6 text-slate-400" />
                                              </div>
                                            )}
                                            <div>
                                              <div className="font-bold text-slate-900 dark:text-white leading-tight mb-1">{item.product_name}</div>
                                              <div className="text-sm text-slate-500 font-medium">Harga: {formatRupiah(item.price)}</div>
                                              <div className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-1">
                                                Dibeli: {item.unit_qty || (item.quantity / (item.conversion_factor || 1))} {item.unit_name || 'PCS'}
                                              </div>
                                              {item.already_returned_qty > 0 && (
                                                <Badge variant="outline" className="mt-1 text-[10px] text-orange-600 bg-orange-50 font-medium px-1.5 py-0.5">
                                                  Sudah Retur: {item.already_returned_qty} {item.unit_name || 'PCS'}
                                                </Badge>
                                              )}
                                            </div>
                                          </div>

                                          <div className="border-t border-slate-100 dark:border-slate-800 pt-3 mt-1">
                                            <div className="text-xs font-bold text-orange-700 dark:text-orange-400 uppercase tracking-wider mb-2 text-right">Jumlah Retur:</div>
                                            {isLunas ? (
                                              <div className="flex justify-end">
                                                <Badge variant="outline" className="bg-slate-100 text-slate-500 py-1.5 font-medium">
                                                  Sudah Maksimal
                                                </Badge>
                                              </div>
                                            ) : (
                                              <div className="flex flex-col items-end gap-2">
                                                <div className="flex gap-2 justify-end">
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    max={maxInSelectedUnit}
                                                    value={returnItems[item.id] || ''}
                                                    onChange={(e) => handleReturnQtyChange(item.id, e.target.value, maxInSelectedUnit)}
                                                    className="flex-1 text-center font-bold text-lg h-10 border-slate-300 focus-visible:ring-orange-400 focus-visible:border-orange-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-all shadow-sm rounded-sm"
                                                    placeholder="0"
                                                  />
                                                  {hasUoms ? (
                                                    <Select
                                                      value={selectedUnit.unit_name}
                                                      onValueChange={(val) => {
                                                        const uom = item.uoms.find((u: any) => u.unit_name === val);
                                                        if (uom) {
                                                          const newMax = Math.floor(baseRemaining / (uom.conversion_factor || 1));
                                                          handleReturnUnitChange(item, uom, newMax);
                                                        }
                                                      }}
                                                    >
                                                      <SelectTrigger className="w-28 h-10 font-medium bg-white dark:bg-slate-950 border-slate-300 shadow-sm focus:ring-orange-400 focus:border-orange-400 rounded-sm">
                                                        <SelectValue placeholder="Satuan" />
                                                      </SelectTrigger>
                                                      <SelectContent>
                                                        {Array.from(new Map(item.uoms.map((u: any) => [u.unit_name, u])).values()).map((u: any) => (
                                                          <SelectItem key={u.id || u.unit_name} value={u.unit_name} className="font-medium">
                                                            {u.unit_name}
                                                          </SelectItem>
                                                        ))}
                                                      </SelectContent>
                                                    </Select>
                                                  ) : (
                                                    <div className="h-10 px-3 flex items-center bg-slate-50 border border-slate-200 rounded-sm w-28 shrink-0 justify-center">
                                                      <span className="text-sm font-semibold text-slate-600">{selectedUnit.unit_name}</span>
                                                    </div>
                                                  )}
                                                </div>
                                                {baseRemaining > 0 && (
                                                  <div className="text-[11px] font-medium text-slate-500 text-right mt-1">
                                                    Maksimal: <span className="font-bold text-slate-700">{maxInSelectedUnit} {selectedUnit.unit_name}</span>
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* Desktop Table View */}
                                  <div className="hidden md:block px-4 pb-4">
                                    <Table>
                                      <TableHeader>
                                        <TableRow className="bg-slate-50/80 dark:bg-slate-800/50">
                                          <TableHead>Produk</TableHead>
                                          <TableHead className="text-right">Harga</TableHead>
                                          <TableHead className="text-center">Dibeli</TableHead>
                                          <TableHead className="text-right bg-orange-50/50 dark:bg-orange-900/10 text-orange-700 dark:text-orange-400 w-[280px]">Jumlah Retur</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {transaction.items?.map((item: any) => {
                                          const selectedUnit = returnUnits[item.id] || { unit_name: item.unit_name || 'PCS', conversion_factor: item.conversion_factor || 1 };
                                          const baseRemaining = item.quantity - (item.already_returned_base_qty || 0);
                                          const maxInSelectedUnit = Math.floor(baseRemaining / (selectedUnit.conversion_factor || 1));
                                          const hasUoms = item.uoms && item.uoms.length > 0;
                                          const isLunas = baseRemaining <= 0;

                                          return (
                                            <TableRow key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                              <TableCell>
                                                <div className="flex items-center gap-4">
                                                  {item.image_url ? (
                                                    <div className="w-12 h-12 rounded-sm overflow-hidden bg-white dark:bg-slate-800 shrink-0 border border-slate-200 dark:border-slate-700 shadow-sm">
                                                      <img
                                                        src={getProductImageUrl(item.image_url)}
                                                        alt={item.product_name}
                                                        className="w-full h-full object-cover"
                                                        onError={(e) => {
                                                          e.currentTarget.style.display = 'none';
                                                          if (e.currentTarget.parentElement?.nextElementSibling) {
                                                            e.currentTarget.parentElement.nextElementSibling.classList.remove('hidden');
                                                          }
                                                        }}
                                                      />
                                                      <div className="w-full h-full flex items-center justify-center hidden bg-slate-50 dark:bg-slate-800/50">
                                                        <Package className="w-5 h-5 text-slate-400" />
                                                      </div>
                                                    </div>
                                                  ) : (
                                                    <div className="w-12 h-12 rounded-sm bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700 shadow-sm">
                                                      <Package className="w-5 h-5 text-slate-400" />
                                                    </div>
                                                  )}
                                                  <div className="font-bold text-slate-900 dark:text-white text-[15px]">{item.product_name}</div>
                                                </div>
                                              </TableCell>
                                              <TableCell className="text-right font-semibold text-slate-700 dark:text-slate-300">
                                                {formatRupiah(item.price)}
                                              </TableCell>
                                              <TableCell className="text-center">
                                                <div className="flex flex-col items-center">
                                                  <div className="font-bold text-slate-900 dark:text-white text-base">
                                                    {item.unit_qty || (item.quantity / (item.conversion_factor || 1))} <span className="text-sm font-medium text-slate-500 ml-0.5">{item.unit_name || 'PCS'}</span>
                                                  </div>
                                                  {item.already_returned_qty > 0 && (
                                                    <Badge variant="outline" className="mt-1.5 text-[10px] text-orange-600 border-orange-200 bg-orange-50 font-medium">
                                                      Sudah Retur: {item.already_returned_qty} {item.unit_name || 'PCS'}
                                                    </Badge>
                                                  )}
                                                </div>
                                              </TableCell>
                                              <TableCell className="bg-orange-50/30 dark:bg-orange-900/10 align-middle">
                                                {isLunas ? (
                                                  <div className="flex justify-end">
                                                    <Badge variant="outline" className="bg-slate-100 text-slate-500 py-1 font-medium">
                                                      Sudah Maksimal
                                                    </Badge>
                                                  </div>
                                                ) : (
                                                  <div className="flex flex-col items-end gap-2">
                                                    <div className="flex justify-end items-center gap-2">
                                                      <Input
                                                        type="number"
                                                        min="0"
                                                        max={maxInSelectedUnit}
                                                        value={returnItems[item.id] || ''}
                                                        onChange={(e) => handleReturnQtyChange(item.id, e.target.value, maxInSelectedUnit)}
                                                        className="w-20 text-center font-bold text-lg h-10 border-slate-300 focus-visible:ring-orange-400 focus-visible:border-orange-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-all shadow-sm rounded-sm"
                                                        placeholder="0"
                                                      />
                                                      {hasUoms ? (
                                                        <Select
                                                          value={selectedUnit.unit_name}
                                                          onValueChange={(val) => {
                                                            const uom = item.uoms.find((u: any) => u.unit_name === val);
                                                            if (uom) {
                                                              const newMax = Math.floor(baseRemaining / (uom.conversion_factor || 1));
                                                              handleReturnUnitChange(item, uom, newMax);
                                                            }
                                                          }}
                                                        >
                                                          <SelectTrigger className="w-28 h-10 font-medium bg-white border-slate-300 shadow-sm focus:ring-orange-400 rounded-sm">
                                                            <SelectValue placeholder="Satuan" />
                                                          </SelectTrigger>
                                                          <SelectContent>
                                                            {Array.from(new Map(item.uoms.map((u: any) => [u.unit_name, u])).values()).map((u: any) => (
                                                              <SelectItem key={u.id || u.unit_name} value={u.unit_name} className="font-medium">
                                                                {u.unit_name}
                                                              </SelectItem>
                                                            ))}
                                                          </SelectContent>
                                                        </Select>
                                                      ) : (
                                                        <div className="h-10 px-3 flex items-center bg-slate-50 border border-slate-200 rounded-sm">
                                                          <span className="text-sm font-semibold text-slate-600">{selectedUnit.unit_name}</span>
                                                        </div>
                                                      )}
                                                    </div>
                                                    {baseRemaining > 0 && (
                                                      <div className="text-[11px] font-medium text-slate-500 text-right">
                                                        Maksimal: <span className="font-bold text-slate-700">{maxInSelectedUnit} {selectedUnit.unit_name}</span>
                                                      </div>
                                                    )}
                                                  </div>
                                                )}
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </div>

                          <div className="space-y-6">
                            <Card className="shadow-sm border-slate-200 dark:border-slate-800">
                              <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                                <CardTitle className="text-base">Informasi Retur</CardTitle>
                              </CardHeader>
                              <CardContent className="p-6 space-y-6">
                                <div className="grid sm:grid-cols-2 gap-6">
                                  <div className="space-y-3 flex flex-col">
                                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                      Alasan Retur <span className="text-red-500">*</span>
                                    </label>
                                    <Select value={reason} onValueChange={setReason}>
                                      <SelectTrigger className="h-10 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm focus:ring-orange-400 focus:border-orange-400 transition-all font-medium text-slate-700 dark:text-slate-300">
                                        <SelectValue placeholder="Pilih alasan pengembalian..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="Barang Rusak/Cacat" className="font-medium">Barang Rusak / Cacat</SelectItem>
                                        <SelectItem value="Barang Kadaluarsa" className="font-medium">Barang Kadaluarsa</SelectItem>
                                        <SelectItem value="Salah Produk/Varian" className="font-medium">Salah Produk / Varian</SelectItem>
                                        <SelectItem value="Tidak Sesuai Pesanan" className="font-medium">Tidak Sesuai Pesanan</SelectItem>
                                        <SelectItem value="Toko Tutup" className="font-medium">Toko Tutup</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <div className="space-y-3 flex flex-col">
                                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                      Catatan Tambahan
                                    </label>
                                    <Input
                                      className="h-10 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm focus-visible:ring-orange-400 focus-visible:border-orange-400 transition-all font-medium text-slate-700 dark:text-slate-300 placeholder:text-slate-400"
                                      placeholder="Opsional: Tuliskan detail kendala di sini..."
                                      value={notes}
                                      onChange={(e) => setNotes(e.target.value)}
                                    />
                                  </div>
                                </div>

                                <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-900/50 rounded-sm p-5 sm:p-6 border border-slate-200/60 dark:border-slate-700/60 shadow-sm relative overflow-hidden">
                                  <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-bl-full pointer-events-none -mr-10 -mt-10"></div>

                                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
                                    <div className="flex items-center gap-4">
                                      <div className="w-12 h-12 rounded-full bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center border border-slate-100 dark:border-slate-700">
                                        <Receipt className="w-6 h-6 text-slate-400" />
                                      </div>
                                      <div>
                                        <div className="text-sm font-semibold text-slate-500 mb-1">Total Barang Diretur</div>
                                        <div className="font-bold text-slate-900 dark:text-white text-lg">{totalRefundItems} <span className="text-sm font-medium text-slate-500">items</span></div>
                                      </div>
                                    </div>

                                    <div className="w-full sm:w-auto h-px sm:h-12 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>
                                    <div className="w-full sm:hidden h-px bg-slate-200 dark:bg-slate-700"></div>

                                    <div className="flex flex-row sm:flex-col justify-between sm:justify-center items-center sm:items-end w-full sm:w-auto">
                                      <div className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Total Refund</div>
                                      <div className="space-y-2 w-full sm:w-72">
                                        <div className="flex justify-between items-center text-sm font-medium text-slate-600 dark:text-slate-400">
                                          <span>Nilai Barang Retur</span>
                                          <span>{formatRupiah(totalReturnValue)}</span>
                                        </div>
                                        {deductedBalance > 0 && (
                                          <div className="flex justify-between items-center text-sm font-medium text-amber-600 dark:text-amber-500">
                                            <span>Potong Piutang Transaksi</span>
                                            <span>-{formatRupiah(deductedBalance)}</span>
                                          </div>
                                        )}
                                        <div className="flex justify-between items-center text-lg font-bold text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-800">
                                          <span>Total Pengembalian Dana</span>
                                          <span className="text-orange-600 dark:text-orange-400">{formatRupiah(cashRefund)}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      className="w-full gap-2 h-10 text-base font-bold transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none disabled:transform-none disabled:shadow-none"
                                      size="lg"
                                      disabled={totalRefundItems === 0 || !reason || createReturn.isPending}
                                    >
                                      <CheckCircle2 className="w-6 h-6" />
                                      {createReturn.isPending ? "Memproses Retur..." : "Konfirmasi & Proses Retur"}
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Konfirmasi Proses Retur</AlertDialogTitle>
                                      <AlertDialogDescription asChild>
                                        <div>
                                          <div className="space-y-2 mt-4 text-left">
                                            <div className="flex justify-between">
                                              <span>Nilai Barang Retur:</span>
                                              <span className="font-semibold text-slate-900 dark:text-white">{formatRupiah(totalReturnValue)}</span>
                                            </div>
                                            {deductedBalance > 0 && (
                                              <div className="flex justify-between text-amber-600 dark:text-amber-500">
                                                <span>Potong Piutang:</span>
                                                <span className="font-semibold">-{formatRupiah(deductedBalance)}</span>
                                              </div>
                                            )}
                                            <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-700 font-bold text-orange-600 dark:text-orange-400">
                                              <span>Total Cash Refund:</span>
                                              <span>{formatRupiah(cashRefund)}</span>
                                            </div>
                                          </div>
                                          <p className="mt-4">Apakah Anda yakin ingin memproses retur ini?</p>
                                        </div>
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Batal</AlertDialogCancel>
                                      <AlertDialogAction onClick={handleSubmitReturn}>
                                        Proses Retur
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </CardContent>
                            </Card>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <>
                    {activeTab === 'pending' && (
                      <div className="space-y-6">
                        {renderTable(pendingReturns, "Belum ada retur yang menunggu konfirmasi.", <Clock className="w-12 h-12 mb-3" />)}
                      </div>
                    )}

                    {activeTab === 'history' && (
                      <div className="space-y-6">
                        {renderTable(completedReturns, "Belum ada riwayat retur yang selesai.", <History className="w-12 h-12 mb-3" />)}
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <Dialog open={!!selectedReturn} onOpenChange={(open) => !open && setSelectedReturn(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-800 [&>button]:hidden">
            <DialogHeader className="p-5 pb-3 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950">
              <div className="flex flex-row items-center justify-between gap-3 w-full">
                <div className="flex items-center gap-2 min-w-0">
                  <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">Detail Retur</DialogTitle>
                  {selectedReturn && (
                    <Badge variant="outline" className="font-mono bg-slate-50 dark:bg-slate-900 text-xs py-0.5 px-2 font-bold whitespace-nowrap shrink-0">
                      {formatInvoiceNumber(selectedReturn.transaction_id)}
                    </Badge>
                  )}
                </div>
                {selectedReturn && (
                  <div className="shrink-0">
                    {selectedReturn.status === 'pending' ? (
                      <Badge variant="outline" className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50/85 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/50 font-medium text-xs whitespace-nowrap">
                        <span className="relative flex h-1.5 w-1.5 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                        </span>
                        Pending
                      </Badge>
                    ) : (
                      <Badge className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50 font-semibold text-xs shadow-sm whitespace-nowrap">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                        Selesai
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              <DialogDescription className="text-xs text-slate-500 mt-1">
                Informasi lengkap transaksi retur pelanggan
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto scrollbar-hide p-5 bg-slate-50/50 dark:bg-slate-900/20">
              {selectedReturn && (
                <div className="space-y-4">
                  {/* Info Metadata */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 bg-white dark:bg-slate-950 p-4 rounded-sm border border-slate-200/60 dark:border-slate-800/80 shadow-sm">
                    {/* Row 1 - Col 1: Tanggal */}
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">Tanggal</p>
                      <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {new Date(selectedReturn.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    {/* Row 1 - Col 2: Sales (Kanan) */}
                    <div className="space-y-0.5 text-right flex flex-col items-end">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">Sales</p>
                      <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 truncate w-full text-right" title={selectedReturn.cashier_name}>
                        {selectedReturn.cashier_name}
                      </p>
                    </div>
                    {/* Row 2 - Col 1: Nama Pelanggan */}
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">Nama Pelanggan</p>
                      <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 truncate" title={selectedReturn.customers?.name || '-'}>
                        {selectedReturn.customers?.name || 'Umum'}
                      </p>
                    </div>
                    {/* Row 2 - Col 2: Total Refund (Kanan) */}
                    <div className="space-y-0.5 text-right flex flex-col items-end">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">Total Refund</p>
                      <p className="text-xs sm:text-sm font-extrabold text-orange-600 dark:text-orange-400">
                        {formatRupiah(selectedReturn.total_refund)}
                      </p>
                    </div>
                  </div>

                  {/* Alasan Retur */}
                  <div className="p-4 bg-amber-50/40 dark:bg-amber-950/10 border border-amber-200/40 dark:border-amber-900/30 rounded-sm shadow-sm flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-amber-700 dark:text-amber-400 font-bold mb-1">
                        Alasan Retur
                      </div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{selectedReturn.reason}</p>
                      {selectedReturn.notes && (
                        <div className="mt-2 pt-2 border-t border-amber-200/30 dark:border-amber-900/30">
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-0.5">Catatan:</span>
                          <p className="text-xs text-slate-600 dark:text-slate-400 italic font-medium">{selectedReturn.notes}</p>
                        </div>
                      )}
                    </div>
                    <AlertTriangle className="w-8 h-8 text-amber-500 shrink-0 mt-1" />
                  </div>

                  {/* Items Section */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <PackageOpen className="w-4 h-4 text-primary" />
                      <span>Barang yang Diretur</span>
                    </h4>
                    <div className="border border-slate-200 dark:border-slate-850 rounded-sm overflow-hidden bg-white dark:bg-slate-950 shadow-sm">
                      <div className="max-h-[280px] sm:max-h-[360px] overflow-y-auto scrollbar-hide overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider sticky top-0 z-10 backdrop-blur bg-opacity-95">
                            <tr>
                              <th className="px-4 py-2.5">Produk</th>
                              <th className="px-4 py-2.5 text-center">Jml</th>
                              <th className="px-4 py-2.5 text-right whitespace-nowrap">Refund / Item</th>
                              <th className="px-4 py-2.5 text-right">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                            {selectedReturn.sales_return_items?.map((item: any) => (
                              <tr key={item.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-900/30 transition-colors">
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    {item.products?.image_url ? (
                                      <img
                                        src={getProductImageUrl(item.products.image_url)}
                                        alt={item.product_name}
                                        className="w-8 h-8 rounded-sm object-cover border border-slate-200 dark:border-slate-800 shrink-0 shadow-sm"
                                        onError={(e) => e.currentTarget.style.display = 'none'}
                                      />
                                    ) : (
                                      <div className="w-8 h-8 rounded-sm bg-slate-100 dark:bg-slate-850 flex items-center justify-center border border-slate-200 dark:border-slate-800 shrink-0">
                                        <Package className="w-4 h-4 text-slate-400" />
                                      </div>
                                    )}
                                    <span className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[150px] sm:max-w-[220px]" title={item.product_name}>
                                      {item.products?.name || item.product_name || 'Unknown Product'}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 text-center whitespace-nowrap">
                                  <span className="font-bold text-slate-900 dark:text-white">{item.quantity}</span> <span className="text-xs text-slate-500 dark:text-slate-400">{item.unit_name || 'PCS'}</span>
                                </td>
                                <td className="px-4 py-2.5 text-right text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">
                                  {formatRupiah((item.refund_amount || 0) / (item.quantity || 1))}
                                </td>
                                <td className="px-4 py-2.5 text-right font-extrabold text-slate-950 dark:text-white whitespace-nowrap">
                                  {formatRupiah(item.refund_amount || 0)}
                                </td>
                              </tr>
                            ))}
                            {(!selectedReturn.sales_return_items || selectedReturn.sales_return_items.length === 0) && (
                              <tr>
                                <td colSpan={4} className="px-4 py-6 text-center text-slate-500 font-medium">
                                  Rincian item tidak tersedia.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
              {!(Capacitor.getPlatform() === 'android') && (
                <Button
                  variant="outline"
                  onClick={() => selectedReturn && handlePrintReturnReceipt(selectedReturn)}
                  disabled={!selectedReturn}
                  className="flex items-center gap-2 border-emerald-500/80 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 hover:text-emerald-700 hover:border-emerald-600 transition-all font-semibold shadow-sm"
                >
                  <Printer className="w-4 h-4" />
                  Cetak Faktur
                </Button>
              )}
              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setSelectedReturn(null)}
                  className="hover:bg-slate-150 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold"
                >
                  Tutup
                </Button>
                {selectedReturn?.status === 'pending' && isAdmin && (
                  <>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="destructive"
                          className="font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 duration-200 transition-all cursor-pointer px-5"
                          disabled={deleteReturn.isPending || confirmReturn.isPending}
                        >
                          Tolak
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Tolak Retur</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tolak retur ini? Data retur akan dihapus dan sales dapat mengajukan ulang.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Batal</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              deleteReturn.mutate({ id: selectedReturn.id }, {
                                onSuccess: () => {
                                  toast({ title: "Ditolak", description: "Retur berhasil ditolak dan dihapus", variant: "success" });
                                  setSelectedReturn(null);
                                },
                                onError: (err: any) => toast({ title: "Gagal", description: err.message, variant: "destructive" })
                              });
                            }}
                          >
                            Tolak
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20 hover:shadow-lg hover:shadow-emerald-600/30 hover:-translate-y-0.5 active:translate-y-0 duration-200 border-0 transition-all cursor-pointer px-5"
                          disabled={confirmReturn.isPending || deleteReturn.isPending}
                        >
                          Konfirmasi
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Konfirmasi Retur</AlertDialogTitle>
                          <AlertDialogDescription>
                            Konfirmasi retur ini? Data barang akan masuk kembali ke stok Anda.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Batal</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              confirmReturn.mutate({ returnId: selectedReturn.id }, {
                                onSuccess: () => {
                                  toast({ title: "Dikonfirmasi", description: "Retur berhasil disetujui", variant: "success" });
                                  setSelectedReturn(null);
                                },
                                onError: (err: any) => toast({ title: "Gagal", description: err.message, variant: "destructive" })
                              });
                            }}
                          >
                            Konfirmasi
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </Sidebar>
      <AlertDialog open={!!actionDialog} onOpenChange={(open) => !open && setActionDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionDialog?.type === 'confirm' && "Konfirmasi Terima Retur"}
              {actionDialog?.type === 'reject' && "Tolak Retur"}
              {actionDialog?.type === 'delete' && "Hapus Riwayat Retur"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionDialog?.type === 'confirm' && `Apakah Anda yakin ingin menyetujui retur INV-${actionDialog.ret.transaction_id.toString().padStart(5, '0')}?`}
              {actionDialog?.type === 'reject' && `Apakah Anda yakin ingin menolak retur INV-${actionDialog.ret.transaction_id.toString().padStart(5, '0')}? Data retur akan dihapus.`}
              {actionDialog?.type === 'delete' && `Apakah Anda yakin ingin menghapus riwayat retur INV-${actionDialog.ret.transaction_id.toString().padStart(5, '0')} secara permanen?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className={actionDialog?.type === 'confirm' ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}
              onClick={() => {
                if (!actionDialog) return;
                const { type, ret } = actionDialog;
                if (type === 'confirm') {
                  confirmReturn.mutate({ returnId: ret.id }, {
                    onSuccess: () => {
                      toast({ title: "Diterima", description: "Retur berhasil disetujui", variant: "success" });
                      setActionDialog(null);
                    },
                    onError: (err: any) => toast({ title: "Gagal", description: err.message, variant: "destructive" })
                  });
                } else if (type === 'reject') {
                  deleteReturn.mutate({ id: ret.id }, {
                    onSuccess: () => {
                      toast({ title: "Ditolak", description: "Retur berhasil ditolak", variant: "success" });
                      setActionDialog(null);
                    },
                    onError: (err: any) => toast({ title: "Gagal", description: err.message, variant: "destructive" })
                  });
                } else if (type === 'delete') {
                  deleteReturn.mutate({ id: ret.id }, {
                    onSuccess: () => {
                      toast({ title: "Dihapus", description: "Riwayat retur berhasil dihapus", variant: "success" });
                      setActionDialog(null);
                    },
                    onError: (err: any) => toast({ title: "Gagal", description: err.message, variant: "destructive" })
                  });
                }
              }}
            >
              {actionDialog?.type === 'confirm' ? "Terima" : actionDialog?.type === 'reject' ? "Tolak" : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
