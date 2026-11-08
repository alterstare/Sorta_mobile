package com.alterstare.sorta;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.util.List;

// One NAS with SMB and WebDAV both entered: SMB when it's reachable (home
// network), else WebDAV. The choice is made on first use, re-checked every
// minute while on WebDAV (and when asked, e.g. on resume), and a failed call
// on one moves the connection to the other and retries there once — except
// "not found", which is the same answer on both.
//
// Paths are WebDAV-relative. A WebDAV address with a path (https://nas:5006/tunnel)
// means its root is inside a share, so SMB gets that path in front.
final class DualFs implements RemoteFs {
    private static final long PROBE_MS = 60_000;
    private final SmbFs smb;
    private final WebDavFs dav;
    private final String host;
    private final int port;
    private final String prefix; // "" or "tunnel/" (WebDAV root's path)
    private volatile RemoteFs active;
    private volatile long probedAt;

    DualFs(SmbFs smb, WebDavFs dav, NasStore.Conn c) {
        this.smb = smb;
        this.dav = dav;
        this.host = c.host;
        this.port = c.port > 0 ? c.port : 445;
        this.prefix = davPath(c.url);
    }

    static String davPath(String url) {
        try {
            String p = new URI(url).getPath();
            if (p == null) return "";
            p = p.replaceAll("^/+|/+$", "");
            return p.isEmpty() ? "" : p + "/";
        } catch (Exception e) {
            return "";
        }
    }

    // "smb" | "webdav": what the next call uses (probing SMB when due / forced).
    synchronized String via(boolean recheck) {
        if (recheck) probedAt = 0;
        return pick() == smb ? "smb" : "webdav";
    }

    private synchronized RemoteFs pick() {
        long now = System.currentTimeMillis();
        if (active == smb) return smb;
        if (active == null || now - probedAt > PROBE_MS) {
            probedAt = now;
            active = reachable() ? smb : dav;
        }
        return active;
    }

    // The SMB port answers within 2s (a quick look before smbj's 30s timeout).
    private boolean reachable() {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, port), 2000);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    private String rel(RemoteFs fs, String rel) {
        if (fs != smb || prefix.isEmpty()) return rel;
        return rel.isEmpty() ? prefix.substring(0, prefix.length() - 1) : prefix + rel;
    }

    private static boolean notFound(IOException e) {
        String m = String.valueOf(e.getMessage());
        return m.startsWith("ENOENT") || m.contains("404");
    }

    private interface Op<T> {
        T run(RemoteFs fs, String rel) throws IOException;
    }

    private <T> T call(String rel, Op<T> op) throws IOException {
        RemoteFs a = pick();
        try {
            return op.run(a, rel(a, rel));
        } catch (IOException e) {
            if (notFound(e)) throw e;
            RemoteFs b = a == smb ? dav : smb;
            synchronized (this) {
                active = b;
                probedAt = System.currentTimeMillis();
            }
            return op.run(b, rel(b, rel));
        }
    }

    @Override public Entry stat(String rel) throws IOException { return call(rel, RemoteFs::stat); }
    @Override public List<Entry> list(String rel) throws IOException { return call(rel, RemoteFs::list); }
    @Override public InputStream open(String rel) throws IOException { return call(rel, RemoteFs::open); }
    @Override public void mkdirs(String rel) throws IOException { call(rel, (fs, r) -> { fs.mkdirs(r); return null; }); }
    @Override public void delete(String rel, boolean recursive) throws IOException { call(rel, (fs, r) -> { fs.delete(r, recursive); return null; }); }

    // The data can be read only once: no retry on the other, the next call moves.
    @Override
    public void write(String rel, InputStream data, long length) throws IOException {
        RemoteFs a = pick();
        try {
            a.write(rel(a, rel), data, length);
        } catch (IOException e) {
            if (!notFound(e)) synchronized (this) {
                active = a == smb ? dav : smb;
                probedAt = System.currentTimeMillis();
            }
            throw e;
        }
    }

    @Override
    public void rename(String from, String to) throws IOException {
        RemoteFs a = pick();
        try {
            a.rename(rel(a, from), rel(a, to));
        } catch (IOException e) {
            if (notFound(e)) throw e;
            RemoteFs b = a == smb ? dav : smb;
            synchronized (this) {
                active = b;
                probedAt = System.currentTimeMillis();
            }
            b.rename(rel(b, from), rel(b, to));
        }
    }

    @Override
    public void close() {
        smb.close();
        dav.close();
    }
}
