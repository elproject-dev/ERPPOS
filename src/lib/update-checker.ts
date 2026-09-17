import { supabase } from './supabase';
import { APP_VERSION, isUpdateAvailable, type UpdateInfo } from './version';

const SESSION_CACHE_KEY = 'elproject_update_checked';
const SKIP_VERSION_KEY = 'elproject_skip_version';

/**
 * Ambil konfigurasi update dari tabel app_config di Supabase
 */
async function fetchRemoteConfig(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('app_config')
    .select('key, value');

  if (error) {
    console.warn('[UpdateChecker] Gagal fetch remote config:', error.message);
    return {};
  }
  console.log('[UpdateChecker] Data mentah dari DB:', data);

  const config: Record<string, string> = {};
  if (data) {
    for (const row of data) {
      config[row.key] = row.value;
    }
  }

  return config;
}

/**
 * Parse changelog dari string JSON ke array
 */
function parseChangelog(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Jika bukan JSON, coba split by newline atau return as single item
    return raw.split('\n').filter(Boolean);
  }
}

/**
 * Cek apakah ada update tersedia
 * @param forceCheck - bypass session cache (untuk cek manual dari Settings)
 */
export async function checkForUpdate(forceCheck = false): Promise<UpdateInfo | null> {
  console.log('[UpdateChecker] Memulai pengecekan update... APP_VERSION =', APP_VERSION);
  // Cek session cache — hanya cek 1x per sesi kecuali force (dan jangan cache di mode development)
  if (!forceCheck && !import.meta.env.DEV) {
    const cached = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (cached === 'true') {
      return null;
    }
  }

  try {
    const config = await fetchRemoteConfig();
    console.log('[UpdateChecker] Hasil fetchRemoteConfig:', config);

    // Tandai sudah dicek untuk sesi ini
    sessionStorage.setItem(SESSION_CACHE_KEY, 'true');

    const latestVersion = config['app_version_latest'] || APP_VERSION;
    const forceUpdate = config['force_update'] === 'true';
    const downloadUrl = config['download_url'] || 'https://play.google.com/store/apps/details?id=com.kasir.app';
    const title = config['update_title'] || 'Update Tersedia! 🚀';
    const message = config['update_message'] || 'Versi terbaru sudah tersedia dengan fitur dan perbaikan baru.';
    const changelog = parseChangelog(config['update_changelog']);

    const hasUpdate = isUpdateAvailable(APP_VERSION, latestVersion);
    console.log(`[UpdateChecker] current: ${APP_VERSION}, latest: ${latestVersion}, hasUpdate: ${hasUpdate}`);

    // Cek apakah user sudah skip versi ini (kecuali force update)
    if (hasUpdate && !forceUpdate && !forceCheck) {
      const skippedVersion = localStorage.getItem(SKIP_VERSION_KEY);
      if (skippedVersion === latestVersion) {
        console.log(`[UpdateChecker] Peringatan: Anda sebelumnya menekan "Nanti Saja" untuk versi ${latestVersion}. Namun untuk keperluan uji coba, ini diabaikan (bypass).`);
        // return null; // Sengaja dikomentari agar pop-up tetap muncul saat testing!
      }
    }

    if (!hasUpdate) {
      console.log('[UpdateChecker] Tidak ada update baru.');
      return null;
    }

    return {
      latestVersion,
      currentVersion: APP_VERSION,
      forceUpdate,
      downloadUrl,
      title,
      message,
      changelog,
      hasUpdate,
    };
  } catch (error) {
    console.warn('[UpdateChecker] Error saat cek update:', error);
    return null;
  }
}

/**
 * Tandai versi tertentu sebagai "di-skip" oleh user
 */
export function skipVersion(version: string): void {
  localStorage.setItem(SKIP_VERSION_KEY, version);
}

/**
 * Reset session cache agar bisa cek ulang
 */
export function resetUpdateCache(): void {
  sessionStorage.removeItem(SESSION_CACHE_KEY);
}
