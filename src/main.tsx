import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { DilSaglayici } from './context/DilKonteksti';
import './index.css';

// PWA Service Worker qeydiyyatı (Təhlükəsiz və sandbox uyğun)
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
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
    <BrowserRouter>
      <DilSaglayici>
        <App />
      </DilSaglayici>
    </BrowserRouter>
  </StrictMode>,
);
