// Shared code for the newsletter functions (files starting with "_" are not routes).
//
// Flow: the footer form POSTs to /api/newsletter/subscribe, which emails a signed
// confirmation link. The link opens /api/newsletter/confirm, which shows a button
// (so mail scanners that prefetch links can't subscribe anyone). Pressing it adds the
// address to the Resend segment "Newsletter", opted in to the topic for its language.
// Issues are sent by the newsletter routine.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Resend } from 'resend';

export const LANGS = ['pl', 'en', 'de', 'es', 'fr', 'it', 'ar', 'ja', 'zh'] as const;
export type Lang = (typeof LANGS)[number];

export const SITE = 'https://example.com';
export const FROM = 'Your Name <newsletter@news.example.com>';
export const SEGMENT_ID = 'TODO-your-resend-id';
export const TOPICS: Record<Lang, string> = {
  pl: 'TODO-your-resend-id',
  en: 'TODO-your-resend-id',
  de: 'TODO-your-resend-id',
  es: 'TODO-your-resend-id',
  fr: 'TODO-your-resend-id',
  it: 'TODO-your-resend-id',
  ar: 'TODO-your-resend-id',
  ja: 'TODO-your-resend-id',
  zh: 'TODO-your-resend-id',
};

/** Confirmation links stay valid this long. */
const TOKEN_HOURS = 7 * 24;

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

export function homeUrl(lang: Lang) {
  return lang === 'pl' ? `${SITE}/` : `${SITE}/${lang}`;
}

export function resend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  return new Resend(key);
}

// --- Signed tokens -------------------------------------------------------------------

function secret() {
  const s = process.env.NEWSLETTER_SECRET;
  if (!s) throw new Error('NEWSLETTER_SECRET is not set');
  return s;
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/** Hours since the epoch. Tokens use it so repeated sign-ups within an hour match. */
export function currentHour() {
  return Math.floor(Date.now() / 3_600_000);
}

export function makeToken(email: string, lang: Lang, hour = currentHour()) {
  const payload = Buffer.from(JSON.stringify({ e: email, l: lang, h: hour })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readToken(token: string | null): { email: string; lang: Lang } | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { e, l, h } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof e !== 'string' || !isLang(l) || typeof h !== 'number') return null;
    if (currentHour() - h > TOKEN_HOURS) return null;
    return { email: e, lang: l };
  } catch {
    return null;
  }
}

export function isEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(value);
}

// --- Copy ----------------------------------------------------------------------------

interface Copy {
  dir: 'ltr' | 'rtl';
  /** Confirmation email. */
  mailSubject: string;
  mailBody: string;
  mailButton: string;
  mailIgnore: string;
  /** After the form: "check your inbox". */
  checkTitle: string;
  checkBody: string;
  /** The page behind the email link. */
  confirmTitle: string;
  confirmBody: string;
  confirmButton: string;
  /** After confirming. */
  doneTitle: string;
  doneBody: string;
  /** Bad input or an expired link. */
  invalidEmail: string;
  badLinkTitle: string;
  badLinkBody: string;
  errorTitle: string;
  errorBody: string;
  back: string;
}

export const copy: Record<Lang, Copy> = {
  pl: {
    dir: 'ltr',
    mailSubject: 'Potwierdź zapis na newsletter example.com',
    mailBody: 'Ktoś (mam nadzieję, że Ty) zapisał ten adres na codzienny newsletter example.com: najważniejsze wiadomości ze świata AI, codziennie o 20:00.',
    mailButton: 'Potwierdzam zapis',
    mailIgnore: 'Jeśli to nie Ty, zignoruj tę wiadomość. Bez potwierdzenia nic nie wyślemy.',
    checkTitle: 'Sprawdź skrzynkę',
    checkBody: 'Wysłaliśmy link potwierdzający. Kliknij go, a od dziś o 20:00 dostaniesz najważniejsze wiadomości ze świata AI.',
    confirmTitle: 'Potwierdź zapis',
    confirmBody: 'Jeszcze jedno kliknięcie i jesteś na liście.',
    confirmButton: 'Zapisz mnie',
    doneTitle: 'Gotowe!',
    doneBody: 'Pierwszy newsletter przyjdzie dziś lub jutro o 20:00. W każdym mailu jest link do wypisania się jednym kliknięciem.',
    invalidEmail: 'To nie wygląda na poprawny adres e-mail.',
    badLinkTitle: 'Link nie działa',
    badLinkBody: 'Ten link wygasł albo jest niepełny. Zapisz się jeszcze raz, a wyślemy nowy.',
    errorTitle: 'Coś poszło nie tak',
    errorBody: 'Nie udało się tego teraz zrobić. Spróbuj ponownie za kilka minut.',
    back: '← Wróć na example.com',
  },
  en: {
    dir: 'ltr',
    mailSubject: 'Confirm your example.com newsletter subscription',
    mailBody: 'Someone (hopefully you) signed this address up for the example.com daily newsletter: the biggest AI news, every day at 20:00 Warsaw time.',
    mailButton: 'Confirm my subscription',
    mailIgnore: "If this wasn't you, ignore this email. Nothing is sent without confirmation.",
    checkTitle: 'Check your inbox',
    checkBody: "We've sent you a confirmation link. Click it and you'll get the day's biggest AI news every evening.",
    confirmTitle: 'Confirm your subscription',
    confirmBody: "One more click and you're on the list.",
    confirmButton: 'Subscribe me',
    doneTitle: "You're in!",
    doneBody: 'Your first issue arrives this evening or tomorrow. Every email has a one-click unsubscribe link.',
    invalidEmail: "That doesn't look like a valid email address.",
    badLinkTitle: "This link doesn't work",
    badLinkBody: "It has expired or is incomplete. Sign up again and we'll send a new one.",
    errorTitle: 'Something went wrong',
    errorBody: "We couldn't do that right now. Please try again in a few minutes.",
    back: '← Back to example.com',
  },
  de: {
    dir: 'ltr',
    mailSubject: 'Bestätige dein Abo des example.com-Newsletters',
    mailBody: 'Jemand (hoffentlich du) hat diese Adresse für den täglichen Newsletter von example.com eingetragen: die wichtigsten KI-News, jeden Tag um 20:00 Uhr (Warschauer Zeit).',
    mailButton: 'Abo bestätigen',
    mailIgnore: 'Wenn du das nicht warst, ignoriere diese E-Mail. Ohne Bestätigung senden wir nichts.',
    checkTitle: 'Schau in dein Postfach',
    checkBody: 'Wir haben dir einen Bestätigungslink geschickt. Klick darauf, und du bekommst jeden Abend die wichtigsten KI-News.',
    confirmTitle: 'Abo bestätigen',
    confirmBody: 'Noch ein Klick, und du bist dabei.',
    confirmButton: 'Jetzt abonnieren',
    doneTitle: 'Geschafft!',
    doneBody: 'Die erste Ausgabe kommt heute Abend oder morgen. Jede E-Mail enthält einen Link zum Abmelden mit einem Klick.',
    invalidEmail: 'Das sieht nicht nach einer gültigen E-Mail-Adresse aus.',
    badLinkTitle: 'Dieser Link funktioniert nicht',
    badLinkBody: 'Er ist abgelaufen oder unvollständig. Melde dich noch einmal an, dann schicken wir einen neuen.',
    errorTitle: 'Etwas ist schiefgelaufen',
    errorBody: 'Das hat gerade nicht geklappt. Bitte versuche es in ein paar Minuten noch einmal.',
    back: '← Zurück zu example.com',
  },
  es: {
    dir: 'ltr',
    mailSubject: 'Confirma tu suscripción al boletín de example.com',
    mailBody: 'Alguien (esperamos que tú) ha suscrito esta dirección al boletín diario de example.com: las noticias de IA más importantes, cada día a las 20:00 (hora de Varsovia).',
    mailButton: 'Confirmar suscripción',
    mailIgnore: 'Si no has sido tú, ignora este correo. Sin confirmación no enviamos nada.',
    checkTitle: 'Revisa tu correo',
    checkBody: 'Te hemos enviado un enlace de confirmación. Haz clic y recibirás cada tarde las noticias de IA más importantes del día.',
    confirmTitle: 'Confirma tu suscripción',
    confirmBody: 'Un clic más y estarás en la lista.',
    confirmButton: 'Suscribirme',
    doneTitle: '¡Listo!',
    doneBody: 'El primer número llegará esta tarde o mañana. Cada correo incluye un enlace para darte de baja con un clic.',
    invalidEmail: 'Esa dirección de correo no parece válida.',
    badLinkTitle: 'Este enlace no funciona',
    badLinkBody: 'Ha caducado o está incompleto. Suscríbete de nuevo y te enviaremos otro.',
    errorTitle: 'Algo ha salido mal',
    errorBody: 'No hemos podido hacerlo ahora. Inténtalo de nuevo en unos minutos.',
    back: '← Volver a example.com',
  },
  fr: {
    dir: 'ltr',
    mailSubject: 'Confirmez votre inscription à la newsletter example.com',
    mailBody: "Quelqu'un (vous, nous l'espérons) a inscrit cette adresse à la newsletter quotidienne de example.com : l'essentiel de l'actualité de l'IA, chaque jour à 20 h (heure de Varsovie).",
    mailButton: 'Confirmer mon inscription',
    mailIgnore: "Si ce n'était pas vous, ignorez ce message. Sans confirmation, nous n'envoyons rien.",
    checkTitle: 'Vérifiez votre boîte mail',
    checkBody: "Nous vous avons envoyé un lien de confirmation. Cliquez dessus et vous recevrez chaque soir l'essentiel de l'actualité de l'IA.",
    confirmTitle: 'Confirmez votre inscription',
    confirmBody: 'Encore un clic et vous êtes sur la liste.',
    confirmButton: "M'inscrire",
    doneTitle: "C'est fait !",
    doneBody: 'Le premier numéro arrive ce soir ou demain. Chaque e-mail contient un lien de désinscription en un clic.',
    invalidEmail: "Cette adresse e-mail ne semble pas valide.",
    badLinkTitle: 'Ce lien ne fonctionne pas',
    badLinkBody: 'Il a expiré ou est incomplet. Inscrivez-vous à nouveau et nous vous en enverrons un autre.',
    errorTitle: 'Un problème est survenu',
    errorBody: "Impossible de le faire pour l'instant. Réessayez dans quelques minutes.",
    back: '← Retour sur example.com',
  },
  it: {
    dir: 'ltr',
    mailSubject: "Conferma l'iscrizione alla newsletter di example.com",
    mailBody: "Qualcuno (speriamo tu) ha iscritto questo indirizzo alla newsletter quotidiana di example.com: le notizie più importanti sull'IA, ogni giorno alle 20:00 (ora di Varsavia).",
    mailButton: "Confermo l'iscrizione",
    mailIgnore: 'Se non sei stato tu, ignora questa email. Senza conferma non inviamo nulla.',
    checkTitle: 'Controlla la posta',
    checkBody: "Ti abbiamo inviato un link di conferma. Cliccalo e ogni sera riceverai le notizie più importanti sull'IA.",
    confirmTitle: "Conferma l'iscrizione",
    confirmBody: 'Ancora un clic e sei nella lista.',
    confirmButton: 'Iscrivimi',
    doneTitle: 'Fatto!',
    doneBody: 'Il primo numero arriva stasera o domani. Ogni email contiene un link per disiscriverti con un clic.',
    invalidEmail: 'Questo indirizzo email non sembra valido.',
    badLinkTitle: 'Questo link non funziona',
    badLinkBody: 'È scaduto o incompleto. Iscriviti di nuovo e te ne invieremo uno nuovo.',
    errorTitle: 'Qualcosa è andato storto',
    errorBody: 'Non è stato possibile farlo ora. Riprova tra qualche minuto.',
    back: '← Torna a example.com',
  },
  ar: {
    dir: 'rtl',
    mailSubject: 'أكّد اشتراكك في النشرة البريدية لموقع example.com',
    mailBody: 'قام شخص ما (نأمل أن تكون أنت) بتسجيل هذا العنوان في النشرة اليومية لموقع example.com: أهم أخبار الذكاء الاصطناعي، كل يوم الساعة 20:00 بتوقيت وارسو.',
    mailButton: 'تأكيد الاشتراك',
    mailIgnore: 'إذا لم تكن أنت، فتجاهل هذه الرسالة. لن نرسل شيئًا دون تأكيد.',
    checkTitle: 'تحقّق من بريدك',
    checkBody: 'أرسلنا إليك رابط تأكيد. انقر عليه لتصلك كل مساء أهم أخبار الذكاء الاصطناعي.',
    confirmTitle: 'أكّد اشتراكك',
    confirmBody: 'نقرة واحدة أخرى وتصبح ضمن القائمة.',
    confirmButton: 'اشترك الآن',
    doneTitle: 'تم!',
    doneBody: 'يصلك العدد الأول هذا المساء أو غدًا. تحتوي كل رسالة على رابط لإلغاء الاشتراك بنقرة واحدة.',
    invalidEmail: 'لا يبدو أن هذا عنوان بريد إلكتروني صالح.',
    badLinkTitle: 'هذا الرابط لا يعمل',
    badLinkBody: 'انتهت صلاحيته أو أنه غير مكتمل. اشترك مرة أخرى وسنرسل لك رابطًا جديدًا.',
    errorTitle: 'حدث خطأ ما',
    errorBody: 'تعذّر تنفيذ ذلك الآن. حاول مرة أخرى بعد بضع دقائق.',
    back: '→ العودة إلى example.com',
  },
  ja: {
    dir: 'ltr',
    mailSubject: 'example.com ニュースレターの登録確認',
    mailBody: 'このアドレスが example.com の日刊ニュースレターに登録されました。毎日20:00（ワルシャワ時間）に、AI の重要ニュースをお届けします。',
    mailButton: '登録を確認する',
    mailIgnore: 'お心当たりがない場合は、このメールを無視してください。確認がなければ何も送信されません。',
    checkTitle: 'メールをご確認ください',
    checkBody: '確認リンクをお送りしました。クリックすると、毎晩その日の AI の重要ニュースが届きます。',
    confirmTitle: '登録の確認',
    confirmBody: 'あと1クリックで登録完了です。',
    confirmButton: '登録する',
    doneTitle: '登録完了！',
    doneBody: '最初の号は今晩か明日に届きます。すべてのメールにワンクリックで配信停止できるリンクがあります。',
    invalidEmail: '有効なメールアドレスではないようです。',
    badLinkTitle: 'このリンクは使えません',
    badLinkBody: '期限切れか、不完全なリンクです。もう一度登録すると、新しいリンクをお送りします。',
    errorTitle: '問題が発生しました',
    errorBody: '現在処理できませんでした。数分後にもう一度お試しください。',
    back: '← example.com に戻る',
  },
  zh: {
    dir: 'ltr',
    mailSubject: '确认订阅 example.com 新闻简报',
    mailBody: '有人（希望是你）用这个邮箱订阅了 example.com 的每日新闻简报：每天 20:00（华沙时间）送上最重要的 AI 新闻。',
    mailButton: '确认订阅',
    mailIgnore: '如果不是你本人操作，请忽略此邮件。未经确认，我们不会发送任何内容。',
    checkTitle: '请查收邮件',
    checkBody: '我们已向你发送确认链接。点击后，你每晚都会收到当天最重要的 AI 新闻。',
    confirmTitle: '确认订阅',
    confirmBody: '再点一下就完成订阅。',
    confirmButton: '立即订阅',
    doneTitle: '订阅成功！',
    doneBody: '第一期将在今晚或明天送达。每封邮件都附有一键退订链接。',
    invalidEmail: '这似乎不是有效的电子邮件地址。',
    badLinkTitle: '此链接无效',
    badLinkBody: '链接已过期或不完整。请重新订阅，我们会发送新的链接。',
    errorTitle: '出了点问题',
    errorBody: '暂时无法完成操作，请几分钟后再试。',
    back: '← 返回 example.com',
  },
};

// --- HTML ----------------------------------------------------------------------------

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** A small standalone page in the site's dark style. Never indexed. */
export function page(lang: Lang, title: string, body: string, extra = '', status = 200) {
  const c = copy[lang];
  const html = `<!doctype html>
<html lang="${lang}" dir="${c.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)} — example.com</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: #0c0d10; color: #ededf0;
    font: 16px/1.6 system-ui, -apple-system, 'Segoe UI', sans-serif; }
  main { max-width: 32rem; padding: 2rem 1.25rem; }
  .brand { font: 600 0.875rem ui-monospace, monospace; color: #ededf0; text-decoration: none; }
  .brand span, a { color: #2dd4bf; }
  h1 { font: 500 2.25rem/1.1 Georgia, 'Times New Roman', serif; margin: 1.5rem 0 0.75rem; }
  p { color: #9da1ab; margin: 0 0 1.25rem; }
  button { font: 600 0.875rem system-ui, sans-serif; background: #2dd4bf; color: #04201d; border: 0;
    border-radius: 999px; padding: 0.75rem 1.5rem; cursor: pointer; }
  button:hover { opacity: 0.9; }
</style>
</head>
<body>
<main>
<a class="brand" href="${homeUrl(lang)}" dir="ltr">example<span>.com</span></a>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(body)}</p>
${extra}
<p><a href="${homeUrl(lang)}">${escapeHtml(c.back)}</a></p>
</main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}

export function confirmEmailHtml(lang: Lang, link: string) {
  const c = copy[lang];
  return `<!doctype html>
<html lang="${lang}" dir="${c.dir}">
<body style="margin:0;padding:24px;background:#f8f7f4;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#15161a">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e2dd;border-radius:16px;padding:28px">
<p style="margin:0 0 20px;font:600 14px ui-monospace,monospace" dir="ltr">example<span style="color:#0f766e">.com</span></p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.6">${escapeHtml(c.mailBody)}</p>
<p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;border-radius:999px;padding:12px 22px">${escapeHtml(c.mailButton)}</a></p>
<p style="margin:0;font-size:13px;line-height:1.5;color:#5d626c">${escapeHtml(c.mailIgnore)}</p>
</div>
</body>
</html>`;
}
