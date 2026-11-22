import { Capacitor } from '@capacitor/core';

/** True only inside the Android/iOS shell; false in every browser build. */
export const isNative = Capacitor.isNativePlatform();

/**
 * Native-only shell wiring: status bar colours, splash dismissal and the Android
 * hardware back button (which would otherwise close the app from any screen).
 * Dynamic imports keep these plugins out of the browser bundle.
 */
export async function setupNativeShell(): Promise<void> {
  if (!isNative) return;

  const [{ StatusBar, Style }, { SplashScreen }, { App }] = await Promise.all([
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
    import('@capacitor/app'),
  ]);

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#100a18' });
  } catch {
    /* status bar APIs are best-effort (older Android versions) */
  }

  await App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void App.exitApp();
  });

  await SplashScreen.hide();
}
