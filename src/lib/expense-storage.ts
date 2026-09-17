import { supabase } from './supabase';

const BUCKET_NAME = 'expense-receipts';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const MIME_TYPE_MAP: { [key: string]: string } = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'webp': 'image/webp'
};

const getMimeType = (fileName: string, fileType: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return MIME_TYPE_MAP[ext] || fileType || 'image/jpeg';
};

export interface UploadResponse {
  success: boolean;
  filePath?: string;
  publicUrl?: string;
  error?: string;
}

export interface DeleteResponse {
  success: boolean;
  error?: string;
}

export interface ValidationError {
  valid: boolean;
  error?: string;
}

export const validateReceiptFile = (file: File): ValidationError => {
  const isValidMimeType = ALLOWED_MIME_TYPES.includes(file.type);
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const isValidExt = ALLOWED_EXTENSIONS.includes(ext);

  if (!isValidMimeType && !isValidExt) {
    return {
      valid: false,
      error: `Tipe file tidak didukung. Hanya JPG, PNG, dan WebP yang diizinkan.`
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `Ukuran file terlalu besar. Maksimal 5MB.`
    };
  }

  return { valid: true };
};

export const uploadExpenseReceipt = async (
  file: File
): Promise<UploadResponse> => {
  try {
    const validation = validateReceiptFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const timestamp = new Date().getTime();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const fileName = `receipt_${timestamp}_${randomStr}.${fileExt}`;

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, file, {
        cacheControl: '31536000',
        upsert: false,
        contentType: getMimeType(file.name, file.type)
      });

    if (error) {
      return { success: false, error: `Gagal upload: ${error.message}` };
    }

    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);

    return {
      success: true,
      filePath: fileName,
      publicUrl: publicUrlData.publicUrl
    };
  } catch (error: any) {
    return { success: false, error: `Error: ${error?.message || 'Terjadi kesalahan'}` };
  }
};

export const deleteExpenseReceipt = async (filePath: string): Promise<DeleteResponse> => {
  try {
    if (!filePath) {
      return { success: true };
    }

    // Extract the correct path after the bucket name if it's a full URL
    let fileKey = filePath;
    const bucketStr = `/${BUCKET_NAME}/`;
    if (filePath.includes(bucketStr)) {
        fileKey = filePath.substring(filePath.indexOf(bucketStr) + bucketStr.length);
    } else if (filePath.includes('/')) {
        // Fallback for older formats
        fileKey = filePath.split('/').pop() || filePath;
    }
    // Remove query params if any
    if (fileKey.includes('?')) {
        fileKey = fileKey.split('?')[0];
    }
    fileKey = decodeURIComponent(fileKey);

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([fileKey]);

    if (error) {
      if (!error.message.includes('not found')) {
         return { success: false, error: `Gagal menghapus: ${error.message}` };
      }
    } else if (!data || data.length === 0) {
      // Supabase returns empty data array if the file wasn't found OR if RLS blocked it
      return { success: false, error: `File tidak ditemukan atau akses ditolak oleh Policy Supabase.` };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: `Error: ${error?.message || 'Terjadi kesalahan'}` };
  }
};
