// Single source of truth for personal content. Replace every value with your own.
import type { Lang } from '@/i18n';

// Localized text: Polish and English required; other languages fall back to English
// until translated (see `pick()` in src/i18n).
type L = { pl: string; en: string } & Partial<Record<Lang, string>>;

export const profile = {
  name: 'Your Name',
  domain: 'example.com',
  email: 'hello@example.com',
  location: { pl: 'Polska', en: 'Poland' } as L, // TODO: city?
  // TODO: real role/headline
  role: { pl: 'Inżynier i praktyk AI', en: 'AI engineer & practitioner' } as L,
  // TODO: replace with your own one-liner
  headline: {
    pl: 'Buduję rozwiązania AI, które działają w prawdziwych firmach',
    en: 'I build AI that works in real companies',
  } as L,
  // TODO: replace with your own intro
  intro: {
    pl: 'Projektuję i wdrażam systemy oparte na modelach językowych i agentach AI. Piszę o tym, co działa w praktyce, a co jest tylko szumem.',
    en: 'I design and ship systems built on language models and AI agents. I write about what actually works in practice, and what is just noise.',
  } as L,
  // TODO: replace with your real bio (paragraphs)
  bio: {
    pl: [
      'Tu pojawi się moja historia: skąd przyszedłem, czym się zajmuję i co mnie napędza.',
      'Tu opiszę, z kim pracuję i w czym mogę pomóc.',
    ],
    en: [
      'This is where my story goes: where I come from, what I do and what drives me.',
      'This is where I describe who I work with and how I can help.',
    ],
  } as { pl: string[]; en: string[] } & Partial<Record<Lang, string[]>>,
  // TODO: add/remove profiles; leave empty strings out
  socials: [
    { name: 'LinkedIn', url: 'https://www.linkedin.com/in/TODO' },
    { name: 'GitHub', url: 'https://github.com/TODO' },
    { name: 'X', url: 'https://x.com/TODO' },
  ],
  // Public repo with the open-source version of this site (footer link).
  openSource: 'https://github.com/TODO/TODO',
};

/** Socials that are filled in (placeholders marked TODO never render). */
export const publicSocials = profile.socials.filter((s) => !s.url.includes('TODO'));
