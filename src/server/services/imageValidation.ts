import { MAX_IMAGE_BYTES, PublicResourceError } from './publicFetch';

export function decodeImage(base64: string, declaredMime?: string) {
  const dataUrl = base64.match(/^data:([^;]+);base64,(.*)$/s);
  const encoded = dataUrl ? dataUrl[2] : base64;
  if (encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) {
    throw new PublicResourceError('Görsel en fazla 10 MB olabilir.', 413);
  }
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new PublicResourceError('Geçersiz base64 görsel verisi.', 400);
  }
  const buffer = Buffer.from(encoded, 'base64');
  return inspectImage(buffer, declaredMime, dataUrl?.[1]);
}

export function inspectImage(buffer: Buffer, ...declaredMimes: (string | undefined)[]) {
  if (buffer.length > MAX_IMAGE_BYTES)
    throw new PublicResourceError('Görsel en fazla 10 MB olabilir.', 413);
  const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  const webp =
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP';
  const mimeType = png ? 'image/png' : jpeg ? 'image/jpeg' : webp ? 'image/webp' : '';
  if (!mimeType)
    throw new PublicResourceError('Yalnızca PNG, JPEG veya WebP görselleri desteklenir.', 415);
  for (const claimed of declaredMimes) {
    if (claimed !== undefined && typeof claimed !== 'string')
      throw new PublicResourceError('Geçersiz görsel türü.', 400);
    if (
      claimed &&
      claimed.trim().toLowerCase() !== mimeType &&
      !(claimed === 'image/jpg' && jpeg)
    ) {
      throw new PublicResourceError('Görsel türü dosya içeriğiyle eşleşmiyor.', 415);
    }
  }
  return { buffer, mimeType, ext: png ? 'png' : jpeg ? 'jpg' : 'webp' };
}
