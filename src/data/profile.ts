// Single source of truth for personal content. Replace every value with your own.
import type { Lang } from '@/i18n';

// Localized text: Polish and English required; other languages fall back to English
// until translated (see `pick()` in src/i18n).
type L = { pl: string; en: string } & Partial<Record<Lang, string>>;

export const profile = {
  name: 'Your Name',
  domain: 'example.com',
  email: 'hello@example.com',
  // TODO: real role/headline
  role: { pl: 'Inżynier i praktyk AI', en: 'AI engineer & practitioner' } as L,
  // TODO: replace with your own intro
  intro: {
    pl: 'Projektuję i wdrażam systemy oparte na modelach językowych i agentach AI. Piszę o tym, co działa w praktyce, a co jest tylko szumem.',
    en: 'I design and ship systems built on language models and AI agents. I write about what actually works in practice, and what is just noise.',
  } as L,
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

/** Where the author's name links to (LinkedIn), if filled in. */
export const authorUrl = publicSocials.find((s) => s.name === 'LinkedIn')?.url;
