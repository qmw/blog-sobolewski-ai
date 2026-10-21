// POST /api/newsletter/subscribe — the footer form. Emails a confirmation link.
import { createHash } from 'node:crypto';
import { FROM, SITE, confirmEmailHtml, copy, currentHour, isEmail, isLang, makeToken, page, resend, type Lang } from '../_newsletter.js';

export async function POST(request: Request) {
  let lang: Lang = 'pl';
  try {
    const form = await request.formData();
    const rawLang = form.get('lang');
    if (isLang(rawLang)) lang = rawLang;
    const c = copy[lang];

    // Honeypot: people never see this field, bots fill it in. Pretend it worked.
    if (form.get('website')) return page(lang, c.checkTitle, c.checkBody);

    const email = String(form.get('email') ?? '').trim().toLowerCase();
    if (!isEmail(email)) return page(lang, c.errorTitle, c.invalidEmail, '', 400);

    const hour = currentHour();
    const link = `${SITE}/api/newsletter/confirm?token=${encodeURIComponent(makeToken(email, lang, hour))}`;
    // The same address within the same hour gets one email, however often the form is sent.
    const id = createHash('sha256').update(email).digest('hex').slice(0, 32);
    const { error } = await resend().emails.send(
      {
        from: FROM,
        to: [email],
        subject: c.mailSubject,
        html: confirmEmailHtml(lang, link),
        text: `${c.mailBody}\n\n${c.mailButton}: ${link}\n\n${c.mailIgnore}`,
      },
      { idempotencyKey: `newsletter-confirm/${id}/${hour}/${lang}` },
    );
    if (error && error.name !== 'invalid_idempotent_request') {
      console.error('newsletter subscribe: send failed', error.name, error.message);
      return page(lang, c.errorTitle, c.errorBody, '', 502);
    }
    return page(lang, c.checkTitle, c.checkBody);
  } catch (e) {
    console.error('newsletter subscribe:', e);
    return page(lang, copy[lang].errorTitle, copy[lang].errorBody, '', 500);
  }
}
