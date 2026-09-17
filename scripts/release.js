import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ ERROR: Variabel SUPABASE_SERVICE_ROLE_KEY tidak ditemukan di file .env');
  console.error('Silakan tambahkan SUPABASE_SERVICE_ROLE_KEY=kunci_rahasia_anda ke file .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runRelease() {
  try {
    console.log('🚀 Memulai proses rilis Android...\n');

    // 1. Baca versi dari version.ts
    const versionFilePath = path.resolve(__dirname, '../src/lib/version.ts');
    const versionFileContent = fs.readFileSync(versionFilePath, 'utf-8');
    const versionMatch = versionFileContent.match(/export const APP_VERSION = '(.+?)';/);

    if (!versionMatch || !versionMatch[1]) {
      throw new Error('Tidak bisa menemukan APP_VERSION di src/lib/version.ts');
    }

    const version = versionMatch[1];
    console.log(`📦 Versi terdeteksi: v${version}`);

    // 2. Update versionCode dan versionName di build.gradle
    console.log('📝 Memperbarui versi di android/app/build.gradle...');
    const buildGradlePath = path.resolve(__dirname, '../android/app/build.gradle');
    let buildGradleContent = fs.readFileSync(buildGradlePath, 'utf-8');

    // Cari versionCode saat ini dan naikkan 1
    const versionCodeMatch = buildGradleContent.match(/versionCode\s+(\d+)/);
    if (versionCodeMatch && versionCodeMatch[1]) {
      const newVersionCode = parseInt(versionCodeMatch[1]) + 1;
      buildGradleContent = buildGradleContent.replace(/versionCode\s+\d+/, `versionCode ${newVersionCode}`);
      console.log(`✅ versionCode diperbarui menjadi ${newVersionCode}`);
    }

    // Update versionName
    buildGradleContent = buildGradleContent.replace(/versionName\s+".+?"/, `versionName "${version}"`);
    console.log(`✅ versionName diperbarui menjadi "${version}"`);
    fs.writeFileSync(buildGradlePath, buildGradleContent);

    // 3. Build Web dan Sinkronisasi Capacitor
    console.log('🏗️ Menjalankan build Vite dan sinkronisasi Capacitor...');
    execSync('npm run build', { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
    execSync('npx cap sync android', { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });

    // 4. Build APK Release
    console.log('⚙️ Membangun (Build) APK Android...');
    execSync('.\\gradlew assemblerelease', { cwd: path.resolve(__dirname, '../android'), stdio: 'inherit' });

    // 5. Cek apakah APK tersedia
    const apkPath = path.resolve(__dirname, '../android/app/build/outputs/apk/release/app-release.apk');
    if (!fs.existsSync(apkPath)) {
      throw new Error(`APK tidak ditemukan di ${apkPath}.\nPastikan build berhasil.`);
    }

    // 6. Bersihkan file lama di folder android
    const fileName = `elproject_v.${version}.apk`;
    const storagePath = `android/${fileName}`;

    console.log(`🗑️ Membersihkan APK versi lama di Supabase...`);
    const { data: existingFiles } = await supabase.storage.from('app-releases').list('android');
    if (existingFiles && existingFiles.length > 0) {
      const filesToDelete = existingFiles
        .filter(f => f.name !== fileName && f.name !== '.emptyFolderPlaceholder')
        .map(f => `android/${f.name}`);

      if (filesToDelete.length > 0) {
        await supabase.storage.from('app-releases').remove(filesToDelete);
        console.log(`✅ Berhasil menghapus ${filesToDelete.length} file versi lama.`);
      }
    }

    // 7. Upload APK Baru ke Supabase Storage
    console.log(`☁️ Mengupload ${fileName} ke Supabase Storage (app-releases/android)...`);

    const apkBuffer = fs.readFileSync(apkPath);
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('app-releases')
      .upload(storagePath, apkBuffer, {
        contentType: 'application/vnd.android.package-archive',
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Gagal upload APK: ${uploadError.message}`);
    }

    // Dapatkan Public URL
    const { data: publicUrlData } = supabase.storage.from('app-releases').getPublicUrl(storagePath);
    const downloadUrl = publicUrlData.publicUrl;
    console.log(`✅ Upload berhasil! URL: ${downloadUrl}`);

    // 8. Update Database app_config
    console.log('\n🔄 Memperbarui versi di Database app_config...');

    // Update app_version_latest
    const { error: dbError1 } = await supabase
      .from('app_config')
      .upsert({ key: 'app_version_latest', value: version, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (dbError1) throw new Error(`Gagal update app_version_latest: ${dbError1.message}`);

    // Parse Changelog
    const changelogMatch = versionFileContent.match(/export const RELEASE_CHANGELOG = \[([\s\S]*?)\];/);
    let changelogArray = ["Peningkatan performa dan perbaikan bug"];
    if (changelogMatch && changelogMatch[1]) {
      const items = [...changelogMatch[1].matchAll(/["'](.*?)["']/g)].map(m => m[1]);
      if (items.length > 0) changelogArray = items;
    }

    // Update update_changelog
    const { error: dbErrorChangelog } = await supabase
      .from('app_config')
      .upsert({ key: 'update_changelog', value: JSON.stringify(changelogArray), updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (dbErrorChangelog) throw new Error(`Gagal update update_changelog: ${dbErrorChangelog.message}`);

    // Update download_url
    const { error: dbError2 } = await supabase
      .from('app_config')
      .upsert({ key: 'download_url', value: downloadUrl, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (dbError2) throw new Error(`Gagal update download_url: ${dbError2.message}`);

    console.log(`✅ Database berhasil diperbarui ke versi ${version}!`);
    console.log('\n🎉 Rilis Android Sukses! Pengguna sekarang akan mendapatkan popup update.');

  } catch (error) {
    console.error(`\n❌ ERROR: ${error.message}`);
    process.exit(1);
  }
}

runRelease();
