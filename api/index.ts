import { createApp } from '../src/server/index';

const app = createApp();

export default function handler(req: any, res: any) {
  return new Promise((resolve) => {
    // Vercel Serverless mühitində URL normallaşdırması:
    const forwardedUri = req.headers?.['x-forwarded-uri'] || req.headers?.['x-matched-path'];
    if (forwardedUri && typeof forwardedUri === 'string' && (forwardedUri.startsWith('/api') || forwardedUri.startsWith('/uploads'))) {
      req.url = forwardedUri;
    } else if (req.url && !req.url.startsWith('/api') && !req.url.startsWith('/uploads')) {
      req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
    }

    // Serverless mühitdə body-parser donmasını əngəllə
    if (req.body !== undefined && typeof req.body === 'object') {
      req._body = true;
    }

    res.on('finish', () => resolve(true));
    res.on('close', () => resolve(true));

    app(req, res);
  });
}
