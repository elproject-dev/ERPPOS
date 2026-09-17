import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useListTransactions, useListOutlets, useGetTransaction, useDeleteTransaction, useStoreSettings } from "@workspace/api-client-react";
import { formatRupiah, formatInvoiceNumber, formatSimpleDate } from "@/lib/formatters";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft, CreditCard, Banknote, QrCode, User, History, SlidersHorizontal, Printer, Trash2, Edit, Eye, ChevronDown, Copy, Truck, FileText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { ADMIN_EMAIL } from "@/lib/auth";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ActionMenu, ActionMenuItem } from "@/components/ui/action-menu";
import { useToast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";
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
  connectToPrinter,
  disconnectPrinter,
  printReceipt,
  getBluetoothPrinterMac,
  isBluetoothAvailable
} from "@/lib/bluetooth-printer";
import {
  showPrinterNotConnectedNotification,
  showPrintSuccessNotification
} from "@/lib/android-notifications";

const ITEMS_PER_PAGE = 20;

const formatTransactionHistoryDate = (dateStr: string) => {
  if (!dateStr) return '-';

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '-';

  const month = new Intl.DateTimeFormat("id-ID", { month: "long" })
    .format(date)
    .toLowerCase();
  const day = date.getDate();
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${day} ${month} ${year} — ${hour}:${minute}`;
};

function TransactionReceiptDialog({
  transaction: trx,
  onClose,
  onDeleted,
  autoPrintInvoice
}: {
  transaction: any | null,
  onClose: () => void,
  onDeleted: () => void,
  autoPrintInvoice?: boolean
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const { data: storeSettingsData } = useStoreSettings();

  const storeInfo = {
    name: storeSettingsData?.name || 'EL PROJECT',
    address: storeSettingsData?.address || '',
    phone: storeSettingsData?.phone || '',
    showFooter: storeSettingsData?.show_footer ?? true,
    footerMessage: storeSettingsData?.footer_message || '',
    footerMessage2: storeSettingsData?.footer_message2 || '',
    footerMessage3: storeSettingsData?.footer_message3 || '',
    bankName: storeSettingsData?.bank_name || 'BCA',
    bankAccount: storeSettingsData?.bank_account || '4451377137',
    bankAccountName: storeSettingsData?.bank_account_name || 'ELPROJECT'
  };

  const deleteTransaction = useDeleteTransaction();
  const [isPrinting, setIsPrinting] = useState(false);
  const [showAllDetails, setShowAllDetails] = useState(false);

  const displayedStoreName = storeInfo.name;
  const displayedAddress = storeInfo.address;
  const displayedPhone = storeInfo.phone || '';

  const displayedFooter1 = trx?.outlets?.footer_message || storeInfo.footerMessage;
  const displayedFooter2 = trx?.outlets?.footer_message2 || storeInfo.footerMessage2;
  const displayedFooter3 = trx?.outlets?.footer_message3 || storeInfo.footerMessage3;

  const handlePrintReceipt = async () => {
    if (!trx) return;

    if (!isBluetoothAvailable()) {
      void showPrinterNotConnectedNotification('Plugin Bluetooth tidak tersedia di perangkat ini.');
      return;
    }

    const printerMac = getBluetoothPrinterMac();
    if (!printerMac) {
      void showPrinterNotConnectedNotification('Alamat MAC printer belum diatur di pengaturan.');
      return;
    }

    setIsPrinting(true);
    try {

      const receiptCustomerName = trx.customers?.name || trx.customerName || trx.customer_name || "Umum";

      const items = trx.transaction_items?.map((item: any) => ({
        productId: item.product_id,
        productName: item.product_name || item.products?.name,
        quantity: item.quantity,
        price: item.price
      })) || [];

      const total = (trx.subtotal || 0) + (trx.tax || 0) - (trx.discount || 0);
      const showFooter = localStorage.getItem('showFooter') !== 'false';

      const printData = {
        ...trx,
        cashierName: trx.cashier_name,
        items,
        tax: trx.tax || 0,
        ppnPercentage: 11,
        discount: trx.discount || 0,
        discountNote: trx.discount_note || '',
        customerName: receiptCustomerName,
        total: total,
        amountPaid: trx.amount_paid || 0,
        change: trx.change || 0,
        paymentMethod: trx.payment_method || 'cash',
        storeName: displayedStoreName,
        storeAddress: displayedAddress,
        storePhone: displayedPhone,
        footerMessage: showFooter ? (trx?.outlets?.footer_message || localStorage.getItem('footerMessage') || '') : '',
        footerMessage2: showFooter ? (trx?.outlets?.footer_message2 || localStorage.getItem('footerMessage2') || '') : '',
        footerMessage3: showFooter ? (trx?.outlets?.footer_message3 || localStorage.getItem('footerMessage3') || '') : '',
      };

      const connectionResult = await connectToPrinter(printerMac);
      if (!connectionResult.success) {
        void showPrinterNotConnectedNotification(connectionResult.message);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      const printed = await printReceipt(printData);

      if (!printed) {
        void showPrinterNotConnectedNotification('Gagal mencetak struk. Pastikan printer menyala dan terhubung.');
      } else {
        void showPrintSuccessNotification(total, formatInvoiceNumber(trx.id));
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      await disconnectPrinter();
    } catch (error) {
      void showPrinterNotConnectedNotification(
        error instanceof Error ? error.message : 'Terjadi kesalahan saat mencetak struk.'
      );
      try {
        await disconnectPrinter();
      } catch (e) { }
    } finally {
      setIsPrinting(false);
    }
  };

  const handlePrintInvoice = () => {
    if (!trx) return;

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

    const storeName = displayedStoreName || "EL PROJECT";
    const storeAddress = displayedAddress || "";
    const storePhone = displayedPhone || "";

    let globalDiscountPercent = 0;
    let adminDiscountPercent = 0;
    if (trx.discount > 0 && trx.subtotal > 0) {
      const note = trx.discount_note || '';
      const globalMatch = note.match(/Diskon Global (\d+(\.\d+)?)%/);
      if (globalMatch) {
        globalDiscountPercent = parseFloat(globalMatch[1]);
      } else if (!note.includes('Diskon Admin') || note.includes('Diskon Global')) {
        globalDiscountPercent = Math.round((trx.discount / trx.subtotal) * 100);
      }

      const adminMatch = note.match(/Diskon Admin (\d+(\.\d+)?)%/);
      if (adminMatch) {
        adminDiscountPercent = parseFloat(adminMatch[1]);
      } else if (note.includes('Diskon Admin')) {
        const totalPercent = Math.round((trx.discount / trx.subtotal) * 100);
        adminDiscountPercent = totalPercent - globalDiscountPercent > 0 ? totalPercent - globalDiscountPercent : totalPercent;
      }
    }

    let itemsHtml = trx.transaction_items?.map((item: any, index: number) => {
      const productName = item.product_name || item.products?.name || 'Unknown';
      const qty = item.unit_qty !== undefined && item.unit_qty !== null ? item.unit_qty : (item.quantity || 0);
      const unit = item.unit_name || 'pcs';
      const unitPrice = qty > 0 ? (item.subtotal || 0) / qty : (item.price || 0);
      const subtotal = item.subtotal || 0;
      const baseQty = item.quantity || 0;
      const totalDiscount = (item.discount_amount || 0) * baseQty;
      let totalOriginalPrice = (item.original_price || item.price || 0) * baseQty;

      if (totalDiscount > 0 && totalOriginalPrice <= subtotal) {
        totalOriginalPrice = subtotal + totalDiscount;
      }

      let discountPercent = 0;
      if (totalOriginalPrice > subtotal) {
        const actualDiscount = totalOriginalPrice - subtotal;
        discountPercent = Math.round((actualDiscount / totalOriginalPrice) * 100);
      }

      const displayPrice = qty > 0 ? (totalOriginalPrice / qty) : 0;

      let displayDisc1 = '-';
      let displayDisc2 = '-';

      if (discountPercent > 0) {
        displayDisc1 = discountPercent + '%';
        const extraDiscs = [];
        if (globalDiscountPercent > 0) extraDiscs.push(globalDiscountPercent + '%');
        if (adminDiscountPercent > 0) extraDiscs.push(adminDiscountPercent + '%');

        if (extraDiscs.length > 0) {
          displayDisc2 = extraDiscs.join('+');
        }
      } else {
        displayDisc1 = globalDiscountPercent > 0 ? globalDiscountPercent + '%' : '-';
        displayDisc2 = adminDiscountPercent > 0 ? adminDiscountPercent + '%' : '-';
      }

      let finalItemSubtotal = subtotal;
      if (globalDiscountPercent > 0) {
        finalItemSubtotal -= (finalItemSubtotal * globalDiscountPercent) / 100;
      }
      if (adminDiscountPercent > 0) {
        finalItemSubtotal -= (finalItemSubtotal * adminDiscountPercent) / 100;
      }

      return `
        <tr>
          <td style="font-weight: 600; color: #0f172a;">${productName}</td>
          <td style="text-align: center; font-weight: 600; color: #0f172a;">${qty}</td>
          <td style="text-align: center; font-weight: 600; color: #0f172a;">${unit}</td>
          <td style="text-align: right; color: #475569;">${formatRupiah(displayPrice)}</td>
          <td style="text-align: center; color: #475569;">${displayDisc1}</td>
          <td style="text-align: center; color: #475569;">${displayDisc2}</td>
          <td style="text-align: right; font-weight: 700; color: #0f172a;">${formatRupiah(finalItemSubtotal)}</td>
        </tr>`;
    }).join('') || '';

    const itemsCount = trx.transaction_items?.length || 0;
    if (itemsCount < 10) {
      for (let i = itemsCount; i < 10; i++) {
        itemsHtml += `
          <tr class="empty-row">
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
          </tr>`;
      }
    }

    let returnDate = '-';
    if (trx.created_at) {
      const dateObj = new Date(trx.created_at);
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

    const getInvoiceContentHtml = (docTitle: string = "FAKTUR PENJUALAN", copyLabel: string = "LEMBAR 1 (ASLI)") => {
      return `
        <div class="invoice-copy">
          <div>
            <table class="info-table">
              <tr>
                <td style="width: 60%; vertical-align: middle;">
                  <table style="border-collapse: collapse; border: none; margin: 0; padding: 0;">
                    <tr>
                      <td style="vertical-align: middle; padding-right: 12px; border: none;">
                        <img src="${window.location.origin}${import.meta.env.BASE_URL}elproject.webp" alt="Logo" style="height: 40px; width: auto; display: block; position: relative; top: -3px;" onerror="this.style.display='none'" />
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
                  <h1 class="invoice-title">${docTitle}</h1>
                  <div style="font-size: 11px; font-weight: 700; margin-top: 4px; display: inline-flex; gap: 6px; justify-content: flex-end; align-items: center; width: 100%;">
                    <span class="invoice-copy-badge">${copyLabel}</span>
                    <span class="invoice-status-badge ${trx.payment_status === 'paid' ? 'badge-completed' : trx.payment_status === 'partial' ? 'badge-partial' : 'badge-pending'}">${trx.payment_status === 'paid' ? 'LUNAS' : trx.payment_status === 'partial' ? 'CICILAN' : 'TEMPO PENUH'}</span>
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
                      <td style="padding: 2px 0; font-weight: 600; color: #0f172a;">${trx.customers?.name || trx.customerName || trx.customer_name || 'Pelanggan Umum'}</td>
                    </tr>
                    <tr>
                      <td style="width: 1%; white-space: nowrap; padding: 2px 0; color: #475569; font-weight: 500;">No. Telepon</td>
                      <td style="width: 1%; white-space: nowrap; padding: 2px 8px 2px 4px; color: #475569;">:</td>
                      <td style="padding: 2px 0;">${trx.customers?.phone || trx.customerPhone || '-'}</td>
                    </tr>
                    <tr>
                      <td style="width: 1%; white-space: nowrap; padding: 2px 0; color: #475569; font-weight: 500;">Alamat</td>
                      <td style="width: 1%; white-space: nowrap; padding: 2px 8px 2px 4px; color: #475569;">:</td>
                      <td style="padding: 2px 0; font-size: 11.4px; line-height: 1.2;">
                        ${trx.customers?.address || '-'}
                        ${trx.customers?.district ? `, ${trx.customers?.district}` : ''}
                        ${trx.customers?.city ? `, ${trx.customers?.city}` : ''}
                      </td>
                    </tr>
                  </table>
                </td>
                <td style="width: 2%;"></td> <!-- Spacer -->
                <td style="width: 28%; vertical-align: top;">
                  <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                    <tr>
                      <td style="width: 1%; white-space: nowrap; padding: 2px 0; color: #475569; font-weight: 500;">No. Invoice</td>
                      <td style="width: 1%; white-space: nowrap; padding: 2px 8px 2px 4px; color: #475569;">:</td>
                      <td style="padding: 2px 0; font-weight: 600; color: #0f172a; white-space: nowrap;">${formatInvoiceNumber(trx.id)}</td>
                    </tr>
                    <tr>
                      <td style="width: 1%; white-space: nowrap; padding: 2px 0; color: #475569; font-weight: 500;">Tanggal</td>
                      <td style="width: 1%; white-space: nowrap; padding: 2px 8px 2px 4px; color: #475569;">:</td>
                      <td style="padding: 2px 0; white-space: nowrap;">${returnDate}</td>
                    </tr>
                    <tr>
                      <td style="width: 1%; white-space: nowrap; padding: 2px 0; color: #475569; font-weight: 500;">Salesman</td>
                      <td style="width: 1%; white-space: nowrap; padding: 2px 8px 2px 4px; color: #475569;">:</td>
                      <td style="padding: 2px 0; white-space: nowrap;">${trx.cashier_name || 'N/A'}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 39%; text-align: left;">Nama Produk</th>
                  <th style="width: 7%; text-align: center;">Qty</th>
                  <th style="width: 8%; text-align: center;">Satuan</th>
                  <th style="width: 15%; text-align: right;">Harga Satuan</th>
                  <th style="width: 8%; text-align: center;">Disc 1</th>
                  <th style="width: 8%; text-align: center;">Disc 2</th>
                  <th style="width: 15%; text-align: right;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <table style="width: 100%; border-collapse: collapse; margin-top: 4px;">
              <tr>
                <td style="width: 55%; vertical-align: top;">
                  <div style="font-size: 14.4px; line-height: 1.6; color: #0f172a;">
                    Metode Pembayaran : <strong>${getPaymentLabel(trx.payment_method)}</strong><br>
                    Status : <strong>${trx.payment_status === 'paid' ? 'Lunas' : trx.payment_status === 'partial' ? 'Cicilan' : 'Tempo Penuh'}</strong>
                    ${trx.payment_status !== 'paid' && trx.due_date ? `<br>Jatuh Tempo : <strong>${formatSimpleDate(trx.due_date)}</strong>` : ''}
                  </div>
                </td>
                <td style="width: 45%; vertical-align: top; text-align: right;">
                  <table style="width: 100%; border-collapse: collapse; font-size: 11.4px; line-height: 1.4; float: right;">
                    ${trx.tax && trx.tax > 0 ? `
                    <tr>
                      <td style="color: #475569; font-weight: 500; text-align: left;">Pajak</td>
                      <td style="text-align: right; color: #0f172a; font-weight: 600;">${formatRupiah(trx.tax)}</td>
                    </tr>` : ''}
                    ${(() => {
          if (!trx.discount || trx.discount <= 0) return '';

          let globalDiscountAmount = 0;
          let globalDiscountPercent = 0;
          let adminDiscountPercent = 0;
          let hasGlobalDiscount = false;
          let hasAdminPercent = false;
          let hasAdminNote = false;

          const note = trx.discount_note || '';

          const globalMatch = note.match(/Diskon Global (\d+(\.\d+)?)%/);
          if (globalMatch) {
            globalDiscountPercent = parseFloat(globalMatch[1]);
            globalDiscountAmount = Math.floor((trx.subtotal || 0) * (globalDiscountPercent / 100));
            hasGlobalDiscount = true;
          }

          const adminMatch = note.match(/Diskon Admin (\d+(\.\d+)?)%/);
          if (adminMatch) {
            adminDiscountPercent = parseFloat(adminMatch[1]);
            hasAdminPercent = true;
            hasAdminNote = true;
          } else if (note.includes('Diskon Admin')) {
            hasAdminNote = true;
          }

          const manualDiscount = hasGlobalDiscount ? (trx.discount - globalDiscountAmount) : trx.discount;

          if (!hasGlobalDiscount && !hasAdminNote) {
            return `
                            <tr>
                              <td style="color: #475569; font-weight: 500; text-align: left; font-size: 14.4px;">Diskon ${note ? `(${note})` : ''}</td>
                              <td style="text-align: right; color: #ea580c; font-weight: 600; font-size: 14.4px;">${formatRupiah(trx.discount)}</td>
                            </tr>
                         `;
          }

          let html = '';
          if (globalDiscountAmount > 0) {
            html += `
                          <tr>
                            <td style="color: #475569; font-weight: 500; text-align: left; font-size: 14.4px;">Diskon Global (${globalDiscountPercent}%)</td>
                            <td style="text-align: right; color: #ea580c; font-weight: 600; font-size: 14.4px;">${formatRupiah(globalDiscountAmount)}</td>
                          </tr>
                        `;
          }
          if (manualDiscount > 0) {
            html += `
                          <tr>
                            <td style="color: #475569; font-weight: 500; text-align: left; font-size: 14.4px;">Diskon Admin ${hasAdminPercent ? `(${adminDiscountPercent}%)` : ''}</td>
                            <td style="text-align: right; color: #ea580c; font-weight: 600; font-size: 14.4px;">${formatRupiah(manualDiscount)}</td>
                          </tr>
                        `;
          }
          return html;
        })()}
                    <tr>
                      <td style="color: #0f172a; font-weight: 800; border-top: 1.5px solid #0f172a; padding-top: 4px; text-align: left; font-size: 15.6px;">GRAND TOTAL</td>
                      <td style="text-align: right; color: #0f172a; font-weight: 800; border-top: 1.5px solid #0f172a; padding-top: 4px; font-size: 15.6px;">
                        ${formatRupiah((trx.subtotal || 0) + (trx.tax || 0) - (trx.discount || 0))}
                      </td>
                    </tr>
                    ${trx.payment_status === 'partial' ? `
                    <tr>
                      <td style="color: #475569; font-weight: 500; text-align: left;">Cicilan Dibayar</td>
                      <td style="text-align: right; color: #0f172a; font-weight: 600;">${formatRupiah(trx.amount_paid || 0)}</td>
                    </tr>
                    <tr>
                      <td style="color: #ea580c; font-weight: 700; text-align: left;">Sisa Tagihan</td>
                      <td style="text-align: right; color: #ea580c; font-weight: 800;">${formatRupiah(trx.remaining_balance || 0)}</td>
                    </tr>` : ''}
                    ${trx.payment_status === 'unpaid' ? `
                    <tr>
                      <td style="color: #ea580c; font-weight: 700; text-align: left;">Sisa Tagihan (Tempo)</td>
                      <td style="text-align: right; color: #ea580c; font-weight: 800;">${formatRupiah(trx.remaining_balance || 0)}</td>
                    </tr>` : ''}
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
            
            <div style="text-align: left; font-size: 11px; font-style: normal; color: #000000; margin-top: 10px; line-height: 1.3; width: 100%;">
              Pembayaran Transfer melalui Bank: ${storeInfo?.bankName || 'BCA'} ${storeInfo?.bankAccount || '4451377137'} a/n ${storeInfo?.bankAccountName || 'EL PROJECT'}
            </div>

            <div class="footer-divider"></div>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
              <tr>
                <td style="text-align: center; font-size: 10.2px; color: #64748b;">
                  ${[displayedFooter1, displayedFooter2, displayedFooter3].filter(Boolean).join(' | ') || 'Terima Kasih Sudah Melakukan Order'}
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
        <title>Faktur & Surat Jalan - ${formatInvoiceNumber(trx.id)}</title>
        <style>
          @page {
            size: auto; /* Biarkan driver printer continuous yang menentukan ukuran */
            margin: 0; /* Margin 0 di @page akan menghilangkan header/footer teks bawaan browser (Tanggal, Judul, URL) */
          }
          @media print {
            body { margin: 0; padding: 15mm 8mm 5mm 8mm; }
            .no-print { display: none !important; }
            .invoice-copy { border: none !important; } /* Hilangkan border putus-putus luar */
            .page-break {
              page-break-before: always;
              break-before: page;
              clear: both;
            }
          }
          .page-break {
            border-top: 2px dashed #cbd5e1;
            margin: 24px 0;
            page-break-before: always;
            break-before: page;
            clear: both;
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
          .cut-divider {
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            color: #64748b;
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 0.15em;
            margin: 18px 0 24px 0;
            border-top: 1.5px dashed #cbd5e1;
            position: relative;
            height: 1px;
            clear: both;
          }
          .cut-divider span {
            background: #ffffff;
            padding: 0 14px;
            position: absolute;
            top: -7px;
            text-transform: uppercase;
            white-space: nowrap;
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
          .invoice-copy-badge {
            display: inline-block;
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 0.05em;
            padding: 1px 5px;
            border-radius: 3px;
            background-color: #f1f5f9;
            color: #475569;
            border: 1px solid #e2e8f0;
            text-transform: uppercase;
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
          .metadata-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 8px;
          }
          .metadata-table td {
            padding: 2px 0;
            vertical-align: top;
            font-size: 12px;
          }
          .metadata-table td:first-child, .metadata-table td:nth-child(4) {
            color: #475569;
            font-weight: 500;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 8px;
            border-left: 1.5px solid #000000;
            border-right: 1.5px solid #000000;
          }
          .items-table th {
            color: #000000 !important;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
            padding: 2px 4px;
            border-bottom: 1.5px solid #000000;
            border-top: 1.5px solid #000000;
            border-left: 1px solid #000000;
            border-right: 1px solid #000000;
          }
          .items-table td {
            padding: 1px 4px;
            font-size: 13.2px;
            border-bottom: none;
            border-left: 1px solid #000000;
            border-right: 1px solid #000000;
            color: #000000 !important;
          }
          .items-table tr:last-child td {
            border-bottom: 1.5px solid #000000;
          }
          .items-table tr.empty-row td {
            height: 14px;
            padding: 1px 4px;
          }

          .text-center {
            text-align: center;
          }
          .text-right {
            text-align: right;
          }
          .reason-section {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 6px 10px;
            font-size: 11.4px;
            line-height: 1.35;
          }
          .footer-divider {
            border: none;
            border-top: 1px solid #cbd5e1;
            margin: 6px 0 4px 0;
          }
          .no-print {
            display: flex;
            justify-content: center;
            gap: 12px;
            margin-top: 20px;
            padding-top: 12px;
            border-top: 1px dashed #e2e8f0;
            page-break-inside: avoid;
          }
          .btn {
            padding: 8px 20px;
            font-size: 14.4px;
            font-weight: 600;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
            border: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-family: inherit;
            text-decoration: none;
          }
          .btn-primary {
            background-color: #0f172a;
            color: white;
          }
          .btn-primary:hover {
            background-color: #1e293b;
          }
          .btn-secondary {
            background-color: #f1f5f9;
            color: #475569;
            border: 1px solid #cbd5e1;
          }
          .btn-secondary:hover {
            background-color: #e2e8f0;
          }
        </style>
      </head>
      <body>
        <div class="print-wrapper">
          ${getInvoiceContentHtml("FAKTUR PENJUALAN", "SALINAN PELANGGAN")}
          
          <div class="cut-divider">
            <span>Gunting di sini untuk memotong dokumen</span>
          </div>
          
          ${getInvoiceContentHtml("SURAT JALAN", "SALINAN TOKO")}
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

  const handleDelete = () => {
    if (!trx) return;
    if (!confirm(`Hapus transaksi ${formatInvoiceNumber(trx.id)}? Tindakan ini tidak bisa dibatalkan.`)) return;

    deleteTransaction.mutate({ id: trx.id }, {
      onSuccess: () => {
        toast({ title: "Transaksi dihapus", description: "Data transaksi berhasil dihapus." });
        onDeleted();
        onClose();
      },
      onError: (error: any) => {
        toast({
          title: "Gagal menghapus transaksi",
          description: error?.message || "Periksa izin delete pada Supabase.",
          variant: "destructive"
        });
      }
    });
  };

  const getPaymentLabel = (method?: string) => {
    switch (method) {
      case 'cash': return 'Tunai';
      case 'qris': return 'QRIS';
      case 'transfer':
      case 'e_wallet':
        return 'Transfer';
      case 'debit_card': return 'E-wallet';
      case 'credit_card': return 'Kredit';
      default: return method?.replace('_', ' ') || '-';
    }
  };

  useEffect(() => {
    if (autoPrintInvoice && trx && !isPrinting) {
      const timer = setTimeout(() => {
        handlePrintInvoice();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoPrintInvoice, trx]);

  return (
    <Dialog open={!!trx} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden bg-slate-50">
        {!trx ? (
          <LoadingSpinner text="Memuat detail struk..." className="min-h-[300px]" />
        ) : (
          <div className="flex flex-col h-full max-h-[85vh]">
            <div className="p-4 border-b border-slate-200 bg-white flex flex-col justify-center items-center shrink-0">
              <DialogTitle className="font-bold text-lg">Detail Transaksi</DialogTitle>
              <DialogDescription className="sr-only">Rincian struk transaksi lengkap</DialogDescription>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto bg-white m-4 rounded-sm shadow-sm border border-slate-200 printable-receipt [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <div className="mb-4 sm:mb-6 pb-4 sm:pb-6">
                <div className="text-center mb-4">
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">{displayedStoreName}</h2>
                  <p className="text-xs text-slate-500 mt-1">{displayedAddress}</p>
                  {displayedPhone && <p className="text-xs text-slate-400 mt-0.5">{displayedPhone}</p>}
                </div>
                <div className="flex justify-between items-start">
                  <div className="text-left">
                    <p className="text-xs sm:text-sm text-slate-600 font-medium">
                      {new Date(trx.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(trx.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs sm:text-sm text-slate-600 font-medium font-mono">{formatInvoiceNumber(trx.id)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{trx.cashier_name}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 mb-4 sm:mb-6">
                <div className="flex justify-between items-center">
                  <span className="text-xs sm:text-sm text-slate-500">Status</span>
                  {trx.payment_status === 'partial' ? (
                    <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-sm">Cicilan</Badge>
                  ) : trx.payment_status === 'unpaid' ? (
                    <Badge variant="destructive" className="font-medium rounded-sm">Tempo</Badge>
                  ) : (
                    <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-sm">Lunas</Badge>
                  )}
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-500">Pelanggan</span>
                  <span className="text-right text-slate-500">{trx.customers?.name || "-"}</span>
                </div>
                {showAllDetails && (
                  <>
                    {trx.customers?.phone && (
                      <div className="flex justify-between text-xs sm:text-sm">
                        <span className="text-slate-500">No. Telepon</span>
                        <span className="text-right text-slate-500">{trx.customers.phone}</span>
                      </div>
                    )}
                    {trx.customers?.address && (
                      <div className="flex justify-between text-xs sm:text-sm">
                        <span className="text-slate-500">Alamat</span>
                        <span className="text-right max-w-[200px] sm:max-w-[300px] break-words text-slate-500">{trx.customers.address}</span>
                      </div>
                    )}
                    {trx.customers?.province && (
                      <div className="flex justify-between text-xs sm:text-sm">
                        <span className="text-slate-500">Provinsi</span>
                        <span className="text-right text-slate-500 capitalize">{trx.customers.province.toLowerCase()}</span>
                      </div>
                    )}
                    {trx.customers?.city && (
                      <div className="flex justify-between text-xs sm:text-sm">
                        <span className="text-slate-500">Kota/Kabupaten</span>
                        <span className="text-right text-slate-500 capitalize">{trx.customers.city.toLowerCase()}</span>
                      </div>
                    )}
                    {trx.customers?.district && (
                      <div className="flex justify-between text-xs sm:text-sm">
                        <span className="text-slate-500">Kecamatan</span>
                        <span className="text-right text-slate-500 capitalize">{trx.customers.district.toLowerCase()}</span>
                      </div>
                    )}
                    {trx.customers?.village && (
                      <div className="flex justify-between text-xs sm:text-sm">
                        <span className="text-slate-500">Kelurahan</span>
                        <span className="text-right text-slate-500 capitalize">{trx.customers.village.toLowerCase()}</span>
                      </div>
                    )}
                    {trx.customers?.postal_code && (
                      <div className="flex justify-between text-xs sm:text-sm">
                        <span className="text-slate-500">Kode Pos</span>
                        <span className="text-right text-slate-500">{trx.customers.postal_code}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs sm:text-sm">
                      <span className="text-slate-500">Metode Pembayaran</span>
                      <span className="text-right text-slate-500">{getPaymentLabel(trx.payment_method)}</span>
                    </div>
                  </>
                )}

                <div className="flex justify-center mt-2 pt-1 border-t border-slate-100">
                  <button
                    onClick={() => setShowAllDetails(!showAllDetails)}
                    className="text-[11px] sm:text-xs text-gray-600 hover:text-blue-800 font-medium cursor-pointer"
                  >
                    {showAllDetails ? "Sembunyikan detail" : "Lihat semua"}
                  </button>
                </div>
              </div>

              <div className="py-3 sm:py-4 space-y-3 sm:space-y-4 font-mono text-xs sm:text-sm">
                {trx.transaction_items?.map((item: any) => {
                  const baseQty = item.quantity || 0;
                  const qty = item.unit_qty !== undefined && item.unit_qty !== null ? item.unit_qty : baseQty;
                  const subtotal = item.subtotal || 0;

                  const totalDiscount = (item.discount_amount || 0) * baseQty;
                  let totalOriginalPrice = (item.original_price || item.price || 0) * baseQty;

                  if (totalDiscount > 0 && totalOriginalPrice <= subtotal) {
                    totalOriginalPrice = subtotal + totalDiscount;
                  }

                  let discountPercent = 0;
                  if (totalOriginalPrice > subtotal) {
                    const actualDiscount = totalOriginalPrice - subtotal;
                    discountPercent = Math.round((actualDiscount / totalOriginalPrice) * 100);
                  }

                  const displayOriginalPrice = qty > 0 ? (totalOriginalPrice / qty) : 0;

                  return (
                    <div key={item.id} className="flex justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 break-words">{item.product_name || item.products?.name || '-'}</p>
                        <p className="text-slate-500 mt-0.5 text-xs">
                          {qty} x {formatRupiah(displayOriginalPrice)}
                          {discountPercent > 0 && ` (Diskon: ${discountPercent}%)`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-900 whitespace-nowrap">{formatRupiah(subtotal)}</p>
                        {totalDiscount > 0 && (
                          <p className="text-xs text-orange-600">- {formatRupiah(totalDiscount)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2 py-4 sm:py-6 font-mono text-xs sm:text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>{formatRupiah(trx.subtotal)}</span>
                </div>
                {trx.tax && trx.tax > 0 ? (
                  <div className="flex justify-between text-slate-600">
                    <span>Pajak</span>
                    <span>{formatRupiah(trx.tax)}</span>
                  </div>
                ) : null}
                {trx.discount && trx.discount > 0 ? (() => {
                  let globalDiscountAmount = 0;
                  let globalDiscountPercent = 0;
                  let adminDiscountPercent = 0;
                  let hasGlobalDiscount = false;
                  let hasAdminPercent = false;
                  let hasAdminNote = false;

                  const note = trx.discount_note || '';

                  const globalMatch = note.match(/Diskon Global (\d+(\.\d+)?)%/i);
                  if (globalMatch) {
                    globalDiscountPercent = parseFloat(globalMatch[1]);
                    globalDiscountAmount = Math.floor((trx.subtotal || 0) * (globalDiscountPercent / 100));
                    hasGlobalDiscount = true;
                  }

                  const adminMatch = note.match(/Diskon Admin (\d+(\.\d+)?)%/i);
                  if (adminMatch) {
                    adminDiscountPercent = parseFloat(adminMatch[1]);
                    hasAdminPercent = true;
                    hasAdminNote = true;
                  } else if (note.toLowerCase().includes('diskon admin')) {
                    hasAdminNote = true;
                  }

                  const manualDiscount = hasGlobalDiscount ? (trx.discount - globalDiscountAmount) : trx.discount;

                  if (!hasGlobalDiscount && !hasAdminNote) {
                    return (
                      <div className="flex justify-between text-destructive">
                        <span>Diskon {note ? `(${note})` : ''}</span>
                        <span>-{formatRupiah(trx.discount)}</span>
                      </div>
                    );
                  }

                  return (
                    <>
                      {globalDiscountAmount > 0 && (
                        <div className="flex justify-between text-emerald-600 dark:text-emerald-500">
                          <span>Diskon Global ({globalDiscountPercent}%)</span>
                          <span>-{formatRupiah(globalDiscountAmount)}</span>
                        </div>
                      )}
                      {manualDiscount > 0 && (
                        <div className="flex justify-between text-emerald-600 dark:text-emerald-500">
                          <span>Diskon Admin {hasAdminPercent ? `(${adminDiscountPercent}%)` : ''}</span>
                          <span>-{formatRupiah(manualDiscount)}</span>
                        </div>
                      )}
                    </>
                  );
                })() : null}

                <div className="flex justify-between font-bold text-sm sm:text-lg pt-3 sm:pt-4">
                  <span className="text-slate-900">GRAND TOTAL</span>
                  <span className="text-slate-900">{formatRupiah((trx.subtotal || 0) + (trx.tax || 0) - (trx.discount || 0))}</span>
                </div>
              </div>



              {trx.payment_status === 'partial' && (
                <div className="space-y-2 py-4 sm:py-6 font-mono text-xs sm:text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Cicilan Dibayar ({getPaymentLabel(trx.payment_method)})</span>
                    <span>{formatRupiah(trx.amount_paid || 0)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900">
                    <span>Sisa Tagihan</span>
                    <span className="text-red-600">{formatRupiah(trx.remaining_balance || 0)}</span>
                  </div>
                </div>
              )}

              {trx.payment_status === 'unpaid' && (
                <div className="space-y-2 py-4 sm:py-6 font-mono text-xs sm:text-sm">
                  <div className="flex justify-between font-bold text-slate-900">
                    <span>Tagihan (Tempo)</span>
                    <span className="text-red-600">{formatRupiah(trx.remaining_balance || 0)}</span>
                  </div>
                  {trx.due_date && (
                    <div className="flex justify-between text-slate-600 mt-1">
                      <span>Jatuh Tempo</span>
                      <span>{new Date(trx.due_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </div>
                  )}
                </div>
              )}



              {storeInfo.showFooter && (
                <div className="mt-6 sm:mt-8 text-center text-slate-400 text-xs space-y-1">
                  {displayedFooter1 && <p>{displayedFooter1}</p>}
                  {displayedFooter2 && <p>{displayedFooter2}</p>}
                  {displayedFooter3 && <p>{displayedFooter3}</p>}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-white flex justify-between items-center gap-2 shrink-0">
              <div className="flex-1">
                {isAdmin ? (
                  !(Capacitor.getPlatform() === 'android') && (
                    <Button variant="outline" onClick={handlePrintInvoice}>
                      <Printer className="w-4 h-4 mr-2" />
                      <span className="hidden sm:inline">Cetak Faktur</span>
                      <span className="sm:hidden">Cetak</span>
                    </Button>
                  )
                ) : (
                  <Button variant="outline" onClick={handlePrintReceipt} disabled={isPrinting}>
                    <Printer className="w-4 h-4 mr-2" />
                    {isPrinting ? (
                      <span className="hidden sm:inline">Mencetak...</span>
                    ) : (
                      <span className="hidden sm:inline">Cetak Struk</span>
                    )}
                    {isPrinting ? (
                      <span className="sm:hidden">Proses</span>
                    ) : (
                      <span className="sm:hidden">Struk</span>
                    )}
                  </Button>
                )}
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1">
                  <Link href={`/pos?edit=${trx.id}`}>
                    <Button size="icon" variant="ghost" className="text-slate-500 hover:text-primary hover:bg-primary/10" title="Edit Transaksi">
                      <Edit className="w-4 h-4" />
                    </Button>
                  </Link>
                  <Button size="icon" variant="ghost" className="text-slate-500 hover:text-red-600 hover:bg-red-50" onClick={handleDelete} disabled={deleteTransaction.isPending} title="Hapus Transaksi">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function TransactionsPage() {
  const [paymentMethod, setPaymentMethod] = useState<string>("all");
  const [paymentStatus, setPaymentStatus] = useState<string>("all");
  const [page, setPage] = useState<number>(1);
  const [outletFilter, setOutletFilter] = useState<string>("all");
  const [cashierFilter, setCashierFilter] = useState<string>("all");
  const [cashiers, setCashiers] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const [selectedTransaction, setSelectedTransaction] = useState<any | null>(null);
  const [autoPrintInvoice, setAutoPrintInvoice] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<any | null>(null);

  const { user } = useAuth();
  const isAdminSuper = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const deleteTransaction = useDeleteTransaction();

  const handleDeleteAction = (trx: any) => {
    deleteTransaction.mutate({ id: trx.id }, {
      onSuccess: () => {
        toast({ title: "Sukses", description: "Data transaksi berhasil dihapus." });
        refetch();
      },
      onError: (error: any) => {
        toast({
          title: "Gagal menghapus",
          description: error.message || "Terjadi kesalahan saat menghapus transaksi.",
          variant: "destructive"
        });
      }
    });
  };

  const getActionMenuItems = (trx: any) => {
    const items: ActionMenuItem[] = [
      {
        label: "Lihat Detail",
        icon: <Eye className="h-4 w-4 text-slate-500" />,
        onClick: () => {
          setSelectedTransaction(trx);
          setAutoPrintInvoice(false);
        },
      },
      {
        label: "Cetak Faktur",
        icon: <Printer className="h-4 w-4 text-slate-500" />,
        onClick: () => {
          setSelectedTransaction(trx);
          setAutoPrintInvoice(true);
        },
      }
    ];

    if (isAdminSuper) {
      items.push({
        label: "Edit",
        icon: <Edit className="h-4 w-4 text-slate-500" />,
        onClick: () => setLocation(`/pos?edit=${trx.id}`),
      });
      items.push({
        label: "Hapus",
        icon: <Trash2 className="h-4 w-4" />,
        onClick: () => setTransactionToDelete(trx),
        destructive: true,
      });
    }

    return items;
  };

  const { data: outlets } = useListOutlets();

  const { data: transactions, isLoading, refetch } = useListTransactions({
    paymentMethod: paymentMethod === "all" ? undefined : paymentMethod,
    paymentStatus: paymentStatus === "all" ? undefined : paymentStatus,
    outletFilter: outletFilter === "all" ? undefined : outletFilter,
    cashierFilter: cashierFilter === "all" ? undefined : cashierFilter,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    limit: ITEMS_PER_PAGE,
    offset: (page - 1) * ITEMS_PER_PAGE
  });

  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const viewId = searchParams.get('view');

  const { data: viewTransaction } = useGetTransaction(viewId ? parseInt(viewId) : undefined);

  useEffect(() => {
    if (viewTransaction && !selectedTransaction) {
      setSelectedTransaction(viewTransaction);
      // Remove query param without reloading to prevent re-opening on close
      window.history.replaceState({}, '', '/transactions');
    }
  }, [viewTransaction]);

  useEffect(() => {
    if (isAdminSuper) {
      const fetchCashiers = async () => {
        const { data, error } = await supabase
          .from("transactions")
          .select("cashier_name")
          .not("cashier_name", "is", null);

        if (!error && data) {
          const uniqueCashiers = [...new Set(data.map(t => t.cashier_name))].filter(Boolean) as string[];
          setCashiers(uniqueCashiers);
        }
      };
      fetchCashiers();
    }
  }, [isAdminSuper]);

  const handlePrevious = () => {
    if (page > 1) setPage(p => p - 1);
  };

  const handleNext = () => {
    if ((transactions?.length || 0) >= ITEMS_PER_PAGE) {
      setPage(p => p + 1);
    }
  };

  const handlePaymentMethodChange = (value: string) => {
    setPaymentMethod(value);
    setPage(1);
  };

  const getPaymentIcon = (method: string) => {
    switch (method) {
      case 'cash': return <Banknote className="w-4 h-4 text-emerald-600" />;
      case 'qris': return <QrCode className="w-4 h-4 text-blue-600" />;
      case 'transfer': return <CreditCard className="w-4 h-4 text-purple-600" />;
      default: return <CreditCard className="w-4 h-4 text-slate-600" />;
    }
  };

  const getPaymentLabel = (method: string) => {
    switch (method) {
      case 'cash': return 'Tunai';
      case 'debit_card': return 'E-wallet';
      case 'transfer': return 'Transfer';
      case 'qris': return 'QRIS';
      default: return method;
    }
  };

  const calculateTotal = (trx: any) => {
    const subtotal = trx.subtotal || 0;
    const tax = trx.tax || 0;
    const discount = trx.discount || 0;
    return subtotal + tax - discount;
  };

  const getPaymentStatusBadge = (status: string) => {
    if (status === 'partial') return <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-sm">Cicilan</Badge>;
    if (status === 'unpaid') return <Badge variant="destructive" className="font-medium rounded-sm">Tempo</Badge>;
    return <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-sm">Lunas</Badge>;
  };

  return (
    <Sidebar>
      <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950" style={{ '--radius': '0px' } as React.CSSProperties}>
        {/* Header */}
        <div className="px-4 py-2 sm:px-6 sm:py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between">
          <h1 className="text-xl sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            Riwayat Transaksi
          </h1>

          {/* Filter Section (Popover) */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="shrink-0 h-8 px-3 text-xs sm:text-sm flex items-center justify-center gap-2 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm">
                <SlidersHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline">Filter Transaksi</span>
                <span className="sm:hidden font-medium">Filter</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[340px] max-w-[95vw] sm:w-[400px] p-4 sm:rounded-sm shadow-xl">
              <div className="space-y-4">
                <div className="font-semibold text-sm mb-2">Filter Data</div>

                {/* Date Filters */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-500">Rentang Tanggal</label>
                  <div className="flex flex-col sm:flex-row items-center gap-2 w-full">
                    <div className="relative w-full h-9">
                      <Input
                        type="text"
                        placeholder="Tanggal Mulai"
                        value={startDate ? startDate.split('-').reverse().join('-') : ""}
                        readOnly
                        className="absolute inset-0 h-9 w-full rounded-sm text-sm text-center bg-transparent focus:ring-0 cursor-pointer"
                      />
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e: any) => { setStartDate(e.target.value); setPage(1); }}
                        onClick={(e: any) => {
                          try { e.target.showPicker?.(); } catch (err) { }
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        title="Tanggal Mulai"
                      />
                    </div>
                    <span className="text-slate-400 text-sm hidden sm:block">-</span>
                    <div className="relative w-full h-9">
                      <Input
                        type="text"
                        placeholder="Tanggal Akhir"
                        value={endDate ? endDate.split('-').reverse().join('-') : ""}
                        readOnly
                        className="absolute inset-0 h-9 w-full rounded-sm text-sm text-center bg-transparent focus:ring-0 cursor-pointer"
                      />
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e: any) => { setEndDate(e.target.value); setPage(1); }}
                        onClick={(e: any) => {
                          try { e.target.showPicker?.(); } catch (err) { }
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        title="Tanggal Akhir"
                      />
                    </div>
                  </div>
                </div>

                {/* Only show for admin super */}
                {isAdminSuper && (
                  <>
                    {/* Cashier Filter */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-500">Sales</label>
                      <Select value={cashierFilter} onValueChange={(v) => { setCashierFilter(v); setPage(1); }}>
                        <SelectTrigger className="h-9 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1">
                          <User className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                          <SelectValue placeholder="Semua Sales" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Semua Sales</SelectItem>
                          {cashiers.map((cashier) => (
                            <SelectItem key={cashier} value={cashier}>
                              {cashier}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {/* Payment Method Filter */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-500">Metode Pembayaran</label>
                  <Select value={paymentMethod} onValueChange={handlePaymentMethodChange}>
                    <SelectTrigger className="h-9 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1">
                      <CreditCard className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                      <SelectValue placeholder="Semua Metode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Metode</SelectItem>
                      <SelectItem value="cash">Tunai</SelectItem>
                      <SelectItem value="qris">QRIS</SelectItem>
                      <SelectItem value="transfer">Transfer</SelectItem>
                      <SelectItem value="debit_card">E-wallet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Payment Status Filter */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-500">Status Pembayaran</label>
                  <Select value={paymentStatus} onValueChange={(v) => { setPaymentStatus(v); setPage(1); }}>
                    <SelectTrigger className="h-9 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1">
                      <History className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                      <SelectValue placeholder="Semua Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Status</SelectItem>
                      <SelectItem value="paid">Lunas</SelectItem>
                      <SelectItem value="partial">Cicilan</SelectItem>
                      <SelectItem value="unpaid">Tempo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="px-4 py-3 sm:px-6 sm:py-4 flex-1 overflow-auto scrollbar-hide pb-20">

          {isLoading ? (
            <LoadingSpinner text="Memuat data transaksi..." />
          ) : (
            <>
              {/* Mobile Card List */}
              <div className="flex flex-col gap-3 md:hidden">
                {transactions?.length === 0 ? (
                  <div className="text-center py-10 text-slate-500 dark:text-slate-400">Tidak ada transaksi ditemukan</div>
                ) : (
                  transactions?.map(trx => {
                    const total = calculateTotal(trx);
                    const customerName = trx.customers?.name || "Umum";

                    return (
                      <div
                        key={trx.id}
                        onClick={() => setSelectedTransaction(trx)}
                        className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-3 flex flex-col gap-2 cursor-pointer hover:shadow-md transition-shadow relative"
                      >
                        {/* Row 1: Invoice + Payment Method Badge + Status Badge + ActionMenu */}
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                              {formatInvoiceNumber(trx.id)}
                              {trx.is_edited && (
                                <Badge variant="outline" className="w-5 h-5 p-0 flex items-center justify-center rounded-full border-blue-500 text-blue-600 bg-blue-50 text-[10px]" title="Transaksi telah diedit">R</Badge>
                              )}
                            </div>
                            <ActionMenu
                              items={getActionMenuItems(trx)}
                              triggerClassName="-mr-2.5 -mt-2.5"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-slate-500">{formatTransactionHistoryDate(trx.created_at)}</div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge variant="outline" className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-sm">
                                {getPaymentIcon(trx.payment_method)}
                                {getPaymentLabel(trx.payment_method)}
                              </Badge>
                              {getPaymentStatusBadge(trx.payment_status)}
                            </div>
                          </div>
                        </div>

                        {/* Row 2: Customer + Cashier + Total Harga */}
                        <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-slate-100 dark:border-slate-800">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs text-slate-500">
                              <span className="font-medium text-slate-700 dark:text-slate-300">{customerName}</span>
                            </span>
                            <span className="text-xs text-slate-400">
                              {trx.cashier_name}
                            </span>
                          </div>

                          <div className="font-bold text-primary text-base whitespace-nowrap">
                            {formatRupiah(total)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block bg-white dark:bg-slate-900 rounded-none shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                      <TableHead className="w-[180px]">ID / Waktu</TableHead>
                      <TableHead className="min-w-[160px]">Pelanggan</TableHead>
                      <TableHead className="w-[140px]">Sales</TableHead>
                      <TableHead className="w-[120px] text-center">Status</TableHead>
                      <TableHead className="w-[160px] text-center">Metode Bayar</TableHead>
                      <TableHead className="w-[120px] text-right">Total</TableHead>
                      <TableHead className="w-[50px] text-center">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions?.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500 dark:text-slate-400">Tidak ada transaksi ditemukan</TableCell></TableRow>
                    ) : (
                      transactions?.map(trx => {
                        const total = calculateTotal(trx);

                        return (
                          <TableRow
                            key={trx.id}
                            className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:shadow-sm relative hover:z-10 transition-all duration-200 cursor-pointer"
                            onClick={() => setSelectedTransaction(trx)}
                          >
                            <TableCell className="whitespace-nowrap">
                              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                {formatInvoiceNumber(trx.id)}
                                {trx.is_edited && (
                                  <Badge variant="outline" className="w-5 h-5 p-0 flex items-center justify-center rounded-full border-blue-500 text-blue-600 bg-blue-50 text-[10px]" title="Transaksi telah diedit">R</Badge>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">{formatTransactionHistoryDate(trx.created_at)}</div>
                            </TableCell>
                            <TableCell className="font-medium text-slate-900 dark:text-white whitespace-nowrap">
                              {trx.customers?.name || "Umum"}
                            </TableCell>
                            <TableCell className="text-slate-600 dark:text-slate-400 whitespace-nowrap">{trx.cashier_name}</TableCell>
                            <TableCell className="text-center whitespace-nowrap">
                              {getPaymentStatusBadge(trx.payment_status)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-center">
                              <div className="flex items-center justify-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                                {getPaymentIcon(trx.payment_method)}
                                {getPaymentLabel(trx.payment_method)}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-bold text-primary whitespace-nowrap">
                              {formatRupiah(total)}
                            </TableCell>
                            <TableCell className="text-center whitespace-nowrap">
                              <ActionMenu
                                items={getActionMenuItems(trx)}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination Controls */}
              {transactions && transactions.length > 0 && (
                <div className="flex items-center justify-between py-3 border-t border-slate-200 dark:border-slate-800 mt-2">
                  <div className="text-sm text-slate-500">
                    Halaman {page}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrevious}
                      disabled={page === 1}
                      className="flex items-center gap-1"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNext}
                      disabled={transactions.length < ITEMS_PER_PAGE}
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
      </div>

      {selectedTransaction && (
        <TransactionReceiptDialog
          transaction={selectedTransaction}
          autoPrintInvoice={autoPrintInvoice}
          onClose={() => {
            setSelectedTransaction(null);
            setAutoPrintInvoice(false);
          }}
          onDeleted={() => {
            setSelectedTransaction(null);
            setAutoPrintInvoice(false);
            refetch();
          }}
        />
      )}

      <AlertDialog open={!!transactionToDelete} onOpenChange={(open) => !open && setTransactionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Transaksi?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus transaksi {transactionToDelete ? formatInvoiceNumber(transactionToDelete.id) : ''}? <br></br>Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                handleDeleteAction(transactionToDelete);
                setTransactionToDelete(null);
              }}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}
