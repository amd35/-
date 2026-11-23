import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native Android shell (Capacitor).
 *
 * Build:  VITE_API_URL=https://your-api-host npm run build:native
 * Sync:   npx cap sync android
 * Run:    npx cap open android   (Android Studio → Run / Build APK)
 *
 * VITE_API_URL must be the public HTTPS origin of the API server (no trailing
 * slash, no /api suffix) because the WebView is served from https://localhost
 * and therefore cannot use the dev-server proxy.
 */
const config: CapacitorConfig = {
  appId: 'com.connectplus.app',
  appName: 'يلا فون',
  webDir: 'dist',
  android: {
    // The API is HTTPS in production; do not relax this to ship mixed content.
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: '#100a18',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#100a18',
      overlaysWebView: false,
    },
  },
};

export default config;
