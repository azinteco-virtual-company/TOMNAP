import { supabase } from '../supabase';
import { PublicResourceError } from '../publicFetch';
import {
  demoSiparislerVeritabani,
  firmalarVeritabani,
  kullanicilarVeritabani,
  siparislerVeritabani,
} from '../state';
import { asamaIlerletebilir, sonrakiAsama } from '../../../shared/v2Asama';
import { v2Tenant } from './ortak';

/**
 * GEÇİCİ v2 aşama köprüsü (OPEN_QUESTIONS 38): bir v2 siparişini yalnız bir sonraki
 * lojistik aşamaya taşır. Veritabanında tomnap_v2_asama_ilerlet (migration 19) satırı
 * kilitler, beklenen aşamayı karşılaştırır ve geçmişe yazar; bellek deposu aynı kuralları
 * uygular. Her okuma ve yazma oturumun butiğiyle sınırlıdır.
 */
export interface V2AsamaSonucu {
  id: string;
  lojistikDurumu: string;
  oncekiAsama: string;
}

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const bellekModu = (tenantId: string) => !supabase || tenantId === 'demo_sandbox';
const havuz = (tenantId: string): Record<string, unknown>[] =>
  tenantId === 'demo_sandbox' ? demoSiparislerVeritabani : siparislerVeritabani;

const yetkiYok = () =>
  new PublicResourceError('Bu siparişin aşamasını ilerletme yetkiniz yok.', 403);
const bulunamadi = () => new PublicResourceError('Sipariş bulunamadı.', 404);
const cakisma = () =>
  new PublicResourceError(
    'Aşama ilerletilemez: sipariş bu arada değişti, v1 sipariş ya da sonraki aşaması yok. Listeyi yenileyin.',
    409
  );

function rpcHatasi(error: { code?: string } | null): never {
  const code = error?.code ?? '';
  if (code === 'PT403') throw yetkiYok();
  if (code === 'PT404') throw bulunamadi();
  if (code === 'PT409') throw cakisma();
  if (code === '22023' || code === '22P02') throw new PublicResourceError('Geçersiz istek.', 400);
  throw new PublicResourceError('Aşama ilerletilemedi.', 503);
}

function bellekteIlerlet(
  tenantId: string,
  userId: string,
  id: string,
  beklenen: string
): V2AsamaSonucu {
  const kullanici = kullanicilarVeritabani.find(
    (u) => u.id === userId && u.durum === 'AKTIF' && u.tenant_id === tenantId
  );
  // Same as the RPC: a SHIPPING team member of this boutique (never SUPER_ADMIN).
  if (!kullanici || !asamaIlerletebilir(kullanici.rol, 'KANADA_SATINALIM_BEKLIYOR'))
    throw yetkiYok();
  const firma = firmalarVeritabani.find((f) => f.id === tenantId);
  if (!firma || (firma.onayDurumu && firma.onayDurumu !== 'AKTIF')) throw yetkiYok();
  const siparis = havuz(tenantId).find((s) => s.id === id && s.tenant_id === tenantId);
  if (!siparis) throw bulunamadi();
  if (Number(siparis.model_surumu) !== 2) throw cakisma();
  const eski = String(siparis.lojistik_durumu);
  const yeni = sonrakiAsama(eski);
  if (eski !== beklenen || !yeni) throw cakisma();
  if (!asamaIlerletebilir(kullanici.rol, eski)) throw yetkiYok();
  const zaman = new Date().toISOString();
  const ekVeriler =
    siparis.ek_veriler &&
    typeof siparis.ek_veriler === 'object' &&
    !Array.isArray(siparis.ek_veriler)
      ? (siparis.ek_veriler as Record<string, unknown>)
      : {};
  const gecmis = Array.isArray(ekVeriler.islem_gecmisi) ? ekVeriler.islem_gecmisi : [];
  Object.assign(siparis, {
    lojistik_durumu: yeni,
    guncellenme_tarihi: zaman,
    ek_veriler: {
      ...ekVeriler,
      islem_gecmisi: [
        ...gecmis,
        {
          tarih: zaman,
          yapan_rol: kullanici.rol,
          yapan_kisi: kullanici.id,
          eylem: 'V2_ASAMA_ILERLETILDI',
          aciklama: `${eski} -> ${yeni}`,
        },
      ],
    },
  });
  return { id, lojistikDurumu: yeni, oncekiAsama: eski };
}

export async function v2AsamaIlerlet(
  tenant: unknown,
  userId: string,
  siparisId: unknown,
  beklenen: unknown
): Promise<V2AsamaSonucu> {
  const tenantId = v2Tenant(tenant);
  if (typeof siparisId !== 'string' || !UUID.test(siparisId)) throw bulunamadi();
  if (typeof beklenen !== 'string' || !beklenen || beklenen.length > 50)
    throw new PublicResourceError('Beklenen aşama gerekli.', 400);
  const id = siparisId.toLowerCase();
  if (bellekModu(tenantId)) return bellekteIlerlet(tenantId, userId, id, beklenen);
  const { data, error } = await supabase!.rpc('tomnap_v2_asama_ilerlet', {
    p_tenant_id: tenantId,
    p_user_id: userId,
    p_siparis_id: id,
    p_beklenen_asama: beklenen,
  });
  if (error) rpcHatasi(error);
  const s = (data as { siparis?: Record<string, unknown> } | null)?.siparis;
  if (!s || s.tenant_id !== tenantId || s.id !== id || typeof s.lojistik_durumu !== 'string')
    throw new PublicResourceError('Aşama ilerletilemedi.', 503);
  return { id, lojistikDurumu: s.lojistik_durumu, oncekiAsama: String(s.onceki_asama) };
}
