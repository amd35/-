import { BrowserRouter } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from './lib/i18n';
import { ToastProvider } from './lib/ui';
import { AuthProvider } from './lib/auth';
import { RealtimeProvider } from './lib/realtime';
import { CallProvider } from './lib/call';
import './styles.css';

const root = createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <BrowserRouter>
    <I18nProvider>
      <ToastProvider>
        <AuthProvider>
          <RealtimeProvider>
            <CallProvider>
              <App />
            </CallProvider>
          </RealtimeProvider>
        </AuthProvider>
      </ToastProvider>
    </I18nProvider>
  </BrowserRouter>
);
