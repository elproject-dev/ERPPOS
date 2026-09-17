import { useState, useRef, useEffect, useMemo } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { useListProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, useListCategories, useCreateCategory, useUpdateCategory, useDeleteCategory, getListProductsQueryKey, getListCategoriesQueryKey, useListOutlets, useCreateStockMovement, useListStockMovements, useDeleteStockMovement, useDeleteAllStockMovements, useBulkSaveProductUoms, useDiscountSettings, useUpdateDiscountSettings } from "@workspace/api-client-react";
import { formatRupiah } from "@/lib/formatters";
import { CachedImage } from "@/components/ui/cached-image";
import { compressImage } from "@/lib/image-utils";


import { uploadProductImage, deleteProductImage, deleteProductImageByName, getProductImageUrl } from "@/lib/supabase-storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Edit, Trash2, Package, FolderPlus, Upload, X, Image as ImageIcon, Store, Tag, AlertTriangle, SlidersHorizontal, ArrowUpDown, Clock, Layers, Archive, CheckCircle, Ruler, ChevronLeft, ChevronRight, Download, Percent, MoreVertical, Eye, Pencil } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ActionMenu } from "@/components/ui/action-menu";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import * as XLSX from "xlsx-js-style";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { ADMIN_EMAIL } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { exportToExcel } from "@/components/excel-export/excel-export";

const formatNumberWithDots = (value: string): string => {
  const cleanValue = value.replace(/\./g, '').replace(/[^0-9]/g, '');
  if (!cleanValue) return '';
  return cleanValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

const parseNumberFromDots = (value: string): number => {
  return parseInt(value.replace(/\./g, '')) || 0;
};

export default function ProductsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Check if user is admin (only elproject.dev@gmail.com)
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const [search, setSearch] = useState("");
  const [selectedOutlet, setSelectedOutlet] = useState<string>(() => {
    // Admin with assigned outlet should filter to their outlet, not see all
    if (isAdmin && user?.outletId && user.outletId !== "all") {
      return user.outletId;
    }
    return isAdmin ? "all" : (user?.outletId || "all");
  });

  // Force outlet to always match user assignment
  useEffect(() => {
    if (!isAdmin) {
      setSelectedOutlet(user?.outletId || "all");
    } else if (user?.outletId && user.outletId !== "all") {
      // Admin with assigned outlet should use their outlet, not "all"
      setSelectedOutlet(user.outletId);
    }
  }, [isAdmin, user?.outletId]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: outlets } = useListOutlets();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<string>("newest");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  const { data: products, isLoading, refetch: refetchProducts } = useListProducts({
    search: search.length > 2 ? search : undefined,
    outletId: selectedOutlet,
    categoryId: selectedCategory === "all" ? undefined : selectedCategory,
    adminView: isAdmin
  });

  const sortedProducts = useMemo(() => {
    if (!products) return [];
    const sorted = [...products];

    if (sortOrder === "oldest") {
      sorted.sort((a, b) => a.id - b.id);
    } else if (sortOrder === "nameAsc") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortOrder === "nameDesc") {
      sorted.sort((a, b) => b.name.localeCompare(a.name));
    } else {
      sorted.sort((a, b) => b.id - a.id);
    }

    return sorted;
  }, [products, sortOrder]);

  const paginatedProducts = useMemo(() => {
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    return sortedProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [sortedProducts, page]);


  useEffect(() => {
    setPage(1);
  }, [search, selectedOutlet, selectedCategory, sortOrder]);

  const { data: categories, refetch: refetchCategories } = useListCategories({ outletId: selectedOutlet });

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRestockDialogOpen, setIsRestockDialogOpen] = useState(false);
  const [restockItems, setRestockItems] = useState<{ productId: string, quantity: number }[]>([{ productId: "", quantity: 1 }]);
  const createStockMovement = useCreateStockMovement();
  const bulkSaveUoms = useBulkSaveProductUoms();

  // UOM State for Add/Edit Dialog
  const [uomRows, setUomRows] = useState<any[]>([]);
  // Quick Restock UOM
  const [quickRestockUnit, setQuickRestockUnit] = useState<string>('pcs');
  const [quickRestockConversion, setQuickRestockConversion] = useState<number>(1);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteProductInfo, setDeleteProductInfo] = useState<{ id: number, name: string } | null>(null);
  const [isDeleteCategoryDialogOpen, setIsDeleteCategoryDialogOpen] = useState(false);
  const [deleteCategoryInfo, setDeleteCategoryInfo] = useState<{ id: number, name: string } | null>(null);
  const [detailProduct, setDetailProduct] = useState<any>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryOutlets, setNewCategoryOutlets] = useState<string[]>(["all"]);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [showCategoryOutlets, setShowCategoryOutlets] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);

  // Tab & Stock Management States
  const [activeTab, setActiveTab] = useState<'products' | 'stock' | 'discounts' | 'history' | 'global-discount'>('products');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'out' | 'low' | 'available'>('all');
  const [quickRestockProduct, setQuickRestockProduct] = useState<any>(null);
  const [quickRestockQty, setQuickRestockQty] = useState<number>(10);
  const [quickRestockNote, setQuickRestockNote] = useState<string>("Restock Manual Cepat");

  // Discount Modal State
  const [isDiscountDialogOpen, setIsDiscountDialogOpen] = useState(false);
  const [discountProduct, setDiscountProduct] = useState<any>(null);
  const [discountHpp, setDiscountHpp] = useState<string>(""); // HPP input for discount dialog

  // Global Discount Settings State
  const { data: discountSettingsData } = useDiscountSettings();
  const updateDiscountSettings = useUpdateDiscountSettings();
  const [isGlobalDiscountDialogOpen, setIsGlobalDiscountDialogOpen] = useState(false);
  const [globalDiscountEnabled, setGlobalDiscountEnabled] = useState(false);
  const [isGlobalDiscountFormOpen, setIsGlobalDiscountFormOpen] = useState(false);
  const [editingGlobalDiscountIndex, setEditingGlobalDiscountIndex] = useState<number | null>(null);
  const [globalDiscountFormData, setGlobalDiscountFormData] = useState({ minPurchase: '', percent: '' });
  const [globalDiscountRules, setGlobalDiscountRules] = useState<{ minPurchase: string, percent: string }[]>([{ minPurchase: '', percent: '' }]);
  const [globalDiscountLoaded, setGlobalDiscountLoaded] = useState(false);

  // Initialize global discount form from DB when loaded
  useEffect(() => {
    if (discountSettingsData && !globalDiscountLoaded) {
      setGlobalDiscountEnabled(discountSettingsData.global_discount_enabled ?? false);
      const rules = discountSettingsData.global_discount_rules;
      if (Array.isArray(rules) && rules.length > 0) {
        setGlobalDiscountRules(rules.map((r: any) => ({
          minPurchase: r.minPurchase ? formatNumberWithDots(r.minPurchase.toString()) : '',
          percent: r.percent ? r.percent.toString() : ''
        })));
      }
      setGlobalDiscountLoaded(true);
    }
  }, [discountSettingsData, globalDiscountLoaded]);

  // Stock stats calculation from currently loaded products list
  const stockStats = useMemo(() => {
    if (!products) return { totalItems: 0, totalStock: 0, outOfStock: 0, lowStock: 0 };
    let totalStock = 0;
    let outOfStock = 0;
    let lowStock = 0;

    products.forEach((p: any) => {
      const stock = p.stock_quantity || 0;
      totalStock += stock;
      if (stock <= 0) {
        outOfStock++;
      } else if (stock < 20) {
        lowStock++;
      }
    });

    return {
      totalItems: products.length,
      totalStock,
      outOfStock,
      lowStock
    };
  }, [products]);

  // Filtered products list for the stock table
  const filteredStockProducts = useMemo(() => {
    if (!sortedProducts) return [];
    return sortedProducts.filter((product: any) => {
      const stock = product.stock_quantity || 0;
      if (stockStatusFilter === 'out') return stock <= 0;
      if (stockStatusFilter === 'low') return stock > 0 && stock < 20;
      if (stockStatusFilter === 'available') return stock >= 20;
      return true;
    });
  }, [sortedProducts, stockStatusFilter]);

  const paginatedStockProducts = useMemo(() => {
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    return filteredStockProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredStockProducts, page]);

  const handleNextPage = () => {
    const len = activeTab === 'stock' ? filteredStockProducts.length : sortedProducts.length;
    if (page * ITEMS_PER_PAGE < len) {
      setPage(p => p + 1);
    }
  };

  const handlePrevPage = () => {
    if (page > 1) {
      setPage(p => p - 1);
    }
  };

  const [imagePreview, setImagePreview] = useState<string>("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalData, setOriginalData] = useState<any>(null);

  const [formData, setFormData] = useState({
    name: "",
    price: "",
    categoryId: "",
    allowedOutlets: ["all"] as string[],
    imageUrl: "",
    isActive: true,
    stockQuantity: "",
    outletPrices: {} as Record<string, string>
  });

  // Handle price input with auto-formatting dots
  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const formattedValue = formatNumberWithDots(rawValue);
    setFormData(prev => ({ ...prev, price: formattedValue }));
    setHasChanges(true);
  };

  const handleOpenDialog = (product?: any) => {
    if (product) {
      setEditingProduct(product);
      const storedImageUrl = product.image_url || "";
      const storedAllowedOutlets = product.allowed_outlets || (product.outlet_id ? [product.outlet_id.toString()] : ["all"]);
      const initialData = {
        name: product.name,
        price: formatNumberWithDots(product.price?.toString() || ""),
        categoryId: product.categoryId?.toString() || product.category_id?.toString() || "",
        allowedOutlets: storedAllowedOutlets,
        imageUrl: storedImageUrl,
        isActive: product.isActive,
        stockQuantity: product.stock_quantity ? formatNumberWithDots(product.stock_quantity.toString()) : "",
        outletPrices: (() => {
          const prices: Record<string, string> = {};
          if (product.outlet_prices) {
            Object.entries(product.outlet_prices).forEach(([key, val]) => {
              prices[key] = formatNumberWithDots(String(val));
            });
          }
          return prices;
        })()
      };
      setFormData(initialData);
      setOriginalData(initialData);
      setHasChanges(false);
      if (storedImageUrl) {
        setImagePreview(getProductImageUrl(storedImageUrl));
      } else {
        setImagePreview("");
      }
      setImageFile(null);
      // UOM logic moved to the discount dialog
    } else {
      setEditingProduct(null);
      setFormData({ name: "", price: "", categoryId: "", allowedOutlets: ["all"], imageUrl: "", isActive: true, stockQuantity: "", outletPrices: {} });
      setOriginalData(null);
      setHasChanges(false);
      setImagePreview("");
      setImageFile(null);
      setUomRows([]);
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingProduct(null);
    setImagePreview("");
    setImageFile(null);
    setIsUploading(false);
    setFormData({ name: "", price: "", categoryId: "", allowedOutlets: ["all"], imageUrl: "", isActive: true, stockQuantity: "", outletPrices: {} });
    setOriginalData(null);
    setHasChanges(false);
    setUomRows([]);
  };

  const handleOpenDiscountDialog = (product: any) => {
    setDiscountProduct(product);
    let existingUoms = product.uoms || [];

    // Ensure base unit exists
    const hasBaseUnit = existingUoms.some((u: any) => u.conversion_factor === 1 || u.is_default);
    if (!hasBaseUnit) {
      existingUoms = [{ unit_name: 'pcs', conversion_factor: 1, price: null, is_default: true }, ...existingUoms];
    }

    // Group existing UOMs by unit_name
    const groups: { [key: string]: any } = {};
    existingUoms.forEach((u: any) => {
      const name = u.unit_name.toLowerCase().trim();
      if (!groups[name]) {
        groups[name] = {
          unit_name: u.unit_name,
          conversion_factor: u.conversion_factor,
          price: u.price ? formatNumberWithDots(Math.round(Number(u.price)).toString()) : '',
          is_default: u.is_default || false,
          is_base_unit: u.conversion_factor === 1 || u.is_default,
          outletPrices: (() => {
            const prices: { [key: string]: string } = {};
            if (u.outlet_prices && typeof u.outlet_prices === 'object') {
              Object.entries(u.outlet_prices).forEach(([key, val]: [string, any]) => {
                if (val) prices[key] = formatNumberWithDots(String(Math.round(Number(val))));
              });
            }
            return prices;
          })(),
          tiers: []
        };
      }
      groups[name].tiers.push({
        discount_type: u.discount_type || 'none',
        discount_value: u.discount_value ? Number(u.discount_value).toString() : '',
        min_qty: u.min_qty || 1,
        label: u.label || ''
      });
    });

    const groupedRows = Object.values(groups).map((group: any) => {
      if (group.tiers.length === 0) {
        group.tiers.push({
          discount_type: 'none',
          discount_value: '',
          min_qty: 1,
          label: ''
        });
      }
      // Sort to keep tiers in order of min_qty ascending
      group.tiers.sort((a: any, b: any) => Number(a.min_qty) - Number(b.min_qty));
      return group;
    });

    setUomRows(groupedRows);
    setHasChanges(false);
    // Load existing HPP from product data
    setDiscountHpp(product.hpp ? formatNumberWithDots(Math.round(Number(product.hpp)).toString()) : '');
    setIsDiscountDialogOpen(true);
  };

  const handleCloseDiscountDialog = () => {
    setIsDiscountDialogOpen(false);
    setDiscountProduct(null);
    setUomRows([]);
    setDiscountHpp("");
    setHasChanges(false);
  };

  const handleSaveDiscounts = async () => {
    if (!discountProduct) return;

    const uomsToSave: any[] = [];

    uomRows.forEach((group: any) => {
      // Build outlet_prices for this UOM group
      const outletPricesNumeric: { [key: string]: number } = {};
      if (group.outletPrices) {
        Object.entries(group.outletPrices).forEach(([key, val]: [string, any]) => {
          const num = parseNumberFromDots(String(val));
          if (num > 0) outletPricesNumeric[key] = num;
        });
      }

      uomsToSave.push({
        unit_name: group.unit_name.toLowerCase().trim(),
        conversion_factor: Number(group.conversion_factor) || 1,
        price: group.price ? parseNumberFromDots(group.price) : null,
        is_default: group.is_default,
        discount_type: 'none',
        discount_value: 0,
        min_qty: 1,
        label: null,
        outlet_prices: outletPricesNumeric
      });
    });

    const hppValue = parseNumberFromDots(discountHpp);

    try {
      // Save HPP to product record
      await new Promise<void>((resolve, reject) => {
        updateProduct.mutate({
          id: discountProduct.id,
          data: {
            name: discountProduct.name,
            price: discountProduct.price,
            isActive: discountProduct.isActive ?? discountProduct.is_active ?? true,
            allowedOutlets: discountProduct.allowed_outlets || ['all'],
            hpp: hppValue > 0 ? hppValue : null,
            outletPrices: discountProduct.outlet_prices || {}
          }
        }, {
          onSuccess: () => resolve(),
          onError: (err: any) => reject(err)
        });
      });

      // Save UOMs
      bulkSaveUoms.mutate({ productId: discountProduct.id, uoms: uomsToSave }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          refetchProducts();
          toast({ title: "Sukses", description: "Pengaturan HPP, satuan & diskon disimpan" });
          handleCloseDiscountDialog();
        },
        onError: (error: any) => {
          toast({ title: "Error", description: error?.message || "Gagal menyimpan pengaturan", variant: "destructive" });
        }
      });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Gagal menyimpan HPP", variant: "destructive" });
    }
  };

  const handleToggleOutletActive = (product: any, currentIsAvailable: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAdmin || selectedOutlet === "all") return;

    let newAllowedOutlets = [...(product.allowed_outlets || ['all'])];

    if (currentIsAvailable) {
      // Deactivate it for this outlet
      if (newAllowedOutlets.includes('all')) {
        const allOutlets = outlets?.map(o => o.id.toString()) || [];
        newAllowedOutlets = allOutlets.filter(id => id !== selectedOutlet);
      } else {
        newAllowedOutlets = newAllowedOutlets.filter(id => id !== selectedOutlet);
      }
    } else {
      // Activate it for this outlet
      if (!newAllowedOutlets.includes('all') && !newAllowedOutlets.includes(selectedOutlet)) {
        newAllowedOutlets.push(selectedOutlet);
      }
    }

    if (newAllowedOutlets.length === 0) {
      toast({ title: "Perhatian", description: "Produk harus tersedia minimal di satu cabang.", variant: "destructive" });
      return;
    }

    updateProduct.mutate({
      id: product.id,
      data: {
        name: product.name,
        price: product.price,
        isActive: product.isActive ?? product.is_active ?? true,
        allowedOutlets: newAllowedOutlets
      }
    }, {
      onSuccess: () => {
        toast({ title: "Sukses", description: `Produk berhasil di${currentIsAvailable ? 'nonaktifkan' : 'aktifkan'} untuk cabang ini.` });
        refetchProducts();
      },
      onError: () => toast({ title: "Error", description: "Gagal mengubah status cabang.", variant: "destructive" })
    });
  };

  const handleFormChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
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
        setHasChanges(true);

        const reader = new FileReader();
        reader.onload = (e) => {
          setImagePreview(e.target?.result as string);
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
    if (formData.imageUrl) {
      deleteProductImage(formData.imageUrl);
    }
    setImageFile(null);
    setImagePreview("");
    setFormData(prev => ({ ...prev, imageUrl: "" }));
    setHasChanges(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast({ title: "Error", description: "Nama produk harus diisi", variant: "destructive" });
      return;
    }

    const priceValue = parseNumberFromDots(formData.price);
    if (!formData.price || priceValue <= 0) {
      toast({ title: "Error", description: "Harga harus diisi dengan angka valid", variant: "destructive" });
      return;
    }

    const isUpdate = !!editingProduct;
    const hasDataChanges = hasChanges;
    const hasNewImage = !!imageFile;

    if (isUpdate && !hasDataChanges && !hasNewImage) {
      toast({ title: "Info", description: "Tidak ada perubahan untuk disimpan" });
      return;
    }

    setIsUploading(true);

    try {
      // --- Duplicate Product Check Removed ---
      let finalImageUrl = formData.imageUrl;

      if (imageFile) {
        const productName = formData.name.trim();
        const uploadResult = await uploadProductImage(imageFile, productName);

        if (!uploadResult.success) {
          toast({ title: "Error", description: uploadResult.error || "Gagal upload gambar", variant: "destructive" });
          setIsUploading(false);
          return;
        }

        finalImageUrl = uploadResult.filePath || "";
      }

      const outletPricesClean: Record<string, number> = {};
      Object.entries(formData.outletPrices).forEach(([key, val]) => {
        if (val) {
          const num = parseNumberFromDots(val);
          if (num > 0) outletPricesClean[key] = num;
        }
      });

      const payload = {
        name: formData.name,
        price: priceValue,
        categoryId: (formData.categoryId === "none" || formData.categoryId === "") ? null : parseInt(formData.categoryId),
        allowedOutlets: formData.allowedOutlets,
        imageUrl: finalImageUrl,
        isActive: formData.isActive,
        stockQuantity: parseNumberFromDots(formData.stockQuantity || '0') || 0,
        outletPrices: outletPricesClean
      };

      // UOM logic moved to its own dialog

      if (isUpdate) {
        updateProduct.mutate({ id: editingProduct.id, data: payload }, {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
            refetchProducts();
            toast({ title: "Sukses", description: "Produk diperbarui" });
            handleCloseDialog();
          },
          onError: (error: any) => {
            toast({ title: "Error", description: error?.message || "Gagal memperbarui produk", variant: "destructive" });
            setIsUploading(false);
          }
        });
      } else {
        createProduct.mutate({ data: payload }, {
          onSuccess: (data: any) => {
            queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
            refetchProducts();
            toast({ title: "Sukses", description: "Produk ditambahkan" });
            handleCloseDialog();
          },
          onError: (error: any) => {
            toast({ title: "Error", description: error?.message || "Gagal menambahkan produk", variant: "destructive" });
            setIsUploading(false);
          }
        });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "Terjadi kesalahan", variant: "destructive" });
      setIsUploading(false);
    }
  };

  const handleDelete = (id: number) => {
    const product = products?.find((p: any) => p.id === id);
    if (product) {
      setDeleteProductInfo({ id: product.id, name: product.name });
      setIsDeleteDialogOpen(true);
    }
  };

  const executeDeleteProduct = () => {
    if (!deleteProductInfo) return;

    const product = products?.find((p: any) => p.id === deleteProductInfo.id);
    const imageUrl = product?.image_url;
    const productName = product?.name;

    deleteProduct.mutate({ id: deleteProductInfo.id }, {
      onSuccess: async () => {
        try {
          if (imageUrl) {
            const deleteRes = await deleteProductImage(imageUrl);
            if (!deleteRes.success) {
              console.warn("Gagal menghapus foto di Supabase:", deleteRes.error);
              toast({ title: "Warning", description: "Produk terhapus, tapi foto mungkin masih tersisa di server.", variant: "destructive" });
            }
          } else {
            // Coba hapus berdasarkan nama jika URL tidak ada tapi mungkin ada sisa file lama
            const deleteResName = await deleteProductImageByName(productName);
            if (!deleteResName.success && !deleteResName.error?.includes('not found')) {
              console.warn("Gagal menghapus foto lama di Supabase:", deleteResName.error);
            }
          }
        } catch (err) {
          console.error("Error saat menghapus foto:", err);
        }
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        refetchProducts();
        toast({ title: "Sukses", description: "Produk dihapus" });
        setIsDeleteDialogOpen(false);
        setDeleteProductInfo(null);
      },
      onError: () => {
        toast({ title: "Error", description: "Gagal menghapus produk", variant: "destructive" });
        setIsDeleteDialogOpen(false);
        setDeleteProductInfo(null);
      }
    });
  };

  const handleExportUomExcel = async () => {
    if (!sortedProducts || sortedProducts.length === 0) {
      toast({ title: "Error", description: "Tidak ada data produk untuk diekspor", variant: "destructive" });
      return;
    }

    try {
      const excelData: any[] = [];
      sortedProducts.forEach((product: any) => {
        const uoms = product.uoms || [];
        // Ensure base unit exists in export
        let exportUoms = [...uoms];
        const hasBaseUnit = exportUoms.some((u: any) => u.conversion_factor === 1 || u.is_default);
        if (!hasBaseUnit) {
          exportUoms = [{ unit_name: 'pcs', conversion_factor: 1, price: product.price, is_default: true, min_qty: 1, discount_type: 'none', discount_value: '' }, ...exportUoms];
        }

        exportUoms.forEach((uom: any) => {
          const hppDasar = product.cost_price || product.hpp || 0;
          const hppSatuan = Number(hppDasar) * Number(uom.conversion_factor || 1);
          const basePrice = Number(uom.price || product.price || 0);
          const discVal = Number(uom.discount_value || 0);

          const rowData: any = {
            "Nama Produk": product.name,
            "Kategori": categories?.find((c: any) => c.id === product.category_id || c.id === product.categoryId)?.name || "Tanpa Kategori",
            "Satuan": uom.unit_name,
            "Konversi": uom.conversion_factor,
            "HPP / Modal": hppSatuan,
            "Harga Satuan Qty": basePrice,
            "Min.beli(Qty)": uom.min_qty || 1,
            "/": uom.unit_name,
            "Diskon %": uom.discount_type === 'percentage' ? discVal : (discVal > 0 ? discVal : 0),
          };

          // Tambahkan harga per area
          outlets.forEach((outlet: any) => {
            const outletPrice = Number((uom.outlet_prices && uom.outlet_prices[outlet.id])
              ? uom.outlet_prices[outlet.id]
              : basePrice);
            rowData[`Harga (${outlet.name})`] = outletPrice;
          });

          rowData["Label Diskon"] = uom.label || "-";

          excelData.push(rowData);
        });
      });

      const worksheet = XLSX.utils.json_to_sheet(excelData);

      const wscols = [
        { wch: 35 }, { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 8 }, { wch: 12 }
      ];
      outlets.forEach(() => { wscols.push({ wch: 18 }); });
      wscols.push({ wch: 20 });
      worksheet["!cols"] = wscols;

      const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:J1");
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const address = XLSX.utils.encode_cell({ c: C, r: R });
          if (!worksheet[address]) continue;

          let alignStr = "left";
          if (C === 0 || C === 1) alignStr = "left";
          else if (C === 2 || C === 3) alignStr = "center";
          else if (C === 4 || C === 5) alignStr = "right"; // HPP & Harga Satuan
          else if (C === 6 || C === 7 || C === 8) alignStr = "center"; // Min beli, /, Diskon
          else if (C === range.e.c) alignStr = "right"; // Label Diskon
          else alignStr = "right"; // Outlets

          let cellStyle: any = {
            alignment: { horizontal: alignStr, vertical: "center" }
          };

          if (R === 0) {
            cellStyle.font = { bold: true, color: { rgb: "FFFFFF" } };
            cellStyle.fill = { fgColor: { rgb: "4F46E5" } };
          } else {
            if (worksheet[address].t === 'n') {
              worksheet[address].z = '#,##0';
            }
          }

          worksheet[address].s = { ...(worksheet[address].s || {}), ...cellStyle };
        }
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Satuan & Diskon");

      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `Data_Satuan_Diskon_${dateStr}.xlsx`;

      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

      const fallbackShare = () => {
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
        const file = new File([blob], fileName, { type: blob.type });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({
            files: [file],
            title: 'Data Satuan & Diskon',
          }).then(() => {
            toast({ title: "Berhasil", description: "File Excel berhasil dibagikan" });
          }).catch((err) => {
            console.error("Error sharing:", err);
            XLSX.writeFile(workbook, fileName);
            toast({ title: "Berhasil", description: "File Excel berhasil diunduh" });
          });
        } else {
          XLSX.writeFile(workbook, fileName);
          toast({ title: "Berhasil", description: "File Excel berhasil diunduh" });
        }
      };

      if ((window as any).Capacitor && (window as any).Capacitor.isNativePlatform()) {
        import('@capacitor/filesystem').then(async ({ Filesystem, Directory }) => {
          try {
            const { Share } = await import('@capacitor/share');
            const uint8Array = new Uint8Array(excelBuffer);
            let binary = '';
            const chunkSize = 8192;
            for (let i = 0; i < uint8Array.length; i += chunkSize) {
              const chunk = uint8Array.subarray(i, i + chunkSize);
              binary += String.fromCharCode.apply(null, chunk as any);
            }
            const base64Data = btoa(binary);
            const result = await Filesystem.writeFile({
              path: fileName,
              data: base64Data,
              directory: Directory.Cache
            });
            await Share.share({
              title: 'Data Satuan & Diskon',
              text: 'Berikut adalah data satuan & diskon produk',
              url: result.uri,
              dialogTitle: 'Bagikan Data'
            });
            toast({ title: "Berhasil", description: "Data siap dibagikan." });
          } catch (err) {
            console.error("Capacitor Share Error:", err);
            fallbackShare();
          }
        }).catch(err => {
          console.error("Capacitor Import Error:", err);
          fallbackShare();
        });
      } else {
        fallbackShare();
      }
    } catch (err) {
      console.error("Error exporting uom excel:", err);
      toast({ title: "Error", description: "Gagal mengekspor data satuan & diskon", variant: "destructive" });
    }
  };

  const resetCategoryForm = () => {
    setNewCategoryName("");
    setNewCategoryOutlets(["all"]);
    setEditingCategoryId(null);
    setShowCategoryOutlets(false);
  };

  const handleSaveCategory = () => {
    if (!newCategoryName.trim()) return;

    if (editingCategoryId) {
      updateCategory.mutate({
        id: editingCategoryId,
        data: {
          name: newCategoryName,
          allowedOutlets: ["all"]
        }
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          refetchCategories();
          toast({ title: "Sukses", description: "Kategori diperbarui" });
          resetCategoryForm();
        }
      });
    } else {
      createCategory.mutate({
        data: {
          name: newCategoryName,
          allowedOutlets: ["all"]
        }
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          refetchCategories();
          toast({ title: "Sukses", description: "Kategori ditambahkan" });
          resetCategoryForm();
        }
      });
    }
  };

  const handleEditCategory = (cat: any) => {
    setEditingCategoryId(cat.id);
    setNewCategoryName(cat.name);
    setNewCategoryOutlets(cat.allowed_outlets || ["all"]);
  };

  const handleDeleteCategory = (id: number) => {
    const category = categories?.find((c: any) => c.id === id);
    if (category) {
      setDeleteCategoryInfo({ id: category.id, name: category.name });
      setIsDeleteCategoryDialogOpen(true);
    }
  };

  const executeDeleteCategory = () => {
    if (!deleteCategoryInfo) return;
    deleteCategory.mutate({ id: deleteCategoryInfo.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        refetchCategories();
        toast({ title: "Sukses", description: "Kategori dihapus" });
        setIsDeleteCategoryDialogOpen(false);
        setDeleteCategoryInfo(null);
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Gagal menghapus kategori", variant: "destructive" });
        setIsDeleteCategoryDialogOpen(false);
        setDeleteCategoryInfo(null);
      }
    });
  };

  const getCategoryName = (product: any) => {
    return product.category?.name || product.categoryName || "Tanpa Kategori";
  };

  const getProductImage = (product: any): string | null => {
    const imageUrl = product.image_url;
    if (!imageUrl) return null;
    return getProductImageUrl(imageUrl);
  };

  // Helper: get the base unit name (smallest unit where conversion = 1)
  const getProductBaseUnit = (product: any): string => {
    const uoms = product?.uoms || [];
    const baseUom = uoms.find((u: any) => u.conversion_factor === 1 || u.is_default);
    return baseUom ? baseUom.unit_name : 'pcs';
  };

  // Helper: format stock in multi-unit display
  const formatMultiUnitStock = (product: any) => {
    const stock = product.stock_quantity || 0;
    const baseUnit = getProductBaseUnit(product);
    const uoms = (product.uoms || []).filter((u: any, index: number, self: any[]) =>
      u.unit_name !== baseUnit && u.conversion_factor > 1 && self.findIndex((t: any) => t.unit_name === u.unit_name) === index
    );
    if (uoms.length === 0) return `${stock} ${baseUnit}`;
    // Sort by conversion factor descending
    const sorted = [...uoms].sort((a: any, b: any) => b.conversion_factor - a.conversion_factor);
    let remaining = stock;
    const parts: string[] = [];
    sorted.forEach((u: any) => {
      const count = Math.floor(remaining / u.conversion_factor);
      if (count > 0) {
        parts.push(`${count} ${u.unit_name}`);
        remaining = remaining % u.conversion_factor;
      }
    });
    if (remaining > 0) parts.push(`${remaining} ${baseUnit}`);
    return parts.length > 0 ? parts.join(', ') : `${stock} ${baseUnit}`;
  };

  // Helper: get UOM options for a product (for selects)
  const getProductUomOptions = (product: any) => {
    const uoms = product?.uoms || [];
    const baseUnit = getProductBaseUnit(product);
    if (uoms.length === 0) return [{ unit_name: baseUnit, conversion_factor: 1 }];

    // Hilangkan duplikasi berdasarkan unit_name (mengabaikan spasi/huruf besar-kecil)
    return uoms.filter((u: any, index: number, self: any[]) =>
      self.findIndex((t: any) => t.unit_name?.trim().toLowerCase() === u.unit_name?.trim().toLowerCase()) === index
    );
  };

  const getOutletName = (product: any): string => {
    const allowedOutlets = product.allowed_outlets;

    if (!allowedOutlets || allowedOutlets.includes("all")) {
      return "Semua Outlet";
    }

    const outletNames = allowedOutlets.map((idStr: string) => {
      const outlet = outlets?.find((o: any) => o.id.toString() === idStr);
      return outlet?.name || "Outlet #" + idStr;
    });

    return outletNames.join(", ");
  };

  const getOutletNamesArray = (product: any): string[] => {
    const allowedOutlets = product.allowed_outlets;

    if (!allowedOutlets || allowedOutlets.includes("all")) {
      return ["Semua Outlet"];
    }

    return allowedOutlets.map((idStr: string) => {
      const outlet = outlets?.find((o: any) => o.id.toString() === idStr);
      return outlet?.name || "Outlet #" + idStr;
    });
  };

  const getOutletCountText = (product: any): string => {
    const allowedOutlets = product.allowed_outlets;

    if (!allowedOutlets || allowedOutlets.includes("all")) {
      return "Semua Outlet";
    }

    return `${allowedOutlets.length} Outlet`;
  };

  const handleRestockSubmit = async () => {
    const validItems = restockItems.filter(item => item.productId && item.quantity > 0);
    if (validItems.length === 0) {
      toast({ title: "Error", description: "Minimal masukkan 1 produk dengan kuantitas > 0", variant: "destructive" });
      return;
    }

    try {
      for (const item of validItems) {
        await createStockMovement.mutateAsync({
          data: {
            product_id: parseInt(item.productId),
            quantity: item.quantity,
            type: 'restock',
            note: 'Manual Restock Gudang'
          }
        });
      }
      toast({ title: "Sukses", description: "Restock gudang berhasil" });
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      refetchProducts();
      setIsRestockDialogOpen(false);
      setRestockItems([{ productId: "", quantity: 1 }]);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Gagal melakukan restock", variant: "destructive" });
    }
  };

  const handleExportExcel = () => {
    if (!sortedProducts || sortedProducts.length === 0) {
      toast({ title: "Error", description: "Tidak ada data produk untuk diekspor", variant: "destructive" });
      return;
    }

    const formatExcelDate = (isoString: string) => {
      if (!isoString) return '-';
      const d = new Date(isoString);
      const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
      const day = d.getDate().toString().padStart(2, '0');
      const month = months[d.getMonth()];
      const year = d.getFullYear();
      const hours = d.getHours().toString().padStart(2, '0');
      const mins = d.getMinutes().toString().padStart(2, '0');
      return `${day} ${month} ${year}, ${hours}.${mins}`;
    };

    const excelData = sortedProducts.map((p: any) => ({
      "Nama Produk": p.name,
      "Kategori": getCategoryName(p),
      "Stok Gudang": p.stock_quantity || 0,
      "Harga (Rp)": p.price,
      "Status": p.isActive ? "Aktif" : "Nonaktif",
      "Cabang Tersedia": getOutletName(p),
      "Terakhir Diupdate": formatExcelDate(p.updated_at)
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Auto-fit columns
    const colWidths = [
      { wch: 40 }, // Nama Produk
      { wch: 20 }, // Kategori
      { wch: 15 }, // Stok
      { wch: 15 }, // Harga
      { wch: 15 }, // Status
      { wch: 30 }, // Cabang
      { wch: 25 }, // Terakhir Update
    ];
    worksheet['!cols'] = colWidths;

    // Apply styling and alignment for all cells
    const range = XLSX.utils.decode_range(worksheet['!ref'] || "A1:G1");

    const alignments = [
      "left",   // 0: Nama Produk
      "center", // 1: Kategori
      "right",  // 2: Stok Gudang
      "right",  // 3: Harga (Rp)
      "center", // 4: Status
      "left",   // 5: Cabang Tersedia
      "center"  // 6: Terakhir Diupdate
    ];

    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const address = XLSX.utils.encode_cell({ c: C, r: R });
        if (!worksheet[address]) continue;

        const alignStr = alignments[C] || "left";

        let cellStyle: any = {
          alignment: { horizontal: alignStr, vertical: "center" }
        };

        if (R === 0) {
          // Header style
          cellStyle.font = { bold: true, color: { rgb: "FFFFFF" } };
          cellStyle.fill = { fgColor: { rgb: "3B82F6" } };
        } else {
          if (worksheet[address].t === 'n') {
            worksheet[address].z = '#,##0';
          }
        }

        worksheet[address].s = cellStyle;
      }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data Produk");

    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `Data_Produk_${dateStr}.xlsx`;

    try {
      try {
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

        const fallbackShare = () => {
          const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
          const file = new File([blob], fileName, { type: blob.type });

          if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({
              files: [file],
              title: 'Data Produk',
            }).then(() => {
              toast({ title: "Berhasil", description: "File Excel berhasil dibagikan" });
            }).catch((err) => {
              console.error("Error sharing:", err);
              XLSX.writeFile(workbook, fileName);
              toast({ title: "Berhasil", description: "File Excel berhasil diunduh" });
            });
          } else {
            XLSX.writeFile(workbook, fileName);
            toast({ title: "Berhasil", description: "File Excel berhasil diunduh" });
          }
        };

        if ((window as any).Capacitor && (window as any).Capacitor.isNativePlatform()) {
          import('@capacitor/filesystem').then(async ({ Filesystem, Directory }) => {
            try {
              const { Share } = await import('@capacitor/share');
              const uint8Array = new Uint8Array(excelBuffer);
              let binary = '';
              const chunkSize = 8192;
              for (let i = 0; i < uint8Array.length; i += chunkSize) {
                const chunk = uint8Array.subarray(i, i + chunkSize);
                binary += String.fromCharCode.apply(null, chunk as any);
              }
              const base64Data = btoa(binary);
              const result = await Filesystem.writeFile({
                path: fileName,
                data: base64Data,
                directory: Directory.Cache
              });
              await Share.share({
                title: 'Data Produk',
                text: 'Berikut adalah data produk',
                url: result.uri,
                dialogTitle: 'Bagikan Data'
              });
              toast({ title: "Berhasil", description: "Data siap dibagikan." });
            } catch (err) {
              console.error("Capacitor Share Error:", err);
              fallbackShare();
            }
          }).catch(err => {
            console.error("Capacitor Import Error:", err);
            fallbackShare();
          });
        } else {
          fallbackShare();
        }
      } catch (err) {
        console.error("Share error:", err);
        XLSX.writeFile(workbook, fileName);
        toast({ title: "Berhasil", description: "File Excel berhasil diunduh" });
      }
    } catch (err) {
      console.error("Share error:", err);
      XLSX.writeFile(workbook, fileName);
      toast({ title: "Berhasil", description: "File Excel berhasil diunduh" });
    }
  };
  const handleQuickCreateCategory = (name: string) => {
    createCategory.mutate({
      data: {
        name,
        allowedOutlets: ["all"]
      }
    }, {
      onSuccess: async (newCat: any) => {
        toast({ title: "Sukses", description: `Kategori '${name}' berhasil ditambahkan` });

        await refetchCategories();

        // Coba cari kategori yang baru ditambahkan dari daftar terbaru
        const res = await refetchCategories();
        const freshCategories = (res as any)?.data || [];
        const createdCat = freshCategories.find((c: any) => c.name.toLowerCase() === name.toLowerCase());

        if (createdCat && createdCat.id) {
          handleFormChange('categoryId', createdCat.id.toString());
        } else if (newCat && newCat.id) {
          handleFormChange('categoryId', newCat.id.toString());
        }

        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Gagal menambahkan kategori", variant: "destructive" });
      }
    });
  };

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

  return (
    <Sidebar>
      <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950" style={{ '--radius': '0px' } as React.CSSProperties}>
        {/* Header */}
        <div className="px-4 py-2 sm:px-6 sm:py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between">
          <h1 className="text-xl sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            Manajemen Produk
          </h1>
          {isAdmin && (
            <>
              {/* Mobile 3-Dots Action Menu */}
              <div className="sm:hidden flex items-center">
                <ActionMenu
                  items={[
                    {
                      label: "Tambah Produk",
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
            <LoadingSpinner text="Memuat data produk..." />
          </div>
        ) : (
          <>
            {/* Tabs Switcher */}
            {isAdmin && (
              <div className="px-4 sm:px-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex justify-between sm:justify-start sm:gap-6 overflow-x-auto scrollbar-hide">
                <button
                  onClick={() => { setActiveTab('products'); setPage(1); }}
                  className={`py-3 text-sm font-semibold border-b-2 transition-all relative flex items-center justify-center gap-2 flex-1 sm:flex-none ${activeTab === 'products'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                >
                  <Package className="w-5 h-5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Daftar Produk</span>
                </button>
                <>
                  <button
                    onClick={() => { setActiveTab('stock'); setPage(1); }}
                    className={`py-3 text-sm font-semibold border-b-2 transition-all relative flex items-center justify-center gap-2 flex-1 sm:flex-none ${activeTab === 'stock'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                  >
                    <Layers className="w-5 h-5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Stok Barang</span>
                    {stockStats.outOfStock > 0 && (
                      <span className="absolute sm:relative top-2 right-1/4 sm:top-0 sm:right-0 flex h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900" />
                    )}
                  </button>
                  <button
                    onClick={() => { setActiveTab('discounts'); setPage(1); }}
                    className={`py-3 text-sm font-semibold border-b-2 transition-all relative flex items-center justify-center gap-2 flex-1 sm:flex-none ${activeTab === 'discounts'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                  >
                    <Tag className="w-5 h-5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Satuan & Harga</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('global-discount'); setPage(1); }}
                    className={`py-3 text-sm font-semibold border-b-2 transition-all relative flex items-center justify-center gap-2 flex-1 sm:flex-none ${activeTab === 'global-discount'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                  >
                    <Percent className="w-5 h-5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Diskon Global</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('history'); setPage(1); }}
                    className={`py-3 text-sm font-semibold border-b-2 transition-all relative flex items-center justify-center gap-2 flex-1 sm:flex-none ${activeTab === 'history'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                  >
                    <Clock className="w-5 h-5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Riwayat Aksi</span>
                  </button>
                </>
              </div>
            )}

            <div className="px-4 py-3 sm:px-6 sm:py-4 flex-1 overflow-auto scrollbar-hide">
              {isDialogOpen ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none shadow-sm mb-6">
                  <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-lg font-semibold">{editingProduct ? "Edit Produk" : "Tambah Produk"}</h2>
                    <Button variant="ghost" size="icon" onClick={() => !isUploading && !createProduct.isPending && !updateProduct.isPending && handleCloseDialog()} className="h-8 w-8 rounded-none">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="p-4 sm:p-2 space-y-2">
                    {/* Image Upload */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Foto Produk</label>
                      <div className="flex flex-col items-start gap-3">
                        <label htmlFor="image-upload" className="relative w-32 h-32 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 flex items-center justify-center overflow-hidden cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors group">
                          {imagePreview ? (
                            <>
                              <CachedImage src={imagePreview} alt="Preview" className="w-full h-full object-cover group-hover:opacity-75 transition-opacity" />
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

                        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/jpg" onChange={handleImageSelect} className="hidden" id="image-upload" />
                        <p className="text-xs text-slate-500 dark:text-slate-400">Format: JPG, PNG, WebP. Maks: 500KB</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Name */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Nama Produk</label>
                        <Input placeholder="Masukkan nama produk" value={formData.name} onChange={(e) => handleFormChange('name', e.target.value)} />
                      </div>

                      {/* Price */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Harga Default</label>
                        <Input placeholder="Masukkan harga" value={formData.price} onChange={handlePriceChange} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Category */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Kategori</label>
                        <SearchableSelect
                          options={[
                            { id: "none", name: "Tanpa Kategori" },
                            ...(categories?.map((cat: any) => ({ id: cat.id.toString(), name: cat.name })) || [])
                          ]}
                          value={formData.categoryId || ""}
                          onChange={(id) => handleFormChange('categoryId', id)}
                          placeholder="Pilih kategori"
                          onCreate={handleQuickCreateCategory}
                          onDelete={(id) => handleDeleteCategory(Number(id))}
                        />
                      </div>

                      {/* Stock Quantity */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Stok Gudang Utama (satuan terkecil)</label>
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder="Masukkan jumlah stok awal"
                          value={formData.stockQuantity}
                          onChange={(e) => {
                            const formatted = formatNumberWithDots(e.target.value);
                            handleFormChange('stockQuantity', formatted);
                          }}
                        />
                      </div>
                    </div>

                    {/* Active */}
                    <div className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
                      <div>
                        <label htmlFor="isActive" className="text-sm font-medium cursor-pointer block">Produk Aktif</label>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Produk yang tidak aktif tidak akan muncul di halaman kasir.</p>
                      </div>
                      <Switch id="isActive" checked={formData.isActive} onCheckedChange={(checked) => handleFormChange('isActive', checked)} />
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                      *Tips: Rekomendasi selesaikan tugas kategori dahulu.
                    </p>
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                    <Button variant="outline" onClick={handleCloseDialog} className="rounded-none">Batal</Button>
                    <Button onClick={handleSubmit} disabled={isUploading || createProduct.isPending || updateProduct.isPending} className="rounded-none">
                      {isUploading || createProduct.isPending || updateProduct.isPending ? "Menyimpan..." : "Simpan"}
                    </Button>
                  </div>
                </div>
              ) : activeTab === 'products' ? (
                <>
                  {/* Search and Filters */}
                  <div className="mb-4 flex flex-col sm:flex-row gap-3">
                    <div className="flex items-center gap-2 flex-1">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-4 h-4" />
                        <Input
                          placeholder="Cari produk..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="pl-9 shadow-sm"
                        />
                      </div>

                      {/* Mobile 1 Filter Button (Popover like /receivables) */}
                      <div className="sm:hidden shrink-0">
                        <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="relative flex items-center justify-center gap-2 shadow-sm bg-white dark:bg-slate-900 h-9 px-3 border-slate-200 dark:border-slate-700"
                            >
                              <SlidersHorizontal className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                              <span className="font-medium text-xs">Filter</span>
                              {(sortOrder !== "newest" || selectedCategory !== "all" || selectedOutlet !== "all") && (
                                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full" />
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-[300px] max-w-[90vw] p-4 rounded-lg shadow-xl border border-slate-200 dark:border-slate-800">
                            <div className="flex items-center justify-between font-semibold text-sm mb-3 border-b pb-2 text-slate-800 dark:text-slate-200">
                              <div className="flex items-center gap-2">
                                <SlidersHorizontal className="w-4 h-4 text-primary" />
                                Filter Produk
                              </div>
                              {(sortOrder !== "newest" || selectedCategory !== "all" || selectedOutlet !== "all") && (
                                <button
                                  onClick={() => {
                                    setSortOrder("newest");
                                    setSelectedCategory("all");
                                    setSelectedOutlet("all");
                                  }}
                                  className="text-xs text-rose-500 hover:underline font-normal"
                                >
                                  Reset
                                </button>
                              )}
                            </div>

                            <div className="space-y-3">
                              {/* Urutkan */}
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Urutkan</label>
                                <Select value={sortOrder} onValueChange={setSortOrder}>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Urutkan" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="newest">Terbaru</SelectItem>
                                    <SelectItem value="oldest">Terlama</SelectItem>
                                    <SelectItem value="nameAsc">Nama (A-Z)</SelectItem>
                                    <SelectItem value="nameDesc">Nama (Z-A)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* Kategori */}
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Kategori</label>
                                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Semua Kategori" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="all">Semua Kategori</SelectItem>
                                    {categories?.map((cat: any) => (
                                      <SelectItem key={cat.id} value={cat.id.toString()}>
                                        {cat.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* Cabang / Outlet */}
                              {isAdmin && (
                                <div className="space-y-1">
                                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Cabang</label>
                                  <Select value={selectedOutlet} onValueChange={setSelectedOutlet}>
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder="Semua Cabang" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="all">Semua Cabang</SelectItem>
                                      {outlets?.map((outlet: any) => (
                                        <SelectItem key={outlet.id} value={outlet.id.toString()}>
                                          {outlet.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>

                    {/* Desktop Inline Filters */}
                    <div className="hidden sm:flex gap-3 w-auto shrink-0">
                      <div className="w-[160px]">
                        <Select value={sortOrder} onValueChange={setSortOrder}>
                          <SelectTrigger className="w-full shadow-sm">
                            <SelectValue placeholder="Urutkan" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="newest">Terbaru</SelectItem>
                            <SelectItem value="oldest">Terlama</SelectItem>
                            <SelectItem value="nameAsc">Nama (A-Z)</SelectItem>
                            <SelectItem value="nameDesc">Nama (Z-A)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="w-[160px]">
                        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                          <SelectTrigger className="w-full shadow-sm">
                            <SelectValue placeholder="Semua Kategori" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Semua Kategori</SelectItem>
                            {categories?.map((cat: any) => (
                              <SelectItem key={cat.id} value={cat.id.toString()}>
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
                              <SelectValue placeholder="Semua Cabang" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Semua Cabang</SelectItem>
                              {outlets?.map((outlet: any) => (
                                <SelectItem key={outlet.id} value={outlet.id.toString()}>
                                  {outlet.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </div>

                  <>
                    {/* Mobile Card List */}
                    <div className="flex flex-col gap-3 lg:hidden">
                      {sortedProducts?.length === 0 ? (
                        <div className="text-center py-10 text-slate-500 dark:text-slate-400">Tidak ada data</div>
                      ) : (
                        paginatedProducts?.map((product: any) => {
                          const categoryName = getCategoryName(product);
                          const productImage = getProductImage(product);

                          return (
                            <div key={product.id} className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-primary/20 hover:shadow-md active:bg-primary/5 transition-all duration-200" onClick={() => { setDetailProduct(product); setIsDetailDialogOpen(true); }}>
                              <div className="flex gap-3 p-3">
                                <div className="flex-shrink-0">
                                  <div className="w-16 h-16 rounded border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                                    {productImage ? (
                                      <CachedImage src={productImage} alt={product.name} className="w-full h-full object-cover" />
                                    ) : (
                                      <Package className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                                    )}
                                  </div>
                                </div>

                                <div className="flex-1 flex flex-col gap-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <h3 className="font-semibold text-slate-900 dark:text-white text-sm line-clamp-2">{product.name}</h3>
                                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{categoryName}</p>
                                    </div>
                                    {isAdmin && (
                                      <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                                        <ActionMenu
                                          triggerClassName="-mr-2.5 -mt-2.5"
                                          items={[
                                            {
                                              label: "Lihat Detail",
                                              icon: <Eye className="h-4 w-4 text-slate-500 group-hover/menu-item:text-white" />,
                                              onClick: () => { setDetailProduct(product); setIsDetailDialogOpen(true); },
                                            },
                                            {
                                              label: "Edit",
                                              icon: <Pencil className="h-4 w-4 text-slate-500 group-hover/menu-item:text-white" />,
                                              onClick: () => handleOpenDialog(product),
                                            },
                                            {
                                              label: "Hapus",
                                              icon: <Trash2 className="h-4 w-4 text-red-500 group-hover/menu-item:text-white" />,
                                              onClick: () => handleDelete(product.id),
                                              destructive: true,
                                            }
                                          ]}
                                        />
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between mt-auto pt-1">
                                    <div className="flex items-center gap-2">
                                      <div className="font-bold text-primary text-sm">{formatRupiah(product.price)}</div>
                                      {isAdmin && selectedOutlet !== "all" ? (() => {
                                        const isAvailable = product.allowed_outlets?.includes('all') || product.allowed_outlets?.includes(selectedOutlet);
                                        return (
                                          <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5">
                                            <span className="text-[10px] text-slate-500">{isAvailable ? 'Tersedia' : 'Kosong'}</span>
                                            <Switch
                                              checked={isAvailable}
                                              onCheckedChange={() => handleToggleOutletActive(product, isAvailable, { stopPropagation: () => { } } as any)}
                                            />
                                          </div>
                                        );
                                      })() : product.isActive ? (
                                        <Badge className="bg-green-500 dark:bg-green-600 whitespace-nowrap text-[10px] px-1.5 py-0">Aktif</Badge>
                                      ) : (
                                        <Badge className="bg-slate-500 hover:bg-slate-600 text-white whitespace-nowrap text-[10px] px-1.5 py-0 border-0">Nonaktif</Badge>
                                      )}
                                    </div>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${(product.stock_quantity || 0) <= 0
                                      ? "bg-red-500 text-white"
                                      : (product.stock_quantity || 0) < 20
                                        ? "bg-amber-500 text-white"
                                        : "bg-blue-500 text-white"
                                      }`}>
                                      Stok: {(product.stock_quantity || 0).toLocaleString('id-ID')}
                                    </span>
                                  </div>
                                </div>
                              </div>

                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden lg:block bg-white dark:bg-slate-900 rounded-none shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                              <TableHead className="w-16 text-center">Foto</TableHead>
                              <TableHead>Nama Produk</TableHead>
                              <TableHead className="text-right whitespace-nowrap">Harga</TableHead>
                              <TableHead className="text-center whitespace-nowrap">Stok Gudang</TableHead>
                              <TableHead className="text-center whitespace-nowrap">Kategori</TableHead>

                              <TableHead className="text-center whitespace-nowrap">
                                {isAdmin && selectedOutlet !== "all" ? "Tersedia" : "Status"}
                              </TableHead>
                              {isAdmin && <TableHead className="w-[50px] text-center">Aksi</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortedProducts?.length === 0 ? (
                              <TableRow><TableCell colSpan={isAdmin ? 8 : 6} className="text-center py-8 text-slate-500 dark:text-slate-400">Tidak ada data</TableCell></TableRow>
                            ) : (
                              paginatedProducts?.map((product: any) => {
                                const categoryName = getCategoryName(product);
                                const productImage = getProductImage(product);

                                return (
                                  <TableRow key={product.id} className="border-b dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:shadow-sm relative hover:z-10 transition-all duration-200 cursor-pointer" onClick={() => { setDetailProduct(product); setIsDetailDialogOpen(true); }}>
                                    <TableCell className="text-center">
                                      <div className="w-14 h-14 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0 mx-auto">
                                        {productImage ? (
                                          <CachedImage src={productImage} alt={product.name} className="w-full h-full object-cover" />
                                        ) : (
                                          <Package className="w-7 h-7 text-slate-300 dark:text-slate-600" />
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell className="font-medium text-slate-900 dark:text-white">{product.name}</TableCell>
                                    <TableCell className="text-right font-bold text-primary whitespace-nowrap">{formatRupiah(product.price)}</TableCell>
                                    <TableCell className="text-center whitespace-nowrap">
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${(product.stock_quantity || 0) <= 0
                                        ? "bg-red-500 text-white"
                                        : (product.stock_quantity || 0) < 20
                                          ? "bg-amber-500 text-white"
                                          : "bg-blue-500 text-white"
                                        }`}>
                                        {(product.stock_quantity || 0).toLocaleString('id-ID')}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-center whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">{categoryName}</TableCell>

                                    <TableCell className="text-center whitespace-nowrap" onClick={(e) => {
                                      if (isAdmin && selectedOutlet !== "all") e.stopPropagation();
                                    }}>
                                      {isAdmin && selectedOutlet !== "all" ? (() => {
                                        const isAvailable = product.allowed_outlets?.includes('all') || product.allowed_outlets?.includes(selectedOutlet);
                                        return (
                                          <div className="flex items-center justify-center gap-2">
                                            <Switch
                                              checked={isAvailable}
                                              onCheckedChange={() => handleToggleOutletActive(product, isAvailable, { stopPropagation: () => { } } as any)}
                                            />
                                          </div>
                                        );
                                      })() : product.isActive ? (
                                        <Badge className="bg-green-500 dark:bg-green-600 border-0">Aktif</Badge>
                                      ) : (
                                        <Badge className="bg-slate-500 hover:bg-slate-600 text-white border-0">Nonaktif</Badge>
                                      )}
                                    </TableCell>
                                    {isAdmin && (
                                      <TableCell className="text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                        <ActionMenu
                                          items={[
                                            {
                                              label: "Lihat Detail",
                                              icon: <Eye className="h-4 w-4 text-slate-500 group-hover/menu-item:text-white" />,
                                              onClick: () => { setDetailProduct(product); setIsDetailDialogOpen(true); },
                                            },
                                            {
                                              label: "Edit",
                                              icon: <Pencil className="h-4 w-4 text-slate-500 group-hover/menu-item:text-white" />,
                                              onClick: () => handleOpenDialog(product),
                                            },
                                            {
                                              label: "Hapus",
                                              icon: <Trash2 className="h-4 w-4 text-red-500 group-hover/menu-item:text-white" />,
                                              onClick: () => handleDelete(product.id),
                                              destructive: true,
                                            }
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
                    </div>
                  </>

                  {/* Pagination Controls */}
                  {sortedProducts.length > 0 && (
                    <div className="flex items-center justify-between py-3 border-t border-slate-200 dark:border-slate-800 mt-2">
                      <div className="text-sm text-slate-500">
                        Halaman {page} dari {Math.ceil(sortedProducts.length / ITEMS_PER_PAGE) || 1}
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
                          disabled={page * ITEMS_PER_PAGE >= sortedProducts.length}
                          className="flex items-center gap-1"
                        >
                          Next
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : activeTab === 'stock' ? (
                <>
                  {/* Stock Metric Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-5 items-stretch">
                    {/* Total Jenis Barang */}
                    <div className="rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-lg h-full">
                      <div className="p-4 sm:p-5 h-full flex flex-col justify-between">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-blue-100 text-xs sm:text-sm font-medium">Total Jenis Barang</p>
                            <p className="text-lg sm:text-lg md:text-xl font-bold text-white leading-tight mt-1 truncate">
                              {(stockStats.totalItems || 0).toLocaleString('id-ID')}
                            </p>
                          </div>
                          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                            <Package className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                          </div>
                        </div>
                        <p className="text-xs mt-3 text-blue-200">Produk Terdaftar</p>
                      </div>
                    </div>

                    {/* Total Stok Gudang */}
                    <div className="rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 border-0 shadow-lg h-full">
                      <div className="p-4 sm:p-5 h-full flex flex-col justify-between">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-purple-100 text-xs sm:text-sm font-medium">Total Stok Gudang</p>
                            <p className="text-lg sm:text-lg md:text-xl font-bold text-white leading-tight mt-1 truncate">
                              {(stockStats.totalStock || 0).toLocaleString('id-ID')}
                            </p>
                          </div>
                          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                            <Archive className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                          </div>
                        </div>
                        <p className="text-xs mt-3 text-purple-200">Satuan Terhitung</p>
                      </div>
                    </div>

                    {/* Stok Habis */}
                    <div className="rounded-xl bg-gradient-to-br from-red-500 to-red-600 border-0 shadow-lg h-full">
                      <div className="p-4 sm:p-5 h-full flex flex-col justify-between">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-red-100 text-xs sm:text-sm font-medium">Stok Habis</p>
                            <p className="text-lg sm:text-lg md:text-xl font-bold text-white leading-tight mt-1 truncate">
                              {(stockStats.outOfStock || 0).toLocaleString('id-ID')}
                            </p>
                          </div>
                          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                            <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                          </div>
                        </div>
                        <p className="text-xs mt-3 text-red-200">Perlu Restock Segera</p>
                      </div>
                    </div>

                    {/* Stok Menipis */}
                    <div className="rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 border-0 shadow-lg h-full">
                      <div className="p-4 sm:p-5 h-full flex flex-col justify-between">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-amber-100 text-xs sm:text-sm font-medium">Stok Menipis</p>
                            <p className="text-lg sm:text-lg md:text-xl font-bold text-white leading-tight mt-1 truncate">
                              {(stockStats.lowStock || 0).toLocaleString('id-ID')}
                            </p>
                          </div>
                          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                            <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4 text-white animate-pulse" />
                          </div>
                        </div>
                        <p className="text-xs mt-3 text-amber-200">Batas Kritis Low</p>
                      </div>
                    </div>
                  </div>

                  {/* Stock Filters */}
                  <div className="mb-4 flex flex-row items-center gap-2">
                    <div className="relative flex-1 min-w-0">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-4 h-4" />
                      <Input
                        placeholder="Cari stok barang..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 shadow-sm text-xs sm:text-sm"
                      />
                    </div>

                    <div className="w-[130px] sm:w-[180px] shrink-0">
                      <Select
                        value={stockStatusFilter}
                        onValueChange={(val: any) => setStockStatusFilter(val)}
                      >
                        <SelectTrigger className="w-full shadow-sm text-xs sm:text-sm">
                          <SelectValue placeholder="Filter Stok" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Semua Stok</SelectItem>
                          <SelectItem value="out">Stok Habis (0)</SelectItem>
                          <SelectItem value="low">Stok Menipis (1-19)</SelectItem>
                          <SelectItem value="available">Tersedia (&gt;=20)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <>
                    {/* Mobile Stock Cards */}
                    <div className="flex flex-col gap-3 md:hidden">
                      {filteredStockProducts.length === 0 ? (
                        <div className="text-center py-10 text-slate-500 dark:text-slate-400">Tidak ada data stok</div>
                      ) : (
                        paginatedStockProducts.map((product: any) => {
                          const categoryName = getCategoryName(product);
                          const productImage = getProductImage(product);
                          const stock = product.stock_quantity || 0;

                          return (
                            <div key={product.id} className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm p-3.5 flex flex-col gap-3">
                              <div className="flex gap-3 relative">
                                <div className="w-12 h-12 rounded border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                                  {productImage ? (
                                    <CachedImage src={productImage} alt={product.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <Package className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0 pr-14">
                                  <h4 className="font-semibold text-slate-900 dark:text-white text-sm line-clamp-1">{product.name}</h4>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">{categoryName}</p>
                                  <div className="flex items-center gap-2 mt-1.5">
                                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Stok: {stock.toLocaleString('id-ID')}</span>
                                    {(product.uoms || []).filter((u: any) => u.unit_name !== 'pcs' && u.conversion_factor > 1).length > 0 && (
                                      <span className="text-[10px] text-slate-500 dark:text-slate-400">({formatMultiUnitStock(product)})</span>
                                    )}
                                  </div>
                                </div>
                                <div className="absolute top-0 right-0">
                                  {stock <= 0 ? (
                                    <Badge variant="destructive" className="bg-red-500 text-white text-[10px] py-0.5 px-2 font-semibold border-0 shadow-none">Habis</Badge>
                                  ) : stock < 20 ? (
                                    <Badge className="bg-amber-500 text-white text-[10px] py-0.5 px-2 font-semibold border-0 shadow-none">Menipis</Badge>
                                  ) : (
                                    <Badge className="bg-green-500 text-white text-[10px] py-0.5 px-2 font-semibold border-0 shadow-none">Tersedia</Badge>
                                  )}
                                </div>
                              </div>
                              {isAdmin && (
                                <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 text-xs py-1 h-8"
                                    onClick={() => {
                                      setQuickRestockProduct(product);
                                      setQuickRestockQty(10);
                                      setQuickRestockNote("Restock Manual Cepat");
                                      setQuickRestockUnit(getProductBaseUnit(product));
                                    }}
                                  >
                                    <Plus className="w-3.5 h-3.5 mr-1" /> Restock Cepat
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Desktop Stock Table */}
                    <div className="hidden md:block bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                              <TableHead className="w-16 text-center">Foto</TableHead>
                              <TableHead>Nama Produk</TableHead>
                              <TableHead className="text-center">Kategori</TableHead>
                              <TableHead className="text-center">Stok Gudang</TableHead>
                              <TableHead className="text-center">Status Stok</TableHead>
                              <TableHead className="text-right">Terakhir Diupdate</TableHead>
                              {isAdmin && <TableHead className="w-[50px] text-center">Aksi</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredStockProducts.length === 0 ? (
                              <TableRow><TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-8 text-slate-500 dark:text-slate-400">Tidak ada data stok yang cocok</TableCell></TableRow>
                            ) : (
                              paginatedStockProducts.map((product: any) => {
                                const categoryName = getCategoryName(product);
                                const productImage = getProductImage(product);
                                const stock = product.stock_quantity || 0;

                                return (
                                  <TableRow key={product.id} className="border-b dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all duration-200">
                                    <TableCell className="text-center">
                                      <div className="w-12 h-12 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0 mx-auto">
                                        {productImage ? (
                                          <CachedImage src={productImage} alt={product.name} className="w-full h-full object-cover" />
                                        ) : (
                                          <Package className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell className="font-semibold text-slate-900 dark:text-white">{product.name}</TableCell>
                                    <TableCell className="text-center text-sm text-slate-600 dark:text-slate-400">{categoryName}</TableCell>
                                    <TableCell className="text-center font-bold text-base">
                                      <div>{stock.toLocaleString('id-ID')}</div>
                                      {(product.uoms || []).filter((u: any) => u.unit_name !== 'pcs' && u.conversion_factor > 1).length > 0 && (
                                        <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                                          {formatMultiUnitStock(product)}
                                        </div>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      {stock <= 0 ? (
                                        <Badge variant="destructive" className="bg-red-500 hover:bg-red-600 text-white font-semibold">Habis</Badge>
                                      ) : stock < 20 ? (
                                        <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-semibold">Menipis</Badge>
                                      ) : (
                                        <Badge className="bg-green-500 hover:bg-green-600 text-white font-semibold">Tersedia</Badge>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right text-xs text-slate-500 dark:text-slate-400">
                                      {product.updated_at ? new Date(product.updated_at).toLocaleString('id-ID', {
                                        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                                      }) : '-'}
                                    </TableCell>
                                    {isAdmin && (
                                      <TableCell className="text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                        <ActionMenu
                                          items={[
                                            {
                                              label: "Restock",
                                              icon: <Plus className="h-4 w-4 text-slate-500 group-hover/menu-item:text-white" />,
                                              onClick: () => {
                                                setQuickRestockProduct(product);
                                                setQuickRestockQty(10);
                                                setQuickRestockNote("Restock Manual Cepat");
                                                setQuickRestockUnit(getProductBaseUnit(product));
                                              },
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
                    </div>
                  </>

                  {/* Pagination Controls */}
                  {filteredStockProducts.length > 0 && (
                    <div className="flex items-center justify-between py-3 border-t border-slate-200 dark:border-slate-800 mt-2">
                      <div className="text-sm text-slate-500">
                        Halaman {page} dari {Math.ceil(filteredStockProducts.length / ITEMS_PER_PAGE) || 1}
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
                          disabled={page * ITEMS_PER_PAGE >= filteredStockProducts.length}
                          className="flex items-center gap-1"
                        >
                          Next
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : activeTab === 'discounts' ? (
                <>
                  {isDiscountDialogOpen && discountProduct && (
                    <div id="uom-form-card" className="mb-6 p-4 sm:p-5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm rounded-xl">
                      <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                        <div>
                          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Atur Satuan & Harga Cabang {discountProduct.name}</h2>

                        </div>
                        <Button variant="ghost" size="icon" onClick={handleCloseDiscountDialog} className="h-8 w-8 rounded-none shrink-0">
                          <X className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="space-y-4 py-4">
                        {/* HPP & Margin Section */}
                        {(() => {
                          const hargaJual = Number(discountProduct?.price) || 0;
                          const hppValue = parseNumberFromDots(discountHpp);
                          const margin = hargaJual > 0 && hppValue > 0
                            ? ((hargaJual - hppValue) / hargaJual) * 100
                            : null;
                          const marginNominal = hargaJual > 0 && hppValue > 0
                            ? hargaJual - hppValue
                            : null;
                          const isMarginNegative = margin !== null && margin < 0;

                          return (
                            <div className="space-y-3 border border-slate-200 dark:border-slate-800 p-3 rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
                              <label className="text-sm font-medium flex items-center gap-2">
                                HPP &amp; Margin
                              </label>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-medium text-slate-500">harga jual (satuan terkecil)</label>
                                  <div className="h-8 px-3 flex items-center text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-600 dark:text-slate-400 font-medium">
                                    {hargaJual > 0 ? formatNumberWithDots(hargaJual.toString()) : '-'}
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-medium text-slate-500">HPP / Modal (Rp)</label>
                                  <Input
                                    placeholder="Masukkan HPP"
                                    value={discountHpp}
                                    onChange={(e) => {
                                      setDiscountHpp(formatNumberWithDots(e.target.value));
                                      setHasChanges(true);
                                    }}
                                    className="h-8 text-sm"
                                  />
                                </div>
                              </div>
                              {hppValue > 0 && hargaJual > 0 && (
                                <div className={`p-2.5 rounded-md border text-xs flex flex-wrap gap-x-4 gap-y-1 ${isMarginNegative
                                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                  : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                                  }`}>
                                  <span className={isMarginNegative ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}>
                                    Margin: <strong>{margin !== null ? margin.toFixed(2) : 0}%</strong>
                                  </span>
                                  <span className={isMarginNegative ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}>
                                    Laba: <strong>{marginNominal !== null ? formatNumberWithDots(Math.round(marginNominal).toString()) : '-'}</strong>
                                  </span>
                                  {isMarginNegative && (
                                    <span className="text-red-600 dark:text-red-400 font-semibold w-full">⚠️ HPP melebihi harga jual!</span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        <div className="space-y-3 border border-slate-200 dark:border-slate-800 p-3 rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
                          <label className="text-sm font-medium flex items-center gap-2">
                            Satuan Ukur &amp; Harga Cabang
                          </label>
                          <p className="text-xs text-slate-500 dark:text-slate-400 -mt-1">
                            Tentukan nama satuan terkecil (faktor konversi = 1) dan satuan lainnya.
                          </p>

                          {uomRows.length > 0 && (
                            <div className="space-y-2">
                              {uomRows.map((row, idx) => (
                                <div key={idx} className="flex flex-col gap-2 bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
                                  <div className="flex flex-wrap sm:flex-nowrap items-end gap-2 sm:gap-3">
                                    <div className="flex-1 sm:w-20 space-y-1">
                                      <label className="text-[10px] font-medium text-slate-500 text-center block">
                                        {row.is_base_unit ? "Faktor Konversi (Dasar)" : "Isi (Faktor Konversi)"}
                                      </label>
                                      <Input
                                        type="text"
                                        placeholder="0"
                                        disabled={row.is_base_unit}
                                        value={row.conversion_factor}
                                        onChange={(e) => {
                                          const rawVal = e.target.value.replace(/[^0-9]/g, '');
                                          const val = rawVal === '' ? '' : parseInt(rawVal);
                                          const newRows = [...uomRows];

                                          let newPrice = row.price;
                                          if (discountProduct?.price && val !== '') {
                                            newPrice = formatNumberWithDots(Math.round((val as number) * Number(discountProduct.price)).toString());
                                          } else if (val === '') {
                                            newPrice = '';
                                          }

                                          newRows[idx] = { ...newRows[idx], conversion_factor: val, price: newPrice };
                                          setUomRows(newRows);
                                          setHasChanges(true);
                                        }}
                                        className="h-8 text-sm text-center"
                                      />
                                    </div>
                                    <div className="w-full sm:flex-1 space-y-1">
                                      <label className="text-[10px] font-medium text-slate-500 text-center block">Nama Satuan</label>
                                      <Input
                                        placeholder="box, dus, pack..."
                                        value={row.unit_name}
                                        onChange={(e) => {
                                          const newRows = [...uomRows];
                                          newRows[idx] = { ...newRows[idx], unit_name: e.target.value.toLowerCase().trim() };
                                          setUomRows(newRows);
                                          setHasChanges(true);
                                        }}
                                        className="h-8 text-sm text-center"
                                      />
                                    </div>
                                    <div className="flex-1 sm:w-36 space-y-1">
                                      <label className="text-[10px] font-medium text-slate-500 text-center block">Harga Jual</label>
                                      <div className="relative flex items-center w-full">
                                        <Input
                                          placeholder={discountProduct?.price ? formatNumberWithDots(Math.round(Number(discountProduct.price) * (Number(row.conversion_factor) || 1)).toString()) : "Auto"}
                                          value={row.price}
                                          onChange={(e) => {
                                            const newRows = [...uomRows];
                                            newRows[idx] = { ...newRows[idx], price: formatNumberWithDots(e.target.value) };
                                            setUomRows(newRows);
                                            setHasChanges(true);
                                          }}
                                          className={`h-8 text-sm text-center w-full ${!row.is_base_unit ? 'px-8' : ''}`}
                                        />
                                        {!row.is_base_unit && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const newRows = [...uomRows];
                                              newRows.splice(idx, 1);
                                              setUomRows(newRows);
                                              setHasChanges(true);
                                            }}
                                            className="absolute right-0 top-0 bottom-0 w-8 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-red-500 transition-colors focus:outline-none"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Margin Info per Satuan */}
                                  {(() => {
                                    const hppPcs = parseNumberFromDots(discountHpp);
                                    const convFactor = Number(row.conversion_factor) || 0;
                                    const hargaJualSatuan = parseNumberFromDots(row.price || '0');
                                    const hppSatuan = hppPcs * convFactor;
                                    const labelSatuan = row.unit_name || 'satuan';

                                    if (hppPcs <= 0 || convFactor <= 0 || hargaJualSatuan <= 0) return null;

                                    const laba = hargaJualSatuan - hppSatuan;
                                    const marginPct = (laba / hargaJualSatuan) * 100;
                                    const isNegative = laba < 0;

                                    return (
                                      <div className="flex flex-col gap-1.5 mt-1.5">
                                        <div className={`px-2.5 py-1.5 rounded text-[10px] flex flex-wrap gap-x-3 gap-y-0.5 border ${isNegative
                                          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
                                          : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                                          }`}>
                                          <span>HPP {labelSatuan}: <strong>{formatNumberWithDots(Math.round(hppSatuan).toString())}</strong></span>
                                          <span>Margin: <strong>{marginPct.toFixed(1)}%</strong></span>
                                          <span>Laba: <strong>{formatNumberWithDots(Math.round(laba).toString())}</strong></span>
                                          {isNegative && <span className="font-semibold w-full">⚠️ Harga jual di bawah modal!</span>}
                                        </div>
                                        {convFactor > 1 && (
                                          <div className="px-2.5 py-1.5 rounded text-[10px] bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-400 font-medium">
                                            1 {labelSatuan} - {convFactor} {uomRows.find((r: any) => r.is_base_unit)?.unit_name || 'satuan dasar'} = {formatNumberWithDots(Math.round(hargaJualSatuan).toString())}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}

                                  {/* Harga Per Cabang for this UOM */}
                                  {outlets && outlets.length > 0 && (
                                    <div className="mt-2 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 bg-white dark:bg-slate-900/50">
                                      <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2">Harga Per Cabang ({row.unit_name})</p>
                                      <div className="space-y-1.5">
                                        {outlets.map((outlet: any) => (
                                          <div key={outlet.id} className="flex items-center gap-2">
                                            <label className="text-xs w-24 truncate text-slate-600 dark:text-slate-400" title={outlet.name}>{outlet.name}</label>
                                            <Input
                                              placeholder="Ikut Default"
                                              className="h-7 text-xs flex-1"
                                              value={row.outletPrices?.[outlet.id.toString()] || ""}
                                              onChange={(e) => {
                                                const val = formatNumberWithDots(e.target.value);
                                                const newRows = [...uomRows];
                                                if (!newRows[idx].outletPrices) newRows[idx].outletPrices = {};
                                                newRows[idx].outletPrices[outlet.id.toString()] = val;
                                                setUomRows(newRows);
                                                setHasChanges(true);
                                              }}
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Tiers List Removed */}
                                </div>
                              ))}
                            </div>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              const defaultConv = '';
                              const defaultPrice = '';
                              setUomRows([...uomRows, {
                                unit_name: '',
                                conversion_factor: defaultConv,
                                price: defaultPrice,
                                is_default: false,
                                tiers: [{ discount_type: 'none', discount_value: '', min_qty: 1, label: '' }]
                              }]);
                              setHasChanges(true);
                            }}
                          >
                            Tambah Satuan
                          </Button>

                          {uomRows.length > 0 && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 p-2 rounded border border-slate-100 dark:border-slate-800">
                              <span className="font-medium">Preview:</span>{' '}
                              {uomRows.filter(r => r.unit_name).map((r, i) => (
                                <span key={i}>
                                  {i > 0 && " • "}1 {r.unit_name} = {r.conversion_factor} {getProductBaseUnit(discountProduct)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <Button variant="outline" onClick={handleCloseDiscountDialog}>Batal</Button>
                        <Button onClick={handleSaveDiscounts} disabled={bulkSaveUoms.isPending || !hasChanges}>
                          {bulkSaveUoms.isPending ? "Menyimpan..." : "Simpan Pengaturan"}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="mb-4 flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-4 h-4" />
                      <Input
                        placeholder="Cari produk..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 shadow-sm"
                      />
                    </div>

                    <div className="flex gap-3 w-full sm:w-auto">
                      <div className="w-full sm:w-[160px]">
                        <Select value={sortOrder} onValueChange={setSortOrder}>
                          <SelectTrigger className="w-full shadow-sm">
                            <SelectValue placeholder="Urutkan" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="newest">Terbaru</SelectItem>
                            <SelectItem value="oldest">Terlama</SelectItem>
                            <SelectItem value="nameAsc">Nama (A-Z)</SelectItem>
                            <SelectItem value="nameDesc">Nama (Z-A)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <>
                    {/* Mobile Discount Cards */}
                    <div className="flex flex-col gap-3 md:hidden">
                      {sortedProducts?.length === 0 ? (
                        <div className="text-center py-10 text-slate-500">Tidak ada produk ditemukan.</div>
                      ) : (
                        paginatedProducts?.map((product: any) => {
                          const uoms = product.uoms || [];
                          const hasDiscount = uoms.some((u: any) => u.discount_type !== 'none' && (Number(u.discount_value) > 0));
                          const uniqueUoms = uoms.filter((u: any, index: number, self: any[]) =>
                            self.findIndex((t: any) => t.unit_name === u.unit_name) === index
                          );
                          return (
                            <div key={product.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 flex flex-col gap-3">
                              <div className="flex gap-3 relative">
                                <div className="w-12 h-12 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                                  {getProductImage(product) ? (
                                    <CachedImage src={getProductImage(product)!} alt={product.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <ImageIcon className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0 pr-14">
                                  <div className="font-semibold text-slate-900 dark:text-white text-sm line-clamp-1">
                                    {product.name}
                                  </div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{categories?.find((c: any) => c.id === product.category_id || c.id === product.categoryId)?.name || "Tanpa Kategori"}</div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Harga Jual</div>
                                  <div className="mt-0.5 font-medium text-slate-700 dark:text-slate-300 text-sm">{formatRupiah(product.price)} / {getProductBaseUnit(product)}</div>
                                </div>
                                {hasDiscount && (
                                  <div className="absolute top-0 right-0">
                                    <Badge className="bg-green-500 hover:bg-green-600 text-white text-[10px] py-0.5 px-2 font-semibold border-0 shadow-none">Promo</Badge>
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-1">
                                {uniqueUoms.length > 0 && (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <div className="flex flex-wrap items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity">
                                        {uniqueUoms.map((u: any, idx: number) => (
                                          <Badge key={idx} className={`text-[10px] border-0 ${u.discount_type !== 'none' && Number(u.discount_value) > 0 ? 'bg-green-500 text-white' : 'bg-slate-500 text-white'}`}>
                                            {u.unit_name}
                                          </Badge>
                                        ))}
                                      </div>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[300px] p-0 shadow-lg" align="start">
                                      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 rounded-t-md">
                                        <h4 className="font-semibold text-sm text-slate-800">Detail Varian Satuan</h4>
                                        <p className="text-[10px] text-slate-500 mt-0.5">Struktur harga dan promo grosir</p>
                                      </div>
                                      <div className="p-2 space-y-1.5 max-h-[300px] overflow-y-auto bg-slate-50/50">
                                        {uniqueUoms.map((u: any, idx: number) => {
                                          const factor = u.conversion_factor || 1;
                                          const isDiscount = u.discount_type !== 'none' && Number(u.discount_value) > 0;
                                          return (
                                            <div key={idx} className="p-2.5 bg-white rounded-md border border-slate-200 flex flex-col gap-1 shadow-sm">
                                              <div className="flex justify-between items-center">
                                                <span className="font-semibold text-xs text-slate-800 uppercase">{u.unit_name}</span>
                                                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 px-1.5 py-0.5 rounded">1 = {factor} dsr</span>
                                              </div>
                                              <div className="flex justify-between items-center mt-0.5">
                                                <span className="text-[10px] text-slate-500">Harga Jual:</span>
                                                <span className="text-xs font-semibold text-primary">{formatRupiah(u.price || (product.price * factor))}</span>
                                              </div>
                                              {isDiscount && (
                                                <div className="mt-1.5 px-2 py-1.5 bg-green-50/80 rounded border border-green-100 flex flex-col gap-0.5">
                                                  <span className="font-medium text-[10px] text-green-700">🎉 Promo Aktif:</span>
                                                  <span className="text-[10px] text-green-700">Beli min. <strong className="font-semibold">{u.min_qty} {u.unit_name}</strong> &rarr; Diskon <strong className="font-semibold">{u.discount_type === 'percent' ? `${u.discount_value}%` : formatRupiah(u.discount_value)}</strong></span>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                )}
                              </div>
                              {isAdmin && (
                                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                                  <Button size="sm" variant="outline" onClick={() => handleOpenDiscountDialog(product)} className="w-full text-xs h-8">
                                    <Tag className="w-3.5 h-3.5 mr-1.5" /> Atur Satuan & Harga Cabang
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Desktop Discount Table */}
                    <div className="hidden md:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        <Table className="min-w-[600px]">
                          <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                            <TableRow className="border-slate-200 dark:border-slate-800">
                              <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Produk</TableHead>
                              <TableHead className="text-center font-semibold text-slate-700 dark:text-slate-300">Harga/Items</TableHead>
                              <TableHead className="text-center font-semibold text-slate-700 dark:text-slate-300">Varian Satuan</TableHead>
                              {isAdmin && <TableHead className="w-[50px] text-center font-semibold text-slate-700 dark:text-slate-300">Aksi</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortedProducts?.length === 0 ? (
                              <TableRow><TableCell colSpan={4} className="text-center py-8">Tidak ada produk ditemukan.</TableCell></TableRow>
                            ) : (
                              paginatedProducts?.map((product: any) => {
                                const uoms = product.uoms || [];
                                const hasDiscount = uoms.some((u: any) => u.discount_type !== 'none' && (Number(u.discount_value) > 0));
                                const uniqueUoms = uoms.filter((u: any, index: number, self: any[]) =>
                                  self.findIndex((t: any) => t.unit_name === u.unit_name) === index
                                );
                                return (
                                  <TableRow key={product.id} className="border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                                    <TableCell>
                                      <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                                          {getProductImage(product) ? (
                                            <CachedImage src={getProductImage(product)!} alt={product.name} className="w-full h-full object-cover" />
                                          ) : (
                                            <ImageIcon className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                                          )}
                                        </div>
                                        <div>
                                          <div className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                            {product.name}
                                            {hasDiscount && (
                                              <Badge className="bg-green-500 hover:bg-green-600 text-white border-0 px-1.5 py-0 h-4 text-[9px] leading-none">Promo Aktif</Badge>
                                            )}
                                          </div>
                                          <div className="text-[10px] text-slate-500">{categories.find(c => c.id === product.category_id || c.id === product.categoryId)?.name || "Tanpa Kategori"}</div>
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-center whitespace-nowrap">
                                      <span className="font-medium text-slate-700 dark:text-slate-300">{formatRupiah(product.price)}</span>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <div className="flex flex-wrap items-center justify-center gap-1">
                                        {uniqueUoms.length > 0 && (
                                          <Popover>
                                            <PopoverTrigger asChild>
                                              <div className="flex flex-wrap items-center justify-center gap-1 cursor-pointer hover:opacity-80 transition-opacity">
                                                {uniqueUoms.map((u: any, idx: number) => (
                                                  <Badge key={idx} className={`text-[10px] border-0 ${u.discount_type !== 'none' && Number(u.discount_value) > 0 ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-slate-500 hover:bg-slate-600 text-white'}`}>
                                                    {u.unit_name}
                                                  </Badge>
                                                ))}
                                              </div>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-[300px] p-0 shadow-lg" align="center">
                                              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 rounded-t-md text-left">
                                                <h4 className="font-semibold text-sm text-slate-800">Detail Varian Satuan</h4>
                                                <p className="text-[10px] text-slate-500 mt-0.5">Struktur harga dan promo grosir</p>
                                              </div>
                                              <div className="p-2 space-y-1.5 max-h-[300px] overflow-y-auto bg-slate-50/50 text-left">
                                                {uniqueUoms.map((u: any, idx: number) => {
                                                  const factor = u.conversion_factor || 1;
                                                  const isDiscount = u.discount_type !== 'none' && Number(u.discount_value) > 0;
                                                  return (
                                                    <div key={idx} className="p-2.5 bg-white rounded-md border border-slate-200 flex flex-col gap-1 shadow-sm">
                                                      <div className="flex justify-between items-center">
                                                        <span className="font-semibold text-xs text-slate-800 uppercase">{u.unit_name}</span>
                                                        <span className="text-[10px] text-slate-500 font-medium bg-slate-100 px-1.5 py-0.5 rounded">1 = {factor} dsr</span>
                                                      </div>
                                                      <div className="flex justify-between items-center mt-0.5">
                                                        <span className="text-[10px] text-slate-500">Harga Jual:</span>
                                                        <span className="text-xs font-semibold text-primary">{formatRupiah(u.price || (product.price * factor))}</span>
                                                      </div>
                                                      {isDiscount && (
                                                        <div className="mt-1.5 px-2 py-1.5 bg-green-50/80 rounded border border-green-100 flex flex-col gap-0.5">
                                                          <span className="font-medium text-[10px] text-green-700">🎉 Promo Aktif:</span>
                                                          <span className="text-[10px] text-green-700">Beli min. <strong className="font-semibold">{u.min_qty} {u.unit_name}</strong> &rarr; Diskon <strong className="font-semibold">{u.discount_type === 'percent' ? `${u.discount_value}%` : formatRupiah(u.discount_value)}</strong></span>
                                                        </div>
                                                      )}
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            </PopoverContent>
                                          </Popover>
                                        )}
                                      </div>
                                    </TableCell>
                                    {isAdmin && (
                                      <TableCell className="text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                        <ActionMenu
                                          items={[
                                            {
                                              label: "Atur Satuan & Harga",
                                              icon: <Tag className="h-4 w-4 text-slate-500 group-hover/menu-item:text-white" />,
                                              onClick: () => handleOpenDiscountDialog(product),
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
                    </div>
                  </>

                  {/* Pagination Controls */}
                  {sortedProducts.length > 0 && (
                    <div className="flex items-center justify-between py-3 border-t border-slate-200 dark:border-slate-800 mt-2">
                      <div className="text-sm text-slate-500">
                        Halaman {page} dari {Math.ceil(sortedProducts.length / ITEMS_PER_PAGE) || 1}
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
                          disabled={page * ITEMS_PER_PAGE >= sortedProducts.length}
                          className="flex items-center gap-1"
                        >
                          Next
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : activeTab === 'global-discount' ? (
                <div className="w-full">
                  <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
                    <CardContent className="p-2 space-y-2">
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
                                      placeholder="Masukkan Nominal Diskon"
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
                                      placeholder="Masukkan Presentase Diskon (%)"
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
                            </div>
                            <Button
                              onClick={() => handleOpenGlobalDiscountForm()}
                              className="w-full sm:w-auto"
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
                                  <TableHead className="text-center font-semibold text-slate-800 dark:text-slate-200 w-[50px]">Aksi</TableHead>
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
                                      <TableCell className="text-center">
                                        <ActionMenu
                                          items={[
                                            {
                                              label: "Edit",
                                              onClick: () => handleOpenGlobalDiscountForm(idx),
                                            },
                                            {
                                              label: "Hapus",
                                              onClick: () => handleDeleteGlobalDiscount(idx),
                                              destructive: true
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
              ) : activeTab === 'history' ? (
                <HistoryTabContent isAdmin={isAdmin} />
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* Edit Form moved inline */}



      {/* Category Dialog */}
      <Dialog
        open={isCategoryDialogOpen}
        onOpenChange={(open) => {
          setIsCategoryDialogOpen(open);
          if (!open) resetCategoryForm();
        }}
      >
        <DialogContent className="sm:max-w-md sm:rounded-2xl max-h-[90vh] overflow-y-auto scrollbar-hide">
          <DialogHeader>
            <DialogTitle>Kategori Produk</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Input placeholder="Nama kategori baru" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSaveCategory()} />
              <Button onClick={handleSaveCategory} disabled={createCategory.isPending || updateCategory.isPending}>
                {editingCategoryId ? (
                  <>Simpan Perubahan</>
                ) : showCategoryOutlets ? (
                  <>Simpan Kategori</>
                ) : (
                  <><Plus className="w-4 h-4 mr-1" /> Tambah</>
                )}
              </Button>
            </div>
            {editingCategoryId && (
              <div className="flex justify-end -mt-2">
                <Button variant="link" size="sm" onClick={resetCategoryForm} className="text-slate-500 h-auto p-0">
                  Batal Edit
                </Button>
              </div>
            )}



            <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-hide pr-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              {categories?.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">Belum ada kategori</p>
              ) : (
                categories?.map((cat: any) => (
                  <div key={cat.id} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-lg">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-slate-900 dark:text-white">{cat.name}</span>
                    </div>
                    <div className="flex gap-1 items-center">
                      <Button variant="ghost" size="sm" onClick={() => handleEditCategory(cat)} className="text-slate-500 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 h-8 w-8 p-0">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteCategory(cat.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 h-8 w-8 p-0">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsCategoryDialogOpen(false);
              resetCategoryForm();
            }}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="sm:max-w-sm sm:rounded-2xl max-h-[90vh] overflow-y-auto scrollbar-hide">
          <DialogHeader>
            <DialogTitle>Detail Produk</DialogTitle>
          </DialogHeader>
          {detailProduct && (
            <div className="space-y-4 py-4">
              <div className="flex flex-col items-center gap-3">
                <div className="w-24 h-24 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden shadow-sm">
                  {getProductImage(detailProduct) ? (
                    <CachedImage src={getProductImage(detailProduct)!} alt={detailProduct.name} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                  )}
                </div>
                <div className="text-center">
                  <h3 className="font-semibold text-lg text-slate-900 dark:text-white">{detailProduct.name}</h3>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">{getCategoryName(detailProduct)}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 border-t border-slate-100 dark:border-slate-800 pt-5">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Status</label>
                  {detailProduct.isActive ? (
                    <Badge className="bg-green-500 dark:bg-green-600">Aktif</Badge>
                  ) : (
                    <Badge variant="secondary">Nonaktif</Badge>
                  )}
                </div>
                <div className="text-center">
                  <label className="text-xs text-slate-500 block mb-1">Stok Gudang</label>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${(detailProduct.stock_quantity || 0) <= 0
                    ? "bg-red-500 text-white"
                    : (detailProduct.stock_quantity || 0) < 20
                      ? "bg-amber-500 text-white"
                      : "bg-blue-500 text-white"
                    }`}>
                    {(detailProduct.stock_quantity || 0).toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="text-right">
                  <label className="text-xs text-slate-500 block mb-1">Harga</label>
                  <div className="font-bold text-primary text-sm sm:text-base whitespace-nowrap">{formatRupiah(detailProduct.price)}</div>
                </div>
              </div>

              {outlets && outlets.length > 0 && detailProduct.outlet_prices && Object.keys(detailProduct.outlet_prices).length > 0 && (
                <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                  <label className="text-xs text-slate-500 block mb-2 font-medium">Harga Area Cabang</label>
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800 p-3 space-y-2">
                    {outlets.map((outlet: any) => {
                      const outletPrice = (detailProduct.outlet_prices as any)?.[outlet.id.toString()];
                      if (!outletPrice) return null;
                      return (
                        <div key={outlet.id} className="flex justify-between items-center text-sm">
                          <span className="text-slate-600 dark:text-slate-300">{outlet.name}</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{formatRupiah(Number(outletPrice))}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Restock Dialog */}
      <Dialog open={isRestockDialogOpen} onOpenChange={setIsRestockDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Restock Gudang Utama</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {restockItems.map((item, index) => (
              <div key={index} className="flex items-end gap-3 bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-slate-500">Produk</label>
                  <Select
                    value={item.productId}
                    onValueChange={(v) => {
                      const newItems = [...restockItems];
                      newItems[index].productId = v;
                      setRestockItems(newItems);
                    }}
                  >
                    <SelectTrigger className="bg-white dark:bg-slate-950">
                      <SelectValue placeholder="Pilih Produk" />
                    </SelectTrigger>
                    <SelectContent>
                      {products?.map((p: any) => (
                        <SelectItem key={p.id} value={p.id.toString()}>
                          {p.name} (Stok Saat Ini: {(p.stock_quantity || 0).toLocaleString('id-ID')})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-32 space-y-1">
                  <label className="text-xs font-medium text-slate-500">Tambah (Qty)</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="0"
                    className="bg-white dark:bg-slate-950"
                    value={item.quantity === 0 ? "" : formatNumberWithDots(String(item.quantity))}
                    onChange={(e) => {
                      const val = parseNumberFromDots(e.target.value);
                      const newItems = [...restockItems];
                      newItems[index].quantity = val;
                      setRestockItems(newItems);
                    }}
                  />
                </div>
                {restockItems.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                    onClick={() => {
                      const newItems = [...restockItems];
                      newItems.splice(index, 1);
                      setRestockItems(newItems);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setRestockItems([...restockItems, { productId: "", quantity: 1 }])}
            >
              <Plus className="w-4 h-4 mr-2" /> Tambah Baris Produk
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRestockDialogOpen(false)}>Batal</Button>
            <Button onClick={handleRestockSubmit}>Simpan Restock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Restock Dialog */}
      <Dialog open={!!quickRestockProduct} onOpenChange={(open) => { if (!open) { setQuickRestockProduct(null); setQuickRestockUnit('pcs'); setQuickRestockConversion(1); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Restock Cepat {quickRestockProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-500">Stok Saat Ini</label>
              <div className="text-lg font-bold text-slate-700 dark:text-slate-300">
                {(quickRestockProduct?.stock_quantity || 0).toLocaleString('id-ID')} {quickRestockProduct ? getProductBaseUnit(quickRestockProduct) : 'pcs'}
                {quickRestockProduct && (quickRestockProduct.uoms || []).filter((u: any) => u.unit_name !== getProductBaseUnit(quickRestockProduct) && u.conversion_factor > 1).length > 0 && (
                  <span className="text-sm font-normal text-slate-500 ml-2">({formatMultiUnitStock(quickRestockProduct)})</span>
                )}
              </div>
            </div>

            {/* Unit Selector */}
            {quickRestockProduct && getProductUomOptions(quickRestockProduct).length > 1 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Satuan Restock</label>
                <Select
                  value={quickRestockUnit}
                  onValueChange={(val) => {
                    const uom = getProductUomOptions(quickRestockProduct).find((u: any) => u.unit_name === val);
                    setQuickRestockUnit(val);
                    setQuickRestockConversion(uom?.conversion_factor || 1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Satuan" />
                  </SelectTrigger>
                  <SelectContent>
                    {getProductUomOptions(quickRestockProduct).map((u: any) => (
                      <SelectItem key={u.unit_name} value={u.unit_name}>
                        {u.unit_name} {u.conversion_factor > 1 ? `(1 ${u.unit_name} = ${u.conversion_factor} ${quickRestockProduct ? getProductBaseUnit(quickRestockProduct) : 'pcs'})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Jumlah Restock</label>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="0"
                value={quickRestockQty === 0 ? "" : formatNumberWithDots(String(quickRestockQty))}
                onChange={(e) => {
                  const val = parseNumberFromDots(e.target.value);
                  setQuickRestockQty(val);
                }}
              />
              {quickRestockConversion > 1 && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  = {quickRestockQty * quickRestockConversion} {quickRestockProduct ? getProductBaseUnit(quickRestockProduct) : 'pcs'} akan ditambahkan ke stok
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Catatan</label>
              <Input
                placeholder="Masukkan catatan restock..."
                value={quickRestockNote}
                onChange={(e) => setQuickRestockNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setQuickRestockProduct(null); setQuickRestockUnit('pcs'); setQuickRestockConversion(1); }}>Batal</Button>
            <Button
              onClick={async () => {
                if (quickRestockQty <= 0) {
                  toast({ title: "Error", description: "Jumlah harus lebih besar dari 0", variant: "destructive" });
                  return;
                }
                const actualPcsQty = quickRestockQty * quickRestockConversion;
                const baseUnitStr = quickRestockProduct ? getProductBaseUnit(quickRestockProduct) : 'pcs';
                try {
                  await createStockMovement.mutateAsync({
                    data: {
                      product_id: quickRestockProduct.id,
                      quantity: actualPcsQty,
                      type: 'restock',
                      note: quickRestockNote || 'Restock Manual Cepat',
                      unit_name: quickRestockUnit,
                      unit_qty: quickRestockQty,
                      conversion_factor: quickRestockConversion
                    }
                  });
                  queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
                  refetchProducts();
                  toast({ title: "Sukses", description: `Berhasil menambahkan ${quickRestockQty} ${quickRestockUnit} (${actualPcsQty} ${baseUnitStr}) stok` });
                  setQuickRestockProduct(null);
                  setQuickRestockUnit('pcs');
                  setQuickRestockConversion(1);
                } catch (e: any) {
                  toast({ title: "Error", description: e.message || "Gagal melakukan restock", variant: "destructive" });
                }
              }}
              disabled={createStockMovement.isPending}
            >
              {createStockMovement.isPending ? "Menyimpan..." : "Simpan Restock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Delete Category Alert Dialog */}
      <AlertDialog open={isDeleteCategoryDialogOpen} onOpenChange={setIsDeleteCategoryDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus kategori "{deleteCategoryInfo?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-t-2 border-slate-200 dark:border-slate-700 pt-4 mt-2">
            <AlertDialogCancel onClick={() => setDeleteCategoryInfo(null)}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeDeleteCategory}
              className="bg-red-500 hover:bg-red-600 text-white"
              disabled={deleteCategory.isPending}
            >
              {deleteCategory.isPending ? "Menghapus..." : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Product Alert Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {deleteProductInfo?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan.<br></br>Produk akan dihapus secara permanen dari database,<br></br>termasuk riwayat mutasi dan pengaturan harganya.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-t-2 border-slate-200 dark:border-slate-700 pt-4 mt-2">
            <AlertDialogCancel onClick={() => setDeleteProductInfo(null)}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeDeleteProduct}
              className="bg-red-500 hover:bg-red-600 text-white"
              disabled={deleteProduct.isPending}
            >
              {deleteProduct.isPending ? "Menghapus..." : "Ya, Hapus Produk"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}

function HistoryTabContent({ isAdmin }: { isAdmin: boolean }) {
  const { data: movements, isLoading, refetch } = useListStockMovements();
  const deleteMovement = useDeleteStockMovement();
  const deleteAllMovements = useDeleteAllStockMovements();
  const { toast } = useToast();

  const [page, setPage] = useState(1);
  const [searchHistory, setSearchHistory] = useState("");
  const [filterSort, setFilterSort] = useState("terbaru");
  const [isDeleteAllHistoryDialogOpen, setIsDeleteAllHistoryDialogOpen] = useState(false);
  const [deleteHistoryId, setDeleteHistoryId] = useState<number | null>(null);
  const [isDeleteHistoryDialogOpen, setIsDeleteHistoryDialogOpen] = useState(false);
  const ITEMS_PER_PAGE = 20;

  const filteredAndSortedMovements = useMemo(() => {
    if (!movements) return [];

    let filtered = [...movements];

    if (searchHistory.trim() !== '') {
      const lowerSearch = searchHistory.toLowerCase();
      filtered = filtered.filter(m =>
        (m.products?.name?.toLowerCase().includes(lowerSearch)) ||
        (m.notes?.toLowerCase().includes(lowerSearch)) ||
        (m.type?.toLowerCase().includes(lowerSearch))
      );
    }

    filtered.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return filterSort === 'terbaru' ? dateB - dateA : dateA - dateB;
    });

    return filtered;
  }, [movements, searchHistory, filterSort]);

  const paginatedMovements = useMemo(() => {
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    return filteredAndSortedMovements.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredAndSortedMovements, page]);

  const handleNextPage = () => {
    if (filteredAndSortedMovements && page * ITEMS_PER_PAGE < filteredAndSortedMovements.length) {
      setPage(p => p + 1);
    }
  };

  const handlePrevPage = () => {
    if (page > 1) {
      setPage(p => p - 1);
    }
  };

  const handleDelete = (id: number) => {
    setDeleteHistoryId(id);
    setIsDeleteHistoryDialogOpen(true);
  };

  const handleDeleteAll = () => {
    if (!isAdmin) return;
    setIsDeleteAllHistoryDialogOpen(true);
  };

  const formatMovementType = (type: string) => {
    switch (type) {
      case 'restock': return 'Restock Gudang';
      case 'transfer_to_sales': return 'Transfer ke Sales';
      case 'return_from_sales': return 'Kembali dari Sales';
      case 'adjustment': return 'Penyesuaian Stok';
      case 'sale': return 'Penjualan POS';
      default: return type;
    }
  };

  return (
    <div className="space-y-4">
      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-4 h-4" />
          <Input
            placeholder="Cari riwayat mutasi..."
            value={searchHistory}
            onChange={(e) => { setSearchHistory(e.target.value); setPage(1); }}
            className="pl-9 shadow-sm"
          />
        </div>

        <div className="flex gap-3 w-full sm:w-auto">
          <div className="w-full sm:w-[160px]">
            <Select value={filterSort} onValueChange={(val) => { setFilterSort(val); setPage(1); }}>
              <SelectTrigger className="w-full shadow-sm">
                <SelectValue placeholder="Urutkan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="terbaru">Terbaru</SelectItem>
                <SelectItem value="terlama">Terlama</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (
            <Button
              variant="destructive"
              onClick={handleDeleteAll}
              disabled={deleteAllMovements.isPending || movements?.length === 0}
            >
              Clear All
            </Button>
          )}
        </div>
      </div>
      {isLoading ? (
        <LoadingSpinner text="Memuat riwayat mutasi..." />
      ) : (
        <>
          {/* Mobile History Cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {movements?.length === 0 ? (
              <div className="text-center py-10 text-slate-500">Belum ada riwayat mutasi.</div>
            ) : (
              paginatedMovements?.map((move: any) => {
                const isPositive = move.quantity > 0;
                return (
                  <div key={move.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
                    <div className="flex justify-between items-start mb-2 gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-slate-900 dark:text-white text-sm line-clamp-1">{move.products?.name || 'Produk Dihapus'}</h4>
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mt-0.5">
                          {formatMovementType(move.type)}
                        </span>
                      </div>
                      <span className={`font-bold text-sm shrink-0 ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {isPositive ? `+${move.quantity.toLocaleString('id-ID')}` : move.quantity.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-2">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {new Date(move.created_at).toLocaleString('id-ID', {
                          day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </div>
                    {move.note && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 italic mt-2 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">"{move.note}"</p>
                    )}
                    {isAdmin && (
                      <div className="flex justify-end mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(move.id)} className="h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                          <Trash2 className="w-3.5 h-3.5 mr-1" /> Hapus
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop History Table */}
          <div className="hidden md:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <Table className="min-w-[800px]">
                <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                  <TableRow className="border-slate-200 dark:border-slate-800">
                    <TableHead>Waktu</TableHead>
                    <TableHead>Produk</TableHead>
                    <TableHead>Jenis Mutasi</TableHead>
                    <TableHead>Catatan</TableHead>
                    <TableHead className="text-right w-[150px]">Perubahan Qty</TableHead>
                    {isAdmin && <TableHead className="w-[50px] text-center">Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements?.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8">Belum ada riwayat mutasi.</TableCell></TableRow>
                  ) : (
                    paginatedMovements?.map((move: any) => {
                      const isPositive = move.quantity > 0;
                      return (
                        <TableRow key={move.id} className="border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                          <TableCell className="text-sm text-slate-500 whitespace-nowrap">
                            {new Date(move.created_at).toLocaleString('id-ID', {
                              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                          </TableCell>
                          <TableCell className="font-medium text-slate-900 dark:text-slate-100">{move.products?.name || 'Produk Dihapus'}</TableCell>
                          <TableCell>
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              {formatMovementType(move.type)}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-slate-500 italic max-w-[200px] truncate" title={move.note || '-'}>
                            {move.note || '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-bold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              {isPositive ? `+${move.quantity.toLocaleString('id-ID')}` : move.quantity.toLocaleString('id-ID')}
                            </span>
                          </TableCell>
                          {isAdmin && (
                            <TableCell className="text-center">
                              <ActionMenu
                                items={[
                                  {
                                    label: "Hapus",
                                    onClick: () => handleDelete(move.id),
                                    destructive: true
                                  }
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
          </div>
        </>
      )}

      {/* Pagination Controls */}
      {movements && movements.length > 0 && (
        <div className="flex items-center justify-between py-3 border-t border-slate-200 dark:border-slate-800 mt-2">
          <div className="text-sm text-slate-500">
            Halaman {page} dari {Math.ceil(movements.length / ITEMS_PER_PAGE) || 1}
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
              disabled={page * ITEMS_PER_PAGE >= movements.length}
              className="flex items-center gap-1"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={isDeleteAllHistoryDialogOpen} onOpenChange={setIsDeleteAllHistoryDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus seluruh riwayat mutasi?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus seluruh riwayat mutasi stok? Tindakan ini tidak dapat dibatalkan dan tidak akan mengembalikan kuantitas stok produk ke keadaan semula. Seluruh catatan mutasi akan hilang dari sistem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-t-2 border-slate-200 dark:border-slate-700 pt-4 mt-2">
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white"
              disabled={deleteAllMovements.isPending}
              onClick={() => {
                deleteAllMovements.mutate(undefined, {
                  onSuccess: () => {
                    toast({ title: "Sukses", description: "Seluruh riwayat mutasi berhasil dihapus" });
                    setIsDeleteAllHistoryDialogOpen(false);
                    refetch();
                  },
                  onError: () => toast({ title: "Error", description: "Gagal menghapus seluruh riwayat mutasi", variant: "destructive" })
                });
              }}
            >
              {deleteAllMovements.isPending ? "Menghapus..." : "Ya, Hapus Semua"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isDeleteHistoryDialogOpen} onOpenChange={setIsDeleteHistoryDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus riwayat mutasi ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus riwayat mutasi ini?<br></br>Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-t-2 border-slate-200 dark:border-slate-700 pt-4 mt-2">
            <AlertDialogCancel onClick={() => setDeleteHistoryId(null)}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white"
              disabled={deleteMovement.isPending}
              onClick={() => {
                if (deleteHistoryId !== null) {
                  deleteMovement.mutate({ id: deleteHistoryId }, {
                    onSuccess: () => {
                      toast({ title: "Sukses", description: "Riwayat mutasi berhasil dihapus" });
                      setIsDeleteHistoryDialogOpen(false);
                      setDeleteHistoryId(null);
                      refetch();
                    },
                    onError: () => toast({ title: "Error", description: "Gagal menghapus riwayat mutasi", variant: "destructive" })
                  });
                }
              }}
            >
              {deleteMovement.isPending ? "Menghapus..." : "Ya, Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}