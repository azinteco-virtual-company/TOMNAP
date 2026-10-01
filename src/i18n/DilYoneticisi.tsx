import { useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { dilDurumunuGuncelle } from '.';

/** Applies the single language rule whenever the login state or boutique language changes. */
export function DilYoneticisi() {
  const girisYapildi = useAppStore((state) => state.sessionStatus === 'authenticated');
  const butikDili = useAppStore((state) => state.butikDili);
  useEffect(() => dilDurumunuGuncelle(girisYapildi, butikDili), [girisYapildi, butikDili]);
  return null;
}
