import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from 'vite';

/**
 * Bayrak arkasındaki ekranların derlemesini denetler (Faz A, A6; Codex R3 F18).
 *   node --import tsx scripts/check-v2-bundle.ts [dist] [kapali|acik]
 * İkinci argüman v2 kabuğunun modudur. Verilmezse her ekranın modu derlemenin gördüğü
 * bayraktan (süreç ortamı ve .env dosyaları, Vite'ın kendi kuralıyla) belirlenir.
 * kapali: bayrak kapalı derlemede ekranın işareti hiçbir dosyada yok.
 * acik:   işaret yalnız ayrı bir parçada; index.html'in yüklediği ya da ön
 *         yüklediği (modulepreload) hiçbir dosyada yok.
 */
const env = loadEnv('production', process.cwd(), 'VITE_');
const [dist = 'dist', v2Modu] = process.argv.slice(2);
const EKRANLAR = [
  {
    ad: 'v2 kabuğu',
    isaret: 'tomnap-v2-kabuk',
    bayrak: 'VITE_FF_V2_FLOW',
    mod: v2Modu ?? (env.VITE_FF_V2_FLOW === 'true' ? 'acik' : 'kapali'),
  },
  {
    ad: 'AWB inceleme paneli',
    isaret: 'tomnap-awb-panel',
    bayrak: 'VITE_FF_AWB_REVIEW',
    mod: env.VITE_FF_AWB_REVIEW === 'true' ? 'acik' : 'kapali',
  },
];

function jsDosyalari(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsDosyalari(file);
    return entry.name.endsWith('.js') ? [file] : [];
  });
}

function kontrol(ekran: (typeof EKRANLAR)[number]): string | null {
  if (ekran.mod !== 'kapali' && ekran.mod !== 'acik') return `Bilinmeyen mod: ${ekran.mod}`;
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const ilkYuk = new Set(
    [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="\/?([^"?#]+\.js)"/g)].map((match) =>
      path.join(dist, match[1])
    )
  );
  if (ilkYuk.size === 0) return 'index.html içinde giriş betiği bulunamadı.';
  const isaretli = jsDosyalari(dist).filter((file) =>
    fs.readFileSync(file, 'utf8').includes(ekran.isaret)
  );
  if (ekran.mod === 'kapali')
    return isaretli.length === 0
      ? null
      : `${ekran.bayrak} kapalıyken ${ekran.ad} pakette: ${isaretli.join(', ')}`;
  if (isaretli.length === 0) return `${ekran.bayrak} açıkken ${ekran.ad} derlemede bulunamadı.`;
  const ilkYukte = isaretli.filter((file) => ilkYuk.has(file));
  return ilkYukte.length === 0 ? null : `${ekran.ad} ilk yük paketinde: ${ilkYukte.join(', ')}`;
}

for (const ekran of EKRANLAR) {
  const hata = kontrol(ekran);
  if (hata) {
    console.error(hata);
    process.exitCode = 1;
  } else {
    console.log(
      ekran.mod === 'kapali'
        ? `${ekran.ad} derlemede yok (${ekran.bayrak} kapalı).`
        : `${ekran.ad} ayrı parçada; ilk yük paketinde değil.`
    );
  }
}

/**
 * Çeviri dosyaları ve PDF fontu (docs/i18n.md): dil dosyaları ve Noto Sans ayrı parçalardır;
 * index.html'in yüklediği ya da ön yüklediği hiçbir dosyada olmaz, font service worker'ın
 * kurulumda indirdiği listeye (precache) girmez. Her dil dosyasının en uzun metni ilk yük
 * paketinde aranır.
 */
function ceviriVeFontKontrolu(): string | null {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const ilkYuk = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="\/?([^"?#]+)"/g)]
    .map((match) => path.join(dist, match[1]))
    .filter((dosya) => dosya.endsWith('.js'));
  const ilkIcerik = ilkYuk.map((dosya) => fs.readFileSync(dosya, 'utf8')).join('\n');
  const kok = 'src/i18n/locales';
  const yapraklar = (agac: unknown): string[] =>
    typeof agac === 'string'
      ? [agac]
      : agac && typeof agac === 'object'
        ? Object.values(agac).flatMap(yapraklar)
        : [];
  for (const dil of fs.readdirSync(kok)) {
    const klasor = path.join(kok, dil);
    if (!fs.statSync(klasor).isDirectory()) continue;
    for (const dosya of fs.readdirSync(klasor)) {
      const enUzun = yapraklar(JSON.parse(fs.readFileSync(path.join(klasor, dosya), 'utf8')))
        .filter((metin) => !/["\\\n]/.test(metin))
        .sort((a, b) => b.length - a.length)[0];
      if (!enUzun) continue;
      if (ilkIcerik.includes(enUzun)) return `Çeviri dosyası ilk yük paketinde: ${dil}/${dosya}`;
      const parca = jsDosyalari(dist).find((js) => fs.readFileSync(js, 'utf8').includes(enUzun));
      if (!parca) return `Çeviri dosyası derlemede bulunamadı: ${dil}/${dosya}`;
    }
  }
  const fontlar = fs.readdirSync(path.join(dist, 'assets')).filter((f) => f.endsWith('.ttf'));
  if (fontlar.length < 2) return 'PDF fontu (Noto Sans, normal ve kalın) derlemede yok.';
  if (/\.ttf\b/.test(html)) return 'PDF fontu index.html tarafından yükleniyor.';
  const sw = path.join(dist, 'sw.js');
  if (fs.existsSync(sw) && /url:"[^"]*\.ttf"/.test(fs.readFileSync(sw, 'utf8')))
    return 'PDF fontu service worker kurulum listesinde (precache).';
  return null;
}

const ceviriHatasi = ceviriVeFontKontrolu();
if (ceviriHatasi) {
  console.error(ceviriHatasi);
  process.exitCode = 1;
} else {
  console.log('Çeviri dosyaları ve PDF fontu ayrı parçalarda; ilk yük paketinde değil.');
}
