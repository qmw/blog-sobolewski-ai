import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { type Lang, postUrl, pick, languages } from '@/i18n';
import { profile } from '@/data/profile';
import { getPosts, parseId } from '@/lib/blog';

export async function blogFeed(context: APIContext, lang: Lang) {
  const posts = await getPosts(lang);
  return rss({
    title: `${profile.name} — Blog`,
    description: pick(profile.intro, lang),
    site: context.site!,
    customData: `<language>${languages[lang].locale.toLowerCase()}</language>`,
    items: posts.map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.pubDate,
      categories: p.data.tags,
      link: postUrl(lang, parseId(p.id).slug),
    })),
  });
}
