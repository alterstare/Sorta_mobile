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
}
