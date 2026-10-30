import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { EntitlementsProvider } from './shared/EntitlementsContext.tsx';
import { CreditsProvider } from './shared/CreditsContext.tsx';
import { ToastProvider } from './shared/Toast.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <EntitlementsProvider>
        <CreditsProvider>
          <App />
        </CreditsProvider>
      </EntitlementsProvider>
    </ToastProvider>
  </StrictMode>,
);
