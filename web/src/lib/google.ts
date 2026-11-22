/**
 * Real Google sign-in through Google Identity Services.
 *
 * Loads Google's client script on demand and opens the account chooser with
 * the OAuth popup flow, returning the tokens the server verifies against
 * `GOOGLE_CLIENT_ID`. Works in a normal browser; the Android WebView blocks
 * Google's OAuth window, so the native shell needs a native Google plugin.
 */
interface GoogleTokenResponse {
  access_token?: string;
  id_token?: string;
  error?: string;
}

interface GoogleTokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
}

interface GoogleOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: { message?: string; type?: string }) => void;
  }) => GoogleTokenClient;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('Could not reach Google sign-in'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export async function googleCredential(
  clientId: string
): Promise<{ idToken?: string; accessToken: string }> {
  await loadScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error('Google sign-in is not available in this browser');

  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: 'openid email profile',
      callback: (response) => {
        if (response.error) {
          reject(
            new Error(
              response.error === 'popup_closed_by_user'
                ? 'Google sign-in was cancelled'
                : 'Google sign-in failed'
            )
          );
          return;
        }
        if (!response.access_token) {
          reject(new Error('Google sign-in failed'));
          return;
        }
        resolve({ idToken: response.id_token, accessToken: response.access_token });
      },
      error_callback: (error) => reject(new Error(error?.message || 'Google sign-in failed')),
    });
    client.requestAccessToken({ prompt: 'select_account' });
  });
}
