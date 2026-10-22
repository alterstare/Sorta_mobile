import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.alterstare.sorta',
  appName: 'Sorta',
  webDir: 'dist',
  android: {
    // Pictures and thumbnails are served from https://localhost/_s/… by the
    // native interceptor; no mixed content is needed.
    allowMixedContent: false
  }
}

export default config
