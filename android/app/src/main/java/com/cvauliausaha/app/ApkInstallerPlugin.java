package com.elproject.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("Path is required");
            return;
        }

        try {
            // path dari Capacitor (Filesystem) biasanya berawalan file://
            if (path.startsWith("file://")) {
                path = path.substring(7);
            }
            
            File file = new File(path);
            if (!file.exists()) {
                call.reject("File not found: " + path);
                return;
            }

            Intent intent = new Intent(Intent.ACTION_VIEW);
            Uri uri;
            
            // Gunakan FileProvider untuk Android N (7.0) ke atas
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                String authority = getContext().getPackageName() + ".fileprovider";
                uri = FileProvider.getUriForFile(getContext(), authority, file);
                intent.setFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            } else {
                uri = Uri.fromFile(file);
                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            }

            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            getContext().startActivity(intent);
            
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to install APK: " + e.getMessage(), e);
        }
    }
}
