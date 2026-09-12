import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { DilSaglayici } from './context/DilKonteksti';
import './index.css';

// PWA Service Worker qeydiyyatı (Təhlükəsiz və sandbox uyğun)
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    try {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('PWA ServiceWorker qeydiyyatı gözlənildi:', err);
      });
    } catch {
      // İframe sandbox mühitində xətanı nəzərə alma
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DilSaglayici>
      <App />
    </DilSaglayici>
  </StrictMode>,
);
