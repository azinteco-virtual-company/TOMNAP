import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../../src/server/logger';

describe('Structured Logger (src/server/logger.ts)', () => {
  let logSpy: any;
  let warnSpy: any;
  let errorSpy: any;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logger.info: bilgi loglarını konsola yazmalı', () => {
    logger.info('Test bilgi mesajı', { tenantId: 'test-tenant' });
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('Test bilgi mesajı');
  });

  it('logger.warn: uyarı loglarını warn konsoluna yazmalı', () => {
    logger.warn('Test uyarı mesajı', { count: 42 });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('Test uyarı mesajı');
  });

  it('logger.error: hata loglarını error konsoluna yazmalı', () => {
    const testErr = new Error('Kritik bağlantı hatası');
    logger.error('Veritabanı hatası', testErr);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('Veritabanı hatası');
  });
});
