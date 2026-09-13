import { createApp } from '../src/server/index';

const app = createApp();

export default function handler(req: any, res: any) {
  // Vercel Serverless mühitində URL normallaşdırması:
  // Vercel /api/(.*) -> /api rewrite qaydası sorğunun req.url-ini '/...' kimi ötürə bilər.
  // Express bütün marşrutları '/api' prefiksi altında saxlayır.
  const forwardedUri = req.headers?.['x-forwarded-uri'] || req.headers?.['x-matched-path'];
  if (forwardedUri && typeof forwardedUri === 'string' && (forwardedUri.startsWith('/api') || forwardedUri.startsWith('/uploads'))) {
    req.url = forwardedUri;
  } else if (req.url && !req.url.startsWith('/api') && !req.url.startsWith('/uploads')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  return app(req, res);
}
