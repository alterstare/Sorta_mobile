package com.alterstare.sorta;

import android.net.Uri;
import android.util.Base64;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

// Serves the app's picture urls, same-origin with the app:
//   https://localhost/_s/img/<b64url path>       a picture (NAS: through the cache)
//   https://localhost/_s/th/<b64url thumb>?o=<b64url original>
//                                                a 미리 보기: the NAS thumb, else made from the original
//   https://localhost/_s/lth/<b64url path>?m=…   a 미리 보기 of a phone file
//   https://localhost/_s/raw/<b64url path>       a NAS file as it is now (no cache)
// Everything else falls through to Capacitor's local server.
final class SortaWebViewClient extends BridgeWebViewClient {
    private static final String PREFIX = "/_s/";
    private static final int THUMB = 480;

    SortaWebViewClient(Bridge bridge) {
        super(bridge);
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri u = request.getUrl();
        String path = u.getPath();
        if ("localhost".equals(u.getHost()) && path != null && path.startsWith(PREFIX)) return serve(path.substring(PREFIX.length()), u);
        return super.shouldInterceptRequest(view, request);
    }

    private static String dec(String s) {
        return new String(Base64.decode(s, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP), StandardCharsets.UTF_8);
    }

    private static WebResourceResponse serve(String rest, Uri u) {
        int slash = rest.indexOf('/');
        if (slash < 0) return error(400);
        String kind = rest.substring(0, slash);
        String target;
        try {
            target = dec(rest.substring(slash + 1));
        } catch (IllegalArgumentException e) {
            return error(400);
        }
        try {
            switch (kind) {
                case "img":
                    if (Vfs.isRemote(target)) return ok(mimeOf(target), new ByteArrayInputStream(ImgCache.nas(target)), true);
                    File f = new File(target);
                    if (!f.isFile()) return error(404);
                    return ok(mimeOf(target), new FileInputStream(f), true);
                case "th": {
                    String o = u.getQueryParameter("o");
                    String key = "th|" + target;
                    byte[] b = ImgCache.get(key);
                    if (b == null) {
                        try {
                            b = Vfs.read(target);
                        } catch (IOException e) {
                            if (o == null || o.isEmpty()) throw e;
                            String orig = dec(o);
                            b = ImgCache.thumb(Vfs.isRemote(orig) ? Vfs.read(orig) : Files.readAllBytes(new File(orig).toPath()), THUMB);
                        }
                        ImgCache.put(key, b);
                    }
                    return ok("image/webp", new ByteArrayInputStream(b), true);
                }
                case "lth": {
                    String key = "lth|" + target + "|" + u.getQueryParameter("m");
                    byte[] b = ImgCache.get(key);
                    if (b == null) {
                        b = ImgCache.thumb(Files.readAllBytes(new File(target).toPath()), THUMB);
                        ImgCache.put(key, b);
                    }
                    return ok("image/webp", new ByteArrayInputStream(b), true);
                }
                case "raw":
                    return ok("application/octet-stream", Vfs.open(target), false);
                default:
                    return error(400);
            }
        } catch (IOException e) {
            String m = String.valueOf(e.getMessage());
            return error(m.startsWith("ENOENT") || m.contains("404") ? 404 : 502);
        } catch (RuntimeException e) {
            return error(500);
        }
    }

    private static WebResourceResponse ok(String mime, InputStream in, boolean cache) {
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", cache ? "public, max-age=604800, immutable" : "no-store");
        h.put("Access-Control-Allow-Origin", "*");
        return new WebResourceResponse(mime, null, 200, "OK", h, in);
    }

    private static WebResourceResponse error(int code) {
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        h.put("Cache-Control", "no-store");
        return new WebResourceResponse("text/plain", "utf-8", code, code == 404 ? "Not Found" : "Error", h, new ByteArrayInputStream(new byte[0]));
    }

    static String mimeOf(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        if (n.endsWith(".webp")) return "image/webp";
        if (n.endsWith(".avif")) return "image/avif";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".gif")) return "image/gif";
        if (n.endsWith(".bmp")) return "image/bmp";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".heic") || n.endsWith(".heif")) return "image/heif";
        return "image/*";
    }
}
