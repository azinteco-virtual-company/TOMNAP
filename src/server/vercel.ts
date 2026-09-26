import { createApp } from './index';

// Vercel overwrites X-Forwarded-For with the client's IP and does not forward
// client-supplied entries, so exactly one hop (Vercel's) is trusted.
const app = createApp({ trustProxy: 1 });

export default function handler(req: any, res: any) {
  try {
    // Vercel Serverless mühitində URL və Query String normallaşdırması:
    const originalUrl = req.url || '';
    const queryIndex = originalUrl.indexOf('?');
    const queryString = queryIndex !== -1 ? originalUrl.substring(queryIndex) : '';

    // The path comes only from req.url. Vercel does not set X-Forwarded-Uri, so
    // that header is client-controlled and must never re-route a request.
    if (req.url && !req.url.startsWith('/api') && !req.url.startsWith('/uploads')) {
      req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
    }

    // Əgər req.url-də query string itibdirsə, onu bərpa et
    if (queryString && !req.url.includes('?')) {
      req.url += queryString;
    } else if (req.query && typeof req.query === 'object' && Object.keys(req.query).length > 0 && !req.url.includes('?')) {
      const qs = new URLSearchParams(req.query).toString();
      if (qs) {
        req.url += '?' + qs;
      }
    }

    return app(req, res);
  } catch (err: any) {
    console.error('Vercel Serverless Handler Xətası:', err);
    if (!res.headersSent) {
      return res.status(500).json({ basarili: false, hata: err?.message || 'Daxili server xətası' });
    }
  }
}
