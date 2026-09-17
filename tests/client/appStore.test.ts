import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../src/store/appStore';
import { Siparis } from '../../src/types';

describe('useAppStore (Zustand State Management)', () => {
  beforeEach(() => {
    // Reset store to known state
    useAppStore.setState({
      session: {
        id: 'test-user',
        adSoyad: 'Test',
        email: 'test@example.test',
        rol: 'PATRON',
        tenantId: 'test-tenant',
      },
      sessionStatus: 'authenticated',
      siparisler: [],
      firmalar: [],
      seciliFirmaId: 'all',
      aktifRol: 'SUPER_ADMIN',
      inboxSayisi: 0,
      bildirim: null,
      dbKaynak: 'supabase',
      yukleniyor: false,
    });
  });

  it('siparisEkle: listeye yeni sipariş eklemeli', () => {
    const yeniSiparis: Siparis = {
      id: 'sip-test-101',
      musteri_adi: 'Əli Məmmədov',
      telefon_numarasi: '+994501234567',
      teslimat_adresi: 'Nizami küç. 45, Bakı',
      urun_aciklamasi: 'Kişi İdman Ayaqqabısı',
      adet: 1,
      toplam_tutar: 150,
      alinan_tutar: 50,
      kalan_tutar: 100,
      para_birimi: 'AZN',
      lojistik_durumu: 'KANADA_SATINALIM_BEKLIYOR',
      finans_durumu: 'KISMI_ODEME',
      olusturma_tarihi: new Date().toISOString(),
      ham_mesaj: 'Test mesaj',
      eksik_bilgiler: [],
      siparis_kaynagi: 'WHATSAPP',
    };

    useAppStore.getState().siparisEkle(yeniSiparis);
    const siparisler = useAppStore.getState().siparisler;

    expect(siparisler).toHaveLength(1);
    expect(siparisler[0].id).toBe('sip-test-101');
    expect(siparisler[0].musteri_adi).toBe('Əli Məmmədov');
  });

  it('siparisGuncelle: mevcut siparişi kısmi alanlarla güncellemeli', () => {
    const siparis: Siparis = {
      id: 'sip-test-102',
      musteri_adi: 'Nigar Rəhimova',
      telefon_numarasi: '+994559876543',
      teslimat_adresi: 'Yasamal, Bakı',
      urun_aciklamasi: 'Kosmetika Dəsti',
      adet: 1,
      toplam_tutar: 200,
      alinan_tutar: 0,
      kalan_tutar: 200,
      para_birimi: 'AZN',
      lojistik_durumu: 'KANADA_SATINALIM_BEKLIYOR',
      finans_durumu: 'BEKLIYOR',
      olusturma_tarihi: new Date().toISOString(),
      ham_mesaj: 'Test',
      eksik_bilgiler: [],
      siparis_kaynagi: 'INSTAGRAM_DM',
    };

    useAppStore.getState().siparisEkle(siparis);
    useAppStore.getState().siparisGuncelle('sip-test-102', {
      lojistik_durumu: 'TESLIM_EDILDI',
      alinan_tutar: 200,
      kalan_tutar: 0,
      finans_durumu: 'ODENDI',
    });

    const guncel = useAppStore.getState().siparisler.find((s) => s.id === 'sip-test-102');
    expect(guncel).toBeDefined();
    expect(guncel?.lojistik_durumu).toBe('TESLIM_EDILDI');
    expect(guncel?.finans_durumu).toBe('ODENDI');
    expect(guncel?.alinan_tutar).toBe(200);
    expect(guncel?.guncellenme_tarihi).toBeDefined();
  });

  it('siparisSil: verilen ID li siparişi listeden kaldırmalı', () => {
    const s1: Siparis = {
      id: 'sip-1',
      musteri_adi: 'A',
      urun_aciklamasi: 'U1',
      adet: 1,
      toplam_tutar: 10,
      alinan_tutar: 10,
      kalan_tutar: 0,
      para_birimi: 'AZN',
      lojistik_durumu: 'TESLIM_EDILDI',
      finans_durumu: 'ODENDI',
      olusturma_tarihi: new Date().toISOString(),
      ham_mesaj: '',
      eksik_bilgiler: [],
      siparis_kaynagi: 'WHATSAPP',
    };
    const s2: Siparis = {
      id: 'sip-2',
      musteri_adi: 'B',
      urun_aciklamasi: 'U2',
      adet: 1,
      toplam_tutar: 20,
      alinan_tutar: 20,
      kalan_tutar: 0,
      para_birimi: 'AZN',
      lojistik_durumu: 'TESLIM_EDILDI',
      finans_durumu: 'ODENDI',
      olusturma_tarihi: new Date().toISOString(),
      ham_mesaj: '',
      eksik_bilgiler: [],
      siparis_kaynagi: 'WHATSAPP',
    };

    useAppStore.getState().setSiparisler([s1, s2]);
    expect(useAppStore.getState().siparisler).toHaveLength(2);

    useAppStore.getState().siparisSil('sip-1');
    const kalan = useAppStore.getState().siparisler;
    expect(kalan).toHaveLength(1);
    expect(kalan[0].id).toBe('sip-2');
  });

  it('normal users cannot change their role or tenant', () => {
    useAppStore.setState({ seciliFirmaId: 'test-tenant', aktifRol: 'PATRON' });
    expect((useAppStore.getState() as any).setAktifRol).toBeUndefined();
    useAppStore.getState().setSeciliFirmaId('another-tenant');
    expect(useAppStore.getState().seciliFirmaId).toBe('test-tenant');
    expect(useAppStore.getState().aktifRol).toBe('PATRON');
  });

  it('setBildirim ve setInboxSayisi doğru çalışmalı', () => {
    useAppStore.getState().setBildirim('Uğurla yadda saxlanıldı');
    expect(useAppStore.getState().bildirim).toBe('Uğurla yadda saxlanıldı');

    useAppStore.getState().setInboxSayisi(5);
    expect(useAppStore.getState().inboxSayisi).toBe(5);
  });
});
