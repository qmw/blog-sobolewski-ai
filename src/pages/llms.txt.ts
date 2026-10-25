import type { APIRoute } from 'astro';
import { profile } from '@/data/profile';
import { langs, languages, postUrl, route } from '@/i18n';
import { getPosts, parseId } from '@/lib/blog';

// llms.txt: a plain-text map of the site for AI assistants and answer engines.
export const GET: APIRoute = async ({ site }) => {
  const abs = (p: string) => new URL(p, site).href;
  const sections = [];
  for (const lang of langs) {
    const posts = await getPosts(lang);
    if (!posts.length) continue;
    const lines = posts.map((p) => `- [${p.data.title}](${abs(postUrl(lang, parseId(p.id).slug))}): ${p.data.description}`);
    sections.push(`## Blog (${languages[lang].name})\n${lines.join('\n')}`);
  }
  const body = `# ${profile.name}

> ${profile.intro.en}

- [Contact](${abs(route('contact', 'en'))}) / [Kontakt](${abs(route('contact', 'pl'))})
- [Contact](${abs(route('contact', 'en'))})

${sections.join('\n\n')}
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
