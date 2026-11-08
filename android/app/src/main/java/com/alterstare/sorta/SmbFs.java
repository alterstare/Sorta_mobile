package com.alterstare.sorta;

import com.hierynomus.msdtyp.AccessMask;
import com.hierynomus.msfscc.FileAttributes;
import com.hierynomus.msfscc.fileinformation.FileAllInformation;
import com.hierynomus.msfscc.fileinformation.FileIdBothDirectoryInformation;
import com.hierynomus.mssmb2.SMB2CreateDisposition;
import com.hierynomus.mssmb2.SMB2CreateOptions;
import com.hierynomus.mssmb2.SMB2ShareAccess;
import com.hierynomus.mssmb2.SMBApiException;
import com.hierynomus.smbj.SMBClient;
import com.hierynomus.smbj.SmbConfig;
import com.hierynomus.smbj.auth.AuthenticationContext;
import com.hierynomus.smbj.connection.Connection;
import com.hierynomus.smbj.session.Session;
import com.hierynomus.smbj.share.DiskShare;
import com.hierynomus.smbj.share.File;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

// SMB2/3 (smbj, from Halftone 모바일). Paths are "<share>/<path>" — the same
// shape as a NAS's WebDAV root (Synology / QNAP list the shares there), so one
// connection can use either. The root lists the shares entered in the
// connection (SMB can't list them without RPC). One session, a DiskShare per
// share, reopened when it drops.
final class SmbFs implements RemoteFs {
    private final NasStore.Conn conn;
    private final String password;
    private SMBClient client;
    private Connection connection;
    private Session session;
    private final Map<String, DiskShare> shares = new HashMap<>();

    SmbFs(NasStore.Conn c, String password) {
        this.conn = c;
        this.password = password == null ? "" : password;
    }

    private synchronized Session session() throws IOException {
        if (session != null && connection != null && connection.isConnected()) return session;
        close();
        if (conn.host == null || conn.host.isEmpty()) throw new IOException("SMB 주소를 입력하세요.");
        try {
            client = new SMBClient(SmbConfig.builder().withTimeout(30, TimeUnit.SECONDS).withSoTimeout(60, TimeUnit.SECONDS).build());
            connection = conn.port > 0 ? client.connect(conn.host, conn.port) : client.connect(conn.host);
            AuthenticationContext ac = (conn.smbUser == null || conn.smbUser.isEmpty())
                ? AuthenticationContext.anonymous()
                : new AuthenticationContext(conn.smbUser, password.toCharArray(), conn.domain == null ? "" : conn.domain);
            session = connection.authenticate(ac);
            return session;
        } catch (SMBApiException e) {
            close();
            throw new IOException(e.getStatus() != null && e.getStatus().name().contains("LOGON")
                ? "NAS 로그인 실패 (아이디 / 비밀번호 확인)" : "SMB 오류: " + e.getMessage());
        } catch (IOException e) {
            close();
            throw e;
        } catch (Exception e) {
            close();
            throw new IOException("SMB 연결 실패: " + e.getMessage(), e);
        }
    }

    private synchronized DiskShare share(String name) throws IOException {
        DiskShare d = shares.get(name);
        if (d != null && d.isConnected()) return d;
        Session s = session();
        try {
            d = (DiskShare) s.connectShare(name);
        } catch (SMBApiException e) {
            throw new IOException(String.valueOf(e.getStatus()).contains("BAD_NETWORK_NAME")
                ? "ENOENT: 공유 폴더 " + name : "SMB 오류: " + e.getMessage());
        }
        shares.put(name, d);
        return d;
    }

    // Shares entered in the connection ("tunnel, photo").
    private List<String> shareNames() {
        List<String> out = new ArrayList<>();
        if (conn.share != null) for (String x : conn.share.split("[,;]")) if (!x.trim().isEmpty()) out.add(x.trim());
        return out;
    }

    private static String p(String rel) {
        return rel.replace('/', '\\');
    }

    private interface Op<T> {
        T run(DiskShare s, String path) throws Exception;
    }

    // "<share>/<path>" → that share + the path in it. Run once; on a dropped
    // session reconnect and retry once.
    private <T> T call(String rel, Op<T> op) throws IOException {
        int i = rel.indexOf('/');
        String name = i < 0 ? rel : rel.substring(0, i);
        String path = i < 0 ? "" : p(rel.substring(i + 1));
        if (name.isEmpty()) throw new IOException("SMB 공유 폴더가 없는 경로입니다");
        for (int attempt = 0; ; attempt++) {
            DiskShare s = share(name);
            try {
                return op.run(s, path);
            } catch (SMBApiException e) {
                String st = String.valueOf(e.getStatus());
                throw new IOException(st.contains("NOT_FOUND") ? "ENOENT: " + rel : "SMB 오류: " + st + " " + e.getMessage());
            } catch (Exception e) {
                if (attempt >= 1) throw e instanceof IOException ? (IOException) e : new IOException(e);
                close();
            }
        }
    }

    @Override
    public Entry stat(String rel) throws IOException {
        if (rel.indexOf('/') < 0) {
            Entry e = new Entry();
            e.dir = true;
            e.name = rel;
            if (rel.isEmpty()) session();
            else share(rel); // ENOENT when there's no such share
            return e;
        }
        return call(rel, (s, path) -> {
            Entry e = new Entry();
            boolean isDir = s.folderExists(path);
            if (!isDir && !s.fileExists(path)) {
                e.exists = false;
                return e;
            }
            e.dir = isDir;
            e.name = rel.substring(rel.lastIndexOf('/') + 1);
            FileAllInformation info = s.getFileInformation(path);
            e.size = info.getStandardInformation().getEndOfFile();
            e.mtime = info.getBasicInformation().getLastWriteTime().toEpochMillis();
            return e;
        });
    }

    @Override
    public List<Entry> list(String rel) throws IOException {
        if (rel.isEmpty()) {
            session(); // the login is checked even at the root
            List<Entry> out = new ArrayList<>();
            for (String n : shareNames()) {
                Entry e = new Entry();
                e.name = n;
                e.dir = true;
                out.add(e);
            }
            return out;
        }
        return call(rel, (s, path) -> {
            List<Entry> out = new ArrayList<>();
            for (FileIdBothDirectoryInformation f : s.list(path)) {
                String n = f.getFileName();
                if (".".equals(n) || "..".equals(n)) continue;
                Entry e = new Entry();
                e.name = n;
                e.dir = (f.getFileAttributes() & FileAttributes.FILE_ATTRIBUTE_DIRECTORY.getValue()) != 0;
                e.size = f.getEndOfFile();
                e.mtime = f.getLastWriteTime().toEpochMillis();
                out.add(e);
            }
            return out;
        });
    }

    @Override
    public InputStream open(String rel) throws IOException {
        return call(rel, (s, path) -> {
            File f = s.openFile(path, EnumSet.of(AccessMask.GENERIC_READ), null,
                EnumSet.of(SMB2ShareAccess.FILE_SHARE_READ), SMB2CreateDisposition.FILE_OPEN, null);
            InputStream in = f.getInputStream();
            return new java.io.FilterInputStream(in) {
                @Override public void close() throws IOException {
                    try { super.close(); } finally { f.close(); }
                }
            };
        });
    }

    @Override
    public void write(String rel, InputStream data, long length) throws IOException {
        int slash = rel.lastIndexOf('/');
        if (slash > 0) mkdirs(rel.substring(0, slash));
        call(rel, (s, path) -> {
            try (File f = s.openFile(path, EnumSet.of(AccessMask.GENERIC_WRITE), null,
                EnumSet.noneOf(SMB2ShareAccess.class), SMB2CreateDisposition.FILE_OVERWRITE_IF, null);
                 OutputStream out = f.getOutputStream()) {
                byte[] buf = new byte[64 * 1024];
                int r;
                while ((r = data.read(buf)) != -1) out.write(buf, 0, r);
            }
            return null;
        });
    }

    @Override
    public void mkdirs(String rel) throws IOException {
        if (rel.indexOf('/') < 0) return; // a share itself
        call(rel, (s, path) -> {
            StringBuilder acc = new StringBuilder();
            for (String seg : path.split("[\\\\]")) {
                if (seg.isEmpty()) continue;
                if (acc.length() > 0) acc.append('\\');
                acc.append(seg);
                if (!s.folderExists(acc.toString())) s.mkdir(acc.toString());
            }
            return null;
        });
    }

    @Override
    public void delete(String rel, boolean recursive) throws IOException {
        call(rel, (s, path) -> {
            if (s.folderExists(path)) s.rmdir(path, recursive);
            else if (s.fileExists(path)) s.rm(path);
            return null;
        });
    }

    @Override
    public void rename(String from, String to) throws IOException {
        int i = from.indexOf('/'), j = to.indexOf('/');
        if (i < 0 || j < 0 || !from.substring(0, i).equals(to.substring(0, j))) throw new IOException("SMB: 다른 공유 폴더로는 옮길 수 없습니다");
        int slash = to.lastIndexOf('/');
        if (slash > j) mkdirs(to.substring(0, slash));
        String toPath = p(to.substring(j + 1));
        call(from, (s, path) -> {
            boolean dir = s.folderExists(path);
            HashSet<SMB2CreateOptions> opts = new HashSet<>();
            opts.add(dir ? SMB2CreateOptions.FILE_DIRECTORY_FILE : SMB2CreateOptions.FILE_NON_DIRECTORY_FILE);
            try (com.hierynomus.smbj.share.DiskEntry e = s.open(path, EnumSet.of(AccessMask.DELETE, AccessMask.GENERIC_READ), null,
                EnumSet.of(SMB2ShareAccess.FILE_SHARE_DELETE, SMB2ShareAccess.FILE_SHARE_READ, SMB2ShareAccess.FILE_SHARE_WRITE),
                SMB2CreateDisposition.FILE_OPEN, opts)) {
                e.rename(toPath, false);
            }
            return null;
        });
    }

    @Override
    public synchronized void close() {
        for (DiskShare d : shares.values()) try { d.close(); } catch (Exception ignored) {}
        shares.clear();
        try { if (session != null) session.close(); } catch (Exception ignored) {}
        try { if (connection != null) connection.close(); } catch (Exception ignored) {}
        try { if (client != null) client.close(); } catch (Exception ignored) {}
        session = null;
        connection = null;
        client = null;
    }
}
