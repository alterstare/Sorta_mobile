package com.alterstare.sorta;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.Settings;
import android.widget.Toast;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// JS bridge (src/backend/native.ts): NAS connections, files (phone paths or
// /nas/<id>/…), 올리기, the folder picker, storage permission.
@CapacitorPlugin(
    name = "Sorta",
    permissions = {
        @Permission(strings = {Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE}, alias = "storage")
    }
)
public class SortaPlugin extends Plugin {
    static SortaPlugin instance;
    private final ExecutorService io = Executors.newFixedThreadPool(6);

    private static final Set<String> IMAGE_EXT = new HashSet<>(Arrays.asList(
        "jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "heic", "heif", "jxl", "tif", "tiff"));

    @Override
    public void load() {
        instance = this;
        NasStore.init(getContext());
        ImgCache.init(getContext());
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        notifyListeners("pause", new JSObject());
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        notifyListeners("resume", new JSObject());
    }

    // Android back → JS decides (close something / step back / exit).
    boolean handleBack() {
        if (!hasListeners("back")) return false;
        notifyListeners("back", new JSObject());
        return true;
    }

    private interface Job {
        void run() throws Exception;
    }

    private void bg(PluginCall call, Job job) {
        io.execute(() -> {
            try {
                job.run();
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage() != null ? e.getMessage() : e));
            }
        });
    }

    private static String need(PluginCall call, String key) {
        String v = call.getString(key);
        if (v == null) throw new IllegalArgumentException("missing " + key);
        return v;
    }

    // ---- NAS (WebDAV) — passwords stay here (NasStore), JS never sees them ----

    @PluginMethod
    public void nasList(PluginCall call) {
        try {
            JSArray a = new JSArray();
            for (NasStore.Conn c : NasStore.list()) a.put(c.toJson(true, NasStore.password(c.id)));
            JSObject o = new JSObject();
            o.put("conns", a);
            call.resolve(o);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    private static NasStore.Conn connOf(PluginCall call) {
        JSObject j = call.getObject("conn");
        NasStore.Conn c = NasStore.Conn.fromJson(j == null ? new JSObject() : j);
        c.type = "webdav";
        return c;
    }

    @PluginMethod
    public void nasTest(PluginCall call) {
        bg(call, () -> {
            NasStore.Conn c = connOf(call);
            String pw = call.getString("password");
            if (pw == null && c.id != null && !c.id.isEmpty()) pw = NasStore.password(c.id);
            RemoteFs fs = Vfs.create(c, pw);
            try {
                JSObject o = new JSObject();
                o.put("count", fs.list("").size());
                call.resolve(o);
            } finally {
                fs.close();
            }
        });
    }

    @PluginMethod
    public void nasSave(PluginCall call) {
        bg(call, () -> {
            NasStore.Conn c = connOf(call);
            if (c.id == null || c.id.isEmpty()) c.id = "n" + Long.toString(System.currentTimeMillis(), 36);
            NasStore.save(c, call.getString("password"));
            Vfs.forget(c.id);
            JSObject o = new JSObject();
            o.put("id", c.id);
            call.resolve(o);
        });
    }

    @PluginMethod
    public void nasRemove(PluginCall call) {
        bg(call, () -> {
            String id = need(call, "id");
            NasStore.remove(id);
            Vfs.forget(id);
            call.resolve();
        });
    }

    // ---- files ----

    @PluginMethod
    public void fsReadText(PluginCall call) {
        bg(call, () -> {
            JSObject o = new JSObject();
            o.put("data", new String(Vfs.read(need(call, "path")), StandardCharsets.UTF_8));
            call.resolve(o);
        });
    }

    @PluginMethod
    public void fsWriteText(PluginCall call) {
        bg(call, () -> {
            Vfs.write(need(call, "path"), need(call, "data").getBytes(StandardCharsets.UTF_8));
            call.resolve();
        });
    }

    private static JSObject statOf(RemoteFs.Entry e) {
        JSObject o = new JSObject();
        o.put("name", e.name);
        o.put("exists", e.exists);
        o.put("isDir", e.exists && e.dir);
        o.put("isFile", e.exists && !e.dir);
        o.put("size", e.size);
        o.put("mtime", e.mtime);
        return o;
    }

    @PluginMethod
    public void fsStat(PluginCall call) {
        bg(call, () -> call.resolve(statOf(Vfs.stat(need(call, "path")))));
    }

    @PluginMethod
    public void fsReaddir(PluginCall call) {
        bg(call, () -> {
            String path = need(call, "path");
            JSArray arr = new JSArray();
            if (Vfs.isRemote(path)) {
                for (RemoteFs.Entry e : Vfs.list(path)) arr.put(statOf(e));
            } else {
                File[] list = new File(path).listFiles();
                if (list == null) throw new IOException("ENOENT: " + path);
                for (File f : list) arr.put(statOf(Vfs.stat(f.getPath())));
            }
            JSObject res = new JSObject();
            res.put("entries", arr);
            call.resolve(res);
        });
    }

    @PluginMethod
    public void fsMkdir(PluginCall call) {
        bg(call, () -> {
            String path = need(call, "path");
            if (Vfs.isRemote(path)) Vfs.mkdirs(path);
            else if (!new File(path).isDirectory() && !new File(path).mkdirs()) throw new IOException("mkdir failed: " + path);
            call.resolve();
        });
    }

    // NAS files only (the phone's own pictures go through deleteLocal).
    @PluginMethod
    public void fsRm(PluginCall call) {
        bg(call, () -> {
            String path = need(call, "path");
            if (!Vfs.isRemote(path)) throw new IOException("not a NAS path");
            Vfs.delete(path, false);
            call.resolve();
        });
    }

    // ---- 올리기 ----

    private static boolean isImage(String name) {
        int dot = name.lastIndexOf('.');
        return dot > 0 && IMAGE_EXT.contains(name.substring(dot + 1).toLowerCase(Locale.ROOT));
    }

    // Pictures directly in the folder (not its sub-folders; hidden files skipped).
    @PluginMethod
    public void listImages(PluginCall call) {
        bg(call, () -> {
            File dir = new File(need(call, "dir"));
            File[] list = dir.listFiles();
            if (list == null) throw new IOException(dir.exists() ? "폴더를 읽을 수 없습니다 (파일 접근 권한을 확인하세요)" : "폴더가 없습니다: " + dir);
            JSArray arr = new JSArray();
            for (File f : list) {
                if (!f.isFile() || f.getName().startsWith(".") || !isImage(f.getName())) continue;
                JSObject o = new JSObject();
                o.put("path", f.getAbsolutePath());
                o.put("name", f.getName());
                o.put("size", f.length());
                o.put("mtime", f.lastModified());
                arr.put(o);
            }
            JSObject res = new JSObject();
            res.put("files", arr);
            call.resolve(res);
        });
    }

    // One phone file → a NAS path; resolves with the size the NAS reports.
    @PluginMethod
    public void upload(PluginCall call) {
        bg(call, () -> {
            File from = new File(need(call, "from"));
            String to = need(call, "to");
            if (!from.isFile()) throw new IOException("파일이 없습니다: " + from.getName());
            if (!Vfs.isRemote(to)) throw new IOException("NAS 경로가 아닙니다");
            Vfs.put(from, to);
            JSObject o = new JSObject();
            o.put("size", Vfs.stat(to).size);
            call.resolve(o);
        });
    }

    // Phone pictures the user asked to remove after the upload (checked on the
    // JS side against the NAS). Only image files; the gallery is told.
    @PluginMethod
    public void deleteLocal(PluginCall call) {
        JSArray paths = call.getArray("paths", new JSArray());
        bg(call, () -> {
            List<String> gone = new ArrayList<>();
            for (int i = 0; i < paths.length(); i++) {
                String p = paths.optString(i, "");
                File f = new File(p);
                if (p.isEmpty() || Vfs.isRemote(p) || !f.isFile() || !isImage(f.getName())) continue;
                if (f.delete()) gone.add(p);
            }
            if (!gone.isEmpty()) MediaScannerConnection.scanFile(getContext(), gone.toArray(new String[0]), null, null);
            JSObject o = new JSObject();
            o.put("deleted", new JSArray(gone));
            call.resolve(o);
        });
    }

    // A picture (NAS or phone) → the phone's gallery (Pictures/Sorta). A
    // name clash is renamed by the system ("x (1).jpg").
    @PluginMethod
    public void saveToGallery(PluginCall call) {
        bg(call, () -> {
            String path = need(call, "path");
            byte[] b = Vfs.isRemote(path) ? ImgCache.nas(path) : java.nio.file.Files.readAllBytes(new File(path).toPath());
            String name = path.substring(path.lastIndexOf('/') + 1);
            int dot = name.lastIndexOf('.');
            String ext = dot >= 0 ? name.substring(dot + 1).toLowerCase(Locale.ROOT) : "jpg";
            String mime = SortaWebViewClient.mimeOf(name);
            if ("image/*".equals(mime)) mime = "image/" + ext;
            String saved;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                android.content.ContentResolver cr = getContext().getContentResolver();
                android.content.ContentValues v = new android.content.ContentValues();
                v.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, name);
                v.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, mime);
                v.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Sorta");
                v.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 1);
                Uri uri = cr.insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                if (uri == null) throw new IOException("저장하지 못했습니다");
                try (java.io.OutputStream out = cr.openOutputStream(uri)) {
                    if (out == null) throw new IOException("저장하지 못했습니다");
                    out.write(b);
                }
                android.content.ContentValues done = new android.content.ContentValues();
                done.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 0);
                cr.update(uri, done, null, null);
                saved = name;
                try (android.database.Cursor c = cr.query(uri, new String[] {android.provider.MediaStore.MediaColumns.DISPLAY_NAME}, null, null, null)) {
                    if (c != null && c.moveToFirst()) saved = c.getString(0);
                }
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "Sorta");
                //noinspection ResultOfMethodCallIgnored
                dir.mkdirs();
                String stem = dot >= 0 ? name.substring(0, dot) : name;
                File f = new File(dir, name);
                for (int i = 1; f.exists(); i++) f = new File(dir, stem + " (" + i + ")." + ext);
                try (java.io.OutputStream out = new java.io.FileOutputStream(f)) {
                    out.write(b);
                }
                MediaScannerConnection.scanFile(getContext(), new String[] {f.getPath()}, null, null);
                saved = f.getName();
            }
            JSObject o = new JSObject();
            o.put("name", saved);
            call.resolve(o);
        });
    }

    // ---- 올리기 in the background ----

    private boolean askedNotify;
    static final int NOTIFY_REQ = 7302;

    // active: an upload runs → keep the foreground service up and its
    // notification current; false → stop it.
    @PluginMethod
    public void uploadService(PluginCall call) {
        android.content.Context ctx = getContext();
        if (!Boolean.TRUE.equals(call.getBoolean("active", false))) {
            UploadService.stop(ctx);
            call.resolve();
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && !askedNotify
            && ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            askedNotify = true;
            androidx.core.app.ActivityCompat.requestPermissions(getActivity(), new String[] {Manifest.permission.POST_NOTIFICATIONS}, NOTIFY_REQ);
        }
        UploadService.update(ctx, call.getString("title", ""), call.getString("text", ""), call.getInt("done", 0), call.getInt("total", 0));
        call.resolve();
    }

    // Service started / stopped → the WebView's renderer priority.
    static void onUploadService() {
        SortaPlugin p = instance;
        if (p == null) return;
        p.getActivity().runOnUiThread(() -> UploadService.applyPriority(p.getBridge().getWebView()));
    }

    // ---- 자동 업데이트 ----

    // A release APK → the app cache (progress as "updateProgress" events).
    @PluginMethod
    public void downloadUpdate(PluginCall call) {
        bg(call, () -> {
            String url = need(call, "url");
            File out = new File(getContext().getCacheDir(), need(call, "name"));
            File part = new File(out.getPath() + ".part");
            okhttp3.OkHttpClient http = new okhttp3.OkHttpClient.Builder().followRedirects(true).build();
            try (okhttp3.Response r = http.newCall(new okhttp3.Request.Builder().url(url).build()).execute()) {
                if (!r.isSuccessful() || r.body() == null) throw new IOException("HTTP " + r.code());
                long total = r.body().contentLength();
                long done = 0;
                long lastSent = 0;
                try (java.io.InputStream in = r.body().byteStream(); java.io.OutputStream o = new java.io.FileOutputStream(part)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        o.write(buf, 0, n);
                        done += n;
                        if (done - lastSent > 256 * 1024) {
                            lastSent = done;
                            JSObject ev = new JSObject();
                            ev.put("done", done);
                            ev.put("total", total);
                            notifyListeners("updateProgress", ev);
                        }
                    }
                }
            }
            if (out.exists() && !out.delete()) throw new IOException("cannot replace " + out);
            if (!part.renameTo(out)) throw new IOException("rename failed");
            JSObject o = new JSObject();
            o.put("path", out.getAbsolutePath());
            call.resolve(o);
        });
    }

    // Hand the APK to the system installer. Without "install unknown apps"
    // allowed, its settings page opens first.
    @PluginMethod
    public void installApk(PluginCall call) {
        android.content.Context ctx = getContext();
        File f = new File(need(call, "path"));
        JSObject o = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ctx.getPackageManager().canRequestPackageInstalls()) {
            Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
            s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(s);
            o.put("needPermission", true);
            call.resolve(o);
            return;
        }
        Uri uri = androidx.core.content.FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", f);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(i);
        call.resolve(o);
    }

    // ---- folder picker / storage ----

    @PluginMethod
    public void pickFolder(PluginCall call) {
        startActivityForResult(call, new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), "folderResult");
    }

    // content://…/tree/primary%3ADCIM%2FCamera → /storage/emulated/0/DCIM/Camera
    @ActivityCallback
    private void folderResult(PluginCall call, ActivityResult result) {
        JSObject o = new JSObject();
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            o.put("path", null);
            call.resolve(o);
            return;
        }
        String docId = DocumentsContract.getTreeDocumentId(data.getData());
        int colon = docId.indexOf(':');
        String vol = colon >= 0 ? docId.substring(0, colon) : docId;
        String rel = colon >= 0 ? docId.substring(colon + 1) : "";
        String base = "primary".equalsIgnoreCase(vol) ? Environment.getExternalStorageDirectory().getAbsolutePath() : "/storage/" + vol;
        o.put("path", rel.isEmpty() ? base : base + "/" + rel);
        call.resolve(o);
    }

    private boolean storageGranted() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) return Environment.isExternalStorageManager();
        return getPermissionState("storage") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void storageStatus(PluginCall call) {
        JSObject o = new JSObject();
        o.put("granted", storageGranted());
        call.resolve(o);
    }

    // Android 11+: the "모든 파일에 접근" settings page; older: the runtime permission.
    @PluginMethod
    public void requestStorage(PluginCall call) {
        if (storageGranted()) {
            storageStatus(call);
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
            try {
                startActivityForResult(call, i, "storageResult");
            } catch (Exception e) {
                startActivityForResult(call, new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION), "storageResult");
            }
        } else {
            requestPermissionForAlias("storage", call, "storagePermResult");
        }
    }

    @ActivityCallback
    private void storageResult(PluginCall call, ActivityResult result) {
        storageStatus(call);
    }

    @PermissionCallback
    private void storagePermResult(PluginCall call) {
        storageStatus(call);
    }

    // ---- app ----

    @PluginMethod
    public void appInfo(PluginCall call) {
        JSObject o = new JSObject();
        try {
            android.content.pm.PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            o.put("version", pi.versionName);
            o.put("code", Build.VERSION.SDK_INT >= 28 ? (int) pi.getLongVersionCode() : pi.versionCode);
        } catch (Exception e) {
            o.put("version", "0");
            o.put("code", 0);
        }
        call.resolve(o);
    }

    @PluginMethod
    public void setTheme(PluginCall call) {
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        getContext().getSharedPreferences("sorta", android.content.Context.MODE_PRIVATE).edit().putBoolean("dark", dark).apply();
        getActivity().runOnUiThread(() -> MainActivity.applyTheme(getActivity(), getBridge().getWebView(), dark));
        call.resolve();
    }

    @PluginMethod
    public void toast(PluginCall call) {
        String text = call.getString("text", "");
        getActivity().runOnUiThread(() -> Toast.makeText(getContext(), text, Toast.LENGTH_SHORT).show());
        call.resolve();
    }

    @PluginMethod
    public void exitApp(PluginCall call) {
        call.resolve();
        getActivity().runOnUiThread(() -> {
            UploadService.stop(getActivity());
            getActivity().finish();
        });
    }

    @PluginMethod
    public void cacheInfo(PluginCall call) {
        bg(call, () -> {
            long[] u = ImgCache.usage();
            JSObject o = new JSObject();
            o.put("bytes", u[0]);
            o.put("files", u[1]);
            call.resolve(o);
        });
    }

    @PluginMethod
    public void clearCache(PluginCall call) {
        bg(call, () -> {
            ImgCache.clear();
            call.resolve();
        });
    }

    @PluginMethod
    public void setCacheLimit(PluginCall call) {
        Double b = call.getDouble("bytes");
        ImgCache.setLimit(b == null ? 1024L * 1024 * 1024 : b.longValue());
        call.resolve();
    }
}
