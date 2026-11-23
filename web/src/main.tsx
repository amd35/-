import { BrowserRouter } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from './lib/i18n';
import { ToastProvider } from './lib/ui';
import { AuthProvider } from './lib/auth';
import { RealtimeProvider } from './lib/realtime';
import { BackgroundsProvider } from './lib/backgrounds';
import { CallProvider } from './lib/call';
import { setupNativeShell } from './lib/native';
import './styles.css';
import './game.css';
import './lucky.css';
import './country.css';
import './giftBoutique.css';

void setupNativeShell();

const root = createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <BrowserRouter>
    <I18nProvider>
      <ToastProvider>
        <AuthProvider>
          <RealtimeProvider>
            <BackgroundsProvider>
              <CallProvider>
                <App />
              </CallProvider>
            </BackgroundsProvider>
          </RealtimeProvider>
        </AuthProvider>
      </ToastProvider>
    </I18nProvider>
  </BrowserRouter>
);
