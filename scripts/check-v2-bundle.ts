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
