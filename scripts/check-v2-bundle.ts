import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from 'vite';

/**
 * v2 kabuğunun ilk yük paketine girmediğini doğrular (Faz A, A6).
 *   node --import tsx scripts/check-v2-bundle.ts [dist] [kapali|acik]
 * Mod verilmezse derlemenin gördüğü VITE_FF_V2_FLOW'dan (süreç ortamı ve .env
 * dosyaları, Vite'ın kendi kuralıyla) belirlenir.
 * kapali: VITE_FF_V2_FLOW kapalı derlemede v2 işareti hiçbir dosyada yok.
 * acik:   işaret yalnız ayrı bir parçada; index.html'in yüklediği ya da ön
 *         yüklediği (modulepreload) hiçbir dosyada yok.
 */
const ISARET = 'tomnap-v2-kabuk';
const derlemeBayragi = loadEnv('production', process.cwd(), 'VITE_').VITE_FF_V2_FLOW === 'true';
const [dist = 'dist', mod = derlemeBayragi ? 'acik' : 'kapali'] = process.argv.slice(2);

function jsDosyalari(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsDosyalari(file);
    return entry.name.endsWith('.js') ? [file] : [];
  });
}

function kontrol(): string | null {
  if (mod !== 'kapali' && mod !== 'acik') return `Bilinmeyen mod: ${mod}`;
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const ilkYuk = new Set(
    [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="\/?([^"?#]+\.js)"/g)].map((match) =>
      path.join(dist, match[1])
    )
  );
  if (ilkYuk.size === 0) return 'index.html içinde giriş betiği bulunamadı.';
  const isaretli = jsDosyalari(dist).filter((file) =>
    fs.readFileSync(file, 'utf8').includes(ISARET)
  );
  if (mod === 'kapali')
    return isaretli.length === 0
      ? null
      : `Bayrak kapalıyken v2 kodu pakette: ${isaretli.join(', ')}`;
  if (isaretli.length === 0) return 'Bayrak açıkken v2 kabuğu derlemede bulunamadı.';
  const ilkYukte = isaretli.filter((file) => ilkYuk.has(file));
  return ilkYukte.length === 0 ? null : `v2 kodu ilk yük paketinde: ${ilkYukte.join(', ')}`;
}

const hata = kontrol();
if (hata) {
  console.error(hata);
  process.exitCode = 1;
} else {
  console.log(
    mod === 'kapali'
      ? 'v2 kabuğu derlemede yok (VITE_FF_V2_FLOW kapalı).'
      : 'v2 kabuğu ayrı parçada; ilk yük paketinde değil.'
  );
}
