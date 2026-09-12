import { Request, Response, NextFunction } from 'express';

// API Rotaları için Global Hata Yakalayıcı (Asla HTML dönmez, her zaman temiz JSON döner)
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  if (req.path.startsWith('/api/')) {
    console.error('Express API Hatası:', err);
    return res.status(err.status || 500).json({
      basarili: false,
      hata: err.type === 'entity.too.large'
        ? 'Yüklenen görsel boyutu sunucu sınırını aştı. Lütfen görseli kırpın veya küçültün.'
        : (err.message || 'Sunucu işlemi sırasında bir hata oluştu.'),
    });
  }
  next(err);
}
