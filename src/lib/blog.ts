import { getCollection, type CollectionEntry } from 'astro:content';
import type { Lang } from '@/i18n';
import { postUrl } from '@/i18n';

export type Post = CollectionEntry<'blog'>;

/** `pl/my-post` → { lang: 'pl', slug: 'my-post' } */
export function parseId(id: string): { lang: Lang; slug: string } {
  const [lang, ...rest] = id.split('/');
  return { lang: lang as Lang, slug: rest.join('/') };
}

/** Drafts show in `astro dev` so you can preview them; they never ship to production. */
export async function getPosts(lang: Lang): Promise<Post[]> {
  const posts = await getCollection(
    'blog',
    (p: Post) => parseId(p.id).lang === lang && (import.meta.env.DEV || !p.data.draft),
  );
  return posts.sort((a: Post, b: Post) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function readingMinutes(body = '') {
  return Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 220));
}

/** Paths of this post in every language it exists in (matched by translationKey). */
export async function postAlternates(post: Post): Promise<Partial<Record<Lang, string>>> {
  const { lang, slug } = parseId(post.id);
  const out: Partial<Record<Lang, string>> = { [lang]: postUrl(lang, slug) };
  const key = post.data.translationKey;
  if (!key) return out;
  const all = await getCollection('blog', (p: Post) => !p.data.draft && p.data.translationKey === key);
  for (const p of all) {
    const o = parseId(p.id);
    out[o.lang] = postUrl(o.lang, o.slug);
  }
  return out;
}

/** The newer and older post around `post` in the same language (sorted by date). */
export async function adjacentPosts(post: Post, lang: Lang): Promise<{ newer?: Post; older?: Post }> {
  const posts = await getPosts(lang);
  const i = posts.findIndex((p) => p.id === post.id);
  if (i === -1) return {};
  return { newer: posts[i - 1], older: posts[i + 1] };
}

/** Up to `n` other posts, the ones sharing most tags first, then the newest. */
export async function relatedPosts(post: Post, lang: Lang, n = 2): Promise<Post[]> {
  const posts = (await getPosts(lang)).filter((p) => p.id !== post.id);
  const tags = new Set(post.data.tags);
  const score = (p: Post) => p.data.tags.filter((t) => tags.has(t)).length;
  return posts
    .map((p, i) => ({ p, s: score(p), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, n)
    .map((x) => x.p);
}
