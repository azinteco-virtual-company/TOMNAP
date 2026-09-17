import { afterEach, describe, expect, it, vi } from 'vitest';

const config = vi.hoisted(() => ({
  RESEND_API_KEY: '',
  EMAIL_FROM: 'noreply@example.invalid',
  APP_URL: 'https://portal.example',
  IS_PRODUCTION: true,
}));
vi.mock('../../../src/server/config', () => config);
import {
  sendActivationEmail,
  sendInviteEmail,
  getApplicationUrl,
  sendEmail,
} from '../../../src/server/services/emailService';

afterEach(() => {
  config.APP_URL = 'https://portal.example';
  config.RESEND_API_KEY = '';
  config.IS_PRODUCTION = true;
  vi.restoreAllMocks();
});

describe('Activation email security', () => {
  it('does not report delivery for development simulation either', async () => {
    config.IS_PRODUCTION = false;
    const response = await sendActivationEmail({
      email: 'owner@example.invalid',
      adSoyad: 'Owner',
      butikAdi: 'Store',
      token: 'secret',
    });
    expect(response.basarili).toBe(false);
  });

  it('escapes user-provided HTML in email templates', async () => {
    config.RESEND_API_KEY = 'mock-only';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ id: 'mock' }), { status: 200 }));
    await sendActivationEmail({
      email: 'owner@example.invalid',
      adSoyad: '<img src=x onerror=alert(1)>',
      butikAdi: '<a href="https://evil.invalid">Store</a>',
      token: 'secret',
    });
    const payload = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(payload.html).not.toContain('<img src=x');
    expect(payload.html).not.toContain('<a href="https://evil.invalid">');
    expect(payload.html).toContain('&lt;img src=x');
    expect(payload.text).toContain('<img src=x');
  });

  it('sends a stable provider idempotency key and persisted sender', async () => {
    config.RESEND_API_KEY = 'mock-only';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ id: 'mock' }), { status: 200 }));
    await sendEmail({
      from: 'original@example.test',
      to: 'owner@example.test',
      subject: 'Fixed',
      html: '<p>Fixed</p>',
      text: 'Fixed',
      idempotencyKey: 'tomnap-onboarding/job-id',
    });
    const request = fetchSpy.mock.calls[0][1]!;
    expect(request.headers).toMatchObject({ 'Idempotency-Key': 'tomnap-onboarding/job-id' });
    expect(JSON.parse(String(request.body)).from).toBe('original@example.test');
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it('never simulates successful email delivery in production', async () => {
    const response = await sendActivationEmail({
      email: 'owner@example.invalid',
      adSoyad: 'Owner',
      butikAdi: 'Store',
      token: 'secret-activation-token',
    });
    expect(response.basarili).toBe(false);
    expect(response.link).toBe(
      'https://portal.example/sifre-belirle?token=secret-activation-token'
    );
  });

  it('does not log bearer links or recipients', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await sendActivationEmail({
      email: 'private@example.invalid',
      adSoyad: 'Owner',
      butikAdi: 'Store',
      token: 'activation-secret',
    });
    await sendInviteEmail({
      email: 'private@example.invalid',
      butikAdi: 'Store',
      rol: 'BAKU_KURYE',
      token: 'invitation-secret',
    });
    const logs = JSON.stringify(spy.mock.calls);
    expect(logs).not.toContain('activation-secret');
    expect(logs).not.toContain('invitation-secret');
    expect(logs).not.toContain('private@example.invalid');
  });

  it.each([
    'http://portal.example',
    'https://user:password@portal.example',
    'javascript:alert(1)',
    'https://portal.example/?token=secret',
  ])('rejects unsafe production APP_URL %s', (url) => {
    config.APP_URL = url;
    expect(getApplicationUrl).toThrow();
  });
});
