import { describe, expect, it } from 'vitest';
import {
  eslesmeOnerileriOlustur,
  foldName,
  nameSimilarity,
  normalizeAwb,
  normalizeCode,
  normalizeName,
  normalizePhone,
  toSiparisAdayi,
  ZAYIF_ADAY_SINIRI,
  ZAYIF_ESLESME_ESIGI,
  type ManifestSatiriGirdisi,
  type SiparisAdayi,
} from '../../../src/server/services/kargo/manifestMatching';

function order(id: string, overrides: Partial<SiparisAdayi> = {}): SiparisAdayi {
  return {
    id,
    musteriAdi: 'Synthetic Customer',
    telefon: '',
    lojistikDurumu: 'KANADA_DEPO',
    awb: '',
    awbGosterim: '',
    kanadaTakipKodu: '',
    ...overrides,
  };
}

function row(overrides: Partial<ManifestSatiriGirdisi> = {}): ManifestSatiriGirdisi {
  return { takipNo: '37349392426', aliciAdi: 'Nobody Matching', ...overrides };
}

describe('Unicode-aware normalization', () => {
  it('preserves Azerbaijani and Cyrillic letters instead of stripping them', () => {
    expect(normalizeName('Əli')).toBe('əli');
    expect(normalizeName('Şəhla Çələbi-Öğüz')).toBe('şəhla çələbi öğüz');
    expect(normalizeName('İsmayılova')).toBe('ismayılova');
    expect(normalizeName('ЛЕЙЛА  Иванова')).toBe('лейла иванова');
  });

  it('turns empty, punctuation-only and placeholder names into an empty value', () => {
    for (const value of ['', '   ', '---', '.', 'Müştəri', 'Bilinmeyen Müşteri', null, 42])
      expect(normalizeName(value)).toBe('');
  });

  it('compares full phone numbers across local and international formats', () => {
    const expected = '994552843911';
    for (const value of ['+994 55 284 39 11', '055 284 39 11', '552843911', '00994552843911'])
      expect(normalizePhone(value)).toBe(expected);
    expect(normalizePhone(994552843911)).toBe(expected);
    for (const value of ['2843911', 'Tel: 055 284 39 11', '', undefined, '+'])
      expect(normalizePhone(value)).toBe('');
  });

  it('normalizes codes without accepting trivially short references', () => {
    expect(normalizeAwb(' 3734 9392 426 ')).toBe('37349392426');
    expect(normalizeAwb('az-cargo-1234')).toBe('AZ-CARGO-1234');
    expect(normalizeCode('tor-zara-1234')).toBe('TOR-ZARA-1234');
    expect(normalizeCode('12')).toBe('');
    expect(normalizeAwb({})).toBe('');
  });
});

describe('Name similarity has no substring shortcut', () => {
  it('keeps both reported false matches below the candidate threshold', () => {
    expect(nameSimilarity('Natalia Petrova', 'Əli')).toBeLessThan(ZAYIF_ESLESME_ESIGI);
    expect(nameSimilarity('John Smith', 'Лейла Иванова')).toBe(0);
  });

  it('never matches an empty or placeholder name', () => {
    expect(nameSimilarity('', 'Anyone')).toBe(0);
    expect(nameSimilarity('Müştəri', 'Müştəri')).toBe(0);
  });

  it('is order- and case-insensitive for the same person', () => {
    expect(nameSimilarity('MƏMMƏDOVA AYTƏN', 'Aytən Məmmədova')).toBe(1);
    expect(nameSimilarity('Лейла Иванова', 'лейла иванова')).toBe(1);
  });
});

describe('Order snapshots are runtime-checked', () => {
  it('rejects malformed rows and normalizes stored codes', () => {
    expect(toSiparisAdayi(null)).toBeNull();
    expect(toSiparisAdayi([])).toBeNull();
    expect(toSiparisAdayi({ musteri_adi: 'No id' })).toBeNull();
    expect(toSiparisAdayi({ id: 7, musteri_adi: 'Numeric id' })).toBeNull();
    expect(
      toSiparisAdayi({
        id: 'order-1',
        musteri_adi: ' Əli ',
        telefon_numarasi: 5,
        lojistik_durumu: 'KANADA_DEPO',
        uluslararasi_kargo_kodu: ' awb 1 ',
        kanada_takip_kodu: 'tor-ca-1234',
      })
    ).toEqual({
      id: 'order-1',
      musteriAdi: 'Əli',
      telefon: '5',
      lojistikDurumu: 'KANADA_DEPO',
      awb: 'AWB1',
      awbGosterim: 'awb 1',
      kanadaTakipKodu: 'TOR-CA-1234',
    });
  });
});

describe('Suggestions never write and never guess', () => {
  it('reproduces neither reported false match', () => {
    const report = eslesmeOnerileriOlustur(
      [row({ aliciAdi: 'Natalia Petrova' }), row({ takipNo: '37349392427', aliciAdi: 'John Smith' })],
      [order('eli', { musteriAdi: 'Əli' }), order('cyrillic', { musteriAdi: 'Лейла Иванова' })]
    );
    expect(report.satirlar.map((item) => [item.durum, item.adaylar.length])).toEqual([
      ['ESLESME_YOK', 0],
      ['ESLESME_YOK', 0],
    ]);
    expect(report.cakismalar).toEqual([]);
  });

  it('pre-selects exactly one strong phone match', () => {
    const report = eslesmeOnerileriOlustur(
      [row({ telefon: '+994 55 284 39 11', agirlikKg: 1.4 })],
      [order('target', { telefon: '055 284 39 11' }), order('other', { telefon: '0501112233' })]
    );
    const [suggestion] = report.satirlar;
    expect(suggestion).toMatchObject({
      durum: 'ONERILDI',
      onerilenSiparisId: 'target',
      agirlikKg: 1.4,
      adaylar: [{ siparisId: 'target', eslesmeTipi: 'TELEFON', guc: 'GUCLU', skor: 1 }],
    });
  });

  it('pre-selects exactly one strong order-code match', () => {
    const report = eslesmeOnerileriOlustur(
      [row({ referansNo: 'tor-zara-1234' })],
      [order('target', { kanadaTakipKodu: 'TOR-ZARA-1234' })]
    );
    expect(report.satirlar[0]).toMatchObject({
      durum: 'ONERILDI',
      onerilenSiparisId: 'target',
      adaylar: [{ eslesmeTipi: 'SIPARIS_KODU' }],
    });
  });

  it('selects nothing when one manifest row matches several orders', () => {
    const report = eslesmeOnerileriOlustur(
      [row({ telefon: '0552843911' })],
      [order('first', { telefon: '552843911' }), order('second', { telefon: '+994552843911' })]
    );
    expect(report.satirlar[0]).toMatchObject({
      durum: 'BELIRSIZ',
      belirsizlikSebebi: 'COKLU_SIPARIS',
      onerilenSiparisId: null,
    });
    expect(report.satirlar[0].adaylar.map((item) => item.siparisId)).toEqual(['first', 'second']);
  });

  it('selects nothing when one order is the only strong match of several rows', () => {
    const report = eslesmeOnerileriOlustur(
      [
        row({ takipNo: 'AWB-0001', telefon: '0552843911' }),
        row({ takipNo: 'AWB-0002', telefon: '0552843911' }),
      ],
      [order('shared', { telefon: '0552843911' })]
    );
    for (const suggestion of report.satirlar)
      expect(suggestion).toMatchObject({
        durum: 'BELIRSIZ',
        belirsizlikSebebi: 'SIPARIS_BIRDEN_FAZLA_SATIRDA',
        onerilenSiparisId: null,
      });
  });

  it('selects nothing when the manifest repeats the same AWB', () => {
    const report = eslesmeOnerileriOlustur(
      [row({ telefon: '0552843911' }), row({ telefon: '0701112233' })],
      [order('a', { telefon: '0552843911' }), order('b', { telefon: '0701112233' })]
    );
    for (const suggestion of report.satirlar)
      expect(suggestion).toMatchObject({
        durum: 'BELIRSIZ',
        belirsizlikSebebi: 'MANIFESTTE_TEKRAR_AWB',
        onerilenSiparisId: null,
      });
  });

  it('lists delivered and already-labelled orders as conflicts, never as candidates', () => {
    const report = eslesmeOnerileriOlustur(
      [row({ telefon: '0552843911' })],
      [
        order('delivered', { telefon: '0552843911', lojistikDurumu: 'TESLIM_EDILDI' }),
        order('labelled', { telefon: '0552843911', awb: 'OLD-AWB-1', awbGosterim: 'old-awb-1' }),
      ]
    );
    expect(report.satirlar[0]).toMatchObject({ durum: 'CAKISMA', adaylar: [] });
    expect(report.cakismalar).toEqual([
      expect.objectContaining({ siparisId: 'delivered', sebep: 'TESLIM_EDILDI', eslesmeTipi: 'TELEFON' }),
      expect.objectContaining({ siparisId: 'labelled', sebep: 'MEVCUT_AWB', mevcutAwb: 'old-awb-1' }),
    ]);
  });

  it('reports an AWB that is already attached instead of proposing it again', () => {
    const attached = eslesmeOnerileriOlustur(
      [row({ takipNo: 'awb-7777', telefon: '0552843911' })],
      [order('holder', { awb: 'AWB-7777', awbGosterim: 'AWB-7777' }), order('phone', { telefon: '0552843911' })]
    );
    expect(attached.satirlar[0]).toMatchObject({
      durum: 'ZATEN_BAGLI',
      bagliSiparisId: 'holder',
      onerilenSiparisId: null,
      adaylar: [],
    });
    const duplicated = eslesmeOnerileriOlustur(
      [row({ takipNo: 'AWB-7777' })],
      [order('one', { awb: 'AWB-7777', awbGosterim: 'AWB-7777' }), order('two', { awb: 'AWB-7777', awbGosterim: 'AWB-7777' })]
    );
    expect(duplicated.satirlar[0].durum).toBe('CAKISMA');
    expect(duplicated.cakismalar.map((item) => [item.siparisId, item.sebep])).toEqual([
      ['one', 'AWB_BASKA_SIPARISTE'],
      ['two', 'AWB_BASKA_SIPARISTE'],
    ]);
  });

  it('offers name similarity only as scored, unselected weak candidates', () => {
    const report = eslesmeOnerileriOlustur(
      [row({ aliciAdi: 'MƏMMƏDOVA AYTƏN' })],
      [
        order('same-name', { musteriAdi: 'Aytən Məmmədova' }),
        order('delivered-same-name', { musteriAdi: 'Aytən Məmmədova', lojistikDurumu: 'TESLIM_EDILDI' }),
        order('labelled-same-name', { musteriAdi: 'Aytən Məmmədova', awb: 'X-1234', awbGosterim: 'X-1234' }),
        order('unrelated', { musteriAdi: 'Əli' }),
      ]
    );
    expect(report.satirlar[0]).toMatchObject({
      durum: 'ZAYIF_ADAY',
      onerilenSiparisId: null,
      adaylar: [{ siparisId: 'same-name', eslesmeTipi: 'ISIM', guc: 'ZAYIF', skor: 1 }],
    });
    expect(report.cakismalar).toEqual([]);
  });

  it('caps weak candidates and orders them by score', () => {
    const orders = Array.from({ length: ZAYIF_ADAY_SINIRI + 3 }, (_, index) =>
      order(`o-${index}`, { musteriAdi: index === 4 ? 'Aytən Məmmədova' : 'Aytən Məmmədli' })
    );
    const report = eslesmeOnerileriOlustur([row({ aliciAdi: 'Aytən Məmmədova' })], orders);
    expect(report.satirlar[0].adaylar).toHaveLength(ZAYIF_ADAY_SINIRI);
    expect(report.satirlar[0].adaylar[0]).toMatchObject({ siparisId: 'o-4', skor: 1 });
    const scores = report.satirlar[0].adaylar.map((item) => item.skor);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('rejects rows whose AWB cannot be stored and summarizes every status', () => {
    const report = eslesmeOnerileriOlustur(
      [row({ takipNo: 'AB/12' }), row({ takipNo: 'AWB-0009', telefon: '0552843911' })],
      [order('target', { telefon: '0552843911' })]
    );
    expect(report.satirlar[0]).toMatchObject({ durum: 'GECERSIZ_AWB', adaylar: [] });
    expect(report.ozet).toMatchObject({ toplamSatir: 2, GECERSIZ_AWB: 1, ONERILDI: 1, cakismaSayisi: 0 });
  });
});

describe('ASCII folding widens weak candidates only', () => {
  const schemes = ['PASAPORT', 'BASIT'] as const;

  it('folds with the passport and simple schemes and transliterates Cyrillic', () => {
    expect(foldName('Qəmər Əsədova', 'PASAPORT')).toBe('gamar asadova');
    expect(foldName('Qəmər Əsədova', 'BASIT')).toBe('qemer esedova');
    expect(foldName('Cəfər Xəlilov', 'PASAPORT')).toBe('jafar khalilov');
    expect(foldName('Cəfər Xəlilov', 'BASIT')).toBe('cefer xelilov');
    expect(foldName('Şəhla Çələbi-Öğüz', 'PASAPORT')).toBe('shahla chalabi oghuz');
    expect(foldName('Şəhla Çələbi-Öğüz', 'BASIT')).toBe('sehla celebi oguz');
    for (const scheme of schemes) {
      expect(foldName('Лейла Иванова', scheme)).toBe('leyla ivanova');
      expect(foldName('Йолдаш Ёлкин', scheme)).toBe('yoldash yolkin');
    }
  });

  it('removes the combining dot that JavaScript adds when lowercasing İ', () => {
    expect([...'İ'.toLowerCase()]).toEqual(['i', '̇']);
    expect(foldName('İSAQ', 'PASAPORT')).toBe('isag');
    expect(foldName('İsaq', 'BASIT')).toBe('isaq');
    for (const scheme of schemes) expect(foldName('İsmayılova İlqar', scheme)).not.toMatch(/\p{M}/u);
  });

  it('folds empty and placeholder names to nothing, so they still match nothing', () => {
    for (const scheme of schemes)
      for (const value of ['', '---', 'Müştəri', 'Bilinmeyen Müşteri', null, 7]) expect(foldName(value, scheme)).toBe('');
    expect(nameSimilarity('Müştəri', 'Mushteri')).toBe(0);
  });

  it.each([
    ['Konul Isag', 'Könül İsaq'],
    ['Gamar Asadova', 'Qəmər Əsədova'],
    ['Jafar Khalilov', 'Cəfər Xəlilov'],
  ])('offers manifest name %s as an unselected weak candidate for %s', (manifestName, orderName) => {
    expect(nameSimilarity(manifestName, orderName)).toBeGreaterThanOrEqual(ZAYIF_ESLESME_ESIGI);
    const report = eslesmeOnerileriOlustur([row({ aliciAdi: manifestName })], [order('customer', { musteriAdi: orderName })]);
    expect(report.satirlar[0]).toMatchObject({ durum: 'ZAYIF_ADAY', onerilenSiparisId: null });
    expect(report.satirlar[0].adaylar).toEqual([
      expect.objectContaining({ siparisId: 'customer', eslesmeTipi: 'ISIM', guc: 'ZAYIF' }),
    ]);
  });

  it('still rejects both reported false matches', () => {
    expect(nameSimilarity('Natalia Petrova', 'Əli')).toBeLessThan(ZAYIF_ESLESME_ESIGI);
    expect(nameSimilarity('John Smith', 'Лейла Иванова')).toBeLessThan(ZAYIF_ESLESME_ESIGI);
    const report = eslesmeOnerileriOlustur(
      [row({ aliciAdi: 'Natalia Petrova' }), row({ takipNo: '37349392427', aliciAdi: 'John Smith' })],
      [order('eli', { musteriAdi: 'Əli' }), order('cyrillic', { musteriAdi: 'Лейла Иванова' })]
    );
    expect(report.satirlar.map((item) => [item.durum, item.adaylar.length])).toEqual([
      ['ESLESME_YOK', 0],
      ['ESLESME_YOK', 0],
    ]);
  });

  it('leaves normalization and the strong phone and order-code rules unchanged', () => {
    expect(normalizeName('Qəmər Əsədova')).toBe('qəmər əsədova');
    const report = eslesmeOnerileriOlustur(
      [
        row({ takipNo: 'AWB-0001', aliciAdi: 'Gamar Asadova' }),
        row({ takipNo: 'AWB-0002', aliciAdi: 'Somebody Else', telefon: '0552843911' }),
        row({ takipNo: 'AWB-0003', aliciAdi: 'Somebody Else', referansNo: 'tor-ca-1234' }),
      ],
      [
        order('named', { musteriAdi: 'Qəmər Əsədova' }),
        order('phone', { musteriAdi: 'Other Person', telefon: '+994552843911' }),
        order('code', { musteriAdi: 'Third Person', kanadaTakipKodu: 'TOR-CA-1234' }),
      ]
    );
    // A perfect transliterated name is still only a weak, unselected candidate.
    expect(report.satirlar[0]).toMatchObject({ durum: 'ZAYIF_ADAY', onerilenSiparisId: null });
    expect(report.satirlar[0].adaylar.every((item) => item.guc === 'ZAYIF')).toBe(true);
    expect(report.satirlar[1]).toMatchObject({ durum: 'ONERILDI', onerilenSiparisId: 'phone' });
    expect(report.satirlar[1].adaylar[0]).toMatchObject({ eslesmeTipi: 'TELEFON', guc: 'GUCLU' });
    expect(report.satirlar[2]).toMatchObject({ durum: 'ONERILDI', onerilenSiparisId: 'code' });
    expect(report.satirlar[2].adaylar[0]).toMatchObject({ eslesmeTipi: 'SIPARIS_KODU', guc: 'GUCLU' });
  });
});

describe('Strong phone rule is an exact normalized match', () => {
  it('reduces international, local and bare Azerbaijani formats to one canonical number', () => {
    for (const value of ['+994 50 123 45 67', '050 123 45 67', '994501234567'])
      expect(normalizePhone(value)).toBe('994501234567');
  });

  it('does not match two operators that share the last seven digits', () => {
    // The removed matcher accepted any number containing the manifest's last 7 digits.
    expect(normalizePhone('050 123 45 67')).not.toBe(normalizePhone('055 123 45 67'));
    const report = eslesmeOnerileriOlustur(
      [row({ telefon: '050 123 45 67' })],
      [order('other-operator', { telefon: '055 123 45 67' })]
    );
    expect(report.satirlar[0]).toMatchObject({ durum: 'ESLESME_YOK', onerilenSiparisId: null, adaylar: [] });
  });

  it('keeps a Canadian number apart from an Azerbaijani one with the same last seven digits', () => {
    expect(normalizePhone('+1 780 123 4567')).toBe('17801234567');
    expect(normalizePhone('780 123 4567')).not.toMatch(/^994/);
    const report = eslesmeOnerileriOlustur(
      [row({ telefon: '+1 780 123 4567' }), row({ takipNo: '37349392427', telefon: '780 123 4567' })],
      [order('baku', { telefon: '050 123 45 67' })]
    );
    expect(report.satirlar.map((item) => [item.durum, item.adaylar.length])).toEqual([
      ['ESLESME_YOK', 0],
      ['ESLESME_YOK', 0],
    ]);
  });
});
