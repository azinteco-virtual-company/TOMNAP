import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Minimal pure Node.js PNG encoder without external dependencies
function createPNG(width, height, getPixelRGBA) {
  // 1. PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // 2. IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // Bit depth: 8
  ihdr.writeUInt8(6, 9); // Color type: 6 (RGBA)
  ihdr.writeUInt8(0, 10); // Compression method
  ihdr.writeUInt8(0, 11); // Filter method
  ihdr.writeUInt8(0, 12); // Interlace: none

  const ihdrChunk = makeChunk('IHDR', ihdr);

  // 3. Image data with scanline filter (filter type 0 = None)
  const scanlineLength = width * 4 + 1;
  const rawData = Buffer.alloc(height * scanlineLength);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = getPixelRGBA(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  // Compress IDAT
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);

  // 4. IEND chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// CRC32 calculation for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crcTarget = chunk.subarray(4, 8 + len);
  const crc = crc32(crcTarget);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

// Icon generator logic
// Creates a clean, modern emblem:
// Dark slate-900 gradient background, rounded square border, Canadian red maple leaf stylized with Baku logistics badge
function getPixel(x, y, w, h, isMaskable = false) {
  const cx = w / 2;
  const cy = h / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Normalization
  const nx = (x / w) * 2 - 1; // -1 to 1
  const ny = (y / h) * 2 - 1; // -1 to 1

  // Background: Deep Slate gradient
  const bgR = Math.round(15 + (1 - ny) * 10);
  const bgG = Math.round(23 + (1 - ny) * 15);
  const bgB = Math.round(42 + (1 - ny) * 25);

  // If not maskable, round corners of the icon
  if (!isMaskable) {
    const cornerRadius = w * 0.22;
    const innerW = w - cornerRadius * 2;
    const innerH = h - cornerRadius * 2;
    const clampedX = Math.max(-innerW / 2, Math.min(innerW / 2, dx));
    const clampedY = Math.max(-innerH / 2, Math.min(innerH / 2, dy));
    const cdist = Math.sqrt((dx - clampedX) ** 2 + (dy - clampedY) ** 2);
    if (cdist > cornerRadius) {
      return [0, 0, 0, 0]; // Transparent outer margin
    }
  }

  // Inside container
  // Draw an inner glowing shield / circle
  const safeRadius = isMaskable ? w * 0.35 : w * 0.38;

  // Outer decorative ring
  if (Math.abs(dist - safeRadius) < (w * 0.015)) {
    return [59, 130, 246, 255]; // Indigo-blue ring
  }

  // Center emblem: Canadian Maple Leaf + Cargo Plane geometric silhouette
  // We can render a stylized Maple Leaf geometric silhouette
  const scale = safeRadius * 0.85;
  const mx = dx / scale;
  const my = -dy / scale + 0.1; // invert Y so up is positive

  // Stylized maple leaf shape equation approximation
  // or a crisp stylized modern geometric Canadian-Baku badge:
  // Center diamond/rhombus and wings
  const leafDist = Math.sqrt(mx * mx + my * my);
  
  // Center leaf point
  const isCenterPeak = Math.abs(mx) < 0.22 && my > 0 && my < 0.95 && Math.abs(mx) < (0.95 - my) * 0.35;
  // Left and Right main points
  const isLeftPeak = mx < -0.1 && mx > -0.85 && my > 0.05 && my < 0.7 && (Math.hypot(mx + 0.45, my - 0.4) < 0.35);
  const isRightPeak = mx > 0.1 && mx < 0.85 && my > 0.05 && my < 0.7 && (Math.hypot(mx - 0.45, my - 0.4) < 0.35);
  // Center core
  const isCore = leafDist < 0.45 && my > -0.3;
  // Stem
  const isStem = Math.abs(mx) < 0.06 && my >= -0.7 && my <= -0.2;

  // Logistics plane/arrow accent in center
  const isPlane = Math.abs(mx) < 0.5 && Math.abs(my + 0.1) < 0.12 && (my + 0.1 > -Math.abs(mx) * 0.4);

  if (isCenterPeak || isLeftPeak || isRightPeak || isCore || isStem) {
    // Canadian Vibrant Red / Coral
    return [239, 68, 68, 255];
  }

  // Center glowing logistic badge (emerald dot at base)
  if (Math.hypot(mx, my + 0.1) < 0.18) {
    return [16, 185, 129, 255]; // Emerald
  }

  // Gradient background
  return [bgR, bgG, bgB, 255];
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Generate pwa-192x192.png
const png192 = createPNG(192, 192, (x, y, w, h) => getPixel(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), png192);
console.log('✓ Created public/pwa-192x192.png');

// 2. Generate pwa-512x512.png
const png512 = createPNG(512, 512, (x, y, w, h) => getPixel(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), png512);
console.log('✓ Created public/pwa-512x512.png');

// 3. Generate pwa-maskable-512x512.png (with safe-zone bleed)
const pngMaskable = createPNG(512, 512, (x, y, w, h) => getPixel(x, y, w, h, true));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), pngMaskable);
console.log('✓ Created public/pwa-maskable-512x512.png');

// 4. Generate apple-touch-icon.png (180x180)
const appleIcon = createPNG(180, 180, (x, y, w, h) => getPixel(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), appleIcon);
console.log('✓ Created public/apple-touch-icon.png');

// 5. Generate favicon.ico (copy 192 or write 64)
const faviconPNG = createPNG(64, 64, (x, y, w, h) => getPixel(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), faviconPNG);
console.log('✓ Created public/favicon.ico');

// 6. Generate crisp vector SVG public/icon.svg
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e293b" />
    </linearGradient>
    <linearGradient id="leafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ef4444" />
      <stop offset="100%" stop-color="#dc2626" />
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#10b981" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#ef4444" flood-opacity="0.35"/>
    </filter>
  </defs>
  <!-- Base Background -->
  <rect width="512" height="512" rx="115" fill="url(#bgGrad)" />
  <!-- Outer Accent Border -->
  <rect x="16" y="16" width="480" height="480" rx="100" fill="none" stroke="url(#accentGrad)" stroke-width="4" stroke-opacity="0.5" />
  
  <!-- Central Badge Ring -->
  <circle cx="256" cy="256" r="185" fill="none" stroke="#334155" stroke-width="2" stroke-dasharray="8 8" />
  <circle cx="256" cy="256" r="170" fill="#1e293b" fill-opacity="0.7" stroke="#475569" stroke-width="1.5" />

  <!-- Canadian Maple Leaf Icon -->
  <g filter="url(#glow)" transform="translate(256, 240) scale(1.15)">
    <!-- Maple Leaf Path -->
    <path d="M0 -110 
             L16 -70 L38 -78 L34 -48 L65 -52 L54 -20 L92 -15 L78 12 L98 28 L62 42 L52 35 L42 55 L16 48 L14 85 L-14 85 L-16 48 L-42 55 L-52 35 L-62 42 L-98 28 L-78 12 L-92 -15 L-54 -20 L-65 -52 L-34 -48 L-38 -78 L-16 -70 Z" 
          fill="url(#leafGrad)" />
    <!-- Leaf Stem -->
    <rect x="-5" y="80" width="10" height="40" rx="3" fill="#b91c1c" />
    <!-- Center Emblem: Flight & Package -->
    <circle cx="0" cy="10" r="26" fill="#0f172a" stroke="#10b981" stroke-width="3.5" />
    <path d="M-10 10 L-2 4 L12 10 L-2 16 Z" fill="#10b981" />
    <circle cx="0" cy="10" r="4" fill="#ffffff" />
  </g>

  <!-- Bottom Logotype / Monogram -->
  <text x="256" y="445" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="34" font-weight="900" fill="#f8fafc" text-anchor="middle" letter-spacing="4">
    KNB LOGISTICS
  </text>
  <text x="256" y="475" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700" fill="#10b981" text-anchor="middle" letter-spacing="2">
    CANADA ➔ BAKU
  </text>
</svg>`;

fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent);
console.log('✓ Created public/icon.svg');
