import { createApp } from '../src/server/index';

const app = createApp();

export default function handler(req: any, res: any) {
  return new Promise((resolve) => {
    // Vercel Serverless mühitində URL və Query String normallaşdırması:
    const originalUrl = req.url || '';
    const queryIndex = originalUrl.indexOf('?');
    const queryString = queryIndex !== -1 ? originalUrl.substring(queryIndex) : '';

    const forwardedUri = req.headers?.['x-forwarded-uri'];
    if (forwardedUri && typeof forwardedUri === 'string' && (forwardedUri.startsWith('/api') || forwardedUri.startsWith('/uploads'))) {
      req.url = forwardedUri;
    } else if (req.url && !req.url.startsWith('/api') && !req.url.startsWith('/uploads')) {
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

    // Serverless mühitdə body-parser donmasını əngəllə
    if (req.body !== undefined && typeof req.body === 'object') {
      req._body = true;
    }

    res.on('finish', () => resolve(true));
    res.on('close', () => resolve(true));

    app(req, res);
  });
}
