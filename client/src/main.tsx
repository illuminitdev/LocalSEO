import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { EntitlementsProvider } from './shared/EntitlementsContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EntitlementsProvider>
      <App />
    </EntitlementsProvider>
  </StrictMode>,
);
