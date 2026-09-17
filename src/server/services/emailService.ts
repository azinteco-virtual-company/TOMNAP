import { RESEND_API_KEY, EMAIL_FROM, APP_URL, IS_PRODUCTION } from '../config';

/** Use a trusted deployment URL for bearer links, never Host or forwarded headers. */
export function getApplicationUrl(): string {
  const url = new URL(APP_URL);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (IS_PRODUCTION && url.protocol !== 'https:')
  ) {
    throw new Error('APP_URL etibarlı tətbiq ünvanı olmalıdır.');
  }
  return url.toString().replace(/\/+$/, '');
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>\"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' })[char]!
  );
}

export interface EmailGonderParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface ActivationEmailParams {
  email: string;
  adSoyad: string;
  butikAdi: string;
  token: string;
}

export interface InviteEmailParams {
  email: string;
  adSoyad?: string;
  butikAdi: string;
  rol: string;
  token: string;
  davetEden?: string;
}

/**
 * Ümumi e-poçt göndərmə funksiyası.
 * RESEND_API_KEY mövcuddursa Resend API vasitəsilə göndərir.
 * Yoxdursa və ya inkişaf rejimindədirsə konsola təhlükəsiz link çıxarır və xəta vermədən tamamlayır.
 */
export async function sendEmail(
  params: EmailGonderParams
): Promise<{ basarili: boolean; id?: string; hata?: string }> {
  const { to, subject, html, text } = params;

  console.log(`\n================= [TOMNAP EMAIL SERVICE] =================`);
  console.log(`GÖNDƏRİLİR: ${new Date().toISOString()}`);

  if (RESEND_API_KEY) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [to],
          subject,
          html,
          text: text || subject,
        }),
      });

      const resData = (await response.json()) as any;
      if (response.ok) {
        console.log(`✅ E-poçt Resend vasitəsilə uğurla çatdırıldı. Message ID: ${resData?.id}`);
        console.log(`==========================================================\n`);
        return { basarili: true, id: resData?.id };
      } else {
        console.warn('Resend API e-poçt göndərmə xətası:', response.status);
        console.log(`==========================================================\n`);
        return { basarili: false, hata: resData?.message || 'E-poçt göndərilə bilmədi' };
      }
    } catch (err: any) {
      console.error(`❌ Resend göndərmə xətası:`, err.message);
      console.log(`==========================================================\n`);
      return { basarili: false, hata: err.message };
    }
  }

  if (IS_PRODUCTION) {
    return { basarili: false, hata: 'E-poçt xidməti konfiqurasiya edilməyib.' };
  }

  // Development-only simulation; never claim delivery in production.
  console.log(`ℹ️ [TEST/DEV REJİMİ] RESEND_API_KEY təyin edilməyib, e-poçt simulyasiya edildi.`);
  console.log(`==========================================================\n`);
  return { basarili: false, hata: 'Geliştirme ortamında e-poçt gönderilmedi.' };
}

/**
 * Yeni Butik Qeydiyyatı üçün Aktivasiya & Şifrə Təyini E-poçtu
 */
export async function sendActivationEmail(params: ActivationEmailParams) {
  const baseUrl = getApplicationUrl();
  const link = `${baseUrl}/sifre-belirle?token=${encodeURIComponent(params.token)}`;

  const subject = `TOMNAP — ${params.butikAdi} üçün şifrənizi təyin edin və iş masanızı aktivləşdirin`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #e2e8f0; margin: 0; padding: 24px; }
    .card { max-width: 580px; margin: 0 auto; background: #1e293b; border-radius: 16px; border: 1px solid #334155; padding: 36px 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .brand { font-size: 24px; font-weight: 800; color: #818cf8; letter-spacing: -0.5px; margin-bottom: 24px; }
    .brand span { color: #f43f5e; }
    h1 { font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 16px; }
    p { font-size: 15px; line-height: 1.6; color: #cbd5e1; margin-bottom: 20px; }
    .btn { display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff !important; text-decoration: none; padding: 14px 28px; font-size: 15px; font-weight: 600; border-radius: 10px; margin: 12px 0 24px 0; text-align: center; }
    .btn:hover { background: #4338ca; }
    .link-box { background: #0f172a; padding: 12px 16px; border-radius: 8px; border: 1px dashed #475569; word-break: break-all; font-family: monospace; font-size: 13px; color: #94a3b8; }
    .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #334155; font-size: 12px; color: #64748b; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">TOMNAP<span>.</span></div>
    <h1>Hörmətli ${escapeHtml(params.adSoyad)},</h1>
    <p>
      <strong>"${escapeHtml(params.butikAdi)}"</strong> butikiniz üçün TOMNAP Beynəlxalq E-Ticarət İdarəetmə Platformasında qeydiyyat uğurla tamamlandı.
    </p>
    <p>
      Hesabınızı aktivləşdirmək və şəxsi şifrənizi təyin etmək üçün aşağıdakı düyməyə klikləyin:
    </p>
    <div style="text-align: center;">
      <a href="${link}" class="btn" target="_blank">Şifrənizi Təyin Edin və Giriş Edin</a>
    </div>
    <p style="font-size: 13px; color: #94a3b8;">
      Düymə açılmırsa, aşağıdakı linki birbaşa brauzerinizin ünvan sətrinə yapışdıra bilərsiniz:
    </p>
    <div class="link-box">${link}</div>
    <div class="footer">
      <p>Bu təhlükəsizlik linki 24 saat müddətində etibarlıdır. Əgər bu müraciəti siz etməmisinizsə, zəhmət olmasa bu məktubu nəzərə almayın.</p>
      <p>© 2026 TOMNAP Enterprise Platform — Bütün hüquqlar qorunur.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
Hörmətli ${params.adSoyad},

"${params.butikAdi}" butikiniz üçün TOMNAP platformasında qeydiyyat uğurla tamamlandı.
Şifrənizi təyin etmək və hesabınızı aktivləşdirmək üçün bu linkə keçid edin:
${link}

Bu link 24 saat müddətində etibarlıdır.
TOMNAP Dəstək Komandası
  `.trim();

  const result = await sendEmail({ to: params.email, subject, html, text });
  return { ...result, link };
}

/**
 * Komanda Üzvləri üçün Dəvət & Şifrə Təyini E-poçtu
 */
export async function sendInviteEmail(params: InviteEmailParams) {
  const baseUrl = getApplicationUrl();
  const link = `${baseUrl}/davet-qebul?token=${encodeURIComponent(params.token)}`;

  const rolAdlari: Record<string, string> = {
    KANADA_SATINALMA: 'Kanada Satınalma Meneceri',
    SATIS_SORUMLUSU: 'Satış və Müştəri Xidmətləri',
    BAKU_FINANS: 'Bakı Maliyyə / Kassa Sorumlusu',
    BAKU_KURYE: 'Bakı Daxili Çatdırılma / Kuryer',
    PATRON: 'Həmtəsisçi / Patron',
  };

  const rolAdi = rolAdlari[params.rol] || params.rol;
  const subject = `TOMNAP — "${params.butikAdi}" butik komandasına dəvət edildiniz (${rolAdi})`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #e2e8f0; margin: 0; padding: 24px; }
    .card { max-width: 580px; margin: 0 auto; background: #1e293b; border-radius: 16px; border: 1px solid #334155; padding: 36px 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .brand { font-size: 24px; font-weight: 800; color: #818cf8; letter-spacing: -0.5px; margin-bottom: 24px; }
    .brand span { color: #f43f5e; }
    .role-badge { display: inline-block; background: #312e81; color: #c7d2fe; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
    h1 { font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 16px; }
    p { font-size: 15px; line-height: 1.6; color: #cbd5e1; margin-bottom: 20px; }
    .btn { display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff !important; text-decoration: none; padding: 14px 28px; font-size: 15px; font-weight: 600; border-radius: 10px; margin: 12px 0 24px 0; text-align: center; }
    .link-box { background: #0f172a; padding: 12px 16px; border-radius: 8px; border: 1px dashed #475569; word-break: break-all; font-family: monospace; font-size: 13px; color: #94a3b8; }
    .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #334155; font-size: 12px; color: #64748b; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">TOMNAP<span>.</span></div>
    <div class="role-badge">${escapeHtml(rolAdi)}</div>
    <h1>${params.adSoyad ? `Hörmətli ${escapeHtml(params.adSoyad)},` : 'Salam,'}</h1>
    <p>
      ${escapeHtml(params.davetEden || 'Butik rəhbərliyi')} tərəfindən <strong>"${escapeHtml(params.butikAdi)}"</strong> butikinin idarəetmə masasına <strong>${escapeHtml(rolAdi)}</strong> vəzifəsi üzrə dəvət olundunuz.
    </p>
    <p>
      Dəvəti qəbul etmək, şifrənizi təyin etmək və iş masanıza daxil olmaq üçün aşağıdakı düyməyə klikləyin:
    </p>
    <div style="text-align: center;">
      <a href="${link}" class="btn" target="_blank">Dəvəti Qəbul Et və Şifrə Təyin Et</a>
    </div>
    <p style="font-size: 13px; color: #94a3b8;">
      Düymə açılmırsa, aşağıdakı keçidi kopyalayaraq brauzerinizdə aça bilərsiniz:
    </p>
    <div class="link-box">${link}</div>
    <div class="footer">
      <p>Bu dəvət linki 7 gün müddətində etibarlıdır.</p>
      <p>© 2026 TOMNAP Enterprise Platform</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
Hörmətli ${params.adSoyad || 'Komanda Üzvü'},

${params.davetEden || 'Butik rəhbərliyi'} tərəfindən "${params.butikAdi}" butikinin idarəetmə masasına ${rolAdi} olaraq dəvət edildiniz.
Dəvəti qəbul etmək üçün bu linkə keçid edin:
${link}

TOMNAP Dəstək Komandası
  `.trim();

  const result = await sendEmail({ to: params.email, subject, html, text });
  return { ...result, link };
}
