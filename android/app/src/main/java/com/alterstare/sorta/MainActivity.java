package com.alterstare.sorta;

import android.os.Bundle;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Page background + the system bars (their area shows the window
    // background; icons dark on light, light on dark).
    static void applyTheme(android.app.Activity act, android.webkit.WebView web, boolean dark) {
        int bg = dark ? 0xFF14161D : 0xFFFFFFFF;
        web.setBackgroundColor(dark ? 0xFF0B0D13 : 0xFFF4F5F8);
        act.getWindow().getDecorView().setBackgroundColor(bg);
        //noinspection deprecation
        act.getWindow().setStatusBarColor(bg);
        //noinspection deprecation
        act.getWindow().setNavigationBarColor(dark ? 0xFF14161D : 0xFFFFFFFF);
        androidx.core.view.WindowInsetsControllerCompat c = new androidx.core.view.WindowInsetsControllerCompat(act.getWindow(), act.getWindow().getDecorView());
        c.setAppearanceLightStatusBars(!dark);
        c.setAppearanceLightNavigationBars(!dark);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SortaPlugin.class);
        super.onCreate(savedInstanceState);
        // Serve /_s/… picture urls (phone files, NAS pictures and 미리 보기).
        bridge.setWebViewClient(new SortaWebViewClient(bridge));
        bridge.getWebView().getSettings().setSupportZoom(false);
        bridge.getWebView().getSettings().setBuiltInZoomControls(false);
        // Last theme (SortaPlugin.setTheme) as the page background before it loads.
        boolean dark = getSharedPreferences("sorta", MODE_PRIVATE).getBoolean("dark", false);
        applyTheme(this, bridge.getWebView(), dark);
        // Back: the app's own navigation (JS decides whether to step back or exit).
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                SortaPlugin p = SortaPlugin.instance;
                if (p != null && p.handleBack()) return;
                finish();
            }
        });
    }

    // Notification permission (asked at the first 올리기) denied → say once
    // where the progress went.
    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == SortaPlugin.NOTIFY_REQ && grantResults.length > 0
            && grantResults[0] != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            android.widget.Toast.makeText(this,
                "알림 권한이 꺼져 있어 올리기 진행 알림이 보이지 않습니다. 올리기는 계속되며, 휴대폰 설정 › 앱 › Sorta › 알림에서 켤 수 있습니다.",
                android.widget.Toast.LENGTH_LONG).show();
        }
    }

    // Closed for good (not a configuration change): the upload dies with the
    // WebView — drop the service and its notification.
    @Override
    public void onDestroy() {
        if (isFinishing()) UploadService.stop(this);
        super.onDestroy();
    }
}
