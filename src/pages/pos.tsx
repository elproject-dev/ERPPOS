import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useListProducts, useListCategories, useListCustomers, useCreateTransaction, useUpdateTransaction, useGetTransaction, getListProductsQueryKey, getListCustomersQueryKey, useListOutlets, generateNextCustomerId, useUpdateCustomer, useStoreSettings, useDiscountSettings } from "@workspace/api-client-react";
import { formatRupiah, formatInvoiceNumber } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { getProductImageUrl as getProductImageUrlFromStorage } from "@/lib/supabase-storage";
import { connectToPrinter, disconnectPrinter, printReceipt, getAutoPrintSetting, getBluetoothPrinterMac, isBluetoothAvailable } from "@/lib/bluetooth-printer";
import { showTransactionSuccessNotification, showPrinterNotConnectedNotification, showPrintSuccessNotification } from "@/lib/android-notifications";
import { Sidebar } from "@/components/layout/Sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Minus, X, CreditCard, Banknote, QrCode, ShoppingCart, Package, Trash2, Printer, Bluetooth, Circle, Store, AlertTriangle, Ruler, Clock, CalendarRange, CheckCircle2, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthUserName, useAuth } from "@/contexts/AuthContext";
import { ADMIN_EMAIL } from "@/lib/auth";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface CartItem {
  productId: number;
  productName: string;
  price: number;
  quantity: number;
  imageUrl?: string | null;
  unitName: string;
  conversionFactor: number;
  unitPrice: number;
  uomDiscountType?: string;
  uomDiscountAmount?: number;
  uomMinQty?: number;
  uomLabel?: string;
}

// Helper function untuk format angka dengan titik ribuan
const formatNumberWithDots = (value: string): string => {
  const cleanValue = value.replace(/\./g, '').replace(/[^0-9]/g, '');
  if (!cleanValue) return '';
  return cleanValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

// Helper function untuk parse angka dari format dengan titik ke number
const parseNumberFromDots = (value: string): number => {
  return parseInt(value.replace(/\./g, '')) || 0;
};

const getBaseUnitName = (product: any): string => {
  if (!product || !product.uoms) return 'pcs';
  const baseUom = product.uoms.find((u: any) => u.conversion_factor === 1 || u.is_default);
  return baseUom ? baseUom.unit_name.toLowerCase() : 'pcs';
};



const formatCustomerLabel = (customer: any) => {
  return customer?.phone ? `${customer.name} - ${customer.phone}` : customer?.name || '';
};

const CUSTOM_DISCOUNT_NOTE_VALUE = '__custom_discount_note__';

const getDefaultDiscountNotes = () => [
  'Promo Member',
  'Diskon Produk',
  'Voucher Toko',
  'Promo Musiman',
  'Komplain Pelanggan'
];



const getPaymentMethodLabel = (method: string) => {
  switch (method) {
    case 'cash': return 'Tunai';
    case 'transfer': return 'Transfer';
    case 'debit_card': return 'E-wallet';
    case 'credit_card': return 'Kredit';
    case 'qris': return 'QRIS';
    default: return method;
  }
};

export default function POSPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const cashierName = useAuthUserName();
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const queryClient = useQueryClient();
  const { data: storeSettingsData } = useStoreSettings();
  const { data: discountSettingsData } = useDiscountSettings();
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const editIdParam = searchParams.get('edit');
  const editId = editIdParam ? parseInt(editIdParam) : null;
  const isEditMode = !!editId;

  const { data: editTransactionData } = useGetTransaction(editId || 0);

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [cart, setCart] = useState<CartItem[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("pos_cart");
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to load cart", e);
      }
    }
    return [];
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("pos_cart", JSON.stringify(cart));
      window.dispatchEvent(new CustomEvent('cartUpdated', { detail: cart.length }));
    }
  }, [cart]);

  const [customerId, setCustomerId] = useState<number | undefined>();
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState<boolean>(false);
  const [manualCustomerName, setManualCustomerName] = useState<string>("");
  const [manualCustomerPhone, setManualCustomerPhone] = useState<string>("");
  const [manualAddress, setManualAddress] = useState<string>("");
  const [manualDistrict, setManualDistrict] = useState<string>("");
  const [manualCity, setManualCity] = useState<string>("");
  const [manualProvince, setManualProvince] = useState<string>("");
  const [manualVillage, setManualVillage] = useState<string>("");
  const [manualPostalCode, setManualPostalCode] = useState<string>("");
  const [manualCustomerId, setManualCustomerId] = useState<string>("");

  // Emsifa wilayah API states
  const [posProvinces, setPosProvinces] = useState<any[]>([]);
  const [posRegencies, setPosRegencies] = useState<any[]>([]);
  const [posDistricts, setPosDistricts] = useState<any[]>([]);
  const [posVillages, setPosVillages] = useState<any[]>([]);
  const [posSelectedProvId, setPosSelectedProvId] = useState("");
  const [posSelectedKabId, setPosSelectedKabId] = useState("");
  const [posSelectedKecId, setPosSelectedKecId] = useState("");
  const [isLoadingPosProv, setIsLoadingPosProv] = useState(false);
  const [isLoadingPosKab, setIsLoadingPosKab] = useState(false);
  const [isLoadingPosKec, setIsLoadingPosKec] = useState(false);
  const [isLoadingPosKel, setIsLoadingPosKel] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [amountPaidDisplay, setAmountPaidDisplay] = useState<string>("");
  const [amountPaidStr, setAmountPaidStr] = useState<string>("");
  const [discountDisplay, setDiscountDisplay] = useState<string>("");
  const [discountStr, setDiscountStr] = useState<string>("");
  const [discountNote, setDiscountNote] = useState<string>("");
  const [discountNoteOptions, setDiscountNoteOptions] = useState<string[]>([]);
  const [isCustomDiscountNote, setIsCustomDiscountNote] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [discountPercentStr, setDiscountPercentStr] = useState<string>("");
  const [discountType, setDiscountType] = useState<"nominal" | "percent">("percent");
  const enableDiscount = isAdmin && isEditMode;
  const defaultDiscountPrice = "0";
  const enablePPN = false;
  const ppnPercentage = 11;

  const [showReceipt, setShowReceipt] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<any>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showProducts, setShowProducts] = useState(false); // Default tidak menampilkan produk

  const [paymentType, setPaymentType] = useState<"lunas" | "dp" | "tempo">("lunas");
  const [dueDate, setDueDate] = useState<string>("");
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);



  // Fetch provinces when customer section becomes relevant (always on mount)
  useEffect(() => {
    async function fetchPosProvinces() {
      setIsLoadingPosProv(true);
      try {
        const res = await fetch("https://www.emsifa.com/api-wilayah-indonesia/api/provinces.json");
        setPosProvinces(await res.json());
      } catch (e) { console.error(e); }
      finally { setIsLoadingPosProv(false); }
    }
    fetchPosProvinces();
  }, []);

  // Fetch regencies when province changes
  useEffect(() => {
    if (!posSelectedProvId) { setPosRegencies([]); setPosSelectedKabId(""); return; }
    async function fetchPosRegencies() {
      setIsLoadingPosKab(true);
      try {
        const res = await fetch(`https://www.emsifa.com/api-wilayah-indonesia/api/regencies/${posSelectedProvId}.json`);
        setPosRegencies(await res.json());
      } catch (e) { console.error(e); }
      finally { setIsLoadingPosKab(false); }
    }
    fetchPosRegencies();
  }, [posSelectedProvId]);

  // Fetch districts when regency changes
  useEffect(() => {
    if (!posSelectedKabId) { setPosDistricts([]); setPosSelectedKecId(""); return; }
    async function fetchPosDistricts() {
      setIsLoadingPosKec(true);
      try {
        const res = await fetch(`https://www.emsifa.com/api-wilayah-indonesia/api/districts/${posSelectedKabId}.json`);
        setPosDistricts(await res.json());
      } catch (e) { console.error(e); }
      finally { setIsLoadingPosKec(false); }
    }
    fetchPosDistricts();
  }, [posSelectedKabId]);

  // Fetch villages when district changes
  useEffect(() => {
    if (!posSelectedKecId) { setPosVillages([]); return; }
    async function fetchPosVillages() {
      setIsLoadingPosKel(true);
      try {
        const res = await fetch(`https://www.emsifa.com/api-wilayah-indonesia/api/villages/${posSelectedKecId}.json`);
        setPosVillages(await res.json());
      } catch (e) { console.error(e); }
      finally { setIsLoadingPosKel(false); }
    }
    fetchPosVillages();
  }, [posSelectedKecId]);

  // Auto-select Province when editing existing customer
  useEffect(() => {
    if (manualProvince && posProvinces.length > 0 && !posSelectedProvId) {
      const found = posProvinces.find((p: any) => p.name?.toLowerCase() === manualProvince?.toLowerCase());
      if (found) setPosSelectedProvId(found.id);
    }
  }, [manualProvince, posProvinces, posSelectedProvId]);

  // Auto-select Regency when editing
  useEffect(() => {
    if (manualCity && posRegencies.length > 0 && !posSelectedKabId) {
      const found = posRegencies.find((r: any) => r.name?.toLowerCase() === manualCity?.toLowerCase());
      if (found) setPosSelectedKabId(found.id);
    }
  }, [manualCity, posRegencies, posSelectedKabId]);

  // Auto-select District when editing
  useEffect(() => {
    if (manualDistrict && posDistricts.length > 0 && !posSelectedKecId) {
      const found = posDistricts.find((d: any) => d.name?.toLowerCase() === manualDistrict?.toLowerCase());
      if (found) setPosSelectedKecId(found.id);
    }
  }, [manualDistrict, posDistricts, posSelectedKecId]);

  // UOM selector state
  const [uomSelectorProduct, setUomSelectorProduct] = useState<any>(null);

  // QTY selector state
  const [qtySelector, setQtySelector] = useState<{ product: any, uom: any | null } | null>(null);
  const [qtyInput, setQtyInput] = useState<number>(1);

  // Initialize outlet: Kasir's specific outlet for Kasir, Admin's assigned outlet if set, otherwise 'all'
  const [selectedOutlet, setSelectedOutlet] = useState<string>(() => {
    // Kasir must use their assigned outlet
    if (!isAdmin) {
      return user?.outletId || "all";
    }
    // Admin with assigned outlet should filter to their outlet
    if (user?.outletId && user.outletId !== "all") {
      return user.outletId;
    }
    // Admin without outlet assignment can see all
    return "all";
  });

  // Force outlet to always match user assignment or transaction data in edit mode
  useEffect(() => {
    if (isEditMode && editTransactionData?.outlet_id) {
      setSelectedOutlet(editTransactionData.outlet_id.toString());
    } else if (!isAdmin) {
      // Kasir must always use their assigned outlet
      setSelectedOutlet(user?.outletId || "all");
    } else {
      // Admin with assigned outlet should use their outlet, not "all"
      if (user?.outletId && user.outletId !== "all") {
        setSelectedOutlet(user.outletId);
      }
    }
  }, [isAdmin, user?.outletId, isEditMode, editTransactionData?.outlet_id]);

  const { data: outlets } = useListOutlets();

  const { data: products, isLoading: isLoadingProducts } = useListProducts({
    search: search.length > 2 ? search : undefined,
    // Abaikan categoryId saat ada input pencarian (search >= 3 karakter)
    // Sehingga pencarian tetap bekerja meski kasir masih dalam mode kategori
    categoryId: search.length > 2 ? undefined : categoryId,
    isActive: true,
    outletId: selectedOutlet,
    includeShared: true
  });
  const { data: categories } = useListCategories({ outletId: selectedOutlet });
  const { data: customers, isLoading: isLoadingCustomers, refetch: refetchCustomers } = useListCustomers();

  // Populate customer details in Edit Mode when customers data is loaded
  useEffect(() => {
    if (isEditMode && editTransactionData?.customer_id && customers && customers.length > 0) {
      const c = customers.find(cust => cust.id === editTransactionData.customer_id);
      if (c) {
        setManualCustomerName(c.name || "");
        setManualCustomerPhone(c.phone ? String(c.phone) : "");
        setManualAddress(c.address || "");
        setManualDistrict(c.district || "");
        setManualCity(c.city || "");
        setManualProvince(c.province || "");
        setManualVillage(c.village || "");
        setManualPostalCode(c.postal_code || "");
        setManualCustomerId(c.customer_id_manual || "");
        // Reset wilayah IDs so auto-select useEffects can run
        setPosSelectedProvId("");
        setPosSelectedKabId("");
        setPosSelectedKecId("");
      }
    }
  }, [isEditMode, editTransactionData, customers]);

  useEffect(() => {
    if (isEditMode && editTransactionData) {
      const items = editTransactionData.transaction_items || [];
      const newCart = items.map((item: any) => {
        const rawImg = item.imageUrl || item.image_url || item.product?.image_url || item.product?.imageUrl;
        const prod = products?.find((p: any) => p.id === item.product_id);
        const imageUrl = prod ? getProductImageUrl(prod, 'thumb') : (rawImg ? getProductImageUrlFromStorage(rawImg, { width: 100, height: 100 }) : null);

        return {
          productId: item.product_id,
          productName: item.product_name,
          price: item.price,
          quantity: item.unit_qty || (item.quantity / (item.conversion_factor || 1)),
          imageUrl: imageUrl,
          unitName: item.unit_name || 'pcs',
          conversionFactor: item.conversion_factor || 1,
          unitPrice: item.price * (item.conversion_factor || 1),
          uomDiscountType: 'none',
          uomDiscountAmount: 0,
          uomMinQty: 1,
          uomLabel: ''
        };
      });

      setCart(newCart);

      if (editTransactionData.customer_id) {
        setCustomerId(editTransactionData.customer_id);
      } else if (editTransactionData.customer_name) {
        setManualCustomerName(editTransactionData.customer_name);
      }

      setPaymentMethod(editTransactionData.payment_method);
      if (editTransactionData.payment_status === 'partial') {
        setPaymentType('dp');
        setAmountPaidDisplay(formatNumberWithDots(editTransactionData.amount_paid?.toString() || "0"));
        setAmountPaidStr(formatNumberWithDots(editTransactionData.amount_paid?.toString() || "0"));
      } else if (editTransactionData.payment_status === 'unpaid') {
        setPaymentType('tempo');
      } else {
        setPaymentType('lunas');
      }

      if (editTransactionData.due_date) {
        setDueDate(editTransactionData.due_date);
      }

      if (editTransactionData.discount > 0) {
        const note = editTransactionData.discount_note || "";

        // Default to 0 / empty for admin discounts as requested
        setDiscountType('percent');
        setDiscountPercentStr("");
        setDiscountDisplay("");
        setDiscountStr("");

        // Parse custom note part
        const noteParts = note.split(' + ');
        const customNotePart = noteParts.find((p: string) => !p.startsWith('Diskon Global') && !p.startsWith('Diskon Admin'));

        if (customNotePart) {
          setDiscountNote(customNotePart);
        } else if (!note.includes('Diskon Global') && !note.includes('Diskon Admin')) {
          setDiscountNote(note);
        } else {
          setDiscountNote("");
        }
      } else {
        setDiscountType('percent');
        setDiscountDisplay("");
        setDiscountStr("");
        setDiscountPercentStr("");
        setDiscountNote("");
      }
    }
  }, [editTransactionData, isEditMode, products]);

  // Auto-sync missing product images in cart when products list loads
  useEffect(() => {
    if (cart.length > 0 && products && products.length > 0) {
      let updated = false;
      const updatedCart = cart.map(item => {
        if (!item.imageUrl) {
          const prod = products.find((p: any) => p.id === item.productId);
          if (prod) {
            const img = getProductImageUrl(prod, 'thumb');
            if (img) {
              updated = true;
              return { ...item, imageUrl: img };
            }
          }
        }
        return item;
      });
      if (updated) {
        setCart(updatedCart);
      }
    }
  }, [products]);

  const getProductBasePrice = (product: any) => {
    // Priority 1: Check default/base UOM outlet-specific price
    if (selectedOutlet && selectedOutlet !== "all" && product.uoms && product.uoms.length > 0) {
      const baseUom = product.uoms.find((u: any) => u.conversion_factor === 1 || u.is_default);
      if (baseUom && baseUom.outlet_prices && baseUom.outlet_prices[selectedOutlet]) {
        return Number(baseUom.outlet_prices[selectedOutlet]);
      }
    }
    // Priority 2: Product-level outlet price
    if (selectedOutlet && selectedOutlet !== "all" && product.outlet_prices) {
      if (product.outlet_prices[selectedOutlet]) {
        return Number(product.outlet_prices[selectedOutlet]);
      }
    }
    // Priority 3: Default price
    return product.price;
  };

  // Get UOM price considering outlet-specific UOM prices
  const getUomPrice = (uom: any, product: any) => {
    // Priority 1: UOM outlet-specific price
    if (selectedOutlet && selectedOutlet !== "all" && uom.outlet_prices) {
      const outletUomPrice = uom.outlet_prices[selectedOutlet];
      if (outletUomPrice) return Number(outletUomPrice);
    }
    // Priority 2: UOM global custom price
    if (uom.price) return Number(uom.price);
    // Priority 3: Product area price × conversion factor
    return getProductBasePrice(product) * (uom.conversion_factor || 1);
  };

  const posProducts = useMemo(() => {
    return (products || [])
      .filter((p: any) => p.stock_quantity > 0 && p.is_active !== false)
      // apply search
      .filter((p: any) => {
        if (search.length > 2) {
          return p.name.toLowerCase().includes(search.toLowerCase());
        }
        if (categoryId) {
          return p.category_id === categoryId;
        }
        return true;
      });
  }, [products, search, categoryId]);



  const createTransaction = useCreateTransaction();
  const updateTransaction = useUpdateTransaction();
  const updateCustomer = useUpdateCustomer();

  // Auto-show products on load if screen is landscape (e.g., Galaxy Tab 7 mapping)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const isLandscape = window.innerWidth > window.innerHeight;
      if (isLandscape) {
        setShowProducts(true);
      }
    }
  }, []);



  const prevCartLengthRef = useRef(0);
  useEffect(() => {
    const prevLength = prevCartLengthRef.current;
    const currentLength = cart.length;
    prevCartLengthRef.current = currentLength;

    if (currentLength === 0 && prevLength > 0) {
      setDiscountDisplay("");
      setDiscountStr("");
      setDiscountNote("");
      setIsCustomDiscountNote(false);
    }
  }, [cart.length]);



  // Function to handle printing receipt
  const handlePrintReceipt = async (
    transaction: any,
    options?: { showSuccessNotification?: boolean; hideErrorNotification?: boolean }
  ) => {
    console.log('Starting print process...', transaction);

    const showError = (msg: string) => {
      if (!options?.hideErrorNotification) {
        void showPrinterNotConnectedNotification(msg);
      }
    };

    if (!isBluetoothAvailable()) {
      console.warn('Bluetooth plugin not available');
      showError('Plugin Bluetooth tidak tersedia di perangkat ini.');
      return;
    }

    const printerMac = getBluetoothPrinterMac();
    console.log('Printer MAC:', printerMac);

    if (!printerMac) {
      console.error('Printer MAC not set');
      showError('Alamat MAC printer belum diatur di pengaturan.');
      return;
    }

    setIsPrinting(true);
    try {
      // Prepare transaction data with store settings
      const activeOutletObj = outlets?.find(o => o.id.toString() === selectedOutlet);
      const showFooter = storeSettingsData?.show_footer ?? true;
      const printData = {
        ...transaction,
        storeName: storeSettingsData?.bluetooth_store_name || storeSettingsData?.name || 'EL PROJECT',
        storeAddress: storeSettingsData?.address || '',
        storePhone: storeSettingsData?.phone || '',
        footerMessage: showFooter ? (activeOutletObj?.footer_message || storeSettingsData?.footer_message || '') : '',
        footerMessage2: showFooter ? (activeOutletObj?.footer_message2 || storeSettingsData?.footer_message2 || '') : '',
        footerMessage3: showFooter ? (activeOutletObj?.footer_message3 || storeSettingsData?.footer_message3 || '') : '',
      };
      console.log('Print data prepared:', printData);

      // Connect to printer (auto connect if not connected)
      console.log('Connecting to printer...');
      const connectionResult = await connectToPrinter(printerMac);
      console.log('Connection result:', connectionResult);

      if (!connectionResult.success) {
        console.error('Connection failed:', connectionResult.message);
        showError(connectionResult.message);
        return;
      }

      // Add small delay to ensure connection is stable
      await new Promise(resolve => setTimeout(resolve, 500));

      // Print receipt
      console.log('Printing receipt...');
      const printed = await printReceipt(printData);
      console.log('Print result:', printed);

      if (!printed) {
        console.error('Print failed');
        showError('Gagal mencetak struk. Pastikan printer menyala dan terhubung.');
      } else if (options?.showSuccessNotification) {
        const invoiceId = transaction?.id ?? transaction?.transaction_id;
        void showPrintSuccessNotification(
          transaction?.total ?? 0,
          invoiceId != null ? formatInvoiceNumber(invoiceId) : undefined
        );
      }

      // Wait for print to complete before disconnecting
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Disconnect after printing to free up connection
      console.log('Disconnecting printer...');
      await disconnectPrinter();
      console.log('Printer disconnected');
    } catch (error) {
      console.error('Print error:', error);
      showError(error instanceof Error ? error.message : 'Terjadi kesalahan saat mencetak struk.');
      // Ensure disconnect on error
      try {
        await disconnectPrinter();
      } catch (disconnectError) {
        console.error('Error during disconnect:', disconnectError);
      }
    } finally {
      setIsPrinting(false);
    }
  };

  const getProductImageUrl = (product: any, size: 'small' | 'thumb' | 'full' = 'full'): string | null => {
    const imageUrl = product.image_url || product.imageUrl;
    if (!imageUrl) return null;

    let options = undefined;
    if (size === 'small') options = { width: 200, height: 200 };
    if (size === 'thumb') options = { width: 100, height: 100 };

    return getProductImageUrlFromStorage(imageUrl, options);
  };



  const handleAmountPaidChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const formattedValue = formatNumberWithDots(rawValue);
    setAmountPaidDisplay(formattedValue);
    setAmountPaidStr(formattedValue);
  };



  const addToCart = (product: any, selectedUnit?: { unit_name: string; conversion_factor: number; price?: number; discount_type?: string; discount_value?: number; label?: string; min_qty?: number; outlet_prices?: any }, qtyToAdd: number = 1) => {
    const unitName = selectedUnit?.unit_name || getBaseUnitName(product);
    const conversionFactor = selectedUnit?.conversion_factor || 1;
    const unitPrice = selectedUnit ? getUomPrice(selectedUnit, product) : getProductBasePrice(product) * conversionFactor;

    let uomDiscountAmount = 0;
    if (selectedUnit?.discount_type === 'amount') {
      // Threshold pricing: nilai diskon dibagi rata per unit
      uomDiscountAmount = (Number(selectedUnit.discount_value) || 0) / (selectedUnit.min_qty || 1);
    } else if (selectedUnit?.discount_type === 'percent') {
      uomDiscountAmount = unitPrice * ((Number(selectedUnit.discount_value) || 0) / 100);
    }

    const cartKey = `${product.id}_${unitName}`;

    if (product.stock_quantity !== undefined && product.stock_quantity !== null) {
      const conversionFactor = selectedUnit ? (selectedUnit.conversion_factor || 1) : 1;
      const totalPcsInCart = cart.reduce((acc, item) => {
        if (item.productId === product.id) {
          return acc + (item.quantity * item.conversionFactor);
        }
        return acc;
      }, 0);

      if (totalPcsInCart + (conversionFactor * qtyToAdd) > product.stock_quantity) {
        toast({ title: "Stok Tidak Cukup", description: `Sisa stok: ${Math.floor(product.stock_quantity - totalPcsInCart)} ${getBaseUnitName(product)}`, variant: "destructive" });
        return;
      }
    }

    const imageUrl = getProductImageUrl(product, 'thumb');

    const existing = cart.find(item => item.productId === product.id && item.unitName === unitName);
    const newQuantity = (existing?.quantity || 0) + qtyToAdd;

    const tempItem: CartItem = existing ? { ...existing, quantity: newQuantity } : {
      productId: product.id,
      productName: product.name,
      price: getProductBasePrice(product),
      quantity: newQuantity,
      imageUrl: imageUrl,
      unitName,
      conversionFactor,
      unitPrice,
      uomDiscountType: selectedUnit?.discount_type || 'none',
      uomDiscountAmount,
      uomMinQty: selectedUnit?.min_qty || 1,
      uomLabel: selectedUnit?.label || ''
    };

    const oldCalc = existing ? getCartItemPriceAndDiscount(existing) : { discount: 0, label: '' };
    const newCalc = getCartItemPriceAndDiscount(tempItem);

    if (newCalc.discount > 0 && newCalc.discount !== oldCalc.discount) {
      toast({
        title: "Promo Aktif!",
        description: newCalc.label ? `Promo ${newCalc.label} tercapai. Anda hemat ${formatRupiah(newCalc.discount * newQuantity)}` : `Diskon Grosir tercapai! Hemat ${formatRupiah(newCalc.discount * newQuantity)}`,
        duration: 2500,
        variant: "success",
      });
    } else {
      toast({
        title: product.name,
        description: `Ditambahkan ke keranjang (${unitName})`,
        duration: 1500,
        variant: "success",
      });
    }

    setCart(prev => {
      if (existing) {
        return prev.map(item =>
          (item.productId === product.id && item.unitName === unitName)
            ? { ...item, quantity: newQuantity }
            : item
        );
      }
      return [...prev, tempItem];
    });
  };

  const handleProductClick = (product: any) => {
    const uoms = product.uoms || [];
    const baseUnitName = getBaseUnitName(product);
    const nonPcsUoms = uoms.filter((u: any) => u.unit_name.toLowerCase() !== baseUnitName && u.conversion_factor > 1);
    const hasAnyDiscount = uoms.some((u: any) => u.discount_type !== 'none' && Number(u.discount_value) > 0);

    if (nonPcsUoms.length > 0 || hasAnyDiscount) {
      // Product has multiple units or has promo - show UOM selector so user can see details
      setUomSelectorProduct(product);
    } else {
      // Product only has base unit with no promo - open qty selector directly
      setQtyInput(1);
      setQtySelector({ product, uom: null });
    }
  };

  const updateQuantity = (productId: number, delta: number, unitName?: string) => {
    const product = posProducts.find((p: any) => p.id === productId);
    const actualUnitName = unitName || getBaseUnitName(product);
    const item = cart.find(i => i.productId === productId && i.unitName === actualUnitName);
    if (!item) return;

    const newQuantity = Math.max(1, item.quantity + delta);
    if (newQuantity === item.quantity) return;

    if (delta > 0) {
      const convFactor = item.conversionFactor || 1;
      if (product && product.stock_quantity !== undefined && product.stock_quantity !== null) {
        const totalPcsInCart = cart.reduce((acc, cartItem) => {
          if (cartItem.productId === product.id && cartItem.unitName !== actualUnitName) {
            return acc + (cartItem.quantity * cartItem.conversionFactor);
          }
          return acc;
        }, 0);

        if (totalPcsInCart + (newQuantity * convFactor) > product.stock_quantity) {
          toast({ title: "Stok Tidak Cukup", description: `Sisa stok: ${Math.floor(product.stock_quantity - totalPcsInCart)} ${getBaseUnitName(product)}`, variant: "destructive" });
          return;
        }
      }
    }

    const oldCalc = getCartItemPriceAndDiscount(item);
    const newCalc = getCartItemPriceAndDiscount({ ...item, quantity: newQuantity });

    if (newCalc.discount > 0 && newCalc.discount !== oldCalc.discount) {
      toast({
        title: "Promo Aktif!",
        description: newCalc.label ? `Promo ${newCalc.label} tercapai. Anda hemat ${formatRupiah(newCalc.discount * newQuantity)}` : `Diskon Grosir tercapai! Hemat ${formatRupiah(newCalc.discount * newQuantity)}`,
        duration: 2500,
        variant: "success",
      });
    } else if (newCalc.discount === 0 && oldCalc.discount > 0) {
      toast({
        title: "Promo Batal",
        description: "Kuantitas tidak lagi memenuhi syarat promo.",
        duration: 2500,
        variant: "destructive",
      });
    }

    setCart(prev => prev.map(i => {
      if (i.productId === productId && i.unitName === actualUnitName) {
        return { ...i, quantity: newQuantity };
      }
      return i;
    }));
  };

  const removeFromCart = (productId: number, unitName?: string) => {
    setCart(prev => prev.filter(item => {
      const product = posProducts.find((p: any) => p.id === productId);
      const actualUnitName = unitName || getBaseUnitName(product);
      return !(item.productId === productId && item.unitName === actualUnitName);
    }));
  };

  // Function untuk create pelanggan baru
  const createNewCustomer = async (name: string, phone: string, alamat: string, kecamatan: string, kabupaten: string, provinsi?: string, kelurahan?: string, kodepos?: string) => {
    try {
      const trimmedName = name.trim();
      const trimmedPhone = phone.trim();

      if (!trimmedName) {
        toast({ title: "Error", description: "Nama pelanggan wajib diisi", variant: "destructive" });
        return null;
      }

      // Generate ID Pelanggan otomatis dengan format CTM-00001
      const autoGeneratedId = await generateNextCustomerId();

      // Validasi outlet terhadap data outlets yang ada
      let outletIdToSave: number | null = null;
      if (user?.outletId && user.outletId !== "all") {
        const parsed = parseInt(user.outletId);
        if (!isNaN(parsed) && outlets?.some(o => o.id === parsed)) {
          outletIdToSave = parsed;
        }
      }

      const { data, error } = await supabase
        .from('customers')
        .insert({
          name: trimmedName,
          phone: trimmedPhone || null,
          sales_name: cashierName,
          customer_id_manual: autoGeneratedId,
          address: alamat.trim() || null,
          district: kecamatan.trim() || null,
          city: kabupaten.trim() || null,
          province: provinsi?.trim() || null,
          village: kelurahan?.trim() || null,
          postal_code: kodepos?.trim() || null,
          ...(outletIdToSave !== null ? { outlet_id: outletIdToSave } : {})
        })
        .select()
        .single();

      if (error) {
        console.error('Create customer error:', error);
        toast({ title: "Error", description: "Gagal membuat pelanggan baru", variant: "destructive" });
        return null;
      }

      await queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
      await refetchCustomers?.();

      return data;
    } catch (err) {
      console.error('Create customer error:', err);
      return null;
    }
  };

  const clearCart = () => {
    if (cart.length > 0) {
      setCart([]);
      setDiscountDisplay("");
      setDiscountStr("");
      setDiscountNote("");
      setIsCustomDiscountNote(false);
      setAmountPaidDisplay("");
      setAmountPaidStr("");
    }
  };

  // Function untuk update total belanja customer langsung di supabase
  const updateCustomerData = async (customerId: number, transactionTotal: number) => {
    return true;
  };

  const getCartItemPriceAndDiscount = (item: CartItem) => {
    const product = posProducts.find(p => p.id === item.productId);
    if (!product) {
      const activeDiscount = item.quantity >= (item.uomMinQty || 1) ? (item.uomDiscountAmount || 0) : 0;
      return { price: item.unitPrice, discount: activeDiscount, label: item.uomLabel };
    }

    const uoms = product.uoms || [];

    const matchingUoms = uoms.filter((u: any) => u.unit_name.toLowerCase() === item.unitName.toLowerCase());

    if (matchingUoms.length === 0) {
      const activeDiscount = item.quantity >= (item.uomMinQty || 1) ? (item.uomDiscountAmount || 0) : 0;
      return { price: item.unitPrice, discount: activeDiscount, label: item.uomLabel };
    }

    const eligibleUoms = matchingUoms.filter((u: any) => item.quantity >= (u.min_qty || 1));
    const activeUom = eligibleUoms.length > 0
      ? eligibleUoms.reduce((max: any, u: any) => (u.min_qty || 1) > (max.min_qty || 1) ? u : max, eligibleUoms[0])
      : matchingUoms.reduce((min: any, u: any) => (u.min_qty || 1) < (min.min_qty || 1) ? u : min, matchingUoms[0]);

    const basePrice = getUomPrice(activeUom, product);
    let discountAmountPerUnit = 0;
    if (item.quantity >= (activeUom.min_qty || 1)) {
      if (activeUom.discount_type === 'amount') {
        // Konsep Threshold: Diskon dibagi rata per unit, jadi saat qty naik, harga per unit tetap konsisten
        discountAmountPerUnit = (Number(activeUom.discount_value) || 0) / (activeUom.min_qty || 1);
      } else if (activeUom.discount_type === 'percent') {
        discountAmountPerUnit = basePrice * ((Number(activeUom.discount_value) || 0) / 100);
      }
    }

    return { price: basePrice, discount: discountAmountPerUnit, label: activeUom.label || '' };
  };

  const subtotal = useMemo(() => cart.reduce((sum, item) => {
    const { price, discount } = getCartItemPriceAndDiscount(item);
    return sum + ((price - discount) * item.quantity);
  }, 0), [cart, posProducts]);

  const tax = useMemo(() => {
    if (!enablePPN) return 0;
    return Math.round(subtotal * (ppnPercentage / 100));
  }, [subtotal, enablePPN, ppnPercentage]);

  // Global Discount Logic - reads from Supabase via discountSettingsData (reactive)
  const globalDiscountEnabled = discountSettingsData?.global_discount_enabled === true;
  const globalRules = globalDiscountEnabled && Array.isArray(discountSettingsData?.global_discount_rules)
    ? discountSettingsData.global_discount_rules
    : [];

  const { globalDiscountAmount, appliedGlobalDiscountPercent } = useMemo(() => {
    if (!globalDiscountEnabled || globalRules.length === 0) {
      return { globalDiscountAmount: 0, appliedGlobalDiscountPercent: 0 };
    }

    // Sort rules by minPurchase descending so we check highest tier first
    const sortedRules = [...globalRules].sort((a, b) => Number(b.minPurchase) - Number(a.minPurchase));

    for (const rule of sortedRules) {
      const minPurchase = Number(rule.minPurchase);
      const percent = Number(rule.percent);

      if (subtotal >= minPurchase) {
        return {
          globalDiscountAmount: Math.floor(subtotal * (percent / 100)),
          appliedGlobalDiscountPercent: percent
        };
      }
    }

    return { globalDiscountAmount: 0, appliedGlobalDiscountPercent: 0 };
  }, [globalDiscountEnabled, globalRules, subtotal]);

  // Hitung poin yang akan didapat dari pembelian saat ini
  const parsedDiscountPercent = parseFloat(discountPercentStr) || 0;
  const manualDiscount = enableDiscount
    ? (discountType === 'percent'
      ? Math.floor((subtotal - globalDiscountAmount) * (parsedDiscountPercent / 100))
      : parseNumberFromDots(discountStr))
    : 0;
  const discount = manualDiscount + globalDiscountAmount;
  const total = useMemo(() => Math.max(0, subtotal + tax - discount), [subtotal, tax, discount]);
  const amountPaid = parseNumberFromDots(amountPaidStr);
  const change = amountPaid > 0 ? amountPaid - total : 0;
  const discountNoteSelectValue = discountNote;

  const handleCheckout = async () => {
    if (isSubmitting) return;

    if (cart.length === 0) {
      toast({ title: "Error", description: "Keranjang belanja masih kosong", variant: "destructive" });
      return;
    }

    if (paymentType === "dp" && amountPaid >= total) {
      toast({ title: "Error", description: "Nominal cicilan harus kurang dari total tagihan", variant: "destructive" });
      return;
    }

    if (paymentType === "dp" && amountPaid <= 0) {
      toast({ title: "Error", description: "Nominal cicilan tidak boleh kosong", variant: "destructive" });
      return;
    }

    if (paymentType !== "lunas" && !dueDate) {
      toast({ title: "Error", description: "Tanggal jatuh tempo wajib diisi untuk transaksi Cicilan / Tempo", variant: "destructive" });
      return;
    }

    if (paymentType !== "lunas" && !customerId && !manualCustomerName.trim()) {
      toast({ title: "Error", description: "Pelanggan wajib dipilih atau diisi untuk transaksi hutang (Cicilan/Tempo)", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    // Create pelanggan baru dari input manual agar langsung masuk ke data pelanggan
    let finalCustomerId = customerId;
    const manualName = manualCustomerName.trim();
    const manualPhone = manualCustomerPhone.trim();
    const manualAddressValue = manualAddress.trim();
    const manualDistrictValue = manualDistrict.trim();
    const manualCityValue = manualCity.trim();
    const manualProvinceValue = manualProvince.trim();
    const manualVillageValue = manualVillage.trim();
    const manualPostalCodeValue = manualPostalCode.trim();

    if (!customerId && manualName) {
      const newCustomer = await createNewCustomer(manualName, manualPhone, manualAddressValue, manualDistrictValue, manualCityValue, manualProvinceValue, manualVillageValue, manualPostalCodeValue);
      if (newCustomer) {
        finalCustomerId = newCustomer.id;
        toast({ title: "Sukses", description: `Pelanggan baru "${newCustomer.name}" berhasil dibuat`, variant: "default" });
      } else {
        toast({ title: "Error", description: "Gagal membuat pelanggan baru, lanjutkan transaksi tanpa simpan customer", variant: "destructive" });
      }
    } else if (customerId && selectedCustomer) {
      // Check if user modified the pre-filled customer data
      if (
        manualName !== (selectedCustomer.name || "") ||
        manualPhone !== (selectedCustomer.phone || "") ||
        manualAddressValue !== (selectedCustomer.address || "") ||
        manualDistrictValue !== (selectedCustomer.district || "") ||
        manualCityValue !== (selectedCustomer.city || "") ||
        manualProvinceValue !== (selectedCustomer.province || "") ||
        manualVillageValue !== (selectedCustomer.village || "") ||
        manualPostalCodeValue !== (selectedCustomer.postal_code || "")
      ) {
        await new Promise((resolve) => {
          updateCustomer.mutate({
            id: customerId,
            data: {
              name: manualName || selectedCustomer.name,
              phone: manualPhone,
              address: manualAddressValue,
              district: manualDistrictValue,
              city: manualCityValue,
              province: manualProvinceValue,
              village: manualVillageValue,
              postal_code: manualPostalCodeValue
            }
          }, {
            onSuccess: resolve,
            onError: (err: any) => {
              console.error("Gagal mengupdate pelanggan", err);
              resolve(null);
            }
          });
        });
      }
    }

    const receiptCustomerName = manualName || selectedCustomer?.name || "Umum";

    let finalAmountPaid = total;
    let finalRemaining = 0;
    let paymentStatus = "paid";

    if (paymentType === "tempo") {
      finalAmountPaid = 0;
      finalRemaining = total;
      paymentStatus = "unpaid";
    } else if (paymentType === "dp") {
      finalAmountPaid = amountPaid;
      finalRemaining = total - amountPaid;
      paymentStatus = "partial";
    }

    let validOutletId: number | null = null;
    const parsedOutlet = selectedOutlet !== "all" ? parseInt(selectedOutlet) : NaN;
    if (!isNaN(parsedOutlet) && outlets?.some(o => o.id === parsedOutlet)) {
      validOutletId = parsedOutlet;
    }

    const payloadCashierName = isEditMode && editTransactionData?.cashier_name ? editTransactionData.cashier_name : cashierName;

    const adminDiscountNote = (enableDiscount && discountType === 'percent' && parsedDiscountPercent > 0)
      ? `Diskon Admin ${parsedDiscountPercent}%`
      : (enableDiscount && manualDiscount > 0) ? 'Diskon Admin' : '';

    let finalDiscountNoteParts = [];
    if (globalDiscountAmount > 0) finalDiscountNoteParts.push(`Diskon Global ${appliedGlobalDiscountPercent}%`);
    if (adminDiscountNote) finalDiscountNoteParts.push(adminDiscountNote);
    if (discountNoteSelectValue) finalDiscountNoteParts.push(discountNoteSelectValue);

    const finalDiscountNote = finalDiscountNoteParts.join(' + ');

    const transactionPayload = {
      data: {
        customerId: finalCustomerId,
        cashierName: payloadCashierName,
        paymentMethod: paymentMethod as any,
        outletId: validOutletId,
        discount,
        discountNote: finalDiscountNote,
        amountPaid: finalAmountPaid,
        remainingBalance: finalRemaining,
        paymentStatus: paymentStatus,
        dueDate: paymentType !== "lunas" ? new Date(dueDate).toISOString() : undefined,
        subtotal: subtotal,
        tax: tax,
        change: paymentType === "lunas" ? change : 0,
        customerName: receiptCustomerName !== "Umum" ? receiptCustomerName : undefined,
        customerPhone: selectedCustomer?.phone || manualCustomerPhone || undefined,
        pointsRedeemed: 0,
        pointsDiscount: 0,
        earnedPoints: 0,
        items: cart.map(item => {
          const { price, discount } = getCartItemPriceAndDiscount(item);
          return {
            product_id: item.productId,
            productName: item.productName,
            quantity: item.quantity * item.conversionFactor,
            price: (price - discount) / item.conversionFactor,
            originalPrice: price / item.conversionFactor,
            discountAmount: discount / item.conversionFactor,
            cost_price: 0,
            total: (price - discount) * item.quantity,
            unitName: item.unitName,
            unitQty: item.quantity,
            conversionFactor: item.conversionFactor
          };
        })
      }
    };

    const mutationOptions = {
      onSuccess: async (res: any) => {
        // Update customer data langsung (total_spent)
        if (isEditMode && editTransactionData) {
          const oldTotal = (editTransactionData.subtotal || 0) + (editTransactionData.tax || 0) - (editTransactionData.discount || 0);
          if (finalCustomerId === editTransactionData.customer_id) {
            // Same customer, update by difference
            const diff = total - oldTotal;
            if (finalCustomerId && diff !== 0) {
              await updateCustomerData(finalCustomerId, diff);
            }
          } else {
            // Customer changed
            if (editTransactionData.customer_id && oldTotal > 0) {
              await updateCustomerData(editTransactionData.customer_id, -oldTotal);
            }
            if (finalCustomerId && total > 0) {
              await updateCustomerData(finalCustomerId, total);
            }
          }
        } else {
          // New transaction
          if (finalCustomerId && total > 0) {
            await updateCustomerData(finalCustomerId, total);
          }
        }
        await refetchCustomers?.();

        const mappedItems = cart.map(item => {
          const { price, discount, label } = getCartItemPriceAndDiscount(item);
          return {
            ...item,
            unitPrice: price,
            uomDiscountAmount: discount,
            uomMinQty: 1,
            uomLabel: label
          };
        });

        setLastTransaction({
          ...res,
          cashierName: payloadCashierName,
          cashier_name: payloadCashierName,
          items: mappedItems,
          subtotal,
          tax,
          discount,
          discountNote,
          globalDiscountAmount,
          appliedGlobalDiscountPercent,
          manualDiscount,
          parsedDiscountPercent,
          discountType,
          total,
          amountPaid: finalAmountPaid,
          change,
          paymentMethod,
          payment_status: paymentStatus,
          remaining_balance: finalRemaining,
          enablePPN,
          ppnPercentage,
          customerName: receiptCustomerName,
          customerPhone: selectedCustomer?.phone || manualCustomerPhone,
          pointsRedeemed: 0,
          pointsDiscount: 0,
          earnedPoints: 0,
          finalCustomerPoints: 0,
          pointsValue: 0
        });
        setShowReceipt(true);

        // Auto print if enabled
        if (getAutoPrintSetting()) {
          const transactionData = {
            ...res,
            cashierName: payloadCashierName,
            cashier_name: payloadCashierName,
            items: mappedItems,
            subtotal,
            tax,
            discount,
            discountNote,
            globalDiscountAmount,
            appliedGlobalDiscountPercent,
            manualDiscount,
            parsedDiscountPercent,
            discountType,
            total,
            amountPaid: finalAmountPaid,
            change,
            paymentMethod,
            payment_status: paymentStatus,
            remaining_balance: finalRemaining,
            enablePPN,
            ppnPercentage,
            customerName: receiptCustomerName,
            customerPhone: selectedCustomer?.phone || manualCustomerPhone,
            pointsRedeemed: 0,
            pointsDiscount: 0,
            earnedPoints: 0,
            finalCustomerPoints: 0,
            pointsValue: 0,
            createdAt: res?.created_at || new Date().toISOString()
          };
          handlePrintReceipt(transactionData, { hideErrorNotification: true });
        }
        setCart([]);
        setCustomerId(undefined);
        setManualCustomerName("");
        setManualCustomerPhone("");
        setManualAddress("");
        setManualDistrict("");
        setManualCity("");
        setPaymentMethod("cash");
        setAmountPaidDisplay("");
        setAmountPaidStr("");
        setDiscountDisplay("");
        setDiscountStr("");
        setDiscountNote("");
        setIsCustomDiscountNote(false);
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });

        // Dispatch custom event for realtime updates across the app
        window.dispatchEvent(new CustomEvent('transactionCreated', {
          detail: { transactionId: res?.id, cashierName: payloadCashierName }
        }));
        queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });

        void showTransactionSuccessNotification(
          total,
          res?.id != null ? formatInvoiceNumber(res.id) : undefined
        );
        setIsSubmitting(false);

        if (isEditMode) {
          // Tutup mode edit otomatis dengan kembali ke daftar transaksi
          setLocation(`/transactions?view=${res?.id || editId}`);
        }
      },
      onError: (error: any) => {
        setIsSubmitting(false);
        toast({ title: "Error", description: error?.message || "Gagal menyimpan transaksi", variant: "destructive" });
      }
    };

    if (isEditMode) {
      updateTransaction.mutate({ transactionId: editId, ...transactionPayload }, mutationOptions);
    } else {
      createTransaction.mutate(transactionPayload, mutationOptions);
    }
  };

  const selectedCustomer = customers?.find(c => c.id === customerId);
  const filteredCustomers = customers?.filter(c => {
    if (!customerSearchQuery) return true;
    if (customerSearchQuery.length < 3) return false;
    const query = customerSearchQuery.toLowerCase();
    const phone = String(c.phone || '').toLowerCase();
    return (
      c.name?.toLowerCase().includes(query) ||
      phone.includes(query)
    );
  });



  return (
    <Sidebar>
      <div className="flex flex-col lg:flex-row h-full w-full bg-slate-100 dark:bg-slate-900">
        {/* Left Panel: Products */}
        <div className="flex-[3] flex flex-col min-w-0 lg:flex-[7] order-1 z-10">

          {/* Edit Mode Banner */}
          {isEditMode && (
            <div className="bg-amber-100 text-amber-900 p-2 text-sm font-medium text-center shadow-sm">
              <AlertTriangle className="w-4 h-4 inline-block mb-0.5 mr-2" />
              Mode Edit Transaksi #{editTransactionData?.id ? formatInvoiceNumber(editTransactionData.id) : editId}{editTransactionData?.cashier_name ? ` - ${editTransactionData.cashier_name}` : ''}
            </div>
          )}

          {/* Search dan Filter Section - SELALU DI ATAS untuk semua device */}
          <div className="p-3 lg:p-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 space-y-2 lg:space-y-3 shadow-md flex-shrink-0">
            {/* Search Input and Outlet Filter Wrapper */}
            <div className="flex flex-col sm:flex-row gap-2 pt-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-4 h-4 lg:w-4 lg:h-4" />
                <Input
                  placeholder="Cari produk..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    // Tampilkan produk saat user mengetik 3+ karakter, sembunyikan jika kurang (hanya jika portrait)
                    if (e.target.value.length >= 3) {
                      setShowProducts(true);
                    } else {
                      if (typeof window !== "undefined" && window.innerWidth <= window.innerHeight) {
                        setShowProducts(false);
                      }
                    }
                  }}
                  className="pl-9 h-11 lg:h-12 text-sm lg:text-lg shadow-md border-primary/20 focus:border-primary"
                />
              </div>



            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide pt-2">
              {/* Toggle Button - Simple Circle */}
              <Button
                onClick={() => {
                  if (categoryId !== undefined) {
                    // Jika kategori terpilih, reset kategori tapi tetap tampilkan produk
                    setCategoryId(undefined);
                  } else {
                    // Jika tidak ada kategori, toggle tampilan produk
                    setShowProducts(!showProducts);
                  }
                }}
                className="rounded-full w-9 h-9 lg:w-10 lg:h-10 p-0 shrink-0 flex items-center justify-center"
                variant={categoryId !== undefined || showProducts ? "default" : "outline"}
                size="sm"
              >
                <Circle className="w-4 h-4" fill="currentColor" />
              </Button>

              {categories?.map(cat => (
                <Button
                  key={cat.id}
                  variant={categoryId === cat.id ? "default" : "outline"}
                  onClick={() => {
                    setCategoryId(cat.id);
                    setShowProducts(true); // Tampilkan produk saat kategori diklik
                  }}
                  className="rounded-full whitespace-nowrap shrink-0 text-xs lg:text-sm px-3"
                  size="sm"
                >
                  {cat.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Product Grid - Conditional Display */}
          {showProducts && (
            <ScrollArea className="flex-1 p-4">
              {isLoadingProducts ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-5 gap-2 md:gap-4">
                  {[...Array(12)].map((_, i) => (
                    <div key={i} className="aspect-square bg-slate-200 dark:bg-slate-700 animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : posProducts?.length === 0 ? (
                <div></div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-5 gap-2 md:gap-4">
                  {posProducts?.map(product => {
                    const imageUrl = getProductImageUrl(product, 'small');
                    return (
                      <div
                        key={product.id}
                        className="p-[3px] rounded-sm hover:scale-105 transition-transform duration-200 cursor-pointer"
                        onClick={() => handleProductClick(product)}
                      >
                        <Card
                          className="rounded-sm overflow-hidden active:scale-95 flex flex-col h-full"
                        >
                          <div className="aspect-square w-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center relative">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={product.name}
                                className="w-full h-full object-cover mb-2"
                                loading="lazy"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  const parent = e.currentTarget.parentElement;
                                  if (parent) {
                                    const icon = parent.querySelector('.product-fallback-icon');
                                    if (icon) icon.classList.remove('hidden');
                                  }
                                }}
                              />
                            ) : null}
                            <Package
                              className={`w-6 h-6 lg:w-10 lg:h-10 text-slate-300 dark:text-slate-600 ${imageUrl ? 'hidden' : ''} product-fallback-icon`}
                            />
                            {isAdmin && (
                              <Badge className="absolute top-1 right-1 bg-white/90 text-slate-800 border-none font-bold shadow-sm">
                                Stok: {product.stock_quantity}
                              </Badge>
                            )}
                          </div>
                          <div className="p-1.5 lg:p-3 flex flex-col flex-1">
                            <p className="font-bold text-[10px] lg:text-xs truncate leading-tight mb-0.5 flex-1 text-slate-800">{product.name}</p>
                            <p className="font-bold text-[10px] lg:text-xs text-primary dark:text-primary-400">{formatRupiah(getProductBasePrice(product))}</p>
                          </div>
                        </Card>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          )}
        </div>

        {/* Right Panel: Cart */}
        <div className="w-full lg:flex-[3] flex flex-col bg-white dark:bg-slate-800 shadow-xl z-10 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-700 flex-1 lg:h-full order-2 pb-16 lg:pb-0">
          <div className="flex-1 overflow-y-auto scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {/* Cart Header */}
            <div className="p-4 lg:p-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <h2 className="font-medium text-base flex items-center gap-2 text-slate-700">
                  <ShoppingCart className="w-5 h-5 lg:w-4 lg:h-4 text-primary" />
                  Pesanan Aktif
                </h2>
                <div className="flex items-center gap-2">
                  <Badge className="font-medium text-xs lg:text-xs bg-primary text-primary-foreground hover:bg-primary/90 rounded-none">
                    {cart.reduce((sum, item) => sum + item.quantity, 0)} item
                  </Badge>
                  {cart.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearCart}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Cart Items with Images */}
            <div className="p-4 lg:p-3">
              {cart.length === 0 ? (
                <div className="flex items-center justify-center text-slate-400 dark:text-slate-500 py-6">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">Belum ada produk di pilih</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cart.map(item => (
                    <div key={`${item.productId}_${item.unitName}`} className="flex items-center gap-2 lg:gap-2 p-3 lg:p-2 rounded-sm border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                      <div className="w-14 h-14 lg:w-16 lg:h-16 rounded-sm bg-slate-200 dark:bg-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.productName}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const parent = e.currentTarget.parentElement;
                              if (parent) {
                                const icon = parent.querySelector('.cart-item-icon');
                                if (icon) icon.classList.remove('hidden');
                              }
                            }}
                          />
                        ) : null}
                        <Package className={`w-4 h-4 lg:w-5 lg:h-5 text-slate-400 dark:text-slate-500 ${item.imageUrl ? 'hidden' : ''} cart-item-icon`} />
                      </div>

                      <div className="flex-1 min-w-0 pr-2">
                        <p className="font-bold text-xs lg:text-sm leading-snug text-slate-800 dark:text-slate-200 break-words line-clamp-2">
                          <span className="text-primary">{item.quantity} {item.unitName}</span> {item.productName}
                        </p>
                        <div className="flex flex-col mt-1">
                          {(() => {
                            const { price, discount, label } = getCartItemPriceAndDiscount(item);
                            const finalPrice = price - discount;
                            const totalItemPrice = finalPrice * item.quantity;

                            return (
                              <>
                                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                  @ {formatRupiah(finalPrice)} {discount > 0 ? <span className="line-through opacity-70 ml-1">{formatRupiah(price)}</span> : null}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <p className="font-bold text-[13px] lg:text-sm text-emerald-600 dark:text-emerald-400">
                                    {formatRupiah(totalItemPrice)}
                                  </p>
                                  {label && (
                                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[9px] px-1.5 py-0 h-4 font-semibold border-0 whitespace-nowrap">
                                      🏷️ {label}
                                    </Badge>
                                  )}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 lg:gap-2">
                        <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-sm p-0.5">
                          <button
                            onClick={() => updateQuantity(item.productId, -1, item.unitName)}
                            className="w-5 h-5 lg:w-6 lg:h-6 flex items-center justify-center rounded-sm hover:bg-slate-100 dark:hover:bg-slate-700 active:bg-slate-200 dark:active:bg-slate-600 text-slate-600 dark:text-slate-300 transition-colors"
                          >
                            <Minus className="w-2.5 h-2.5 lg:w-3 lg:h-3" />
                          </button>
                          <span className="w-4 text-center text-xs font-medium text-slate-700">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.productId, 1, item.unitName)}
                            className="w-5 h-5 lg:w-6 lg:h-6 flex items-center justify-center rounded-sm hover:bg-slate-100 dark:hover:bg-slate-700 active:bg-slate-200 dark:active:bg-slate-600 text-slate-600 dark:text-slate-300 transition-colors"
                          >
                            <Plus className="w-2.5 h-2.5 lg:w-3 lg:h-3" />
                          </button>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.productId, item.unitName)}
                          className="text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1"
                        >
                          <X className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Customer Selector */}
            <div className="px-4 lg:px-3 pb-4 lg:pb-3">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-normal text-primary uppercase tracking-wider">CARI PELANGGAN</label>
                <div className="relative">
                  <Input
                    value={selectedCustomer ? formatCustomerLabel(selectedCustomer) : customerSearchQuery}
                    onChange={(e) => {
                      setCustomerSearchQuery(e.target.value);
                      setShowCustomerDropdown(true);
                      if (!e.target.value) {
                        setCustomerId(undefined);
                      }
                    }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                    placeholder="Cari pelanggan member..."
                    className="h-10 lg:h-9 rounded-sm"
                  />
                  {showCustomerDropdown && customerSearchQuery && (
                    <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-sm shadow-lg max-h-60 overflow-auto">
                      {isLoadingCustomers ? (
                        <div className="p-3 text-sm text-slate-500 dark:text-slate-400 font-normal">Memuat...</div>
                      ) : customers && customers.length > 0 ? (
                        <>
                          {filteredCustomers?.map(c => (
                            <div
                              key={c.id}
                              onClick={() => {
                                setCustomerId(c.id);
                                setManualCustomerName(c.name || "");
                                setManualCustomerPhone(c.phone ? String(c.phone) : "");
                                setManualAddress(c.address || "");
                                setManualDistrict(c.district || "");
                                setManualCity(c.city || "");
                                setManualProvince(c.province || "");
                                setManualVillage(c.village || "");
                                setManualPostalCode(c.postal_code || "");
                                setManualCustomerId(c.customer_id_manual || "");
                                // Reset wilayah IDs so auto-select useEffects can fire
                                setPosSelectedProvId("");
                                setPosSelectedKabId("");
                                setPosSelectedKecId("");
                                setCustomerSearchQuery("");
                                setShowCustomerDropdown(false);
                              }}
                              className="flex items-center gap-2 p-3 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-700 last:border-b-0"
                            >
                              <span className="flex-1 truncate text-slate-900 dark:text-slate-100">{formatCustomerLabel(c)}</span>
                            </div>
                          ))}
                          {filteredCustomers?.length === 0 && (
                            <div className="p-3 text-sm text-slate-500 dark:text-slate-400 font-normal">Tidak ada pelanggan ditemukan</div>
                          )}
                        </>
                      ) : (
                        <div className="p-3 text-sm text-slate-500 dark:text-slate-400 font-normal">Tidak ada pelanggan</div>
                      )}
                    </div>
                  )}
                </div>

                {selectedCustomer && (
                  <button
                    onClick={() => {
                      setCustomerId(undefined);
                      setCustomerSearchQuery("");
                      setManualCustomerName("");
                      setManualCustomerPhone("");
                      setManualAddress("");
                      setManualDistrict("");
                      setManualCity("");
                      setManualProvince("");
                      setManualVillage("");
                      setManualPostalCode("");
                      setManualCustomerId("");
                      setPosSelectedProvId("");
                      setPosSelectedKabId("");
                      setPosSelectedKecId("");
                    }}
                    className="text-xs text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 underline"
                  >
                    Hapus pelanggan terpilih
                  </button>
                )}
              </div>
            </div>

            {/* Manual Customer Input */}
            <div className="px-4 lg:px-3 pb-4 lg:pb-3">
              <div className="flex flex-col gap-3 lg:gap-2">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-normal text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nama Pelanggan</label>
                  <Input
                    value={manualCustomerName}
                    onChange={(e) => {
                      setManualCustomerName(e.target.value);
                      setManualCustomerName(e.target.value);
                    }}
                    placeholder="Masukkan nama pelanggan"
                    className="h-10 lg:h-9 rounded-sm"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-normal text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nomor Telepon</label>
                  <Input
                    value={manualCustomerPhone}
                    onChange={(e) => setManualCustomerPhone(e.target.value)}
                    placeholder="Masukkan nomor telepon"
                    className="h-10 lg:h-9 rounded-sm"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-normal text-slate-500 dark:text-slate-400 uppercase tracking-wider">Alamat Lengkap</label>
                  <Input
                    value={manualAddress}
                    onChange={(e) => setManualAddress(e.target.value)}
                    placeholder="Masukkan alamat"
                    className="h-10 lg:h-9 rounded-sm"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-normal text-slate-500 dark:text-slate-400 uppercase tracking-wider">Provinsi</label>
                  <SearchableSelect
                    options={posProvinces}
                    value={posSelectedProvId}
                    onChange={(id, name) => {
                      setPosSelectedProvId(id);
                      setPosSelectedKabId("");
                      setPosSelectedKecId("");
                      setManualProvince(name);
                      setManualCity("");
                      setManualDistrict("");
                      setManualVillage("");
                      setManualPostalCode("");
                    }}
                    placeholder="Pilih Provinsi..."
                    loading={isLoadingPosProv}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-normal text-slate-500 dark:text-slate-400 uppercase tracking-wider">Kota / Kab</label>
                    <SearchableSelect
                      options={posRegencies}
                      value={posSelectedKabId}
                      onChange={(id, name) => {
                        setPosSelectedKabId(id);
                        setPosSelectedKecId("");
                        setManualCity(name);
                        setManualDistrict("");
                        setManualVillage("");
                        setManualPostalCode("");
                      }}
                      placeholder="Kota/Kabupaten..."
                      loading={isLoadingPosKab}
                      disabled={!posSelectedProvId}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-normal text-slate-500 dark:text-slate-400 uppercase tracking-wider">Kecamatan</label>
                    <SearchableSelect
                      options={posDistricts}
                      value={posSelectedKecId}
                      onChange={(id, name) => {
                        setPosSelectedKecId(id);
                        setManualDistrict(name);
                        setManualVillage("");
                        setManualPostalCode("");
                      }}
                      placeholder="Kecamatan..."
                      loading={isLoadingPosKec}
                      disabled={!posSelectedKabId}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-normal text-slate-500 dark:text-slate-400 uppercase tracking-wider">Kelurahan</label>
                    <SearchableSelect
                      options={posVillages}
                      value={posVillages.find((v: any) => v.name === manualVillage)?.id || ""}
                      onChange={(_id, name) => {
                        setManualVillage(name);
                        // Auto-fetch postal code
                        fetch(`https://kodepos.vercel.app/search?q=${name}`)
                          .then(res => res.json())
                          .then(resData => {
                            if (resData && resData.data && resData.data.length > 0) {
                              const match = resData.data.find((d: any) => d.district.toLowerCase() === manualDistrict?.toLowerCase()) || resData.data[0];
                              setManualPostalCode(match.code.toString());
                            }
                          })
                          .catch(err => console.error("Gagal mengambil kodepos", err));
                      }}
                      placeholder="Kelurahan..."
                      loading={isLoadingPosKel}
                      disabled={!posSelectedKecId}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-normal text-slate-500 dark:text-slate-400 uppercase tracking-wider">Kode Pos</label>
                    <Input
                      value={manualPostalCode}
                      onChange={(e) => setManualPostalCode(e.target.value)}
                      placeholder="Kodepos"
                      className="h-10 lg:h-9 rounded-sm"
                    />
                  </div>
                </div>
              </div>
            </div>



            {/* Admin Discount */}
            {enableDiscount && (
              <div className="px-4 lg:px-3 pb-4 lg:pb-3 border-b border-slate-200 dark:border-slate-700 mb-4">
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-normal text-slate-500 dark:text-slate-400 uppercase tracking-wider">Diskon Admin</label>
                  </div>

                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={discountPercentStr}
                      onChange={(e) => setDiscountPercentStr(e.target.value)}
                      placeholder="0"
                      className="pr-8 h-10 lg:h-9 rounded-sm"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 font-medium text-sm">%</span>
                  </div>

                  {manualDiscount > 0 && (
                    <div className="mt-1">
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-none px-2 py-1 w-full justify-center text-sm font-medium">
                        Potongan: - {formatRupiah(manualDiscount)}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tipe Pembayaran */}
            <div className="px-4 lg:px-3 pb-4 lg:pb-3">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-normal text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tipe Pembayaran</label>
                <Select
                  value={paymentType}
                  onValueChange={(val: "lunas" | "dp" | "tempo") => {
                    setPaymentType(val);
                    if (val === "lunas") {
                      setDueDate("");
                    } else if (val === "tempo") {
                      setAmountPaidStr("0");
                      setAmountPaidDisplay("0");
                    }
                  }}
                >
                  <SelectTrigger className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-sm">
                    <SelectValue placeholder="Pilih Tipe Pembayaran" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lunas">Lunas</SelectItem>
                    <SelectItem value="dp">Cicilan</SelectItem>
                    <SelectItem value="tempo">Tempo Penuh</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Outlet Selector (Only for Admin/Semua Cabang) */}
            {(isAdmin || !user?.outletId || user.outletId === 'all') && (
              <div className="px-4 lg:px-3 pb-4 lg:pb-3">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-normal text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cabang Transaksi</label>
                  <Select value={selectedOutlet} onValueChange={setSelectedOutlet}>
                    <SelectTrigger className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-sm">
                      <SelectValue placeholder="Pilih Cabang Transaksi" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Cabang (Pusat)</SelectItem>
                      {outlets?.map((outlet: any) => (
                        <SelectItem key={outlet.id} value={outlet.id.toString()}>
                          {outlet.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Payment Method */}
            <div className="px-4 lg:px-3 pb-4 lg:pb-3">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-normal text-slate-500 dark:text-slate-400 uppercase tracking-wider">Metode Pembayaran</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setPaymentMethod("cash")}
                    className={`flex flex-col items-center justify-center p-2 rounded-sm border-2 transition-all ${paymentMethod === "cash" ? "border-primary bg-primary/5 text-primary dark:bg-primary-900/20 dark:border-primary-400 dark:text-primary-300" : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"}`}
                  >
                    <Banknote className="w-4 h-4 lg:w-5 lg:h-5 mb-1" />
                    <span className="text-[10px] font-medium">Tunai</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod("transfer")}
                    className={`flex flex-col items-center justify-center p-2 rounded-sm border-2 transition-all ${paymentMethod === "transfer" ? "border-primary bg-primary/5 text-primary dark:bg-primary-900/20 dark:border-primary-400 dark:text-primary-300" : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"}`}
                  >
                    <CreditCard className="w-4 h-4 lg:w-5 lg:h-5 mb-1" />
                    <span className="text-[10px] font-medium">Transfer</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod("qris")}
                    className={`flex flex-col items-center justify-center p-2 rounded-sm border-2 transition-all ${paymentMethod === "qris" ? "border-primary bg-primary/5 text-primary dark:bg-primary-900/20 dark:border-primary-400 dark:text-primary-300" : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"}`}
                  >
                    <QrCode className="w-4 h-4 lg:w-5 lg:h-5 mb-1" />
                    <span className="text-[10px] font-medium">QRIS</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Cash Input / DP Input */}
            {paymentType === "dp" && (
              <div className="px-4 lg:px-3 pb-4 lg:pb-3">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs font-normal text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block">
                      Nominal Cicilan
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 font-medium text-sm">Rp</span>
                      <Input
                        type="text"
                        value={amountPaidDisplay}
                        onChange={handleAmountPaidChange}
                        className="pl-9 h-10 rounded-sm border font-bold text-sm"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-normal text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block">Sisa Hutang</label>
                    <div className={`h-10 rounded-sm border flex items-center px-3 font-bold text-sm bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400`}>
                      {formatRupiah(Math.max(0, total - amountPaid))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Jatuh Tempo Date Input */}
            {paymentType !== "lunas" && (
              <div className="px-4 lg:px-3 pb-4 lg:pb-3">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-normal text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tanggal Jatuh Tempo</label>
                  <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={`w-full justify-between text-left font-medium h-10 px-3 border border-slate-200 dark:border-slate-800 rounded-sm bg-white dark:bg-slate-900 ${!dueDate ? "text-slate-400" : "text-slate-900 dark:text-slate-100"
                          }`}
                      >
                        {dueDate ? (
                          new Date(dueDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
                        ) : (
                          <span>Pilih Tanggal</span>
                        )}
                        <CalendarRange className="w-4 h-4 text-slate-400" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-sm shadow-lg" align="start">
                      <Calendar
                        mode="single"
                        selected={dueDate ? new Date(dueDate) : undefined}
                        onSelect={(date) => {
                          if (date) {
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            setDueDate(`${year}-${month}-${day}`);
                          } else {
                            setDueDate("");
                          }
                          setIsCalendarOpen(false);
                        }}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}



            {/* Summary */}
            <div className="px-4 lg:px-3 pb-4 lg:pb-3">
              <div className="bg-slate-100 dark:bg-slate-900 rounded-sm p-4 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{formatRupiah(subtotal)}</span>
                </div>
                {globalDiscountAmount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-500">
                    <span>Diskon Global ({appliedGlobalDiscountPercent}%)</span>
                    <span className="font-medium">- {formatRupiah(globalDiscountAmount)}</span>
                  </div>
                )}
                {manualDiscount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-500">
                    <span>Diskon Admin {discountType === 'percent' && parsedDiscountPercent > 0 ? `(${parsedDiscountPercent}%)` : ''}</span>
                    <span className="font-medium">- {formatRupiah(manualDiscount)}</span>
                  </div>
                )}
                {tax > 0 && (
                  <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
                    <span>PPN ({ppnPercentage}%)</span>
                    <span className="font-medium">+ {formatRupiah(tax)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                  <span className="font-medium text-slate-700 dark:text-slate-200">TOTAL</span>
                  <span className="text-xl font-bold text-primary dark:text-primary-400">{formatRupiah(total)}</span>
                </div>
              </div>
            </div>

            {/* Checkout Button */}
            <div className="px-4 lg:px-3 pb-12 lg:pb-3 flex gap-2">
              {isEditMode && (
                <Button
                  className="h-12 text-base font-medium rounded-sm"
                  size="lg"
                  variant="outline"
                  onClick={() => {
                    setLocation('/transactions');
                  }}
                  disabled={isSubmitting || createTransaction.isPending || updateTransaction.isPending}
                >
                  Batal
                </Button>
              )}
              <Button
                className="flex-1 h-12 text-base font-medium shadow-lg rounded-sm"
                size="lg"
                disabled={
                  isSubmitting ||
                  cart.length === 0 ||
                  createTransaction.isPending ||
                  updateTransaction.isPending ||
                  (paymentType === "dp" && (amountPaid <= 0 || amountPaid >= total))
                }
                onClick={handleCheckout}
              >
                {createTransaction.isPending || updateTransaction.isPending ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Memproses...
                  </div>
                ) : isEditMode ? (
                  "SIMPAN PERUBAHAN"
                ) : (
                  "BAYAR SEKARANG"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Receipt Dialog */}
      <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
        <DialogContent className="dark:bg-slate-800 max-h-[120vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-center flex flex-col items-center gap-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
              Transaksi Berhasil
            </DialogTitle>
            <DialogDescription className="text-center text-slate-600 dark:text-slate-400">
              Terima kasih atas pembelian Anda
            </DialogDescription>
          </DialogHeader>

          <div className="border-t border-dashed border-slate-200 dark:border-slate-700 w-full" />

          {/* Scrollable Content - Hidden Scrollbar */}
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="rounded-sm space-y-2 font-mono text-sm">
              {/* Header - Store Name Centered */}
              <div className="text-center mb-3">
                <p className="font-bold text-base text-slate-900 dark:text-slate-100">
                  {storeSettingsData?.name || 'EL PROJECT'}
                </p>
                {(() => {
                  const address = storeSettingsData?.address;
                  return address && typeof address === 'string' && address.trim() ? (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5 whitespace-pre-wrap">
                      {address}
                    </p>
                  ) : null;
                })()}
              </div>

              {/* Date/Time - Invoice Row */}
              <div className="flex justify-between items-start border-b border-slate-200 dark:border-slate-700 pb-2 mb-2">
                <div className="text-left">
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                    {lastTransaction?.createdAt ? new Date(lastTransaction.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
                    {lastTransaction?.createdAt ? new Date(lastTransaction.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium font-mono">
                    {lastTransaction?.id ? formatInvoiceNumber(lastTransaction.id) : "INV-"}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">{cashierName}</p>
                </div>
              </div>

              {/* Customer Info */}
              {lastTransaction?.customerName && (
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500 dark:text-slate-400">Pelanggan</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">{lastTransaction.customerName}</span>
                </div>
              )}

              {lastTransaction?.items?.map((item: any, idx: number) => {
                const activeDiscount = item.quantity >= (item.uomMinQty || 1) ? (item.uomDiscountAmount || 0) : 0;
                const itemPrice = item.unitPrice - activeDiscount;
                return (
                  <div key={idx} className="mb-2 break-inside-avoid">
                    <div className="font-bold">{item.productName}</div>
                    <div className="flex justify-between items-start">
                      <div>
                        <div>{item.quantity} {item.unitName} x {formatRupiah(item.unitPrice)}</div>
                        {activeDiscount > 0 && (
                          <div className="text-[10px] text-slate-600 mt-0.5 italic">
                            Diskon: -{formatRupiah(activeDiscount * item.quantity)} {item.uomLabel ? `(${item.uomLabel})` : ''}
                          </div>
                        )}
                      </div>
                      <p className="font-bold text-slate-900 dark:text-slate-100">{formatRupiah(item.quantity * itemPrice)}</p>
                    </div>
                  </div>
                );
              })}

              <div className="border-t border-dashed border-slate-200 dark:border-slate-700 pt-2 mt-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-400">Metode</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{getPaymentMethodLabel(lastTransaction?.paymentMethod || '')}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
                  <span className="text-slate-700 dark:text-slate-300">{formatRupiah(lastTransaction?.subtotal || 0)}</span>
                </div>

                {lastTransaction?.enablePPN && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Pajak ({lastTransaction?.ppnPercentage || 11}%)</span>
                    <span className="text-slate-700 dark:text-slate-300">{formatRupiah(lastTransaction?.tax || 0)}</span>
                  </div>
                )}
                {(lastTransaction?.globalDiscountAmount || 0) > 0 && (
                  <div className="flex justify-between text-xs text-emerald-600 dark:text-emerald-500">
                    <span>Diskon Global ({lastTransaction?.appliedGlobalDiscountPercent}%)</span>
                    <span>-{formatRupiah(lastTransaction?.globalDiscountAmount)}</span>
                  </div>
                )}
                {(lastTransaction?.manualDiscount || 0) > 0 && (
                  <div className="flex justify-between text-xs text-emerald-600 dark:text-emerald-500">
                    <span>Diskon Admin {lastTransaction?.discountType === 'percent' && lastTransaction?.parsedDiscountPercent > 0 ? `(${lastTransaction.parsedDiscountPercent}%)` : ''}</span>
                    <span>-{formatRupiah(lastTransaction?.manualDiscount)}</span>
                  </div>
                )}
                {(lastTransaction?.discount || 0) > 0 && !(lastTransaction?.globalDiscountAmount > 0 || lastTransaction?.manualDiscount > 0) && (
                  <div className="flex justify-between text-xs text-red-600 dark:text-red-400">
                    <span>Diskon {lastTransaction?.discountNote && `(${lastTransaction.discountNote})`}</span>
                    <span>-{formatRupiah(lastTransaction?.discount || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base pt-2">
                  <span className="text-slate-700 dark:text-slate-200">TOTAL</span>
                  <span className="text-slate-900 dark:text-slate-100">{formatRupiah(lastTransaction?.total || 0)}</span>
                </div>
                {lastTransaction?.payment_status === 'partial' ? (
                  <>
                    <div className="flex justify-between text-xs pt-2">
                      <span className="text-slate-500 dark:text-slate-400">Cicilan ({getPaymentMethodLabel(lastTransaction?.paymentMethod || '')})</span>
                      <span className="text-slate-700 dark:text-slate-300">{formatRupiah(lastTransaction?.amountPaid || lastTransaction?.amount_paid || 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold text-amber-600 dark:text-amber-400">
                      <span>Kekurangan Pembayaran</span>
                      <span>{formatRupiah(lastTransaction?.remaining_balance || 0)}</span>
                    </div>
                  </>
                ) : lastTransaction?.payment_status === 'unpaid' ? (
                  <div className="flex justify-between text-xs font-bold text-amber-600 dark:text-amber-400 pt-2">
                    <span>Kekurangan Pembayaran</span>
                    <span>{formatRupiah(lastTransaction?.remaining_balance || 0)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between text-xs pt-2">
                    <span className="text-slate-500 dark:text-slate-400">Metode Pembayaran</span>
                    <span className="text-slate-700 dark:text-slate-300 font-bold">{getPaymentMethodLabel(lastTransaction?.paymentMethod || '')}</span>
                  </div>
                )}

              </div>
            </div>
          </div>

          <DialogFooter className="sm:justify-center gap-2 mt-2">
            <Button
              onClick={() => handlePrintReceipt(lastTransaction, { showSuccessNotification: true })}
              disabled={isPrinting}
              variant="outline"
              className="w-full sm:flex-1 rounded-sm"
            >
              {isPrinting ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Mencetak...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Printer className="w-4 h-4" />
                  Print
                </div>
              )}
            </Button>
            <Button
              onClick={() => setShowReceipt(false)}
              className="w-full sm:flex-1 rounded-sm"
            >
              Selesai
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* UOM Selector Dialog */}
      <Dialog open={!!uomSelectorProduct} onOpenChange={(open) => !open && setUomSelectorProduct(null)}>
        <DialogContent className="sm:max-w-md sm:rounded-sm">
          <DialogHeader className="flex flex-col items-center justify-center text-center sm:text-center">
            <DialogTitle className="text-base font-bold">
              Pilih Satuan
            </DialogTitle>
            <DialogDescription className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">
              {uomSelectorProduct?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            {uomSelectorProduct && (() => {
              const uoms = [...(uomSelectorProduct.uoms || [])];
              const hasBaseUnit = uoms.some(u => u.conversion_factor === 1 || u.is_default);
              if (!hasBaseUnit) {
                uoms.unshift({
                  unit_name: 'pcs',
                  conversion_factor: 1,
                  price: null,
                  discount_type: 'none',
                  discount_value: 0
                });
              }

              return uoms.map((uom: any, idx: number) => {
                const unitPrice = getUomPrice(uom, uomSelectorProduct);
                const minQty = uom.min_qty || 1;

                const totalBeforeDiscount = unitPrice * minQty;
                let totalDiscount = 0;

                if (uom.discount_type === 'amount') {
                  totalDiscount = Number(uom.discount_value) || 0;
                } else if (uom.discount_type === 'percent') {
                  totalDiscount = totalBeforeDiscount * ((Number(uom.discount_value) || 0) / 100);
                }

                const totalAfterDiscount = Math.max(0, totalBeforeDiscount - totalDiscount);

                return (
                  <button
                    key={`${uom.unit_name}_${idx}`}
                    onClick={() => {
                      setQtyInput(minQty);
                      setQtySelector({ product: uomSelectorProduct, uom });
                      setUomSelectorProduct(null);
                    }}
                    className="flex items-center justify-between p-3 rounded-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200 active:scale-[0.98] group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center text-[8px] font-bold uppercase">
                        {uom.unit_name.slice(0, 3)}
                      </div>
                      <div className="text-left">
                        <div className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                          {minQty} <span className="capitalize">{uom.unit_name}</span>
                        </div>
                        {uom.conversion_factor > 1 && (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">1 {uom.unit_name} = {uom.conversion_factor} {getBaseUnitName(uomSelectorProduct)}</div>
                        )}
                        {uom.label && (
                          <div className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 mt-0.5">🏷️ {uom.label}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      {totalDiscount > 0 ? (
                        <div className="text-right">
                          <div className="text-[10px] text-slate-400 line-through mb-0.5">{formatRupiah(totalBeforeDiscount)}</div>
                          <div className="font-bold text-sm text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-700">{formatRupiah(totalAfterDiscount)}</div>
                        </div>
                      ) : (
                        <div className="font-bold text-sm text-slate-900 dark:text-slate-100">{formatRupiah(totalBeforeDiscount)}</div>
                      )}
                    </div>
                  </button>
                );
              });
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* QTY Selector Dialog */}
      <Dialog open={!!qtySelector} onOpenChange={(open) => !open && setQtySelector(null)}>
        <DialogContent className="sm:max-w-sm sm:rounded-sm">
          <DialogHeader className="flex flex-col items-center justify-center text-center sm:text-center">
            <DialogTitle className="text-base font-bold">
              Masukkan Jumlah
            </DialogTitle>
            <DialogDescription className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 flex flex-col items-center justify-center gap-1.5">
              <span className="text-center">{qtySelector?.product?.name}</span>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                {qtySelector?.uom?.unit_name || 'pcs'}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setQtyInput(prev => Math.max(1, prev - 1))}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Input
                type="number"
                className="w-24 text-center font-bold text-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={qtyInput}
                onChange={(e) => setQtyInput(parseInt(e.target.value) || 1)}
                min={1}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setQtyInput(prev => prev + 1)}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {/* Quick amount buttons */}
            <div className="grid grid-cols-4 gap-2">
              {[5, 10, 20, 50].map(amount => (
                <Button
                  key={amount}
                  variant="secondary"
                  size="sm"
                  onClick={() => setQtyInput(amount)}
                  className="text-xs"
                >
                  {amount}
                </Button>
              ))}
            </div>

            <Button
              className="w-full mt-2"
              onClick={() => {
                if (qtySelector) {
                  addToCart(qtySelector.product, qtySelector.uom, qtyInput);
                  setQtySelector(null);
                }
              }}
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              Tambah
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}