// /api/newsletter/confirm — the link from the confirmation email.
// GET returns a page that submits itself with JavaScript, so one click on the email
// link subscribes. Mail scanners open links but don't run scripts, so they can't
// subscribe anyone; without JavaScript the visitor presses the button.
// POST adds the contact to the Newsletter segment and its language topic.
import { LANGS, SEGMENT_ID, TOPICS, copy, escapeHtml, isLang, page, readToken, resend, type Lang } from '../_newsletter.js';

function langOf(request: Request): Lang {
  const l = new URL(request.url).searchParams.get('lang');
  return isLang(l) ? l : 'pl';
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  const data = readToken(token);
  if (!data) {
    const c = copy[langOf(request)];
    return page(langOf(request), c.badLinkTitle, c.badLinkBody, '', 400);
  }
  const c = copy[data.lang];
  const form = `<form id="confirm" method="post" action="/api/newsletter/confirm"><input type="hidden" name="token" value="${escapeHtml(token!)}"><p><button type="submit">${escapeHtml(c.confirmButton)}</button></p></form>
<script>document.getElementById('confirm').submit();</script>`;
  return page(data.lang, c.confirmTitle, c.confirmBody, form);
}

export async function POST(request: Request) {
  let lang: Lang = 'pl';
  try {
    const form = await request.formData();
    const data = readToken(String(form.get('token') ?? ''));
    if (!data) return page(lang, copy[lang].badLinkTitle, copy[lang].badLinkBody, '', 400);
    lang = data.lang;
    const c = copy[lang];
    const r = resend();
    const topic = { id: TOPICS[lang], subscription: 'opt_in' as const };

    const created = await r.contacts.create({
      email: data.email,
      unsubscribed: false,
      properties: { lang },
      segments: [{ id: SEGMENT_ID }],
      topics: [topic],
    });
    if (created.error) {
      // Already a contact (maybe unsubscribed earlier, or another language): update it.
      const updated = await r.contacts.update({ email: data.email, unsubscribed: false, properties: { lang } });
      if (updated.error) throw new Error(`update: ${updated.error.name} ${updated.error.message} (create: ${created.error.message})`);
      const seg = await r.contacts.segments.add({ email: data.email, segmentId: SEGMENT_ID });
      if (seg.error && !/already/i.test(seg.error.message)) throw new Error(`segment: ${seg.error.message}`);
      // One language per subscriber: opt in to this one, out of the rest.
      const topics = LANGS.map((l) => ({ id: TOPICS[l], subscription: l === lang ? ('opt_in' as const) : ('opt_out' as const) }));
      const top = await r.contacts.topics.update({ email: data.email, topics });
      if (top.error) throw new Error(`topics: ${top.error.message}`);
    }
    return page(lang, c.doneTitle, c.doneBody);
  } catch (e) {
    console.error('newsletter confirm:', e);
    return page(lang, copy[lang].errorTitle, copy[lang].errorBody, '', 500);
  }
}
