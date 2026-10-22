package com.alterstare.sorta;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.Arrays;

// Disk cache for NAS pictures and 미리 보기 (LRU by mtime, touched on hit,
// trimmed to 90% of the budget in the background every ~16MB written), and
// the thumbnail maker for pictures without a NAS 미리 보기 / phone files.
final class ImgCache {
    private static File dir;
    private static volatile long max = 1024L * 1024 * 1024;
    private static long added;
    private static volatile boolean trimming;

    private ImgCache() {}

    static void init(Context ctx) {
        dir = new File(ctx.getCacheDir(), "img");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
    }

    static void setLimit(long bytes) {
        max = Math.max(0, bytes);
        new Thread(ImgCache::prune).start();
    }

    private static File entry(String key) {
        return new File(dir, sha1(key));
    }

    static byte[] get(String key) throws IOException {
        File f = entry(key);
        if (!f.exists() || f.length() == 0) return null;
        //noinspection ResultOfMethodCallIgnored
        f.setLastModified(System.currentTimeMillis());
        return Files.readAllBytes(f.toPath());
    }

    // A NAS file through the cache (pictures don't change in place: Sorta only moves them).
    static byte[] nas(String path) throws IOException {
        byte[] b = get("nas|" + path);
        if (b != null) return b;
        b = Vfs.read(path);
        put("nas|" + path, b);
        return b;
    }

    static void put(String key, byte[] bytes) throws IOException {
        if (max <= 0) return;
        File f = entry(key);
        File tmp = new File(f.getPath() + ".tmp");
        try (OutputStream out = new FileOutputStream(tmp)) {
            out.write(bytes);
        }
        //noinspection ResultOfMethodCallIgnored
        tmp.renameTo(f);
        boolean trim;
        synchronized (ImgCache.class) {
            added += bytes.length;
            trim = added > 16L * 1024 * 1024 && !trimming;
            if (trim) {
                added = 0;
                trimming = true;
            }
        }
        if (trim) new Thread(() -> {
            try {
                prune();
            } finally {
                trimming = false;
            }
        }).start();
    }

    private static void prune() {
        File[] files = dir.listFiles();
        if (files == null) return;
        long total = 0;
        for (File f : files) total += f.length();
        if (total <= max) return;
        Arrays.sort(files, (a, b) -> Long.compare(a.lastModified(), b.lastModified()));
        for (File f : files) {
            if (total <= max * 9 / 10) break;
            total -= f.length();
            //noinspection ResultOfMethodCallIgnored
            f.delete();
        }
    }

    static long[] usage() {
        File[] files = dir.listFiles();
        long total = 0;
        if (files != null) for (File f : files) total += f.length();
        return new long[] {total, files == null ? 0 : files.length};
    }

    static void clear() {
        File[] files = dir.listFiles();
        if (files != null) for (File f : files) //noinspection ResultOfMethodCallIgnored
            f.delete();
    }

    // ≤ max px on the long side, WEBP. Bounds first → inSampleSize decode.
    static byte[] thumb(byte[] data, int maxSide) throws IOException {
        BitmapFactory.Options b = new BitmapFactory.Options();
        b.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(data, 0, data.length, b);
        int sw = b.outWidth, sh = b.outHeight;
        if (sw <= 0 || sh <= 0) throw new IOException("decode failed");
        float scale = Math.min(1f, (float) maxSide / Math.max(sw, sh));
        int w = Math.max(1, Math.round(sw * scale));
        int h = Math.max(1, Math.round(sh * scale));
        int sample = 1;
        while (sw / (sample * 2) >= w && sh / (sample * 2) >= h) sample *= 2;
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inSampleSize = sample;
        Bitmap full = BitmapFactory.decodeByteArray(data, 0, data.length, o);
        if (full == null) throw new IOException("decode failed");
        Bitmap scaled = Bitmap.createScaledBitmap(full, w, h, true);
        if (scaled != full) full.recycle();
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        @SuppressWarnings("deprecation")
        Bitmap.CompressFormat fmt = Build.VERSION.SDK_INT >= 30 ? Bitmap.CompressFormat.WEBP_LOSSY : Bitmap.CompressFormat.WEBP;
        scaled.compress(fmt, 74, bo);
        scaled.recycle();
        return bo.toByteArray();
    }

    static String sha1(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-1").digest(s.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (byte x : d) sb.append(String.format("%02x", x));
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString(s.hashCode());
        }
    }
}
