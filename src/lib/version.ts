export const APP_VERSION = '1.0.20';

export const RELEASE_CHANGELOG = [
  "ubah icon android & pwa"
];

export interface UpdateInfo {
  latestVersion: string;
  currentVersion: string;
  forceUpdate: boolean;
  downloadUrl: string;
  title: string;
  message: string;
  changelog: string[];
  hasUpdate: boolean;
}

/**
 * Cek apakah latest > current menggunakan SemVer sederhana
 * Contoh: '1.0.1' > '1.0.0' => true
 */
export function isUpdateAvailable(current: string, latest: string): boolean {
  if (!current || !latest) return false;
  if (current === latest) return false;

  const currentParts = current.replace(/[^0-9.]/g, '').split('.').map(Number);
  const latestParts = latest.replace(/[^0-9.]/g, '').split('.').map(Number);

  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const c = currentParts[i] || 0;
    const l = latestParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}
