#!/usr/bin/env node
// The newsletter routine's tool. Needs RESEND_API_KEY.
//
//   node scripts/newsletter.mjs status [YYYY-MM-DD]      subscribers per language, quota, what's sent
//   node scripts/newsletter.mjs preview <issue.json> <lang>   print one language's email HTML
//   node scripts/newsletter.mjs send <issue.json>            one broadcast per language with subscribers
//
// Segment and topic IDs live in api/_newsletter.ts; this script finds them by name.
import { readFileSync } from 'node:fs';
import { Resend } from 'resend';

const LANGS = ['pl', 'en', 'de', 'es', 'fr', 'it', 'ar', 'ja', 'zh'];
const SITE = 'https://example.com';
const FROM = 'Your Name <newsletter@news.example.com>';
const SEGMENT = 'Newsletter';
const topicName = (lang) => `Newsletter ${lang.toUpperCase()}`;
const broadcastName = (date, lang) => `daily-${date}-${lang}`;

const footer = {
  pl: { blog: 'Dziś na blogu', why: 'Dostajesz ten mail, bo zapisałeś się na newsletter example.com.', unsub: 'Wypisz się', read: 'Czytaj' },
  en: { blog: 'New on the blog today', why: 'You get this email because you subscribed to the example.com newsletter.', unsub: 'Unsubscribe', read: 'Read' },
  de: { blog: 'Heute im Blog', why: 'Du bekommst diese E-Mail, weil du den Newsletter von example.com abonniert hast.', unsub: 'Abmelden', read: 'Lesen' },
  es: { blog: 'Hoy en el blog', why: 'Recibes este correo porque te suscribiste al boletín de example.com.', unsub: 'Darse de baja', read: 'Leer' },
  fr: { blog: "Aujourd'hui sur le blog", why: 'Vous recevez cet e-mail car vous êtes inscrit à la newsletter de example.com.', unsub: 'Se désinscrire', read: 'Lire' },
  it: { blog: 'Oggi sul blog', why: 'Ricevi questa email perché ti sei iscritto alla newsletter di example.com.', unsub: 'Disiscriviti', read: 'Leggi' },
  ar: { blog: 'جديد المدونة اليوم', why: 'تصلك هذه الرسالة لأنك اشتركت في النشرة البريدية لموقع example.com.', unsub: 'إلغاء الاشتراك', read: 'اقرأ' },
  ja: { blog: '本日のブログ', why: 'example.com のニュースレターにご登録いただいたため、このメールをお送りしています。', unsub: '配信停止', read: '読む' },
  zh: { blog: '今日博客', why: '你收到这封邮件，是因为你订阅了 example.com 的新闻简报。', unsub: '退订', read: '阅读' },
};

function client() {
  if (!process.env.RESEND_API_KEY) fail('RESEND_API_KEY is not set');
  return new Resend(process.env.RESEND_API_KEY);
}

function fail(msg) {
  console.error(`newsletter: ${msg}`);
  process.exit(1);
}

/** The SDK returns { data, error } instead of throwing. */
function ok(res, what) {
  if (res.error) fail(`${what}: ${res.error.name} ${res.error.message}`);
  return res.data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ids(r) {
  const segments = ok(await r.segments.list(), 'list segments').data;
  const segment = segments.find((s) => s.name === SEGMENT);
  if (!segment) fail(`segment "${SEGMENT}" not found`);
  const topics = ok(await r.topics.list(), 'list topics').data;
  const topic = {};
  for (const lang of LANGS) {
    const t = topics.find((x) => x.name === topicName(lang));
    if (!t) fail(`topic "${topicName(lang)}" not found`);
    topic[lang] = t.id;
  }
  return { segmentId: segment.id, topic };
}

/** Subscribed contacts per language: in the segment, not unsubscribed, opted in to the topic. */
async function counts(r, { segmentId, topic }) {
  const byTopic = Object.fromEntries(Object.entries(topic).map(([l, id]) => [id, l]));
  const n = Object.fromEntries(LANGS.map((l) => [l, 0]));
  let after;
  do {
    const page = ok(await r.contacts.list({ segmentId, limit: 100, ...(after ? { after } : {}) }), 'list contacts');
    for (const c of page.data) {
      if (c.unsubscribed) continue;
      const topics = ok(await r.contacts.topics.list({ id: c.id, limit: 100 }), 'list contact topics').data;
      for (const t of topics) if (t.subscription === 'opt_in' && byTopic[t.id]) n[byTopic[t.id]]++;
      await sleep(120); // the API allows 10 requests per second
    }
    after = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (after);
  return n;
}

async function usage() {
  const res = await fetch('https://api.resend.com/usage', { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
  if (!res.ok) return null;
  const u = await res.json();
  const left = (x) => (x?.limit == null ? Infinity : x.limit - x.used);
  return { daily: left(u.emails?.daily), monthly: left(u.emails?.monthly), contacts: u.contacts };
}

async function existing(r, date) {
  const names = new Set();
  let after;
  for (let i = 0; i < 5; i++) {
    const page = ok(await r.broadcasts.list({ limit: 100, ...(after ? { after } : {}) }), 'list broadcasts');
    for (const b of page.data) if (b.name?.startsWith(`daily-${date}-`)) names.add(b.name);
    if (!page.has_more) break;
    after = page.data.at(-1)?.id;
  }
  return names;
}

function warsawDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(new Date());
}

// --- Issue ----------------------------------------------------------------------------

function readIssue(path) {
  let issue;
  try {
    issue = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(`can't read ${path}: ${e.message}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issue.date ?? '')) fail('issue.date must be YYYY-MM-DD');
  if (!issue.issues?.pl) fail('issue.issues.pl is required');
  for (const [lang, x] of Object.entries(issue.issues)) {
    if (!LANGS.includes(lang)) fail(`unknown language "${lang}"`);
    for (const k of ['subject', 'preview', 'intro']) if (!x[k]?.trim()) fail(`${lang}.${k} is empty`);
    if (!Array.isArray(x.items) || x.items.length === 0) fail(`${lang}.items is empty`);
    for (const it of x.items) {
      if (!it.title?.trim() || !it.summary?.trim()) fail(`${lang}: an item lacks a title or summary`);
      if (!/^https:\/\//.test(it.url ?? '')) fail(`${lang}: item "${it.title}" needs an https url`);
    }
    for (const p of x.posts ?? []) if (!p.url?.startsWith(SITE)) fail(`${lang}: post "${p.title}" must link to ${SITE}`);
    if (x.subject.length > 78) console.warn(`warning: ${lang}.subject is ${x.subject.length} characters`);
  }
  return issue;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function render(issue, lang) {
  const x = issue.issues[lang];
  const f = footer[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const date = new Date(`${issue.date}T12:00:00Z`).toLocaleDateString(lang === 'zh' ? 'zh-CN' : lang, { day: 'numeric', month: 'long', year: 'numeric' });
  const items = x.items
    .map(
      (it) => `<tr><td style="padding:0 0 22px">
<p style="margin:0 0 6px;font-size:17px;line-height:1.35;font-weight:600"><a href="${esc(it.url)}" style="color:#15161a;text-decoration:none">${esc(it.title)}</a></p>
<p style="margin:0 0 6px;font-size:15px;line-height:1.6;color:#33363d">${esc(it.summary)}</p>
<p style="margin:0;font-size:13px"><a href="${esc(it.url)}" style="color:#0f766e">${esc(it.source || new URL(it.url).hostname)} →</a></p>
</td></tr>`,
    )
    .join('\n');
  const posts = (x.posts ?? []).length
    ? `<tr><td style="padding:6px 0 22px;border-top:1px solid #e4e2dd">
<p style="margin:16px 0 10px;font:600 12px ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#0f766e">${esc(f.blog)}</p>
${x.posts.map((p) => `<p style="margin:0 0 8px;font-size:15px"><a href="${esc(p.url)}" style="color:#15161a">${esc(p.title)}</a></p>`).join('\n')}
</td></tr>`
    : '';
  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(x.subject)}</title></head>
<body style="margin:0;padding:0;background:#f8f7f4;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#15161a">
<div style="display:none;max-height:0;overflow:hidden">${esc(x.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f7f4"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e4e2dd;border-radius:16px">
<tr><td style="padding:28px 28px 8px">
<p style="margin:0;font:600 14px ui-monospace,monospace" dir="ltr"><a href="${SITE}${lang === 'pl' ? '/' : `/${lang}`}" style="color:#15161a;text-decoration:none">example<span style="color:#0f766e">.com</span></a></p>
<p style="margin:4px 0 18px;font-size:13px;color:#5d626c">${esc(date)}</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.6">${esc(x.intro)}</p>
</td></tr>
<tr><td style="padding:0 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${items}
${posts}
</table></td></tr>
<tr><td style="padding:16px 28px 28px;border-top:1px solid #e4e2dd;font-size:12px;line-height:1.5;color:#5d626c">
${esc(f.why)} <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#5d626c">${esc(f.unsub)}</a>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}

// --- Commands -------------------------------------------------------------------------

const [cmd, arg, arg2] = process.argv.slice(2);

if (cmd === 'preview') {
  if (!arg || !arg2) fail('usage: preview <issue.json> <lang>');
  const issue = readIssue(arg);
  if (!issue.issues[arg2]) fail(`no "${arg2}" in the issue`);
  process.stdout.write(render(issue, arg2));
} else if (cmd === 'status') {
  const date = arg ?? warsawDate();
  const r = client();
  const n = await counts(r, await ids(r));
  const sent = await existing(r, date);
  const u = await usage();
  const total = Object.values(n).reduce((a, b) => a + b, 0);
  console.log(`date ${date}`);
  for (const l of LANGS) console.log(`${l}: ${n[l]} subscribers${sent.has(broadcastName(date, l)) ? ', sent' : n[l] ? ', not sent yet' : ''}`);
  console.log(`total ${total}`);
  if (u) console.log(`emails left today ${u.daily}, this month ${u.monthly}; contacts ${u.contacts?.used}/${u.contacts?.limit}`);
} else if (cmd === 'send') {
  if (!arg) fail('usage: send <issue.json>');
  const issue = readIssue(arg);
  const r = client();
  const { segmentId, topic } = await ids(r);
  const n = await counts(r, { segmentId, topic });
  const sent = await existing(r, issue.date);
  const todo = LANGS.filter((l) => n[l] > 0 && !sent.has(broadcastName(issue.date, l)));
  const missing = todo.filter((l) => !issue.issues[l]);
  if (missing.length) fail(`subscribers but no translation for: ${missing.join(', ')}`);
  const needed = todo.reduce((a, l) => a + n[l], 0);
  const u = await usage();
  if (u && needed > Math.min(u.daily, u.monthly)) fail(`needs ${needed} emails, only ${Math.min(u.daily, u.monthly)} left (daily ${u.daily}, monthly ${u.monthly})`);
  if (!todo.length) console.log('nothing to send');
  for (const lang of todo) {
    const x = issue.issues[lang];
    const b = ok(
      await r.broadcasts.create({
        name: broadcastName(issue.date, lang),
        from: FROM,
        subject: x.subject,
        previewText: x.preview,
        html: render(issue, lang),
        segmentId,
        topicId: topic[lang],
        send: true,
      }),
      `broadcast ${lang}`,
    );
    console.log(`${lang}: sent to ${n[lang]} (broadcast ${b.id})`);
    await sleep(200);
  }
} else {
  fail('usage: status [date] | preview <issue.json> <lang> | send <issue.json>');
}
